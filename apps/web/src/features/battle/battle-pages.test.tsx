import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { resetAuthStoreForTests, useAuthStore } from "../../stores/auth-store";
import { loadBattleObservations } from "./battle-session-storage";

const partyId = "00000000-0000-4000-8000-000000000001";
const secondPartyId = "00000000-0000-4000-8000-000000000002";
const sessionId = "10000000-0000-4000-8000-000000000001";

const authResponse = {
  accessToken: "header.payload.signature",
  tokenType: "Bearer" as const,
  expiresIn: 900,
  refreshToken: "r".repeat(43),
  refreshExpiresIn: 2_592_000,
  user: {
    id: "fecccd4a-a137-4b3b-bb09-239306040706",
    email: "battle@example.com",
    displayName: "Battle Trainer",
    role: "user" as const,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  },
};

const rule = { id: 1, name: "シングルバトル", teamSize: 2, pickSize: 1 };
const parties = [
  {
    id: partyId,
    name: "メインパーティ",
    description: null,
    ruleId: 1,
    isActive: true,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
  },
  {
    id: secondPartyId,
    name: "サブパーティ",
    description: null,
    ruleId: 1,
    isActive: true,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
  },
];
const charizard = {
  id: 6,
  dexNo: 6,
  nameJa: "リザードン",
  nameEn: "Charizard",
  form: "normal",
  type1: "fire",
  type2: "flying",
  isMega: false,
  basePokemonId: null,
};
const megaCharizard = {
  ...charizard,
  id: 10006,
  nameJa: "メガリザードンX",
  nameEn: "Mega Charizard X",
  form: "mega-x",
  type2: "dragon",
  isMega: true,
  basePokemonId: 6,
};
const flamethrower = {
  id: 53,
  nameJa: "かえんほうしゃ",
  nameEn: "Flamethrower",
  type: "fire",
  category: "special" as const,
  power: 90,
  accuracy: 100,
  priority: 0,
  tags: [],
};
const fireBlast = {
  ...flamethrower,
  id: 126,
  nameJa: "だいもんじ",
  nameEn: "Fire Blast",
  power: 110,
  accuracy: 85,
};
const candidate = {
  archetypeId: "30000000-0000-4000-8000-000000000001",
  name: "リザードン展開",
  matchRate: 87.5,
  rank: 1,
  popularityTier: "high" as const,
  matched: [],
  contradictions: [],
  exclusionCodes: [],
  likelyUnseen: [],
  threatMoveIds: [],
};

