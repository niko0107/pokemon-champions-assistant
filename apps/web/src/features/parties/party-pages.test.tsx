import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { resetAuthStoreForTests, useAuthStore } from "../../stores/auth-store";
import { partyQueryKeys } from "./party-api";

const authResponse = {
  accessToken: "header.payload.signature",
  tokenType: "Bearer" as const,
  expiresIn: 900,
  refreshToken: "r".repeat(43),
  refreshExpiresIn: 2_592_000,
  user: {
    id: "fecccd4a-a137-4b3b-bb09-239306040706",
    email: "trainer@example.com",
    displayName: "Trainer",
    role: "user" as const,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  },
};

const rule = {
  id: 1,
  name: "シングルバトル",
  teamSize: 1,
  pickSize: 1,
  battleLevel: 50,
};
const pokemon = {
  id: 1,
  dexNo: 130,
  nameJa: "ギャラドス",
  nameEn: "Gyarados",
  form: "normal",
  type1: "water",
  type2: "flying",
  isMega: false,
  basePokemonId: null,
};
const pokemonDetail = {
  ...pokemon,
  baseHp: 95,
  baseAtk: 125,
  baseDef: 79,
  baseSpa: 60,
  baseSpd: 100,
  baseSpe: 81,
};
const moves = ["たきのぼり", "じしん", "こおりのキバ", "りゅうのまい"].map((nameJa, index) => ({
  id: index + 1,
  nameJa,
  nameEn: `Move ${index + 1}`,
  type: index === 0 ? "water" : "normal",
  category: index === 3 ? "status" : "physical",
  power: index === 3 ? null : 80,
  accuracy: 100,
  priority: 0,
  tags: index === 3 ? ["setup"] : [],
}));
const partySummary = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "ランク用",
  description: "攻める構築",
  ruleId: 1,
  isActive: true,
  createdAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createFetchMock(
  options: {
    parties?: unknown;
    partiesStatus?: number;
    rules?: (typeof rule)[];
    onCreate?: (body: unknown) => void;
    createDelayMs?: number;
  } = {},
) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/parties") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as {
        name: string;
        pokemons: Array<{ statPoints: unknown; actualStats: unknown }>;
      };
      options.onCreate?.(body);
      const response = jsonResponse(
        {
          ...partySummary,
          name: body.name,
          pokemons: [
            {
              slot: 1,
              pokemonId: 1,
              itemId: null,
              abilityId: null,
              nature: "まじめ",
              teraType: null,
              statPoints: body.pokemons[0]?.statPoints,
              evs: null,
              ivs: null,
              actualStats: body.pokemons[0]?.actualStats,
              moves: moves.map((move, index) => ({ slot: index + 1, moveId: move.id })),
            },
          ],
        },
        201,
      );
      return options.createDelayMs
        ? new Promise<Response>((resolve) =>
            setTimeout(() => resolve(response), options.createDelayMs),
          )
        : Promise.resolve(response);
    }
    if (url.endsWith("/parties")) {
      return Promise.resolve(
        jsonResponse(options.parties ?? { items: [] }, options.partiesStatus ?? 200),
      );
    }
    if (url.endsWith("/master/rules")) {
      return Promise.resolve(jsonResponse({ items: options.rules ?? [rule] }));
    }
    if (url.includes("/master/pokemons?")) {
      return Promise.resolve(jsonResponse({ items: [pokemon] }));
    }
    if (url.endsWith("/master/pokemons/1")) {
      return Promise.resolve(jsonResponse(pokemonDetail));
    }
    if (url.includes("/master/abilities?")) {
      return Promise.resolve(
        jsonResponse({
          items: [{ id: 1, nameJa: "いかく", nameEn: "Intimidate", effectTags: [] }],
        }),
      );
    }
    if (url.includes("/master/moves?")) {
      return Promise.resolve(jsonResponse({ items: moves }));
    }
    if (url.includes("/master/items?")) {
      return Promise.resolve(
        jsonResponse({
          items: [
            {
              id: 1,
              nameJa: "オボンのみ",
              nameEn: "Sitrus Berry",
              effectTags: ["berry"],
            },
          ],
        }),
      );
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
}

