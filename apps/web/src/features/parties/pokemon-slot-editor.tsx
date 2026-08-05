import { useQuery } from "@tanstack/react-query";
import {
  ARCHETYPE_STAT_POINT_STAT_MAX,
  ARCHETYPE_STAT_POINT_TOTAL_MAX,
  type AbilitySummary,
  type ItemSummary,
  type MoveSummary,
  type PokemonSummary,
} from "@pokemon-champions/shared";
import { fetchAbilities, fetchPokemonDetail, partyQueryKeys } from "./party-api";
import {
  PARTY_STAT_KEYS,
  PARTY_STAT_LABELS,
  TERA_TYPES,
  type PartyPokemonFormState,
  type PartyNumericInput,
  type PartyStatKey,
} from "./party-form-types";
import { NATURE_OPTIONS } from "./party-stats";
import { ItemPicker, MovePicker, PokemonPicker } from "./search-picker";

interface PokemonSlotEditorProps {
  value: PartyPokemonFormState;
  excludedPokemonIds: ReadonlySet<number>;
  errors: readonly string[];
  onChange: (value: PartyPokemonFormState) => void;
  onRemove: () => void;
}

function replaceMove(
  moves: Array<MoveSummary | null>,
  index: number,
  move: MoveSummary | null,
): Array<MoveSummary | null> {
  return moves.map((current, currentIndex) => (currentIndex === index ? move : current));
}

