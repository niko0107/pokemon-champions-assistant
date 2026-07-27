import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BattleCandidate, BattleCandidatesResponse } from "@pokemon-champions/shared";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-client";
import { battleQueryKeys } from "./battle-api";
import { BattleCandidatesPanel } from "./battle-candidates";
import type { StoredBattleObservation } from "./battle-session-storage";

const sessionId = "10000000-0000-4000-8000-000000000001";
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
const observations: StoredBattleObservation[] = [
  {
    type: "pokemon",
    pokemon: charizard,
    observation: {
      id: "20000000-0000-4000-8000-000000000001",
      sessionId,
      seq: 1,
      kind: "pokemon",
      pokemonId: 6,
      moveId: null,
      itemId: null,
      abilityId: null,
      position: null,
      isRevoked: false,
      createdAt: "2026-07-27T00:00:00.000Z",
    },
  },
  {
    type: "move",
    move: flamethrower,
    observation: {
      id: "20000000-0000-4000-8000-000000000002",
      sessionId,
      seq: 2,
      kind: "move",
      pokemonId: 6,
      moveId: 53,
      itemId: null,
      abilityId: null,
      position: null,
      isRevoked: false,
      createdAt: "2026-07-27T00:00:01.000Z",
    },
  },
];

const candidate: BattleCandidate = {
  archetypeId: "30000000-0000-4000-8000-000000000001",
  name: "リザードン展開",
  matchRate: 87.5,
  rank: 1,
  popularityTier: "high",
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
  contradictions: [
    {
      observationSeq: 2,
      kind: "move",
      penaltyPoints: -12,
      contradictionCode: "move_not_in_archetype",
      pokemonId: 6,
      moveId: 53,
    },
  ],
  exclusionCodes: ["pokemon_miss_threshold"],
  likelyUnseen: [{ pokemonId: 25, usageRate: 0.875 }],
  threatMoveIds: [85],
};

