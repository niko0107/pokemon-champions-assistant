import { useQueries } from "@tanstack/react-query";
import {
  ARCHETYPE_TEAM_SIZE_MAX,
  type BattleCandidate,
  type BattleCandidatesResponse,
} from "@pokemon-champions/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPokemonDetail, partyQueryKeys } from "../parties/party-api";
import { getBattleCandidatesErrorMessage, getBattleSelectionErrorMessage } from "./battle-errors";
import type { StoredBattleObservation } from "./battle-session-storage";

const MAX_POKEMON_DETAIL_REQUESTS = 3 * ARCHETYPE_TEAM_SIZE_MAX;

const POPULARITY_LABELS: Readonly<Record<BattleCandidate["popularityTier"], string>> = {
  high: "高",
  mid: "中",
  low: "低",
};

const CONTRADICTION_LABELS: Readonly<Record<string, string>> = {
  pokemon_not_in_archetype: "観測ポケモンが構築に含まれません",
  move_not_in_archetype: "観測した技が構築に含まれません",
  item_not_in_archetype: "観測した持ち物が構築に含まれません",
  ability_mismatch: "観測した特性と構築が一致しません",
  mega_not_in_archetype: "観測したメガ形態と構築が一致しません",
};

const EXCLUSION_LABELS: Readonly<Record<string, string>> = {
  pokemon_miss_threshold: "構築に含まれない観測ポケモンが規定数に達しています",
  mega_conflict: "メガ形態の観測が構築と矛盾しています",
};

type RankMovement = "new" | "up" | "down";

interface CandidatePanelProps {
  sessionId: string;
  isActive: boolean;
  response: BattleCandidatesResponse | undefined;
  observations: StoredBattleObservation[];
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  selectedArchetypeId: string | null;
  selectingArchetypeId: string | null;
  selectionError: unknown;
  onSelect: (archetypeId: string) => void;
  onRetry: () => void;
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits,
  }).format(value);
}

function fallbackCodeLabel(): string {
  return "未分類の判定情報があります";
}

function candidateObservationLabel(
  detail: BattleCandidate["matched"][number],
  pokemonNames: ReadonlyMap<number, string>,
  moveNames: ReadonlyMap<string, string>,
): string {
  const pokemonName =
    detail.pokemonId === undefined
      ? null
      : (pokemonNames.get(detail.pokemonId) ?? `Pokemon ID: ${detail.pokemonId}`);

  switch (detail.kind) {
    case "pokemon":
      return pokemonName ?? "Pokemon観測";
    case "move": {
      const moveName =
        detail.pokemonId === undefined || detail.moveId === undefined
          ? null
          : moveNames.get(`${detail.pokemonId}:${detail.moveId}`);
      const resolvedMove = moveName ?? `技 ID: ${detail.moveId ?? "不明"}`;
      return pokemonName ? `${pokemonName} · ${resolvedMove}` : resolvedMove;
    }
    case "item":
      return `${pokemonName ?? "対象Pokemon不明"} · 持ち物 ID: ${detail.itemId ?? "不明"}`;
    case "ability":
      return `${pokemonName ?? "対象Pokemon不明"} · 特性 ID: ${detail.abilityId ?? "不明"}`;
    case "position": {
      const positionLabel =
        detail.position === "lead" ? "先発" : detail.position === "back" ? "控え" : "位置不明";
      return `${pokemonName ?? "対象Pokemon不明"} · ${positionLabel}`;
    }
    case "mega":
      return `${pokemonName ?? "対象Pokemon不明"} · メガ観測`;
  }
}

function RankMovementBadge({
  movement,
  previousRank,
  currentRank,
}: {
  movement: RankMovement;
  previousRank?: number;
  currentRank: number;
}) {
  const label =
    movement === "new"
      ? "新しい候補"
      : movement === "up"
        ? `${previousRank}位から${currentRank}位へ上昇`
        : `${previousRank}位から${currentRank}位へ下降`;
  const visible = movement === "new" ? "NEW" : movement === "up" ? "↑ UP" : "↓ DOWN";

  return (
    <span
      aria-label={label}
      className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[0.65rem] font-black tracking-wide text-blue-900"
    >
      {visible}
    </span>
  );
}

