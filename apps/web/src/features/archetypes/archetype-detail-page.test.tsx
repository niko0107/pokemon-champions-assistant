import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import type { PublicArchetypeDetail } from "@pokemon-champions/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { resetAuthStoreForTests, useAuthStore } from "../../stores/auth-store";
import { archetypeQueryKeys } from "./archetype-api";

const sessionId = "10000000-0000-4000-8000-000000000001";
const archetypeId = "30000000-0000-4000-8000-000000000001";
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

function detail(): PublicArchetypeDetail {
  return {
    id: archetypeId,
    name: "メガリザードン展開",
    description: "先発から盤面を整える公開構築です。",
    rule: {
      id: 1,
      name: "シングルバトル",
      teamSize: 6,
      pickSize: 3,
      battleLevel: 50,
    },
    season: { id: 1, name: "シーズン1" },
    defaultLeads: [1, 2, 3],
    playstyleNotes: "壁から積みエースを展開する",
    pokemons: Array.from({ length: 6 }, (_, index) => ({
      slot: index + 1,
      usageRate: index === 0 ? 0.875 : 1,
      nature: index === 0 ? "ようき" : null,
      teraType: index === 0 ? "fire" : null,
      evs: index === 0 ? { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 } : null,
      statPoints:
        index === 1
          ? {
              hp: 32,
              attack: 0,
              defense: 10,
              specialAttack: 0,
              specialDefense: 24,
              speed: 0,
            }
          : null,
      ivs: null,
      actualStats:
        index === 0
          ? {
              hp: 153,
              attack: 150,
              defense: 100,
              specialAttack: 90,
              specialDefense: 105,
              speed: 167,
            }
          : null,
      statDataStatus: index === 0 ? "exact" : "partial",
      role: index === 0 ? ("lead" as const) : ("support" as const),
      threatNotes: index === 0 ? "積み展開に注意" : null,
      pokemon: {
        id: index + 1,
        nameJa: index === 0 ? "メガリザードンX" : `ポケモン${index + 1}`,
        nameEn: index === 0 ? "Mega Charizard X" : `Pokemon ${index + 1}`,
        form: index === 0 ? "mega-x" : "normal",
        type1: index === 0 ? ("fire" as const) : ("normal" as const),
        type2: index === 0 ? ("dragon" as const) : null,
        isMega: index === 0,
      },
      item: index === 0 ? { id: 1, nameJa: "リザードナイトX", nameEn: "Charizardite X" } : null,
      ability: index === 0 ? { id: 1, nameJa: "かたいツメ", nameEn: "Tough Claws" } : null,
      moves: [
        {
          moveId: index + 1,
          nameJa: index === 0 ? "フレアドライブ" : `技${index + 1}`,
          nameEn: index === 0 ? "Flare Blitz" : `Move ${index + 1}`,
          type: index === 0 ? ("fire" as const) : ("normal" as const),
          category: "physical" as const,
          power: 120,
          accuracy: 100,
          priority: 0,
          tags: [],
          adoptionRate: 1,
        },
      ],
    })),
    sources: [
      {
        title: "公式大会結果",
        url: "https://example.com/very/long/source/path",
        siteName: "Example",
      },
    ],
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderRoute(path = `/battle/${sessionId}/archetypes/${archetypeId}`) {
  window.history.replaceState({}, "", path);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { ...render(<App />, { wrapper }), queryClient };
}

describe("WEB-008 archetype detail page", () => {
  beforeEach(() => {
    resetAuthStoreForTests();
    useAuthStore.getState().setAuthenticated(authResponse);
  });

  it("Archetype IDごとのquery keyを生成する", () => {
    expect(archetypeQueryKeys.detail(archetypeId)).toEqual(["archetypes", "detail", archetypeId]);
    expect(archetypeQueryKeys.detail(archetypeId)).not.toEqual(
      archetypeQueryKeys.detail("30000000-0000-4000-8000-000000000002"),
    );
  });

  it("loadingを認識可能な状態で表示する", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    renderRoute();
    expect(screen.getByRole("status")).toHaveTextContent("構築詳細を読み込んでいます");
  });

  it("構築・Rule・6体・技・持ち物・基本選出・notes・出典を表示する", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${authResponse.accessToken}`,
      );
      return Promise.resolve(response(detail()));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderRoute();

    expect(await screen.findByRole("heading", { name: "メガリザードン展開" })).toBeVisible();
    expect(screen.getByText("シングルバトル")).toBeVisible();
    expect(screen.getByText("6体構築 · 3体選出 · Lv.50")).toBeVisible();
    expect(screen.getAllByText(/^SLOT /u)).toHaveLength(6);
    expect(screen.getByRole("heading", { name: "メガリザードンX" })).toBeVisible();
    expect(screen.getByText("メガシンカ")).toBeVisible();
    expect(screen.getByText("リザードナイトX")).toBeVisible();
    expect(screen.getByText("かたいツメ")).toBeVisible();
    expect(screen.getByText("フレアドライブ")).toBeVisible();
    expect(screen.getByText("採用率 87.5%")).toBeVisible();
    expect(screen.getByText("出典で確認済み")).toBeVisible();
    expect(screen.getAllByText("実数値未確認")).toHaveLength(5);
    expect(screen.getAllByText("未確認").length).toBeGreaterThan(0);
    expect(screen.getByText("積み展開に注意")).toBeVisible();
    expect(screen.getByText("壁から積みエースを展開する")).toBeVisible();

    const defaultPicks = screen.getByRole("heading", { name: "基本選出" }).parentElement;
    expect(defaultPicks).not.toBeNull();
    expect(within(defaultPicks!).getByText("メガリザードンX")).toBeVisible();
    expect(within(defaultPicks!).getByText("ポケモン2")).toBeVisible();
    expect(within(defaultPicks!).getByText("ポケモン3")).toBeVisible();

    const source = screen.getByRole("link", {
      name: "公式大会結果（外部サイトを新しいタブで開く）",
    });
    expect(source).toHaveAttribute("href", "https://example.com/very/long/source/path");
    expect(source).toHaveAttribute("target", "_blank");
    expect(source).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "← 対戦画面へ戻る" })).toHaveAttribute(
      "href",
      `/battle/${sessionId}`,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("能力ポイントを努力値と別表示し、相互に補完しない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response(detail()))),
    );
    renderRoute();

    const evPokemon = (await screen.findByRole("heading", { name: "メガリザードンX" })).closest(
      "li",
    );
    const statPointPokemon = screen.getByRole("heading", { name: "ポケモン2" }).closest("li");
    expect(evPokemon).not.toBeNull();
    expect(statPointPokemon).not.toBeNull();

    const evSection = within(evPokemon!).getByRole("heading", { name: "努力値" }).parentElement;
    const emptyStatPointSection = within(evPokemon!).getByRole("heading", {
      name: "能力ポイント",
    }).parentElement;
    expect(evSection).toHaveTextContent("252");
    expect(emptyStatPointSection).toHaveTextContent("データ未登録");

    const emptyEvSection = within(statPointPokemon!).getByRole("heading", {
      name: "努力値",
    }).parentElement;
    const statPointSection = within(statPointPokemon!).getByRole("heading", {
      name: "能力ポイント",
    }).parentElement;
    expect(emptyEvSection).toHaveTextContent("データ未登録");
    expect(statPointSection).toHaveTextContent("HP32");
    expect(statPointSection).toHaveTextContent("防御10");
    expect(statPointSection).toHaveTextContent("特防24");
    expect(statPointSection).not.toHaveTextContent("努力値");
  });

  it("nullable・空配列を虚偽の値で補完せず空状態として表示する", async () => {
    const value = detail();
    value.defaultLeads = [];
    value.playstyleNotes = null;
    value.sources = [];
    value.pokemons[0] = {
      ...value.pokemons[0]!,
      item: null,
      ability: null,
      nature: null,
      teraType: null,
      evs: null,
      statPoints: null,
      ivs: null,
      actualStats: null,
      statDataStatus: "partial",
      threatNotes: null,
      moves: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response(value))),
    );
    renderRoute();

    expect(await screen.findByText("基本選出の登録なし")).toBeVisible();
    expect(screen.getByText("立ち回りメモの登録なし")).toBeVisible();
    expect(screen.getByText("出典の登録なし")).toBeVisible();
    expect(screen.getAllByText("持ち物なし").length).toBeGreaterThan(0);
    expect(screen.getByText("技データ未登録")).toBeVisible();
    expect(screen.getAllByText("データ未登録").length).toBeGreaterThan(1);
    expect(screen.getAllByText("備考なし").length).toBeGreaterThan(0);
  });

  it("基本選出が登録済みの場合は従来どおりslot順で表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response(detail()))),
    );
    renderRoute();

    const defaultPicks = (await screen.findByRole("heading", { name: "基本選出" })).parentElement;
    expect(defaultPicks).not.toBeNull();
    expect(within(defaultPicks!).queryByText("基本選出の登録なし")).not.toBeInTheDocument();
    expect(within(defaultPicks!).getByText("メガリザードンX")).toBeVisible();
    expect(within(defaultPicks!).getByText("ポケモン2")).toBeVisible();
    expect(within(defaultPicks!).getByText("ポケモン3")).toBeVisible();
  });

  it.each([
    [404, "NOT_FOUND", "見つからないか、現在は公開されていません"],
    [500, "INTERNAL_ERROR", "現在、構築詳細を表示できません"],
  ])("%iを内部detailなしの安全なエラー表示にする", async (status, code, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          response(
            {
              type: "about:blank",
              title: "server title",
              status,
              detail: "private database status and SQL",
              code,
            },
            status,
          ),
        ),
      ),
    );
    renderRoute();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).not.toHaveTextContent("private database");
    expect(screen.getByRole("button", { name: "再読み込み" })).toBeVisible();
  });

  it("不正IDではAPIを呼ばず、戻る導線付きエラーを表示する", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderRoute(`/battle/${sessionId}/archetypes/not-a-uuid`);

    expect(screen.getByRole("alert")).toHaveTextContent("構築IDが正しくありません");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "対戦画面へ戻る" })).toHaveAttribute(
      "href",
      `/battle/${sessionId}`,
    );
  });

  it("危険URLを含む不正レスポンスを表示せず、HTML文字列をテキストとして扱う", async () => {
    const unsafe = detail();
    unsafe.description = "<script>window.stolen = true</script>";
    unsafe.sources[0] = {
      ...unsafe.sources[0]!,
      url: "javascript:alert(1)",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response(unsafe))),
    );
    renderRoute();

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("link", { name: /公式大会結果/u })).not.toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("長い名称とURLを省略せず安全な要素へ表示する", async () => {
    const value = detail();
    value.name = "長い構築名".repeat(12);
    value.pokemons[0]!.pokemon.nameJa = "長いポケモン名".repeat(15);
    value.sources[0]!.url = `https://example.com/${"long-segment".repeat(40)}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response(value))),
    );
    renderRoute();

    expect(await screen.findByRole("heading", { name: value.name })).toBeVisible();
    expect(screen.getByRole("heading", { name: value.pokemons[0]!.pokemon.nameJa })).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /公式大会結果/u })).toHaveAttribute(
        "href",
        value.sources[0]!.url,
      ),
    );
  });
});
