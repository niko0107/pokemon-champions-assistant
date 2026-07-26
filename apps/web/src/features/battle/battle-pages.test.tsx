import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { resetAuthStoreForTests, useAuthStore } from "../../stores/auth-store";

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

interface FetchMockOptions {
  partyItems?: typeof parties;
  createSessionStatus?: number;
  createSessionProblem?: unknown;
  createSessionDelayMs?: number;
  sessionStatus?: "active" | "ended" | "archived";
  searchItems?: Array<typeof charizard>;
  searchStatus?: number;
  observationStatus?: number;
  observationProblem?: unknown;
  observationDelayMs?: number;
  observationNetworkError?: boolean;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

function createFetchMock(options: FetchMockOptions = {}) {
  let observationSeq = 0;
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
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
      if (options.observationNetworkError) {
        return Promise.reject(new Error("network unavailable"));
      }
      const body = JSON.parse(String(init.body)) as { pokemonId: number };
      observationSeq += 1;
      const response =
        options.observationStatus && options.observationStatus >= 400
          ? jsonResponse(options.observationProblem, options.observationStatus)
          : jsonResponse(
              {
                id: `20000000-0000-4000-8000-${String(observationSeq).padStart(12, "0")}`,
                sessionId,
                seq: observationSeq,
                kind: "pokemon",
                pokemonId: body.pokemonId,
                moveId: null,
                itemId: null,
                abilityId: null,
                position: null,
                isRevoked: false,
                createdAt: "2026-07-26T00:00:00.000Z",
              },
              201,
            );
      return options.observationDelayMs
        ? new Promise<Response>((resolve) =>
            setTimeout(() => resolve(response), options.observationDelayMs),
          )
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

describe("WEB-001 battle pages", () => {
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

  it("ended Sessionでは状態を表示しPokemon入力を無効化する", async () => {
    vi.stubGlobal("fetch", createFetchMock({ sessionStatus: "ended" }));
    renderApp(`/battle/${sessionId}`);

    expect(await screen.findByRole("alert")).toHaveTextContent("activeではない");
    expect(screen.getByLabelText("相手ポケモン")).toBeDisabled();
    expect(screen.getByText("ended")).toBeVisible();
  });
});
