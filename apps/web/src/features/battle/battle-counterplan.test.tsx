import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import {
  sessionCounterplanResponseSchema,
  type SessionCounterplanResponse,
} from "@pokemon-champions/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-client";
import { BattleCounterplanPanel } from "./battle-counterplan";

const sessionId = "10000000-0000-4000-8000-000000000001";
const archetypeId = "30000000-0000-4000-8000-000000000001";

const matchupResult = {
  selfPokemonId: 1,
  myPokemonId: 1,
  opponentPokemonId: 101,
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
        return Promise.reject(new Error(`Unexpected request: ${url}`));
      }),
    );
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
});