function pokemonDetailResponse(id: number): Response {
  return new Response(
    JSON.stringify({
      id,
      dexNo: 25,
      nameJa: "ピカチュウ",
      nameEn: "Pikachu",
      form: "normal",
      type1: "electric",
      type2: null,
      isMega: false,
      basePokemonId: null,
      baseHp: 35,
      baseAtk: 55,
      baseDef: 40,
      baseSpa: 50,
      baseSpd: 50,
      baseSpe: 90,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
  };
}

function panel(
  response: BattleCandidatesResponse | undefined,
  overrides: Partial<React.ComponentProps<typeof BattleCandidatesPanel>> = {},
) {
  const props: React.ComponentProps<typeof BattleCandidatesPanel> = {
    sessionId,
    isActive: true,
    response,
    observations,
    isLoading: false,
    isFetching: false,
    error: null,
    selectedArchetypeId: null,
    selectingArchetypeId: null,
    selectionError: null,
    onSelect: () => undefined,
    onRetry: () => undefined,
    ...overrides,
  };
  return <BattleCandidatesPanel {...props} />;
}

describe("WEB-003 candidate panel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const id = Number(String(input).split("/").at(-1));
        return Promise.resolve(pokemonDetailResponse(id));
      }),
    );
  });

  it("候補query keyをSession IDごとに分離する", () => {
    expect(battleQueryKeys.candidates(sessionId)).toEqual(["battle", "candidates", sessionId]);
    expect(battleQueryKeys.candidates(sessionId)).not.toEqual(
      battleQueryKeys.candidates("10000000-0000-4000-8000-000000000002"),
    );
  });

  it("初回loadingと候補0件を別の正常状態として表示する", () => {
    const loading = render(panel(undefined, { isLoading: true, isFetching: true }), {
      wrapper: createWrapper(),
    });
    expect(screen.getByText("候補を読み込んでいます…")).toBeVisible();
    loading.unmount();

    render(panel({ sessionId, candidates: [] }), { wrapper: createWrapper() });
    expect(screen.getByText("表示できる候補はまだありません")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("サーバー順の上位3件と公開表示項目をすべて表示する", async () => {
    const response: BattleCandidatesResponse = {
      sessionId,
      candidates: [
        { ...candidate, name: "返却順A", rank: 2 },
        {
          ...candidate,
          archetypeId: "30000000-0000-4000-8000-000000000002",
          name: "返却順B",
          rank: 1,
          popularityTier: "mid",
          likelyUnseen: [],
        },
        {
          ...candidate,
          archetypeId: "30000000-0000-4000-8000-000000000003",
          name: "返却順C",
          rank: 3,
          popularityTier: "low",
          likelyUnseen: [],
        },
      ],
    };
    render(panel(response), { wrapper: createWrapper() });

    const candidates = screen.getByRole("list", { name: "構築候補上位3件" });
    const headings = within(candidates).getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "返却順A",
      "返却順B",
      "返却順C",
    ]);
    expect(within(candidates).getAllByText("87.5")).toHaveLength(3);
    expect(within(candidates).getByText("人気度 高")).toBeVisible();
    expect(within(candidates).getByText("人気度 中")).toBeVisible();
    expect(within(candidates).getByText("人気度 低")).toBeVisible();
    expect(within(candidates).getAllByText("リザードン").length).toBeGreaterThan(0);
    expect(within(candidates).getAllByText("リザードン · かえんほうしゃ").length).toBeGreaterThan(
      0,
    );
    expect(
      within(candidates).getAllByText("観測した技が構築に含まれません").length,
    ).toBeGreaterThan(0);
    expect(
      within(candidates).getAllByText("構築に含まれない観測ポケモンが規定数に達しています").length,
    ).toBeGreaterThan(0);
    expect(await within(candidates).findByText("ピカチュウ")).toBeVisible();
    expect(within(candidates).getByText("採用率 87.5%")).toBeVisible();
    expect(within(candidates).getAllByText("技 ID: 85").length).toBeGreaterThan(0);
    expect(candidates).not.toHaveTextContent("rawScore");
    expect(candidates).not.toHaveTextContent("maxScore");
    expect(candidates).not.toHaveTextContent("excluded");
  });

  it("不明ID・未知コード・Pokemon詳細失敗でも候補全体を壊さない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network"))),
    );
    const unknownCandidate = {
      ...candidate,
      matched: [
        {
          observationSeq: 3,
          kind: "item",
          matched: false,
          points: 0,
          pokemonId: 999,
          itemId: 123,
        },
      ],
      contradictions: [
        {
          observationSeq: 3,
          kind: "item",
          penaltyPoints: -1,
          contradictionCode: "future_code",
          pokemonId: 999,
          itemId: 123,
        },
      ],
      exclusionCodes: ["future_exclusion"],
      likelyUnseen: [{ pokemonId: 999, usageRate: 0.4 }],
    } as unknown as BattleCandidate;

    render(panel({ sessionId, candidates: [unknownCandidate] }), { wrapper: createWrapper() });

    expect(screen.getByText("Pokemon ID: 999 · 持ち物 ID: 123")).toBeVisible();
    expect(screen.getByText("Pokemon ID: 999")).toBeVisible();
    expect(screen.getAllByText("未分類の判定情報があります")).toHaveLength(2);
    expect(screen.queryByText(/future_code|future_exclusion/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("リザードン展開")).toBeVisible());
  });

  it("候補更新時に順位変動を通知し、更新中は直前候補を維持する", async () => {
    const first: BattleCandidatesResponse = {
      sessionId,
      candidates: [
        candidate,
        {
          ...candidate,
          archetypeId: "30000000-0000-4000-8000-000000000002",
          name: "雨展開",
          rank: 2,
        },
      ],
    };
    const rendered = render(panel(first), { wrapper: createWrapper() });
    expect(screen.queryByText("↑ UP")).not.toBeInTheDocument();

    rendered.rerender(panel(first, { isFetching: true }));
    expect(screen.getByText("候補を更新中…")).toBeVisible();
    expect(screen.getByText("リザードン展開")).toBeVisible();

    rendered.rerender(
      panel({
        sessionId,
        candidates: [
          {
            ...candidate,
            archetypeId: "30000000-0000-4000-8000-000000000002",
            name: "雨展開",
            rank: 1,
          },
          { ...candidate, rank: 2 },
        ],
      }),
    );
    expect(await screen.findByLabelText("2位から1位へ上昇")).toBeVisible();
    expect(screen.getByLabelText("1位から2位へ下降")).toBeVisible();
    expect(screen.getByText("候補順位が更新されました。")).toBeInTheDocument();
  });

  it("RFC 9457 codeと通信エラーを安全な候補エラーへ変換する", () => {
    const internalDetail = "Redis URLを含む内部詳細";
    const error = new ApiError("server title", {
      status: 400,
      problem: {
        type: "about:blank",
        title: "server title",
        status: 400,
        detail: internalDetail,
        code: "INVALID_SESSION_STATE",
      },
    });
    const first = render(panel(undefined, { error }), { wrapper: createWrapper() });
    expect(screen.getByRole("alert")).toHaveTextContent("候補を取得できません");
    expect(screen.getByRole("alert")).not.toHaveTextContent(internalDetail);
    first.unmount();

    render(panel(undefined, { error: new ApiError("network") }), { wrapper: createWrapper() });
    expect(screen.getByRole("alert")).toHaveTextContent("通信環境");
  });

  it("候補を一度だけ選択し、選択中・選択済み・失敗を明示する", async () => {
    const onSelect = vi.fn();
    const response = { sessionId, candidates: [candidate] };
    const user = userEvent.setup();
    const rendered = render(panel(response, { onSelect }), { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: "この構築で対策を見る" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(candidate.archetypeId);

    rendered.rerender(
      panel(response, {
        onSelect,
        selectingArchetypeId: candidate.archetypeId,
      }),
    );
    expect(screen.getByRole("button", { name: "選択中…" })).toBeDisabled();

    rendered.rerender(
      panel(response, {
        onSelect,
        selectedArchetypeId: candidate.archetypeId,
      }),
    );
    expect(screen.getByRole("button", { name: "選択済み" })).toBeDisabled();

    rendered.rerender(
      panel(response, {
        onSelect,
        selectionError: new ApiError("internal", {
          status: 409,
          problem: {
            type: "about:blank",
            title: "internal",
            status: 409,
            detail: "secret",
            code: "BATTLE_CONFLICT",
          },
        }),
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("すでに選択済み");
    expect(screen.getByRole("alert")).not.toHaveTextContent("secret");
  });

  it("候補選択と干渉しない構築詳細リンクをSession文脈付きで表示する", () => {
    const onSelect = vi.fn();
    render(panel({ sessionId, candidates: [candidate] }, { onSelect }), {
      wrapper: createWrapper(),
    });

    expect(screen.getByRole("link", { name: "構築詳細を見る" })).toHaveAttribute(
      "href",
      `/battle/${sessionId}/archetypes/${candidate.archetypeId}`,
    );
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "この構築で対策を見る" })).toBeEnabled();
  });
});