interface FetchMockOptions {
  partyItems?: typeof parties;
  createSessionStatus?: number;
  createSessionProblem?: unknown;
  createSessionDelayMs?: number;
  sessionStatus?: "active" | "ended" | "archived";
  searchItems?: Array<typeof charizard>;
  searchStatus?: number;
  moveSearchItems?: Array<typeof flamethrower>;
  moveSearchStatus?: number;
  observationStatus?: number;
  observationProblem?: unknown;
  observationDelayMs?: number;
  observationNetworkError?: boolean;
  moveObservationStatus?: number;
  moveObservationProblem?: unknown;
  moveObservationDelayMs?: number;
  moveObservationNetworkError?: boolean;
  undoStatus?: number;
  undoProblem?: unknown;
  undoDelayMs?: number;
  undoNetworkError?: boolean;
  undoResponse?: unknown;
  undoRequiresRefresh?: boolean;
  candidateResponses?: unknown[];
  candidateDelaysMs?: number[];
  candidateStatus?: number;
  candidateProblem?: unknown;
  candidateNetworkError?: boolean;
  candidateRequiresRefresh?: boolean;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

function createFetchMock(options: FetchMockOptions = {}) {
  let observationSeq = 0;
  let undoRequestCount = 0;
  let candidateRequestCount = 0;
  const observationResponses = new Map<string, Record<string, unknown>>();
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/auth/refresh") && init?.method === "POST") {
      return Promise.resolve(jsonResponse(authResponse));
    }
    if (url.endsWith("/sessions") && init?.method === "POST") {
      const response =
        options.createSessionStatus && options.createSessionStatus >= 400
          ? jsonResponse(options.createSessionProblem, options.createSessionStatus)
          : jsonResponse(
              {
                id: sessionId,
                partyId: JSON.parse(String(init.body)).partyId,
                ruleId: 1,
                status: "active",
                startedAt: "2026-07-26T00:00:00.000Z",
                endedAt: null,
                createdAt: "2026-07-26T00:00:00.000Z",
                updatedAt: "2026-07-26T00:00:00.000Z",
              },
              201,
            );
      return options.createSessionDelayMs
        ? new Promise<Response>((resolve) =>
            setTimeout(() => resolve(response), options.createSessionDelayMs),
          )
        : Promise.resolve(response);
    }
    if (url.endsWith(`/sessions/${sessionId}/observations`) && init?.method === "POST") {
      const isMove = JSON.parse(String(init.body)).kind === "move";
      if (
        (isMove && options.moveObservationNetworkError) ||
        (!isMove && options.observationNetworkError)
      ) {
        return Promise.reject(new Error("network unavailable"));
      }
      const body = JSON.parse(String(init.body)) as {
        kind: "pokemon" | "move";
        pokemonId: number;
        moveId?: number;
      };
      observationSeq += 1;
      const responseStatus = isMove
        ? (options.moveObservationStatus ?? options.observationStatus)
        : options.observationStatus;
      const responseProblem = isMove
        ? (options.moveObservationProblem ?? options.observationProblem)
        : options.observationProblem;
      const responseBody = {
        id: `20000000-0000-4000-8000-${String(observationSeq).padStart(12, "0")}`,
        sessionId,
        seq: observationSeq,
        kind: body.kind,
        pokemonId: body.pokemonId,
        moveId: body.kind === "move" ? body.moveId : null,
        itemId: null,
        abilityId: null,
        position: null,
        isRevoked: false,
        createdAt: "2026-07-26T00:00:00.000Z",
      };
      const response =
        responseStatus && responseStatus >= 400
          ? jsonResponse(responseProblem, responseStatus)
          : jsonResponse(responseBody, 201);
      if (!responseStatus || responseStatus < 400) {
        observationResponses.set(responseBody.id, responseBody);
      }
      const responseDelay = isMove
        ? (options.moveObservationDelayMs ?? options.observationDelayMs)
        : options.observationDelayMs;
      return responseDelay
        ? new Promise<Response>((resolve) => setTimeout(() => resolve(response), responseDelay))
        : Promise.resolve(response);
    }
    const undoMatch = url.match(
      new RegExp(`/sessions/${sessionId}/observations/([0-9a-f-]+)$`, "u"),
    );
    if (undoMatch && init?.method === "DELETE") {
      undoRequestCount += 1;
      if (options.undoNetworkError) {
        return Promise.reject(new Error("network unavailable"));
      }
      if (options.undoRequiresRefresh && undoRequestCount === 1) {
        return Promise.resolve(jsonResponse(problem("UNAUTHORIZED", 401), 401));
      }
      const observationId = undoMatch[1] ?? "";
      const original = observationResponses.get(observationId);
      const response =
        options.undoStatus && options.undoStatus >= 400
          ? jsonResponse(options.undoProblem, options.undoStatus)
          : jsonResponse(
              options.undoResponse ??
                (original
                  ? { ...original, isRevoked: true }
                  : {
                      id: observationId,
                      sessionId,
                      seq: 1,
                      kind: "pokemon",
                      pokemonId: 6,
                      moveId: null,
                      itemId: null,
                      abilityId: null,
                      position: null,
                      isRevoked: true,
                      createdAt: "2026-07-26T00:00:00.000Z",
                    }),
            );
      return options.undoDelayMs
        ? new Promise<Response>((resolve) =>
            setTimeout(() => resolve(response), options.undoDelayMs),
          )
        : Promise.resolve(response);
    }
    if (url.endsWith(`/sessions/${sessionId}/candidates`)) {
      candidateRequestCount += 1;
      if (options.candidateNetworkError) {
        return Promise.reject(new Error("network unavailable"));
      }
      if (options.candidateRequiresRefresh && candidateRequestCount === 1) {
        return Promise.resolve(jsonResponse(problem("UNAUTHORIZED", 401), 401));
      }
      const response =
        options.candidateStatus && options.candidateStatus >= 400
          ? jsonResponse(options.candidateProblem, options.candidateStatus)
          : jsonResponse(
              options.candidateResponses?.[
                Math.min(candidateRequestCount - 1, options.candidateResponses.length - 1)
              ] ?? { sessionId, candidates: [] },
            );
      const delay = options.candidateDelaysMs?.[candidateRequestCount - 1];
      return delay
        ? new Promise<Response>((resolve) => setTimeout(() => resolve(response), delay))
        : Promise.resolve(response);
    }
    if (url.endsWith(`/sessions/${sessionId}`)) {
      return Promise.resolve(
        jsonResponse({
          id: sessionId,
          partyId,
          ruleId: 1,
          status: options.sessionStatus ?? "active",
          startedAt: "2026-07-26T00:00:00.000Z",
          endedAt: options.sessionStatus === "ended" ? "2026-07-26T01:00:00.000Z" : null,
          createdAt: "2026-07-26T00:00:00.000Z",
          updatedAt: "2026-07-26T00:00:00.000Z",
        }),
      );
    }
    if (url.endsWith("/parties")) {
      return Promise.resolve(jsonResponse({ items: options.partyItems ?? parties }));
    }
    if (url.endsWith("/master/rules")) {
      return Promise.resolve(jsonResponse({ items: [rule] }));
    }
    if (url.includes("/master/pokemons?")) {
      return Promise.resolve(
        jsonResponse(
          { items: options.searchItems ?? [charizard, megaCharizard] },
          options.searchStatus ?? 200,
        ),
      );
    }
    if (url.includes("/master/moves?")) {
      return Promise.resolve(
        jsonResponse(
          { items: options.moveSearchItems ?? [flamethrower, fireBlast] },
          options.moveSearchStatus ?? 200,
        ),
      );
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
}

function renderApp(path: string) {
  window.history.replaceState({}, "", path);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<App />, { wrapper });
}