function renderApp(path = "/") {
  window.history.replaceState({}, "", path);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { ...render(<App />, { wrapper }), queryClient };
}

describe("WEB-006 party pages", () => {
  beforeEach(() => {
    resetAuthStoreForTests();
    useAuthStore.getState().setAuthenticated(authResponse);
  });

  it("ホームにユーザー、Party、active、Rule名、人数、更新日時を表示する", async () => {
    vi.stubGlobal("fetch", createFetchMock({ parties: { items: [partySummary] } }));
    renderApp();

    expect(await screen.findByText("ランク用")).toBeVisible();
    expect(screen.getByRole("heading", { name: /Trainerさんの\s*パーティ/u })).toBeVisible();
    expect(screen.getByText("ACTIVE")).toBeVisible();
    expect(screen.getByText("シングルバトル")).toBeVisible();
    expect(screen.getByText("1体登録済み")).toBeVisible();
    expect(screen.getByText(/^更新 /u)).toBeVisible();
    expect(screen.getByRole("link", { name: "新しいパーティを登録" })).toHaveAttribute(
      "href",
      "/parties/new",
    );
    expect(screen.getByRole("link", { name: "このパーティで対戦" })).toHaveAttribute(
      "href",
      `/battle/new?partyId=${partySummary.id}`,
    );
  });

  it("0件の空状態を表示する", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderApp();

    expect(await screen.findByText("まだパーティがありません")).toBeVisible();
    expect(screen.getByRole("link", { name: "パーティ登録へ" })).toBeVisible();
  });

  it("Party一覧のloadingとAPIエラーを表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    const first = renderApp();
    expect(screen.getByRole("status")).toHaveTextContent("パーティを読み込んでいます");
    first.unmount();

    vi.stubGlobal(
      "fetch",
      createFetchMock({
        parties: {
          type: "about:blank",
          title: "Internal",
          status: 500,
          code: "INTERNAL_ERROR",
        },
        partiesStatus: 500,
      }),
    );
    renderApp();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "現在Partyを保存できません。時間をおいて再度お試しください。",
    );
  });

  it("未認証ではloginへ遷移する", async () => {
    resetAuthStoreForTests();
    vi.stubGlobal("fetch", createFetchMock());
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeVisible();
    expect(window.location.pathname).toBe("/login");
  });

  it("RuleのteamSizeをslot数へ反映し、Pokemon検索・詳細・特性を取得する", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp("/parties/new");

    await screen.findByRole("option", { name: /シングルバトル/u });
    await user.selectOptions(screen.getByLabelText("Rule"), "1");
    expect(screen.getByText("1枠 · 1体選出")).toBeVisible();
    expect(screen.getByLabelText("対戦レベル")).toHaveTextContent("Lv. 50");
    expect(screen.queryByRole("spinbutton", { name: "実数値の計算レベル" })).toBeNull();
    expect(screen.getByRole("heading", { name: "能力ポイント" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "実数値" })).toBeVisible();
    expect(screen.queryByText(/EV 0\/510/u)).toBeNull();
    expect(screen.queryByLabelText(/ EV$/u)).toBeNull();
    expect(screen.queryByLabelText(/ IV$/u)).toBeNull();
    const pokemonSearch = screen.getByLabelText("ポケモン");
    await user.type(pokemonSearch, "ギャ");
    await user.click(await screen.findByRole("button", { name: "ギャラドス（normal）" }));

    expect(await screen.findByText(/種族値:/u)).toHaveTextContent("95 / 125 / 79 / 60 / 100 / 81");
    await waitFor(() => expect(screen.getByLabelText("特性（任意）")).toContainHTML("いかく"));
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith("/master/pokemons/1")),
    ).toBe(true);
  });

  it("選択済みPokemonを別slotの候補から除外する", async () => {
    const twoMemberRule = { ...rule, teamSize: 2 };
    vi.stubGlobal("fetch", createFetchMock({ rules: [twoMemberRule] }));
    const user = userEvent.setup();
    renderApp("/parties/new");
    await screen.findByRole("option", { name: /シングルバトル/u });
    await user.selectOptions(screen.getByLabelText("Rule"), "1");

    const firstSearch = screen.getAllByLabelText("ポケモン")[0];
    if (!firstSearch) throw new Error("first Pokemon search missing");
    await user.type(firstSearch, "ギャ");
    await user.click(await screen.findByRole("button", { name: "ギャラドス（normal）" }));
    await user.click(screen.getByText("ポケモン 2"));
    const secondSearch = screen.getAllByLabelText("ポケモン")[0];
    if (!secondSearch) throw new Error("second Pokemon search missing");
    await user.type(secondSearch, "ギャ");

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "ギャラドス（normal）" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("能力ポイントと直接入力した実数値を分離保存し、一覧をinvalidateする", async () => {
    let createdBody: unknown;
    const fetchMock = createFetchMock({
      onCreate: (body) => (createdBody = body),
      createDelayMs: 50,
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { queryClient } = renderApp("/parties/new");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await user.type(screen.getByLabelText("パーティ名"), "ランク用");
    await screen.findByRole("option", { name: /シングルバトル/u });
    await user.selectOptions(screen.getByLabelText("Rule"), "1");
    fireEvent.change(screen.getByLabelText("ポケモン"), { target: { value: "ギャ" } });
    fireEvent.change(screen.getByLabelText("持ち物（任意）"), { target: { value: "オボ" } });
    await user.click(await screen.findByRole("button", { name: "ギャラドス（normal）" }));
    await user.selectOptions(screen.getByLabelText("性格"), "まじめ");
    await user.click(await screen.findByRole("button", { name: "オボンのみ" }));
    await waitFor(() => expect(screen.getByLabelText("特性（任意）")).toContainHTML("いかく"));
    await user.selectOptions(screen.getByLabelText("特性（任意）"), "1");

    const pointValues = [32, 0, 0, 32, 2, 0];
    const actualValues = [185, 93, 98, 177, 107, 120];
    const labels = ["HP", "攻撃", "防御", "特攻", "特防", "素早さ"];
    for (const [index, label] of labels.entries()) {
      const pointInput = screen.getByLabelText(`ポケモン1 ${label} 能力ポイント`);
      fireEvent.change(pointInput, { target: { value: String(pointValues[index]) } });
      fireEvent.change(screen.getByLabelText(`ポケモン1 ${label} 実数値`), {
        target: { value: String(actualValues[index]) },
      });
    }
    expect(screen.getByText("合計 66/66")).toBeVisible();
    expect(screen.getByLabelText("ポケモン1 HP 能力ポイント")).toHaveAttribute("max", "32");
    expect(screen.getByLabelText("ポケモン1 HP 能力ポイント")).toHaveValue(32);

    const moveInputs = screen.getAllByPlaceholderText("技名を2文字以上入力");
    for (const input of moveInputs) {
      fireEvent.change(input, { target: { value: "わざ" } });
    }
    for (const [index, input] of moveInputs.entries()) {
      const picker = input.parentElement;
      if (!picker) throw new Error(`move ${index + 1} picker missing`);
      await user.click(
        await within(picker).findByRole("button", {
          name: new RegExp(moves[index]?.nameJa ?? ""),
        }),
      );
    }
    await user.dblClick(screen.getByRole("button", { name: "パーティを保存" }));

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(createdBody).toMatchObject({
      name: "ランク用",
      ruleId: 1,
      pokemons: [
        {
          slot: 1,
          pokemonId: 1,
          itemId: 1,
          abilityId: 1,
          statPoints: {
            hp: 32,
            attack: 0,
            defense: 0,
            specialAttack: 32,
            specialDefense: 2,
            speed: 0,
          },
          evs: null,
          ivs: null,
          actualStats: {
            hp: 185,
            attack: 93,
            defense: 98,
            specialAttack: 177,
            specialDefense: 107,
            speed: 120,
          },
          moves: [
            { slot: 1, moveId: 1 },
            { slot: 2, moveId: 2 },
            { slot: 3, moveId: 3 },
            { slot: 4, moveId: 4 },
          ],
        },
      ],
    });
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes("/master/moves?")),
    ).toSatisfy((calls: unknown[]) =>
      calls.every((call) => String((call as [unknown])[0]).includes("pokemon_id=1")),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: partyQueryKeys.all });
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => String(input).endsWith("/parties") && init?.method === "POST",
      ),
    ).toHaveLength(1);
  });

  it("不足入力を保存前に表示し、APIへ送信しない", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp("/parties/new");

    await screen.findByRole("option", { name: /シングルバトル/u });
    await user.selectOptions(screen.getByLabelText("Rule"), "1");
    await user.click(screen.getByRole("button", { name: "パーティを保存" }));
    expect(await screen.findByText("パーティ名を入力してください。")).toBeVisible();
    expect(screen.getByText("ポケモンを選択してください。")).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => String(input).endsWith("/parties") && init?.method === "POST",
      ),
    ).toHaveLength(0);
  });

  it("能力ポイント合計67を即時表示し、保存前に拒否する", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp("/parties/new");

    await user.type(screen.getByLabelText("パーティ名"), "能力ポイントテスト");
    await screen.findByRole("option", { name: /シングルバトル/u });
    await user.selectOptions(screen.getByLabelText("Rule"), "1");
    await user.type(screen.getByLabelText("ポケモン"), "ギャ");
    await user.click(await screen.findByRole("button", { name: "ギャラドス（normal）" }));

    for (const [stat, points] of [
      ["HP", 32],
      ["攻撃", 32],
      ["防御", 3],
    ] as const) {
      const input = screen.getByLabelText(`ポケモン1 ${stat} 能力ポイント`);
      await user.clear(input);
      await user.type(input, String(points));
    }
    expect(screen.getByRole("alert")).toHaveTextContent(
      "能力ポイントの合計を66以下にしてください（現在67）。",
    );
    await user.click(screen.getByRole("button", { name: "パーティを保存" }));

    expect(await screen.findByText("能力ポイントの合計を66以下にしてください。")).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => String(input).endsWith("/parties") && init?.method === "POST",
      ),
    ).toHaveLength(0);
  });

  it("Rule・Pokemon・性格を変更しても直接入力した実数値を上書きしない", async () => {
    const levelOneRule = { ...rule, id: 2, name: "レベル1", battleLevel: 1 };
    vi.stubGlobal("fetch", createFetchMock({ rules: [rule, levelOneRule] }));
    const user = userEvent.setup();
    renderApp("/parties/new");

    await screen.findByRole("option", { name: /シングルバトル/u });
    await user.selectOptions(screen.getByLabelText("Rule"), "1");
    await user.type(screen.getByLabelText("ポケモン"), "ギャ");
    await user.click(await screen.findByRole("button", { name: "ギャラドス（normal）" }));
    await user.selectOptions(screen.getByLabelText("性格"), "まじめ");
    await user.type(screen.getByLabelText("ポケモン1 HP 実数値"), "185");

    await user.selectOptions(screen.getByLabelText("Rule"), "2");
    expect(screen.getByLabelText("対戦レベル")).toHaveTextContent("Lv. 1");
    expect(screen.getByLabelText("ポケモン1 HP 実数値")).toHaveValue(185);
    await user.selectOptions(screen.getByLabelText("性格"), "おくびょう");
    expect(screen.getByLabelText("ポケモン1 HP 実数値")).toHaveValue(185);
  });
});
