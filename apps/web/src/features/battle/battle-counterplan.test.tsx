import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import {
  sessionCounterplanResponseSchema,
  type SessionCounterplanResponse,
} from "@pokemon-champions/shared";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-client";
import { resetAuthStoreForTests, useAuthStore } from "../../stores/auth-store";
import { BattleCounterplanPanel } from "./battle-counterplan";

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
    email: "battle@example.com",
    displayName: "Battle Trainer",
    role: "user" as const,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  },
};

const matchupResult = {
  selfPokemonId: 1,
  myPokemonId: 1,
  opponentPokemonId: 101,
  calculationMode: "full",
  offensiveScore: 25,
  defensiveScore: 20,
  damageRaceScore: 5,
  totalScore: 44,
  classification: "slightly_favorable",
  bestOffensiveMoveId: 11,
  mostThreateningMoveId: 21,
  outgoingDamage: {
    moveId: 11,
    category: "special",
    minDamage: 80,
    maxDamage: 80,
    minDamagePercent: 52.6,
    maxDamagePercent: 52.6,
    typeMultiplier: 2,
    stabMultiplier: 1.5,
    attackerStat: 150,
    defenderStat: 120,
    canDamage: true,
    isImmune: false,
    knockoutCount: 2,
    possibleKnockoutCount: 2,
    knockoutClassification: "guaranteed_two_hit",
  },
  incomingDamage: null,
  outgoingKnockoutCount: 2,
  incomingKnockoutCount: null,
  offensiveTypeMultiplier: 2,
  defensiveTypeMultiplier: null,
  reasonCodes: ["BEST_MOVE_SUPER_EFFECTIVE", "WINS_DAMAGE_RACE"],
  score: 44,
  verdict: "slightly_favorable",
  breakdown: {
    offense: 25,
    defense: 20,
    speed: 4,
    damageRace: 5,
    priority: 2,
    statusResist: 1,
    setupCounter: 3,
  },
} as const;

const counterplan: SessionCounterplanResponse = sessionCounterplanResponseSchema.parse({
  sessionId,
  selectedArchetypeId: archetypeId,
  perOpponent: [
    {
      opponentPokemonId: 101,
      recommendations: [
        {
          rank: 1,
          selfPokemonId: 1,
          opponentPokemonId: 101,
          totalScore: 44,
          classification: "slightly_favorable",
          reasonCodes: ["BEST_MOVE_SUPER_EFFECTIVE", "WINS_DAMAGE_RACE"],
          matchupResult,
        },
      ],
      avoidSelfPokemonIds: [],
      cautionMoves: [
        {
          moveId: 21,
          opponentPokemonId: 101,
          tags: ["hazard"],
          primaryTag: "hazard",
          adoptionRate: 0.9,
          opponentUsageRate: 1,
        },
      ],
      threatNotes: [{ opponentPokemonId: 101, note: "あくびからの展開に注意" }],
    },
  ],
  selection: {
    selectedPokemonIds: [1],
    leadPokemonId: 1,
    assignmentsByOpponent: [
      {
        opponentPokemonId: 101,
        assignedSelfPokemonId: 1,
        matchupResult,
      },
    ],
    coveredOpponentPokemonIds: [101],
    uncoveredOpponentPokemonIds: [],
    metrics: {
      priorityCoveredCount: 1,
      coveredCount: 1,
      worstBestScore: 44,
      bestScoreSum: 44,
      secondBestScoreSum: 0,
    },
  },
  playstyleNotes: "起点を作って展開する構築",
  strategyCodes: ["LIMIT_HAZARDS", "MANAGE_STATUS"],
  cautionMoves: [
    {
      moveId: 21,
      opponentPokemonId: 101,
      tags: ["hazard"],
      primaryTag: "hazard",
      adoptionRate: 0.9,
      opponentUsageRate: 1,
    },
  ],
  threatNotes: [{ opponentPokemonId: 101, note: "あくびからの展開に注意" }],
  explanation: {
    summary: "相手ポケモン1体への対策です。",
    selectionExplanation: "選出はポケモンID 1です。",
    perOpponent: [
      {
        opponentPokemonId: 101,
        explanation: "ポケモンID 101にはポケモンID 1がおすすめです。",
      },
    ],
    strategyExplanation: "場に設置する技を警戒する。",
  },
});

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function panel(overrides: Partial<React.ComponentProps<typeof BattleCounterplanPanel>> = {}) {
  const props: React.ComponentProps<typeof BattleCounterplanPanel> = {
    sessionId,
    enabled: true,
    response: counterplan,
    responseUpdatedAt: 1,
    isLoading: false,
    isFetching: false,
    error: null,
    onRetry: () => undefined,
    ...overrides,
  };
  return <BattleCounterplanPanel {...props} />;
}

