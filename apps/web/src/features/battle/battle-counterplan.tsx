import { useQueries } from "@tanstack/react-query";
import type {
  CounterplanStrategyCodeValue,
  MatchupReasonCodeValue,
  MatchupVerdictValue,
  SessionCounterplanResponse,
} from "@pokemon-champions/shared";
import { useMemo } from "react";
import { fetchPokemonDetail, fetchPokemonMoves, partyQueryKeys } from "../parties/party-api";
import { getBattleCounterplanErrorMessage } from "./battle-errors";

const VERDICT_LABELS: Readonly<Record<MatchupVerdictValue, string>> = {
  favorable: "有利",
  slightly_favorable: "やや有利",
  even: "互角",
  slightly_unfavorable: "やや不利",
  unfavorable: "不利",
};

const VERDICT_STYLES: Readonly<Record<MatchupVerdictValue, string>> = {
  favorable: "border-emerald-200 bg-emerald-50 text-emerald-900",
  slightly_favorable: "border-sky-200 bg-sky-50 text-sky-900",
  even: "border-slate-200 bg-slate-50 text-slate-700",
  slightly_unfavorable: "border-amber-200 bg-amber-50 text-amber-900",
  unfavorable: "border-rose-200 bg-rose-50 text-rose-900",
};

const REASON_LABELS: Readonly<Record<MatchupReasonCodeValue, string>> = {
  BEST_MOVE_SUPER_EFFECTIVE: "最良技で弱点を突ける",
  BEST_MOVE_RESISTED: "最良技が相手に軽減される",
  BEST_MOVE_IMMUNE: "最良技が相手に無効",
  RESISTS_THREAT: "相手の脅威技を軽減できる",
  IMMUNE_TO_THREAT: "相手の脅威技を無効化できる",
  TAKES_SUPER_EFFECTIVE_DAMAGE: "相手の脅威技で弱点を突かれる",
  WINS_DAMAGE_RACE: "確定数の競争で優位",
  LOSES_DAMAGE_RACE: "確定数の競争で不利",
  EVEN_DAMAGE_RACE: "確定数の競争は互角",
  NO_DAMAGING_MOVE: "有効な攻撃技がない",
  OPPONENT_NO_DAMAGING_MOVE: "相手に有効な攻撃技がない",
};

const STRATEGY_LABELS: Readonly<Record<CounterplanStrategyCodeValue, string>> = {
  PREVENT_SETUP: "積み技を許さない",
  LIMIT_HAZARDS: "設置技の回数を抑える",
  STALL_SCREEN_TURNS: "壁ターンを管理する",
  RESPECT_PRIORITY: "先制技の圏内に注意する",
  MANAGE_STATUS: "状態異常を管理する",
};

const CAUTION_TAG_LABELS: Readonly<Record<string, string>> = {
  setup: "積み",
  hazard: "設置",
  screen: "壁",
  priority: "先制",
  status: "状態異常",
};

const BREAKDOWN_LABELS = {
  offense: "攻撃相性",
  defense: "防御相性",
  speed: "素早さ",
  damageRace: "確定数",
  priority: "優先度",
  statusResist: "状態耐性",
  setupCounter: "積み対策",
} as const;

type MatchupResult =
  SessionCounterplanResponse["perOpponent"][number]["recommendations"][number]["matchupResult"];
type DamageResult = MatchupResult["outgoingDamage"];

interface BattleCounterplanPanelProps {
  sessionId: string;
  enabled: boolean;
  response: SessionCounterplanResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  onRetry: () => void;
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits,
  }).format(value);
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function collectPokemonIds(response: SessionCounterplanResponse | undefined): number[] {
  if (!response) {
    return [];
  }
  return Array.from(
    new Set([
      ...response.selection.selectedPokemonIds,
      ...response.selection.coveredOpponentPokemonIds,
      ...response.selection.uncoveredOpponentPokemonIds,
      ...response.selection.assignmentsByOpponent.flatMap((assignment) => [
        assignment.opponentPokemonId,
        assignment.assignedSelfPokemonId,
      ]),
      ...response.perOpponent.flatMap((opponent) => [
        opponent.opponentPokemonId,
        ...opponent.avoidSelfPokemonIds,
        ...opponent.recommendations.map((recommendation) => recommendation.selfPokemonId),
      ]),
      ...response.cautionMoves.map((move) => move.opponentPokemonId),
      ...response.threatNotes.map((note) => note.opponentPokemonId),
    ]),
  ).sort((left, right) => left - right);
}