export function BattleCandidatesPanel({
  sessionId,
  isActive,
  response,
  observations,
  isLoading,
  isFetching,
  error,
  selectedArchetypeId,
  selectingArchetypeId,
  selectionError,
  onSelect,
  onRetry,
}: CandidatePanelProps) {
  const previousRanks = useRef<Map<string, number> | null>(null);
  const [movements, setMovements] = useState<
    ReadonlyMap<string, { movement: RankMovement; previousRank?: number }>
  >(new Map());
  const candidates = useMemo(() => response?.candidates ?? [], [response]);

  const observedPokemonNames = useMemo(() => {
    const names = new Map<number, string>();
    for (const observation of observations) {
      if (observation.type === "pokemon") {
        names.set(observation.pokemon.id, observation.pokemon.nameJa);
      }
    }
    return names;
  }, [observations]);

  const observedMoveNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const observation of observations) {
      if (observation.type === "move" && observation.observation.moveId !== null) {
        names.set(
          `${observation.observation.pokemonId}:${observation.observation.moveId}`,
          observation.move.nameJa,
        );
      }
    }
    return names;
  }, [observations]);

  const likelyUnseenPokemonIds = useMemo(
    () =>
      Array.from(
        new Set(
          candidates.flatMap((candidate) =>
            candidate.likelyUnseen.map(({ pokemonId }) => pokemonId),
          ),
        ),
      ).slice(0, MAX_POKEMON_DETAIL_REQUESTS),
    [candidates],
  );

  const pokemonDetails = useQueries({
    queries: likelyUnseenPokemonIds.map((pokemonId) => ({
      queryKey: partyQueryKeys.pokemonDetail(pokemonId),
      queryFn: () => fetchPokemonDetail(pokemonId),
      retry: false,
      staleTime: 5 * 60 * 1_000,
    })),
  });

  const pokemonNames = useMemo(() => {
    const names = new Map(observedPokemonNames);
    pokemonDetails.forEach((query, index) => {
      const pokemonId = likelyUnseenPokemonIds[index];
      if (pokemonId !== undefined && query.data) {
        names.set(pokemonId, query.data.nameJa);
      }
    });
    return names;
  }, [likelyUnseenPokemonIds, observedPokemonNames, pokemonDetails]);

  useEffect(() => {
    if (!response) {
      return;
    }
    const nextRanks = new Map(
      response.candidates.map((candidate) => [candidate.archetypeId, candidate.rank]),
    );
    const previous = previousRanks.current;
    if (previous) {
      const nextMovements = new Map<string, { movement: RankMovement; previousRank?: number }>();
      for (const candidate of response.candidates) {
        const previousRank = previous.get(candidate.archetypeId);
        if (previousRank === undefined) {
          nextMovements.set(candidate.archetypeId, { movement: "new" });
        } else if (candidate.rank < previousRank) {
          nextMovements.set(candidate.archetypeId, { movement: "up", previousRank });
        } else if (candidate.rank > previousRank) {
          nextMovements.set(candidate.archetypeId, { movement: "down", previousRank });
        }
      }
      setMovements(nextMovements);
    }
    previousRanks.current = nextRanks;
  }, [response]);

  return (
    <section
      id={`battle-candidates-${sessionId}`}
      aria-labelledby={`battle-candidates-heading-${sessionId}`}
      className="mb-10 scroll-mt-5 border-y-2 border-blue-950 bg-white py-7 sm:mb-12 sm:py-9"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black tracking-[0.18em] text-blue-700">LIVE CANDIDATES</p>
          <h2
            id={`battle-candidates-heading-${sessionId}`}
            className="mt-2 text-2xl font-black tracking-tight sm:text-3xl"
          >
            現在の構築候補
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            サーバーが返した一致度順の上位3件です。観測の保存後に自動更新します。
          </p>
        </div>
        {isFetching && !isLoading && (
          <p role="status" className="flex items-center gap-2 text-sm font-bold text-blue-800">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800" />
            候補を更新中…
          </p>
        )}
      </div>

      {!isActive && (
        <p className="mt-7 text-sm font-semibold text-slate-500">
          候補はactiveな対戦セッションで確認できます。
        </p>
      )}

      {isActive && isLoading && (
        <div role="status" className="mt-7 flex items-center gap-3 py-8 text-sm text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800" />
          候補を読み込んでいます…
        </div>
      )}

      {isActive && error !== null && !response && (
        <div
          role="alert"
          className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
        >
          <span>{getBattleCandidatesErrorMessage(error)}</span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg px-2 py-1 font-black underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-red-700"
          >
            再読み込み
          </button>
        </div>
      )}

      {isActive && error !== null && response && (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
        >
          最新候補を取得できなかったため、直前の候補を表示しています。
        </p>
      )}

      {selectionError !== null && (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-900"
        >
          {getBattleSelectionErrorMessage(selectionError)}
        </p>
      )}

      {isActive && !isLoading && error === null && response && candidates.length === 0 && (
        <div className="mt-7 border-y border-dashed border-slate-300 py-9 text-center">
          <p className="font-black text-slate-700">表示できる候補はまだありません</p>
          <p className="mt-2 text-sm text-slate-500">
            観測情報や公開構築の状況により候補がない場合があります。
          </p>
        </div>
      )}

      {candidates.length > 0 && (
        <ol
          aria-label="構築候補上位3件"
          className="mt-7 divide-y divide-slate-200 border-y border-slate-200"
        >
          {candidates.map((candidate) => {
            const movement = movements.get(candidate.archetypeId);
            return (
              <li
                key={candidate.archetypeId}
                className="grid gap-5 py-6 md:grid-cols-[7rem_minmax(0,1fr)] md:gap-7"
              >
                <div className="flex items-end justify-between gap-4 md:block">
                  <p className="text-xs font-black tracking-[0.16em] text-slate-400">
                    RANK {String(candidate.rank).padStart(2, "0")}
                  </p>
                  <p className="mt-2 font-black tabular-nums text-blue-950">
                    <span className="text-4xl">{formatNumber(candidate.matchRate)}</span>
                    <span className="ml-1 text-sm">%</span>
                  </p>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-black text-slate-950">{candidate.name}</h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
                      人気度 {POPULARITY_LABELS[candidate.popularityTier]}
                    </span>
                    {movement && (
                      <RankMovementBadge
                        movement={movement.movement}
                        previousRank={movement.previousRank}
                        currentRank={candidate.rank}
                      />
                    )}
                  </div>

                  <div className="mt-5 grid gap-5 xl:grid-cols-3">
                    <div>
                      <h4 className="text-xs font-black tracking-[0.12em] text-slate-400">
                        観測との照合
                      </h4>
                      {candidate.matched.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-500">照合済みの観測はありません。</p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {candidate.matched.map((detail) => (
                            <li
                              key={`${detail.observationSeq}:${detail.kind}`}
                              className="text-sm leading-5 text-slate-700"
                            >
                              <span
                                className={`mr-2 font-black ${
                                  detail.matched ? "text-blue-800" : "text-slate-400"
                                }`}
                              >
                                {detail.matched ? "一致" : "不一致"}
                              </span>
                              {candidateObservationLabel(detail, pokemonNames, observedMoveNames)}
                              {detail.matched && (
                                <span className="ml-2 text-xs font-bold text-slate-400">
                                  +{formatNumber(detail.points, 2)}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <h4 className="text-xs font-black tracking-[0.12em] text-slate-400">
                        採用可能性が高い未観測Pokemon
                      </h4>
                      {candidate.likelyUnseen.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-500">未観測候補はありません。</p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {candidate.likelyUnseen.map(({ pokemonId, usageRate }) => (
                            <li
                              key={pokemonId}
                              className="flex justify-between gap-3 text-sm text-slate-700"
                            >
                              <span>
                                {pokemonNames.get(pokemonId) ?? `Pokemon ID: ${pokemonId}`}
                              </span>
                              <span className="shrink-0 text-xs font-bold tabular-nums text-slate-400">
                                採用率 {formatNumber(usageRate * 100)}%
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <h4 className="text-xs font-black tracking-[0.12em] text-slate-400">
                        警戒技
                      </h4>
                      {candidate.threatMoveIds.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-500">警戒技はありません。</p>
                      ) : (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {candidate.threatMoveIds.map((moveId) => (
                            <li
                              key={moveId}
                              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700"
                            >
                              技 ID: {moveId}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {(candidate.contradictions.length > 0 || candidate.exclusionCodes.length > 0) && (
                    <div className="mt-5 border-l-2 border-amber-300 pl-4">
                      <h4 className="text-xs font-black tracking-[0.12em] text-amber-800">
                        矛盾・除外情報
                      </h4>
                      <ul className="mt-2 space-y-1 text-sm text-amber-950">
                        {candidate.contradictions.map((detail) => (
                          <li key={`${detail.observationSeq}:${detail.contradictionCode}`}>
                            {CONTRADICTION_LABELS[detail.contradictionCode] ?? fallbackCodeLabel()}
                            <span className="ml-2 text-xs font-bold tabular-nums text-amber-700">
                              {formatNumber(detail.penaltyPoints, 2)}
                            </span>
                          </li>
                        ))}
                        {candidate.exclusionCodes.map((code) => (
                          <li key={code}>{EXCLUSION_LABELS[code] ?? fallbackCodeLabel()}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
                    <p className="text-xs leading-5 text-slate-500">
                      選択後、保存済みパーティとの対策を表示します。
                    </p>
                    <button
                      type="button"
                      onClick={() => onSelect(candidate.archetypeId)}
                      disabled={
                        !isActive ||
                        selectingArchetypeId !== null ||
                        selectedArchetypeId === candidate.archetypeId
                      }
                      className="min-h-11 rounded-xl bg-blue-950 px-5 py-2.5 text-sm font-black text-white outline-none transition hover:bg-blue-800 focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {selectingArchetypeId === candidate.archetypeId
                        ? "選択中…"
                        : selectedArchetypeId === candidate.archetypeId
                          ? "選択済み"
                          : "この構築で対策を見る"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <p aria-live="polite" className="sr-only">
        {movements.size > 0 ? "候補順位が更新されました。" : ""}
      </p>
    </section>
  );
}