function pokemonDetail(id: number) {
  return {
    id,
    dexNo: id,
    nameJa: id === 1 ? "アシレーヌ" : "カバルドン",
    nameEn: id === 1 ? "Primarina" : "Hippowdon",
    form: "normal",
    type1: id === 1 ? "water" : "ground",
    type2: null,
    isMega: false,
    basePokemonId: null,
    baseHp: 100,
    baseAtk: 100,
    baseDef: 100,
    baseSpa: 100,
    baseSpd: 100,
    baseSpe: 100,
  };
}

describe("WEB-007 counterplan panel", () => {
  beforeEach(() => {
    resetAuthStoreForTests();
    useAuthStore.getState().setAuthenticated(authResponse);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        const pokemonMatch = url.match(/\/master\/pokemons\/(\d+)$/u);
        if (pokemonMatch) {
          return Promise.resolve(
            new Response(JSON.stringify(pokemonDetail(Number(pokemonMatch[1]))), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        if (url.includes("/master/moves?")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                items: [
                  {
                    id: 11,
                    nameJa: "ムーンフォース",
                    nameEn: "Moonblast",
                    type: "fairy",
                    category: "special",
                    power: 95,
                    accuracy: 100,
                    priority: 0,
                    tags: [],
                  },
                  {
                    id: 21,
                    nameJa: "ステルスロック",
                    nameEn: "Stealth Rock",
                    type: "rock",
                    category: "status",
                    power: null,
                    accuracy: null,
                    priority: 0,
                    tags: ["hazard"],
                  },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        if (url.endsWith(`/sessions/${sessionId}/counterplan/explanation`)) {
          return Promise.resolve(
            new Response(JSON.stringify({ status: "unavailable", explanation: null }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`));
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAuthStoreForTests();
  });

  it("未取得empty、loading、RFC 9457エラーを別状態として表示する", () => {
    const empty = render(panel({ enabled: false, response: undefined }), {
      wrapper: wrapper(),
    });
    expect(screen.getByText("対策はまだ読み込まれていません")).toBeVisible();
    empty.unmount();

    const loading = render(panel({ response: undefined, isLoading: true, isFetching: true }), {
      wrapper: wrapper(),
    });
    expect(screen.getByText("対策を計算しています…")).toBeVisible();
    loading.unmount();

    render(
      panel({
        response: undefined,
        error: new ApiError("internal", {
          status: 400,
          problem: {
            type: "about:blank",
            title: "internal",
            status: 400,
            detail: "表示してはいけない内部情報",
            code: "INVALID_ARCHETYPE_SELECTION",
          },
        }),
      }),
      { wrapper: wrapper() },
    );
    expect(screen.getByRole("alert")).toHaveTextContent("まだ選択されていない");
    expect(screen.getByRole("alert")).not.toHaveTextContent("表示してはいけない");
    expect(screen.getByRole("button", { name: "再読み込み" })).toBeVisible();
  });

  it("IDをmaster名称へ結合し、selection・priority・内訳・警戒情報を表示する", async () => {
    render(panel(), { wrapper: wrapper() });

    expect(screen.getByText("相手ポケモン1体への対策です。")).toBeVisible();
    expect(screen.getByText("選出はポケモンID 1です。")).toBeVisible();
    expect(screen.getByText("場に設置する技を警戒する。")).toBeVisible();
    expect(screen.getByText("ポケモンID 101にはポケモンID 1がおすすめです。")).toBeVisible();
    expect((await screen.findAllByText("アシレーヌ"))[0]).toBeVisible();
    expect(screen.getAllByText("カバルドン").length).toBeGreaterThan(0);
    expect(screen.getByText("先発候補")).toBeVisible();
    expect(screen.getByText(/優先対象への対応/u)).toHaveTextContent("1");
    expect(screen.getAllByText("やや有利")[0]).toBeVisible();
    expect(screen.getByText("最良技で弱点を突ける")).toBeVisible();
    expect(screen.getByText("確定数の競争で優位")).toBeVisible();
    expect(screen.getByText("MATCHUP 内訳")).toBeVisible();
    expect(screen.getByText(/ムーンフォース · 52\.6%/u)).toBeVisible();
    expect(screen.getAllByText("ステルスロック").length).toBeGreaterThan(0);
    expect(screen.getByText("起点を作って展開する構築")).toBeVisible();
    expect(screen.getByText("・設置技の回数を抑える")).toBeVisible();
    expect(screen.getByText("・状態異常を管理する")).toBeVisible();
    expect(screen.getAllByText("あくびからの展開に注意").length).toBeGreaterThan(0);
  });

  it("実数値が不明な相手はタイプ相性のみを表示し、ダメージ・確定数・素早さを作らない", async () => {
    const typeOnlyMatchupResult = {
      ...matchupResult,
      calculationMode: "type_only" as const,
      damageRaceScore: 0,
      outgoingDamage: null,
      incomingDamage: null,
      outgoingKnockoutCount: null,
      incomingKnockoutCount: null,
      reasonCodes: ["BEST_MOVE_SUPER_EFFECTIVE"] as const,
      breakdown: {
        ...matchupResult.breakdown,
        damageRace: 0,
        speed: 0,
      },
    };
    const typeOnlyResponse = sessionCounterplanResponseSchema.parse({
      ...counterplan,
      perOpponent: [
        {
          ...counterplan.perOpponent[0],
          recommendations: [
            {
              ...counterplan.perOpponent[0]!.recommendations[0],
              reasonCodes: ["BEST_MOVE_SUPER_EFFECTIVE"],
              matchupResult: typeOnlyMatchupResult,
            },
          ],
        },
      ],
      selection: {
        ...counterplan.selection,
        assignmentsByOpponent: [
          {
            ...counterplan.selection.assignmentsByOpponent[0],
            matchupResult: typeOnlyMatchupResult,
          },
        ],
      },
    });

    render(panel({ response: typeOnlyResponse }), { wrapper: wrapper() });

    expect(await screen.findByText("タイプ相性のみ")).toBeVisible();
    expect(screen.getByText(/ダメージ・確定数・素早さは算出していません/u)).toBeVisible();
    expect(screen.queryByText(/ムーンフォース · 52\.6%/u)).not.toBeInTheDocument();
    expect(screen.queryByText("確定数の競争で優位")).not.toBeInTheDocument();
  });

  it("master取得失敗でもcounterplanを壊さずID fallbackを表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network unavailable"))),
    );
    render(panel(), { wrapper: wrapper() });

    expect(await screen.findByText(/一部の名称を取得できなかったため/u)).toBeVisible();
    expect(screen.getAllByText("Pokemon #1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("技 #21").length).toBeGreaterThan(0);
    expect(screen.getByText("起点を作って展開する構築")).toBeVisible();
  });

  it("pending中はTemplateを維持し、2秒後のreadyで説明だけを差し替えて停止する", async () => {
    vi.useFakeTimers();
    let statusRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/sessions/${sessionId}/counterplan/explanation`)) {
          statusRequests += 1;
          return Promise.resolve(
            new Response(
              JSON.stringify(
                statusRequests === 1
                  ? { status: "pending", explanation: null }
                  : {
                      status: "ready",
                      explanation: {
                        summary: "AIがまとめた全体概要です。",
                        selectionExplanation: "AIがまとめた選出理由です。",
                        perOpponent: [
                          {
                            opponentPokemonId: 101,
                            explanation: "AIがまとめた相手別説明です。",
                          },
                        ],
                        strategyExplanation: "AIがまとめた立ち回りです。",
                      },
                    },
              ),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        const pokemonMatch = url.match(/\/master\/pokemons\/(\d+)$/u);
        if (pokemonMatch) {
          return Promise.resolve(
            new Response(JSON.stringify(pokemonDetail(Number(pokemonMatch[1]))), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        if (url.includes("/master/moves?")) {
          return Promise.resolve(
            new Response(JSON.stringify({ items: [] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`));
      }),
    );

    render(panel(), { wrapper: wrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(statusRequests).toBe(1);
    expect(screen.getByText("相手ポケモン1体への対策です。")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("AIによる説明を生成しています");
    expect(screen.getByText("先発候補")).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
      await Promise.resolve();
    });
    expect(statusRequests).toBe(2);
    await vi.waitFor(() => expect(screen.getByText("AIがまとめた全体概要です。")).toBeVisible());
    expect(screen.getByText("AIがまとめた選出理由です。")).toBeVisible();
    expect(screen.getByText("AIがまとめた立ち回りです。")).toBeVisible();
    expect(screen.getByText("AIがまとめた相手別説明です。")).toBeVisible();
    expect(screen.queryByText("相手ポケモン1体への対策です。")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("AIによる説明");
    expect(screen.getByText("先発候補")).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(statusRequests).toBe(2);
  });

  it.each([
    ["failed", "AIによる説明を生成できなかったため、テンプレート説明を表示しています。"],
    ["unavailable", "現在はテンプレート説明を表示しています。"],
  ])("%sではTemplateを維持して終端状態を表示する", async (status, message) => {
    vi.useFakeTimers();
    let statusRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/sessions/${sessionId}/counterplan/explanation`)) {
          statusRequests += 1;
          return Promise.resolve(
            new Response(JSON.stringify({ status, explanation: null }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.reject(new Error("master unavailable"));
      }),
    );
    render(panel(), { wrapper: wrapper() });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(screen.getByText("相手ポケモン1体への対策です。")).toBeVisible();
    expect(screen.queryByText(/Anthropic|Claude|Redis|BullMQ/u)).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(statusRequests).toBe(1);
  });

  it("状態APIの500は1回だけretryし、Templateと構造化結果を維持する", async () => {
    vi.useFakeTimers();
    let statusRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/sessions/${sessionId}/counterplan/explanation`)) {
          statusRequests += 1;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                type: "about:blank",
                title: "internal",
                status: 500,
                detail: "秘密の内部理由",
                code: "INTERNAL_ERROR",
              }),
              { status: 500, headers: { "Content-Type": "application/problem+json" } },
            ),
          );
        }
        return Promise.reject(new Error("master unavailable"));
      }),
    );
    render(panel(), { wrapper: wrapper() });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1_100);
    });
    expect(statusRequests).toBe(2);
    expect(screen.getByText("相手ポケモン1体への対策です。")).toBeVisible();
    expect(screen.getByText("先発候補")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "現在はテンプレート説明を表示しています。",
    );
    expect(screen.queryByText("秘密の内部理由")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(statusRequests).toBe(2);
  });

  it("状態APIの404はretryせず、Templateを維持する", async () => {
    vi.useFakeTimers();
    let statusRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).endsWith(`/sessions/${sessionId}/counterplan/explanation`)) {
          statusRequests += 1;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                type: "about:blank",
                title: "not found",
                status: 404,
                code: "NOT_FOUND",
              }),
              { status: 404, headers: { "Content-Type": "application/problem+json" } },
            ),
          );
        }
        return Promise.reject(new Error("master unavailable"));
      }),
    );
    render(panel(), { wrapper: wrapper() });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(statusRequests).toBe(1);
    expect(screen.getByText("相手ポケモン1体への対策です。")).toBeVisible();
  });

  it("pending中にunmountすると追加ポーリングを行わない", async () => {
    vi.useFakeTimers();
    let statusRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).endsWith(`/sessions/${sessionId}/counterplan/explanation`)) {
          statusRequests += 1;
          return Promise.resolve(
            new Response(JSON.stringify({ status: "pending", explanation: null }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.reject(new Error("master unavailable"));
      }),
    );
    const view = render(panel(), { wrapper: wrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusRequests).toBe(1);

    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(statusRequests).toBe(1);
  });

  it("counterplan更新時は古いreadyを捨て、新しいTemplateでポーリングを再開する", async () => {
    let statusRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/sessions/${sessionId}/counterplan/explanation`)) {
          statusRequests += 1;
          return Promise.resolve(
            new Response(
              JSON.stringify(
                statusRequests === 1
                  ? {
                      status: "ready",
                      explanation: {
                        summary: "古いAI説明",
                        selectionExplanation: "古いAI選出理由",
                        perOpponent: [{ opponentPokemonId: 101, explanation: "古いAI相手別説明" }],
                        strategyExplanation: null,
                      },
                    }
                  : { status: "pending", explanation: null },
              ),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return Promise.reject(new Error("master unavailable"));
      }),
    );
    const testWrapper = wrapper();
    const view = render(panel(), { wrapper: testWrapper });
    expect(await screen.findByText("古いAI説明")).toBeVisible();

    const updatedCounterplan: SessionCounterplanResponse = {
      ...counterplan,
      explanation: {
        ...counterplan.explanation,
        summary: "更新後のTemplate説明",
      },
    };
    view.rerender(panel({ response: updatedCounterplan, responseUpdatedAt: 2 }));

    expect(screen.getByText("更新後のTemplate説明")).toBeVisible();
    expect(screen.queryByText("古いAI説明")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("AIによる説明を生成しています"),
    );
    expect(statusRequests).toBe(2);
  });

  it("Session変更後に旧Sessionの遅いreadyが新しい説明を上書きしない", async () => {
    const nextSessionId = "10000000-0000-4000-8000-000000000002";
    let resolveOldRequest: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/sessions/${sessionId}/counterplan/explanation`)) {
          return new Promise<Response>((resolve) => {
            resolveOldRequest = resolve;
          });
        }
        if (url.endsWith(`/sessions/${nextSessionId}/counterplan/explanation`)) {
          return Promise.resolve(
            new Response(JSON.stringify({ status: "pending", explanation: null }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.reject(new Error("master unavailable"));
      }),
    );
    const testWrapper = wrapper();
    const view = render(panel(), { wrapper: testWrapper });
    await waitFor(() => expect(resolveOldRequest).toBeTypeOf("function"));

    const nextCounterplan: SessionCounterplanResponse = {
      ...counterplan,
      sessionId: nextSessionId,
      explanation: {
        ...counterplan.explanation,
        summary: "新しいSessionのTemplate説明",
      },
    };
    view.rerender(
      panel({
        sessionId: nextSessionId,
        response: nextCounterplan,
        responseUpdatedAt: 2,
      }),
    );
    expect(screen.getByText("新しいSessionのTemplate説明")).toBeVisible();

    resolveOldRequest?.(
      new Response(
        JSON.stringify({
          status: "ready",
          explanation: {
            summary: "旧Sessionの遅いAI説明",
            selectionExplanation: "旧Sessionの選出説明",
            perOpponent: [{ opponentPokemonId: 101, explanation: "旧Sessionの相手別説明" }],
            strategyExplanation: null,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("新しいSessionのTemplate説明")).toBeVisible();
    expect(screen.queryByText("旧Sessionの遅いAI説明")).not.toBeInTheDocument();
  });

  it("readyの相手IDがcounterplanと一致しない場合はTemplateを安全に維持する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/sessions/${sessionId}/counterplan/explanation`)) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                status: "ready",
                explanation: {
                  summary: "採用してはいけない説明",
                  selectionExplanation: "採用してはいけない選出理由",
                  perOpponent: [{ opponentPokemonId: 999, explanation: "不一致" }],
                  strategyExplanation: null,
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return Promise.reject(new Error("master unavailable"));
      }),
    );
    render(panel(), { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "現在はテンプレート説明を表示しています。",
      ),
    );
    expect(screen.getByText("相手ポケモン1体への対策です。")).toBeVisible();
    expect(screen.queryByText("採用してはいけない説明")).not.toBeInTheDocument();
  });

  it("説明をHTMLやMarkdownとして解釈せず、nullの立ち回りは表示しない", async () => {
    const unsafeCounterplan = sessionCounterplanResponseSchema.parse({
      ...counterplan,
      explanation: {
        summary: "<script>window.hacked = true</script>",
        selectionExplanation: "**太字ではない選出理由**",
        perOpponent: [
          {
            opponentPokemonId: 101,
            explanation: "<a href='https://example.com'>リンクではない説明</a>",
          },
        ],
        strategyExplanation: null,
      },
    });
    render(panel({ response: unsafeCounterplan }), { wrapper: wrapper() });

    expect(screen.getByText("<script>window.hacked = true</script>")).toBeVisible();
    expect(screen.getByText("**太字ではない選出理由**")).toBeVisible();
    expect(screen.getByText("<a href='https://example.com'>リンクではない説明</a>")).toBeVisible();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.queryByRole("link", { name: "リンクではない説明" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "立ち回り" })).not.toBeInTheDocument();
  });

  it("長い説明を折り返し可能なプレーンテキストとして表示し、入力を変更しない", () => {
    const longSummary = "長い説明".repeat(200);
    const longCounterplan: SessionCounterplanResponse = {
      ...counterplan,
      explanation: {
        ...counterplan.explanation,
        summary: longSummary,
      },
    };
    const before = JSON.stringify(longCounterplan);
    render(panel({ response: longCounterplan }), { wrapper: wrapper() });

    expect(screen.getByText(longSummary)).toHaveClass("break-words", "whitespace-pre-wrap");
    expect(JSON.stringify(longCounterplan)).toBe(before);
  });
});