function DamageSummary({
  label,
  damage,
  moveName,
}: {
  label: string;
  damage: DamageResult;
  moveName: (moveId: number) => string;
}) {
  if (!damage) {
    return (
      <div>
        <dt className="font-bold text-slate-500">{label}</dt>
        <dd className="mt-1 text-slate-600">有効なダメージ結果なし</dd>
      </div>
    );
  }
  return (
    <div>
      <dt className="font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 leading-6 text-slate-800">
        {moveName(damage.moveId)} · {formatNumber(damage.minDamagePercent)}%
        {damage.maxDamagePercent !== damage.minDamagePercent
          ? `〜${formatNumber(damage.maxDamagePercent)}%`
          : ""}
        <span className="ml-2 text-xs font-bold text-slate-500">
          {damage.knockoutCount === null ? "倒せない" : `${damage.knockoutCount}発`}
        </span>
      </dd>
    </div>
  );
}

function MatchupBreakdown({
  result,
  moveName,
}: {
  result: MatchupResult;
  moveName: (moveId: number) => string;
}) {
  return (
    <div className="mt-4 rounded-xl bg-slate-50 p-4">
      <h5 className="text-xs font-black tracking-[0.12em] text-slate-500">MATCHUP 内訳</h5>
      <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-4">
        {Object.entries(BREAKDOWN_LABELS).map(([key, label]) => (
          <div key={key}>
            <dt className="text-xs font-bold text-slate-400">{label}</dt>
            <dd className="mt-1 font-black tabular-nums text-slate-800">
              {formatSigned(result.breakdown[key as keyof MatchupResult["breakdown"]])}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="mt-4 grid gap-3 border-t border-slate-200 pt-4 text-sm sm:grid-cols-2">
        <DamageSummary
          label="こちらからの最大打点"
          damage={result.outgoingDamage}
          moveName={moveName}
        />
        <DamageSummary
          label="相手からの最大打点"
          damage={result.incomingDamage}
          moveName={moveName}
        />
      </dl>
    </div>
  );
}

export function BattleCounterplanPanel({
  sessionId,
  enabled,
  response,
  isLoading,
  isFetching,
  error,
  onRetry,
}: BattleCounterplanPanelProps) {
  const pokemonIds = useMemo(() => collectPokemonIds(response), [response]);
  const pokemonQueries = useQueries({
    queries: pokemonIds.map((pokemonId) => ({
      queryKey: partyQueryKeys.pokemonDetail(pokemonId),
      queryFn: () => fetchPokemonDetail(pokemonId),
      enabled: response !== undefined,
      retry: false,
      staleTime: 5 * 60 * 1_000,
    })),
  });
  const moveQueries = useQueries({
    queries: pokemonIds.map((pokemonId) => ({
      queryKey: partyQueryKeys.pokemonMoves(pokemonId),
      queryFn: () => fetchPokemonMoves(pokemonId),
      enabled: response !== undefined,
      retry: false,
      staleTime: 5 * 60 * 1_000,
    })),
  });
  const pokemonNames = useMemo(() => {
    const names = new Map<number, string>();
    pokemonQueries.forEach((query, index) => {
      const pokemonId = pokemonIds[index];
      if (pokemonId !== undefined && query.data) {
        names.set(pokemonId, query.data.nameJa);
      }
    });
    return names;
  }, [pokemonIds, pokemonQueries]);
  const moveNames = useMemo(() => {
    const names = new Map<number, string>();
    moveQueries.forEach((query) => {
      query.data?.items.forEach((move) => names.set(move.id, move.nameJa));
    });
    return names;
  }, [moveQueries]);
  const pokemonName = (pokemonId: number) => pokemonNames.get(pokemonId) ?? `Pokemon #${pokemonId}`;
  const moveName = (moveId: number) => moveNames.get(moveId) ?? `技 #${moveId}`;
  const masterIsFetching = [...pokemonQueries, ...moveQueries].some((query) => query.isFetching);
  const masterHasError = [...pokemonQueries, ...moveQueries].some((query) => query.isError);

  return (
    <section
      id={`battle-counterplan-${sessionId}`}
      aria-labelledby={`battle-counterplan-heading-${sessionId}`}
      className="scroll-mt-5 border-y-2 border-blue-950 bg-white py-7 sm:py-9"
      data-testid="battle-counterplan"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black tracking-[0.18em] text-blue-700">COUNTERPLAN</p>
          <h2
            id={`battle-counterplan-heading-${sessionId}`}
            className="mt-2 text-2xl font-black tracking-tight sm:text-3xl"
          >
            対策
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            選択した構築と使用パーティを、保存済みの能力値で比較した結果です。
          </p>
        </div>
        {(isFetching || masterIsFetching) && response && (
          <p role="status" className="flex items-center gap-2 text-sm font-bold text-blue-800">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800" />
            表示情報を更新中…
          </p>
        )}
      </div>

      {!enabled && !response && (
        <div className="mt-7 border-y border-dashed border-slate-300 py-10 text-center">
          <p className="font-black text-slate-800">対策はまだ読み込まれていません</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            候補から構築を選択するか、上部の「対策」を押して保存済みの選択を確認してください。
          </p>
        </div>
      )}

      {enabled && isLoading && !response && (
        <div role="status" className="mt-7 flex items-center gap-3 py-10 text-sm text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800" />
          対策を計算しています…
        </div>
      )}

      {error !== null && !response && (
        <div
          role="alert"
          className="mt-7 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold leading-6 text-red-900"
        >
          <p>{getBattleCounterplanErrorMessage(error)}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-lg font-black underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-red-700"
          >
            再読み込み
          </button>
        </div>
      )}

      {error !== null && response && (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950"
        >
          最新の対策を取得できなかったため、直前の結果を表示しています。
        </p>
      )}

      {response && (
        <div className="mt-8 space-y-10">
          {masterHasError && (
            <p
              role="alert"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950"
            >
              一部の名称を取得できなかったため、該当箇所はIDで表示しています。
            </p>
          )}

          <section aria-labelledby="selection-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.14em] text-slate-400">SELECTION</p>
                <h3 id="selection-heading" className="mt-2 text-xl font-black sm:text-2xl">
                  おすすめ選出
                </h3>
              </div>
              <p className="text-sm font-bold text-slate-600">
                優先対象への対応{" "}
                <strong className="text-lg text-blue-950">
                  {response.selection.metrics.priorityCoveredCount}
                </strong>
                件
              </p>
            </div>

            <ol className="mt-5 grid gap-3 sm:grid-cols-3">
              {response.selection.selectedPokemonIds.map((pokemonId, index) => {
                const isLead = pokemonId === response.selection.leadPokemonId;
                return (
                  <li
                    key={pokemonId}
                    className={`rounded-2xl border p-4 ${
                      isLead
                        ? "border-blue-900 bg-blue-950 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-950"
                    }`}
                  >
                    <p
                      className={`text-xs font-black tracking-[0.12em] ${
                        isLead ? "text-blue-200" : "text-slate-400"
                      }`}
                    >
                      {isLead ? "先発候補" : `選出 ${index + 1}`}
                    </p>
                    <p className="mt-2 text-lg font-black">{pokemonName(pokemonId)}</p>
                  </li>
                );
              })}
            </ol>

            <dl className="mt-5 grid gap-3 rounded-2xl bg-slate-100 p-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="font-bold text-slate-500">対応できる相手</dt>
                <dd className="mt-1 font-black text-slate-950">
                  {response.selection.metrics.coveredCount}体
                </dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">最も低い担当スコア</dt>
                <dd className="mt-1 font-black tabular-nums text-slate-950">
                  {formatSigned(response.selection.metrics.worstBestScore)}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">未対応</dt>
                <dd className="mt-1 font-black text-slate-950">
                  {response.selection.uncoveredOpponentPokemonIds.length === 0
                    ? "なし"
                    : response.selection.uncoveredOpponentPokemonIds.map(pokemonName).join("、")}
                </dd>
              </div>
            </dl>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                <caption className="pb-3 text-left text-xs font-black tracking-[0.12em] text-slate-500">
                  選出内の相手別担当
                </caption>
                <thead>
                  <tr className="border-y border-slate-200 text-xs text-slate-500">
                    <th className="px-3 py-3 font-black">相手</th>
                    <th className="px-3 py-3 font-black">担当</th>
                    <th className="px-3 py-3 font-black">評価</th>
                    <th className="px-3 py-3 text-right font-black">スコア</th>
                  </tr>
                </thead>
                <tbody>
                  {response.selection.assignmentsByOpponent.map((assignment) => (
                    <tr key={assignment.opponentPokemonId} className="border-b border-slate-100">
                      <td className="px-3 py-3 font-bold">
                        {pokemonName(assignment.opponentPokemonId)}
                      </td>
                      <td className="px-3 py-3">{pokemonName(assignment.assignedSelfPokemonId)}</td>
                      <td className="px-3 py-3">
                        {VERDICT_LABELS[assignment.matchupResult.classification]}
                      </td>
                      <td className="px-3 py-3 text-right font-black tabular-nums">
                        {formatSigned(assignment.matchupResult.totalScore)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="opponent-matchups-heading">
            <p className="text-xs font-black tracking-[0.14em] text-slate-400">PER OPPONENT</p>
            <h3 id="opponent-matchups-heading" className="mt-2 text-xl font-black sm:text-2xl">
              相手別おすすめ
            </h3>
            <div className="mt-5 space-y-6">
              {response.perOpponent.map((opponent) => (
                <article
                  key={opponent.opponentPokemonId}
                  className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-lg font-black sm:text-xl">
                      対 {pokemonName(opponent.opponentPokemonId)}
                    </h4>
                    {opponent.avoidSelfPokemonIds.length > 0 && (
                      <p className="text-xs font-bold text-rose-800">
                        避けたい選択: {opponent.avoidSelfPokemonIds.map(pokemonName).join("、")}
                      </p>
                    )}
                  </div>

                  <ol className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
                    {opponent.recommendations.map((recommendation) => (
                      <li key={recommendation.selfPokemonId} className="py-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xs font-black text-slate-400">
                            RANK {recommendation.rank}
                          </span>
                          <strong className="text-base text-slate-950">
                            {pokemonName(recommendation.selfPokemonId)}
                          </strong>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-black ${
                              VERDICT_STYLES[recommendation.classification]
                            }`}
                          >
                            {VERDICT_LABELS[recommendation.classification]}
                          </span>
                          <span className="ml-auto font-black tabular-nums text-blue-950">
                            {formatSigned(recommendation.totalScore)}
                          </span>
                        </div>
                        <ul className="mt-3 flex flex-wrap gap-2">
                          {recommendation.reasonCodes.map((code) => (
                            <li
                              key={code}
                              className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-900"
                            >
                              {REASON_LABELS[code]}
                            </li>
                          ))}
                        </ul>
                        <MatchupBreakdown
                          result={recommendation.matchupResult}
                          moveName={moveName}
                        />
                      </li>
                    ))}
                  </ol>

                  {(opponent.cautionMoves.length > 0 || opponent.threatNotes.length > 0) && (
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div>
                        <h5 className="text-xs font-black tracking-[0.12em] text-amber-800">
                          警戒技
                        </h5>
                        {opponent.cautionMoves.length === 0 ? (
                          <p className="mt-2 text-sm text-slate-500">該当なし</p>
                        ) : (
                          <ul className="mt-2 space-y-2 text-sm">
                            {opponent.cautionMoves.map((move) => (
                              <li key={`${move.opponentPokemonId}:${move.moveId}`}>
                                <strong>{moveName(move.moveId)}</strong>
                                <span className="ml-2 text-xs text-slate-500">
                                  {CAUTION_TAG_LABELS[move.primaryTag] ?? move.primaryTag} · 採用率{" "}
                                  {formatNumber(move.adoptionRate * 100)}%
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <h5 className="text-xs font-black tracking-[0.12em] text-rose-800">
                          Threat notes
                        </h5>
                        <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                          {opponent.threatNotes.map((note, index) => (
                            <li key={`${note.opponentPokemonId}:${index}`}>{note.note}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="watchouts-heading"
            className="rounded-2xl bg-blue-950 p-5 text-white sm:p-7"
          >
            <p className="text-xs font-black tracking-[0.14em] text-blue-300">WATCHOUTS</p>
            <h3 id="watchouts-heading" className="mt-2 text-xl font-black sm:text-2xl">
              警戒ポイント
            </h3>
            <div className="mt-5 grid gap-6 lg:grid-cols-3">
              <div>
                <h4 className="text-xs font-black tracking-[0.12em] text-blue-300">
                  PLAYSTYLE NOTES
                </h4>
                <p className="mt-2 text-sm leading-7 text-blue-50">
                  {response.playstyleNotes ?? "登録された特徴メモはありません。"}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-black tracking-[0.12em] text-blue-300">
                  STRATEGY CODES
                </h4>
                {response.strategyCodes.length === 0 ? (
                  <p className="mt-2 text-sm text-blue-100">該当する警戒方針はありません。</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm font-bold text-white">
                    {response.strategyCodes.map((code) => (
                      <li key={code}>・{STRATEGY_LABELS[code]}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h4 className="text-xs font-black tracking-[0.12em] text-blue-300">
                  CAUTION MOVES
                </h4>
                {response.cautionMoves.length === 0 ? (
                  <p className="mt-2 text-sm text-blue-100">該当する警戒技はありません。</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm text-white">
                    {response.cautionMoves.map((move) => (
                      <li key={`${move.opponentPokemonId}:${move.moveId}`}>
                        <strong>{moveName(move.moveId)}</strong>
                        <span className="block text-xs text-blue-200">
                          {pokemonName(move.opponentPokemonId)} ·{" "}
                          {CAUTION_TAG_LABELS[move.primaryTag] ?? move.primaryTag}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {response.threatNotes.length > 0 && (
              <div className="mt-6 border-t border-blue-800 pt-5">
                <h4 className="text-xs font-black tracking-[0.12em] text-blue-300">THREAT NOTES</h4>
                <ul className="mt-2 grid gap-2 text-sm leading-6 text-blue-50 sm:grid-cols-2">
                  {response.threatNotes.map((note, index) => (
                    <li key={`${note.opponentPokemonId}:${index}`}>
                      <strong>{pokemonName(note.opponentPokemonId)}:</strong> {note.note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