export function PokemonSlotEditor({
  value,
  excludedPokemonIds,
  errors,
  onChange,
  onRemove,
}: PokemonSlotEditorProps) {
  const pokemonId = value.pokemon?.id ?? null;
  const detail = useQuery({
    queryKey: partyQueryKeys.pokemonDetail(pokemonId ?? 0),
    queryFn: () => fetchPokemonDetail(pokemonId ?? 0),
    enabled: pokemonId !== null,
  });
  const abilities = useQuery({
    queryKey: partyQueryKeys.abilities(pokemonId ?? 0),
    queryFn: () => fetchAbilities(pokemonId ?? 0),
    enabled: pokemonId !== null,
  });
  const statPointTotal = PARTY_STAT_KEYS.reduce((total, stat) => {
    const point = value.statPoints[stat];
    return total + (typeof point === "number" && Number.isFinite(point) ? point : 0);
  }, 0);
  const statPointTotalExceeded = statPointTotal > ARCHETYPE_STAT_POINT_TOTAL_MAX;

  function selectPokemon(pokemon: PokemonSummary): void {
    onChange({
      ...value,
      pokemon,
      item: null,
      ability: null,
      moves: [null, null, null, null],
    });
  }

  function clearPokemon(): void {
    onChange({
      ...value,
      pokemon: null,
      item: null,
      ability: null,
      moves: [null, null, null, null],
    });
  }

  function changeNumericStat(
    kind: "statPoints" | "actualStats",
    stat: PartyStatKey,
    nextValue: PartyNumericInput,
  ): void {
    onChange({
      ...value,
      [kind]: { ...value[kind], [stat]: nextValue },
    });
  }

  const selectedMoveIds = new Set(value.moves.flatMap((move) => (move === null ? [] : [move.id])));

  return (
    <details
      open={value.slot === 1}
      className="group overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700 sm:px-6">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-950 text-sm font-black text-white">
            {value.slot}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-black text-slate-950">
              {value.pokemon?.nameJa ?? `ポケモン ${value.slot}`}
            </span>
            <span className="block text-xs text-slate-500">
              {value.pokemon ? `${value.moves.filter(Boolean).length}/4 技` : "未選択"}
            </span>
          </span>
        </span>
        <span aria-hidden="true" className="text-xl text-slate-400 group-open:rotate-45">
          ＋
        </span>
      </summary>

      <div className="border-t border-slate-200 px-4 py-6 sm:px-6">
        {errors.length > 0 && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <p className="font-bold">この枠を確認してください</p>
            <ul className="mt-1 list-disc pl-5">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <PokemonPicker
          selected={value.pokemon}
          excludedIds={excludedPokemonIds}
          onSelect={selectPokemon}
          onClear={clearPokemon}
        />

        {detail.isLoading && (
          <p role="status" className="mt-3 text-xs text-slate-500">
            種族値を取得中…
          </p>
        )}
        {detail.isError && (
          <p role="alert" className="mt-3 text-xs font-semibold text-red-700">
            ポケモン詳細を取得できませんでした。選び直してください。
          </p>
        )}
        {detail.data && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
            <span>
              タイプ:{" "}
              {detail.data.type2
                ? `${detail.data.type1} / ${detail.data.type2}`
                : detail.data.type1}
            </span>
            <span>
              種族値:{" "}
              {[
                detail.data.baseHp,
                detail.data.baseAtk,
                detail.data.baseDef,
                detail.data.baseSpa,
                detail.data.baseSpd,
                detail.data.baseSpe,
              ].join(" / ")}
            </span>
          </div>
        )}

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <ItemPicker
            selected={value.item}
            onSelect={(item: ItemSummary) => onChange({ ...value, item })}
            onClear={() => onChange({ ...value, item: null })}
          />
          <div>
            <label
              htmlFor={`party-ability-${value.slot}`}
              className="mb-2 block text-sm font-bold text-slate-800"
            >
              特性（任意）
            </label>
            <select
              id={`party-ability-${value.slot}`}
              value={value.ability?.id ?? ""}
              disabled={!pokemonId || abilities.isLoading}
              onChange={(event) => {
                const ability = abilities.data?.items.find(
                  (item: AbilitySummary) => item.id === Number(event.target.value),
                );
                onChange({ ...value, ability: ability ?? null });
              }}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700 focus:ring-3 focus:ring-blue-100 disabled:bg-slate-100"
            >
              <option value="">
                {!pokemonId
                  ? "先にポケモンを選択"
                  : abilities.isLoading
                    ? "特性を取得中…"
                    : "選択しない"}
              </option>
              {abilities.data?.items.map((ability) => (
                <option key={ability.id} value={ability.id}>
                  {ability.nameJa}
                </option>
              ))}
            </select>
            {abilities.isError && (
              <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
                特性候補を取得できませんでした。
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor={`party-nature-${value.slot}`}
              className="mb-2 block text-sm font-bold text-slate-800"
            >
              性格
            </label>
            <select
              id={`party-nature-${value.slot}`}
              value={value.nature}
              onChange={(event) => onChange({ ...value, nature: event.target.value })}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700 focus:ring-3 focus:ring-blue-100"
            >
              <option value="">性格を選択</option>
              {NATURE_OPTIONS.map((nature) => (
                <option key={nature.value} value={nature.value}>
                  {nature.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor={`party-tera-${value.slot}`}
              className="mb-2 block text-sm font-bold text-slate-800"
            >
              テラスタイプ（任意）
            </label>
            <select
              id={`party-tera-${value.slot}`}
              value={value.teraType}
              onChange={(event) => onChange({ ...value, teraType: event.target.value })}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700 focus:ring-3 focus:ring-blue-100"
            >
              <option value="">選択しない</option>
              {TERA_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <section className="mt-8" aria-labelledby={`stat-points-heading-${value.slot}`}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 id={`stat-points-heading-${value.slot}`} className="font-black text-slate-950">
                能力ポイント
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                各能力0〜32、合計66まで。ゲーム画面の能力値の右側に表示される数値を入力します。
              </p>
            </div>
            <span
              className={`shrink-0 text-sm font-black ${statPointTotalExceeded ? "text-red-700" : "text-blue-800"}`}
            >
              合計 {statPointTotal}/{ARCHETYPE_STAT_POINT_TOTAL_MAX}
            </span>
          </div>
          {statPointTotalExceeded && (
            <p
              id={`stat-points-error-${value.slot}`}
              role="alert"
              className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-800"
            >
              能力ポイントの合計を{ARCHETYPE_STAT_POINT_TOTAL_MAX}以下にしてください（現在
              {statPointTotal}）。
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {PARTY_STAT_KEYS.map((stat) => (
              <label key={stat} className="block text-sm font-bold text-slate-800">
                {PARTY_STAT_LABELS[stat]}
                <input
                  aria-label={`ポケモン${value.slot} ${PARTY_STAT_LABELS[stat]} 能力ポイント`}
                  aria-invalid={statPointTotalExceeded}
                  aria-describedby={
                    statPointTotalExceeded ? `stat-points-error-${value.slot}` : undefined
                  }
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={ARCHETYPE_STAT_POINT_STAT_MAX}
                  step="1"
                  value={value.statPoints[stat]}
                  onChange={(event) =>
                    changeNumericStat(
                      "statPoints",
                      stat,
                      event.currentTarget.value === "" ? "" : event.currentTarget.valueAsNumber,
                    )
                  }
                  className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="mt-8" aria-labelledby={`actual-stats-heading-${value.slot}`}>
          <h3 id={`actual-stats-heading-${value.slot}`} className="font-black text-slate-950">
            実数値
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            ゲーム画面に表示されている実際の能力値を6項目すべて入力します。
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {PARTY_STAT_KEYS.map((stat) => (
              <label key={stat} className="block text-sm font-bold text-slate-800">
                {PARTY_STAT_LABELS[stat]}
                <input
                  aria-label={`ポケモン${value.slot} ${PARTY_STAT_LABELS[stat]} 実数値`}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={value.actualStats[stat]}
                  onChange={(event) =>
                    changeNumericStat(
                      "actualStats",
                      stat,
                      event.currentTarget.value === "" ? "" : event.currentTarget.valueAsNumber,
                    )
                  }
                  className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-blue-50 px-3 py-2 text-base font-bold text-blue-950 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h3 className="font-black text-slate-950">技構成</h3>
          <p className="mt-1 text-xs text-slate-500">
            選択中のポケモンが習得できる技から4件選択してください。
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {value.moves.map((move, moveIndex) => (
              <MovePicker
                key={moveIndex}
                pokemonId={pokemonId}
                slot={moveIndex + 1}
                selected={move}
                excludedIds={
                  new Set([...selectedMoveIds].filter((id) => id !== value.moves[moveIndex]?.id))
                }
                onSelect={(selectedMove) =>
                  onChange({
                    ...value,
                    moves: replaceMove(value.moves, moveIndex, selectedMove),
                  })
                }
                onClear={() =>
                  onChange({
                    ...value,
                    moves: replaceMove(value.moves, moveIndex, null),
                  })
                }
              />
            ))}
          </div>
        </section>

        <div className="mt-8 border-t border-slate-200 pt-5 text-right">
          <button
            type="button"
            onClick={onRemove}
            className="rounded-xl px-3 py-2 text-sm font-bold text-red-700 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-700"
          >
            この枠をリセット
          </button>
        </div>
      </div>
    </details>
  );
}