function problem(code: string, status: number): unknown {
  return {
    type: "about:blank",
    title: "Server title",
    status,
    detail: "画面へ表示してはいけない内部情報",
    code,
  };
}

describe("WEB-001 / WEB-002 battle pages", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    resetAuthStoreForTests();
    useAuthStore.getState().setAuthenticated(authResponse);
  });

  it("active PartyとRuleを表示・選択し、Sessionを一度だけ作成して遷移する", async () => {
    const fetchMock = createFetchMock({ createSessionDelayMs: 40 });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp(`/battle/new?partyId=${secondPartyId}`);

    expect(await screen.findByText("メインパーティ")).toBeVisible();
    expect(screen.getByText("サブパーティ")).toBeVisible();
    expect(screen.getAllByText(/シングルバトル/u).length).toBeGreaterThan(0);
    expect(screen.getByRole("radio", { name: /サブパーティ/u })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: /メインパーティ/u }));
    await user.dblClick(screen.getByRole("button", { name: "このパーティで対戦開始" }));

    await waitFor(() => expect(window.location.pathname).toBe(`/battle/${sessionId}`));
    const createCalls = fetchMock.mock.calls.filter(
      ([input, init]) => String(input).endsWith("/sessions") && init?.method === "POST",
    );
    expect(createCalls).toHaveLength(1);
    expect(JSON.parse(String(createCalls[0]?.[1]?.body))).toEqual({
      partyId,
      ruleId: 1,
    });
  });

  it("active Partyがない場合は登録導線を表示する", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        partyItems: parties.map((party) => ({ ...party, isActive: false })),
      }),
    );
    renderApp("/battle/new");

    expect(await screen.findByText("activeなパーティがありません")).toBeVisible();
    expect(screen.getByRole("link", { name: "パーティを登録する" })).toHaveAttribute(
      "href",
      "/parties/new",
    );
    expect(
      screen.queryByRole("button", { name: "このパーティで対戦開始" }),
    ).not.toBeInTheDocument();
  });

  it("Session作成のINVALID_PARTY_STATEを安全に表示する", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        createSessionStatus: 400,
        createSessionProblem: problem("INVALID_PARTY_STATE", 400),
      }),
    );
    const user = userEvent.setup();
    renderApp("/battle/new");

    await screen.findByText("メインパーティ");
    await user.click(screen.getByRole("button", { name: "このパーティで対戦開始" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("active状態と登録内容");
    expect(alert).not.toHaveTextContent("画面へ表示してはいけない内部情報");
  });

  it("未認証ではbattle routeからloginへ遷移する", async () => {
    resetAuthStoreForTests();
    vi.stubGlobal("fetch", createFetchMock());
    renderApp("/battle/new");

    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeVisible();
    expect(window.location.pathname).toBe("/login");
  });

  it("2文字から検索し、通常・メガを別IDとして順番どおりPokemon観測へ追加する", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    const searchInput = await screen.findByLabelText("相手ポケモン");
    await user.type(searchInput, "リ");
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes("/master/pokemons?")),
    ).toHaveLength(0);

    await user.type(searchInput, "ザ");
    const normal = await screen.findByRole("button", { name: "リザードン（normal）を追加" });
    expect(screen.getByRole("button", { name: "メガリザードンX（mega-x）を追加" })).toBeVisible();
    await user.click(normal);

    const observedList = screen.getByRole("heading", { name: "入力済みポケモン" }).parentElement;
    if (!observedList) throw new Error("observed list missing");
    expect(await within(observedList).findByText("リザードン")).toBeVisible();

    await user.type(searchInput, "リザ");
    expect(
      await screen.findByRole("button", { name: "メガリザードンX（mega-x）を追加" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "リザードン（normal）を追加" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "メガリザードンX（mega-x）を追加" }));

    await waitFor(() => {
      const observationCalls = fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith(`/sessions/${sessionId}/observations`),
      );
      expect(observationCalls).toHaveLength(2);
      expect(observationCalls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
        { kind: "pokemon", pokemonId: 6 },
        { kind: "pokemon", pokemonId: 10006 },
      ]);
    });
    const observedNames = within(observedList).getAllByText(/リザードン/u);
    expect(observedNames[0]).toHaveTextContent("リザードン");
    expect(observedNames[1]).toHaveTextContent("メガリザードンX");
    expect(searchInput).toBeDisabled();
    expect(screen.getByText("Ruleの最大入力数 2体に達しました。")).toBeVisible();
  });

  it("Observation送信中の二重送信を防止する", async () => {
    const fetchMock = createFetchMock({ observationDelayMs: 50 });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    const input = await screen.findByLabelText("相手ポケモン");
    await user.type(input, "リザ");
    await user.dblClick(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));

    await screen.findByText(/観測 seq 1/u);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith(`/sessions/${sessionId}/observations`),
      ),
    ).toHaveLength(1);
  });

  it.each([
    [429, "RATE_LIMITED", "少し待って"],
    [400, "INVALID_SESSION_STATE", "観測を追加できません"],
    [400, "INVALID_MASTER_REFERENCE", "選び直してください"],
    [404, "NOT_FOUND", "見つかりません"],
  ])("Observation失敗時(%s %s)は一覧へ追加しない", async (status, code, message) => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        observationStatus: status,
        observationProblem: problem(code, status),
      }),
    );
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    const input = await screen.findByLabelText("相手ポケモン");
    await user.type(input, "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByText("まだ観測はありません")).toBeVisible();
    expect(screen.queryByText(/観測 seq 1/u)).not.toBeInTheDocument();
  });

  it("Observationの通信エラー時は一覧へ追加しない", async () => {
    vi.stubGlobal("fetch", createFetchMock({ observationNetworkError: true }));
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    const input = await screen.findByLabelText("相手ポケモン");
    await user.type(input, "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("通信環境");
    expect(screen.getByText("まだ観測はありません")).toBeVisible();
  });

  it("Pokemon検索の0件とAPIエラーを表示する", async () => {
    vi.stubGlobal("fetch", createFetchMock({ searchItems: [] }));
    const user = userEvent.setup();
    const first = renderApp(`/battle/${sessionId}`);
    const input = await screen.findByLabelText("相手ポケモン");
    await user.type(input, "なし");
    expect(await screen.findByText("一致するポケモンはいません。")).toBeVisible();
    first.unmount();

    vi.stubGlobal("fetch", createFetchMock({ searchItems: [], searchStatus: 500 }));
    renderApp(`/battle/${sessionId}`);
    const secondInput = await screen.findByLabelText("相手ポケモン");
    await user.type(secondInput, "失敗");
    expect(await screen.findByRole("alert")).toHaveTextContent("候補を取得できませんでした");
  });

  it("追加成功済み観測をsessionStorageからreload相当で復元する", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const first = renderApp(`/battle/${sessionId}`);

    const input = await screen.findByLabelText("相手ポケモン");
    await user.type(input, "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    await screen.findByText(/観測 seq 1/u);
    first.unmount();

    renderApp(`/battle/${sessionId}`);
    expect(await screen.findByText(/観測 seq 1/u)).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith(`/sessions/${sessionId}/observations`),
      ),
    ).toHaveLength(1);
  });

  it("Pokemon未登録では技入力を無効にする", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderApp(`/battle/${sessionId}`);

    expect(await screen.findByLabelText("技名")).toBeDisabled();
    expect(screen.getByText("Pokemon観測を追加すると技入力が有効になります。")).toBeVisible();
    expect(screen.getByText("入力対象を選択してください")).toBeVisible();
  });

  it("選択中Pokemonのpokemon_idで2文字から技を検索し、技情報を表示する", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    const pokemonSearch = await screen.findByLabelText("相手ポケモン");
    await user.type(pokemonSearch, "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    expect(await screen.findByText("入力対象: リザードン")).toBeVisible();

    const moveSearch = screen.getByLabelText("技名");
    await user.type(moveSearch, "か");
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes("/master/moves?")),
    ).toHaveLength(0);

    await user.type(moveSearch, "え");
    const candidate = await screen.findByRole("button", {
      name: "かえんほうしゃをリザードンの技として追加",
    });
    expect(candidate).toHaveTextContent("Flamethrower");
    expect(candidate).toHaveTextContent("fire");
    expect(candidate).toHaveTextContent("特殊");
    expect(candidate).toHaveTextContent("威力 90");
    expect(candidate).toHaveTextContent("命中 100");
    expect(candidate).toHaveTextContent("優先度 0");

    const moveCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/master/moves?"),
    );
    expect(String(moveCall?.[0])).toContain("q=%E3%81%8B%E3%81%88");
    expect(String(moveCall?.[0])).toContain("pokemon_id=6");
  });

  it("技検索0件を対象Pokemonに紐づけて表示する", async () => {
    vi.stubGlobal("fetch", createFetchMock({ moveSearchItems: [] }));
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    await user.type(await screen.findByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    await user.type(screen.getByLabelText("技名"), "なし");

    expect(await screen.findByText("一致する習得可能技はありません。")).toBeVisible();
  });

  it("正確なmove Observationを一度だけ送信し、成功後だけ対象Pokemonへ追加する", async () => {
    const fetchMock = createFetchMock({ moveObservationDelayMs: 40 });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    await user.type(await screen.findByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    await user.type(screen.getByLabelText("技名"), "かえ");
    await user.dblClick(
      await screen.findByRole("button", {
        name: "かえんほうしゃをリザードンの技として追加",
      }),
    );

    const observedMoves = await screen.findByRole("heading", {
      name: "リザードンの観測済み技",
    });
    const observedMoveSection = observedMoves.parentElement;
    if (!observedMoveSection) throw new Error("observed move section missing");
    expect(await within(observedMoveSection).findByText("かえんほうしゃ")).toBeVisible();
    expect(within(observedMoveSection).getByText("seq 2")).toBeVisible();

    const observationCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith(`/sessions/${sessionId}/observations`),
    );
    expect(observationCalls).toHaveLength(2);
    expect(observationCalls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { kind: "pokemon", pokemonId: 6 },
      { kind: "move", pokemonId: 6, moveId: 53 },
    ]);

    await user.type(screen.getByLabelText("技名"), "かえ");
    expect(
      screen.queryByRole("button", {
        name: "かえんほうしゃをリザードンの技として追加",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "だいもんじをリザードンの技として追加" }),
    ).toBeVisible();
  });

  it("Pokemon切替時に検索結果を消し、同じ技を別Pokemonへ追加できる", async () => {
    const fetchMock = createFetchMock({ moveSearchItems: [flamethrower] });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    const pokemonSearch = await screen.findByLabelText("相手ポケモン");
    await user.type(pokemonSearch, "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    await user.type(screen.getByLabelText("技名"), "かえ");
    await user.click(
      await screen.findByRole("button", {
        name: "かえんほうしゃをリザードンの技として追加",
      }),
    );

    await user.type(pokemonSearch, "リザ");
    await user.click(
      await screen.findByRole("button", { name: "メガリザードンX（mega-x）を追加" }),
    );
    expect(screen.getByLabelText("技名")).toHaveValue("");
    expect(screen.queryByRole("button", { name: /かえんほうしゃ.*技として追加/u })).toBeNull();

    await user.type(screen.getByLabelText("技名"), "かえ");
    await user.click(
      await screen.findByRole("button", {
        name: "かえんほうしゃをメガリザードンXの技として追加",
      }),
    );

    const observationCalls = fetchMock.mock.calls
      .filter(([input]) => String(input).endsWith(`/sessions/${sessionId}/observations`))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(observationCalls).toEqual([
      { kind: "pokemon", pokemonId: 6 },
      { kind: "move", pokemonId: 6, moveId: 53 },
      { kind: "pokemon", pokemonId: 10006 },
      { kind: "move", pokemonId: 10006, moveId: 53 },
    ]);

    await user.click(screen.getByRole("button", { name: "リザードンを技入力対象にする" }));
    expect(screen.getByText("入力対象: リザードン")).toBeVisible();
    expect(screen.getByRole("heading", { name: "リザードンの観測済み技" })).toBeVisible();
  });

  it.each([
    [429, "RATE_LIMITED", "少し待って"],
    [400, "VALIDATION_ERROR", "入力内容"],
    [400, "INVALID_SESSION_STATE", "観測を追加できません"],
    [400, "INVALID_MASTER_REFERENCE", "選び直してください"],
    [404, "NOT_FOUND", "見つかりません"],
    [500, "INTERNAL_ERROR", "時間をおいて"],
  ])("move Observation失敗時(%s %s)は技一覧へ追加しない", async (status, code, message) => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        moveObservationStatus: status,
        moveObservationProblem: problem(code, status),
      }),
    );
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    await user.type(await screen.findByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    await user.type(screen.getByLabelText("技名"), "かえ");
    await user.click(
      await screen.findByRole("button", {
        name: "かえんほうしゃをリザードンの技として追加",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByText("まだ技観測はありません")).toBeVisible();
    expect(screen.queryByText("seq 2")).not.toBeInTheDocument();
  });

  it("技検索・追加の通信エラーを表示し、reload相当でPokemonと技をseq順に復元する", async () => {
    vi.stubGlobal("fetch", createFetchMock({ moveSearchStatus: 500 }));
    const user = userEvent.setup();
    const searchFailure = renderApp(`/battle/${sessionId}`);
    await user.type(await screen.findByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    await user.type(screen.getByLabelText("技名"), "失敗");
    expect(await screen.findByRole("alert")).toHaveTextContent("技候補を取得できませんでした");
    searchFailure.unmount();

    window.sessionStorage.clear();
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const first = renderApp(`/battle/${sessionId}`);
    await user.type(await screen.findByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    await user.type(screen.getByLabelText("技名"), "かえ");
    await user.click(
      await screen.findByRole("button", {
        name: "かえんほうしゃをリザードンの技として追加",
      }),
    );
    await screen.findByText("seq 2");
    first.unmount();

    renderApp(`/battle/${sessionId}`);
    expect(await screen.findByText(/観測 seq 1/u)).toBeVisible();
    expect(await screen.findByText("seq 2")).toBeVisible();
    expect(screen.getAllByText("かえんほうしゃ").length).toBeGreaterThan(0);
  });

  it("move Observationの通信エラー時は技一覧へ追加しない", async () => {
    vi.stubGlobal("fetch", createFetchMock({ moveObservationNetworkError: true }));
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    await user.type(await screen.findByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    await user.type(screen.getByLabelText("技名"), "かえ");
    await user.click(
      await screen.findByRole("button", {
        name: "かえんほうしゃをリザードンの技として追加",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("通信環境");
    expect(screen.getByText("まだ技観測はありません")).toBeVisible();
  });

  it("Pokemon・Move Observation成功後だけ候補を再取得し、更新中も直前候補を保つ", async () => {
    const afterPokemon = {
      sessionId,
      candidates: [
        {
          ...candidate,
          name: "Pokemon一致候補",
          matched: [
            {
              observationSeq: 1,
              kind: "pokemon",
              matched: true,
              points: 10,
              pokemonId: 6,
            },
          ],
        },
      ],
    };
    const afterMove = {
      sessionId,
      candidates: [
        {
          ...candidate,
          name: "技一致候補",
          matchRate: 100,
          matched: [
            {
              observationSeq: 1,
              kind: "pokemon",
              matched: true,
              points: 10,
              pokemonId: 6,
            },
            {
              observationSeq: 2,
              kind: "move",
              matched: true,
              points: 15,
              pokemonId: 6,
              moveId: 53,
            },
          ],
        },
      ],
    };
    const fetchMock = createFetchMock({
      candidateResponses: [{ sessionId, candidates: [] }, afterPokemon, afterMove],
      candidateDelaysMs: [0, 50, 50],
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    expect(await screen.findByText("表示できる候補はまだありません")).toBeVisible();
    await user.type(await screen.findByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    expect(await screen.findByText("候補を更新中…")).toBeVisible();
    expect(await screen.findByText("Pokemon一致候補")).toBeVisible();
    expect(screen.getByText("一致")).toBeVisible();
    expect(screen.getAllByText("リザードン").length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText("技名"), "かえ");
    await user.click(
      await screen.findByRole("button", {
        name: "かえんほうしゃをリザードンの技として追加",
      }),
    );
    expect(screen.getByText("Pokemon一致候補")).toBeVisible();
    expect(await screen.findByText("技一致候補")).toBeVisible();
    expect(screen.getByText("リザードン · かえんほうしゃ")).toBeVisible();

    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith(`/sessions/${sessionId}/candidates`),
      ),
    ).toHaveLength(3);
  });

  it("Observation失敗時は候補を再取得しない", async () => {
    const fetchMock = createFetchMock({
      observationStatus: 400,
      observationProblem: problem("INVALID_MASTER_REFERENCE", 400),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    expect(await screen.findByText("表示できる候補はまだありません")).toBeVisible();
    await user.type(await screen.findByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("選び直してください");
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith(`/sessions/${sessionId}/candidates`),
      ),
    ).toHaveLength(1);
  });

  it("候補取得は401時に既存refreshを使い、不正レスポンスと別Sessionを表示しない", async () => {
    const fetchMock = createFetchMock({
      candidateRequiresRefresh: true,
      candidateResponses: [{ sessionId, candidates: [candidate] }],
    });
    vi.stubGlobal("fetch", fetchMock);
    const first = renderApp(`/battle/${sessionId}`);

    expect(await screen.findByText("リザードン展開")).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/auth/refresh")),
    ).toHaveLength(1);
    first.unmount();

    vi.stubGlobal(
      "fetch",
      createFetchMock({
        candidateResponses: [
          {
            sessionId,
            candidates: [{ ...candidate, rawScore: 99 }],
          },
        ],
      }),
    );
    const invalid = renderApp(`/battle/${sessionId}`);
    expect(await screen.findByRole("alert")).toHaveTextContent("候補を取得できません");
    expect(screen.queryByText("リザードン展開")).not.toBeInTheDocument();
    invalid.unmount();

    vi.stubGlobal(
      "fetch",
      createFetchMock({
        candidateResponses: [
          {
            sessionId: "10000000-0000-4000-8000-000000000002",
            candidates: [candidate],
          },
        ],
      }),
    );
    renderApp(`/battle/${sessionId}`);
    expect(await screen.findByRole("alert")).toHaveTextContent("候補を取得できません");
    expect(screen.queryByText("リザードン展開")).not.toBeInTheDocument();
  });

  it("連続更新で遅い旧候補レスポンスが新しい候補を上書きしない", async () => {
    const fetchMock = createFetchMock({
      candidateResponses: [
        { sessionId, candidates: [{ ...candidate, name: "古い候補" }] },
        { sessionId, candidates: [{ ...candidate, name: "新しい候補" }] },
      ],
      candidateDelaysMs: [1_000, 10],
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    await user.type(await screen.findByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    expect(await screen.findByText("新しい候補")).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 1_050));
    expect(screen.getByText("新しい候補")).toBeVisible();
    expect(screen.queryByText("古い候補")).not.toBeInTheDocument();
  });

  it("観測0件ではUndoを無効化し、PokemonとMoveの最大seqを対象として表示する", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    const undoButton = await screen.findByRole("button", { name: "ひとつ戻す" });
    expect(undoButton).toBeDisabled();
    expect(screen.getByText("Undoできる有効な観測はありません。")).toBeVisible();

    await user.type(screen.getByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    expect(screen.getByText(/戻す内容:.*リザードン/u)).toBeVisible();
    expect(screen.getByText(/ポケモン観測/u)).toBeVisible();
    expect(screen.getByText("Undo対象 #1")).toBeVisible();

    await user.type(screen.getByLabelText("技名"), "かえ");
    await user.click(
      await screen.findByRole("button", {
        name: "かえんほうしゃをリザードンの技として追加",
      }),
    );
    expect(screen.getAllByText("かえんほうしゃ").length).toBeGreaterThan(0);
    expect(screen.getByText(/技観測/u)).toBeVisible();
    expect(screen.getByText("Undo対象 #2")).toBeVisible();
  });

  it("直近Moveを正確なDELETE・bodyなしで一度だけUndoし、履歴を保持して再追加可能にする", async () => {
    const fetchMock = createFetchMock({
      undoDelayMs: 40,
      candidateResponses: [
        { sessionId, candidates: [] },
        { sessionId, candidates: [{ ...candidate, name: "Pokemon入力後" }] },
        { sessionId, candidates: [{ ...candidate, name: "技入力後" }] },
        { sessionId, candidates: [{ ...candidate, name: "Undo後" }] },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    await user.type(await screen.findByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    await user.type(screen.getByLabelText("技名"), "かえ");
    await user.click(
      await screen.findByRole("button", {
        name: "かえんほうしゃをリザードンの技として追加",
      }),
    );
    await screen.findByText("技入力後");

    await user.dblClick(screen.getByRole("button", { name: "ひとつ戻す" }));
    expect(await screen.findByText(/技観測「かえんほうしゃ」を取り消しました/u)).toBeVisible();
    expect(screen.getByText("まだ技観測はありません")).toBeVisible();
    expect(screen.getByText(/取消済みの履歴 1件/u)).toBeVisible();
    expect(await screen.findByText("Undo後")).toBeVisible();

    const undoCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input).endsWith(
          `/sessions/${sessionId}/observations/20000000-0000-4000-8000-000000000002`,
        ) && init?.method === "DELETE",
    );
    expect(undoCalls).toHaveLength(1);
    expect(undoCalls[0]?.[1]?.body).toBeUndefined();

    const stored = loadBattleObservations(sessionId);
    expect(stored).toHaveLength(2);
    expect(stored[1]).toMatchObject({
      type: "move",
      observation: { seq: 2, isRevoked: true },
      move: { nameJa: "かえんほうしゃ" },
    });

    await user.type(screen.getByLabelText("技名"), "かえ");
    await user.click(
      await screen.findByRole("button", {
        name: "かえんほうしゃをリザードンの技として追加",
      }),
    );
    expect(await screen.findByText("seq 3")).toBeVisible();
    expect(loadBattleObservations(sessionId)).toHaveLength(3);
  });

  it("Pokemon Undoは対象だけを取消し、reload後も履歴を保って再追加できる", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const first = renderApp(`/battle/${sessionId}`);

    await user.type(await screen.findByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    await user.click(screen.getByRole("button", { name: "ひとつ戻す" }));
    expect(await screen.findByText(/ポケモン観測「リザードン」を取り消しました/u)).toBeVisible();
    expect(screen.getByText("まだ観測はありません")).toBeVisible();
    expect(screen.getByLabelText("技名")).toBeDisabled();
    expect(loadBattleObservations(sessionId)[0]).toMatchObject({
      observation: { seq: 1, isRevoked: true },
    });

    first.unmount();
    renderApp(`/battle/${sessionId}`);
    expect(await screen.findByText(/取消済みの履歴 1件/u)).toBeVisible();
    expect(screen.getByText("まだ観測はありません")).toBeVisible();

    await user.type(screen.getByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    expect(await screen.findByText(/観測 seq 2/u)).toBeVisible();
    expect(loadBattleObservations(sessionId)).toHaveLength(2);
  });

  it.each([
    [409, "OBSERVATION_CONFLICT", "観測状態が更新されています"],
    [400, "INVALID_SESSION_STATE", "観測を取り消せません"],
    [404, "NOT_FOUND", "見つかりません"],
    [500, "INTERNAL_ERROR", "時間をおいて"],
  ])("Undo失敗時(%s %s)はローカル履歴を変更しない", async (status, code, message) => {
    const fetchMock = createFetchMock({
      undoStatus: status,
      undoProblem: problem(code, status),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp(`/battle/${sessionId}`);

    await user.type(await screen.findByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    const candidatesBeforeUndo = fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith(`/sessions/${sessionId}/candidates`),
    ).length;
    await user.click(screen.getByRole("button", { name: "ひとつ戻す" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByText(/観測 seq 1/u)).toBeVisible();
    expect(loadBattleObservations(sessionId)[0]?.observation.isRevoked).toBe(false);
    const candidatesAfterUndo = fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith(`/sessions/${sessionId}/candidates`),
    ).length;
    expect(candidatesAfterUndo).toBe(
      code === "OBSERVATION_CONFLICT" ? candidatesBeforeUndo + 1 : candidatesBeforeUndo,
    );
  });

  it("Undoの通信エラー・不正レスポンスでは状態を変更せず、401時は既存refreshを使う", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", createFetchMock({ undoNetworkError: true }));
    const network = renderApp(`/battle/${sessionId}`);
    await user.type(await screen.findByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    await user.click(screen.getByRole("button", { name: "ひとつ戻す" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("通信環境");
    expect(loadBattleObservations(sessionId)[0]?.observation.isRevoked).toBe(false);
    network.unmount();

    window.sessionStorage.clear();
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        undoResponse: {
          id: "20000000-0000-4000-8000-000000000099",
          sessionId,
          seq: 1,
          kind: "pokemon",
          pokemonId: 6,
          moveId: null,
          itemId: null,
          abilityId: null,
          position: null,
          isRevoked: true,
          createdAt: "2026-07-26T00:00:00.000Z",
        },
      }),
    );
    const invalid = renderApp(`/battle/${sessionId}`);
    await user.type(await screen.findByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    await user.click(screen.getByRole("button", { name: "ひとつ戻す" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("取り消せませんでした");
    expect(loadBattleObservations(sessionId)[0]?.observation.isRevoked).toBe(false);
    invalid.unmount();

    window.sessionStorage.clear();
    const refreshMock = createFetchMock({ undoRequiresRefresh: true });
    vi.stubGlobal("fetch", refreshMock);
    renderApp(`/battle/${sessionId}`);
    await user.type(await screen.findByLabelText("相手ポケモン"), "リザ");
    await user.click(await screen.findByRole("button", { name: "リザードン（normal）を追加" }));
    await user.click(screen.getByRole("button", { name: "ひとつ戻す" }));
    expect(await screen.findByText(/ポケモン観測「リザードン」を取り消しました/u)).toBeVisible();
    expect(
      refreshMock.mock.calls.filter(([input]) => String(input).endsWith("/auth/refresh")),
    ).toHaveLength(1);
  });

  it("ended Sessionでは状態を表示しPokemon入力を無効化する", async () => {
    vi.stubGlobal("fetch", createFetchMock({ sessionStatus: "ended" }));
    renderApp(`/battle/${sessionId}`);

    expect(await screen.findByRole("alert")).toHaveTextContent("activeではない");
    expect(screen.getByLabelText("相手ポケモン")).toBeDisabled();
    expect(screen.getByLabelText("技名")).toBeDisabled();
    expect(screen.getByRole("button", { name: "ひとつ戻す" })).toBeDisabled();
    expect(screen.getByText("ended")).toBeVisible();
  });
});
