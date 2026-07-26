import { useQuery } from "@tanstack/react-query";
import type {
  AbilitySummary,
  ItemSummary,
  MoveSummary,
  PartyActualStats,
  PokemonSummary,
} from "@pokemon-champions/shared";
import { fetchAbilities, fetchPokemonDetail, partyQueryKeys } from "./party-api";
import {
  PARTY_STAT_KEYS,
  PARTY_STAT_LABELS,
  TERA_TYPES,
  type PartyPokemonFormState,
  type PartyStatKey,
} from "./party-form-types";
import { calculateActualStats, NATURE_OPTIONS } from "./party-stats";
import { ItemPicker, MovePicker, PokemonPicker } from "./search-picker";

interface PokemonSlotEditorProps {
  value: PartyPokemonFormState;
  level: number | null;
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
  level,
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
  const evTotal = PARTY_STAT_KEYS.reduce((total, stat) => total + value.evs[stat], 0);

  let calculated: PartyActualStats | null = null;
  if (detail.data && level !== null && value.nature) {
    try {
      calculated = calculateActualStats({
        pokemon: detail.data,
        evs: value.evs,
        ivs: value.ivs,
        level,
        nature: value.nature,
      });
    } catch {
      calculated = null;
    }
  }

  const displayedActualStats: Readonly<Record<PartyStatKey, number>> | null =
    calculated === null
      ? null
      : {
          hp: value.actualStatOverrides.hp ?? calculated.hp,
          atk: value.actualStatOverrides.atk ?? calculated.attack,
          def: value.actualStatOverrides.def ?? calculated.defense,
          spa: value.actualStatOverrides.spa ?? calculated.specialAttack,
          spd: value.actualStatOverrides.spd ?? calculated.specialDefense,
          spe: value.actualStatOverrides.spe ?? calculated.speed,
        };

  function resetCalculatedOverrides(next: PartyPokemonFormState): void {
    onChange({ ...next, actualStatOverrides: {} });
  }

  function selectPokemon(pokemon: PokemonSummary): void {
    onChange({
      ...value,
      pokemon,
      item: null,
      ability: null,
      moves: [null, null, null, null],
      actualStatOverrides: {},
    });
  }

  function clearPokemon(): void {
    onChange({
      ...value,
      pokemon: null,
      item: null,
      ability: null,
      moves: [null, null, null, null],
      actualStatOverrides: {},
    });
  }

  function changeNumericStat(kind: "evs" | "ivs", stat: PartyStatKey, nextValue: number): void {
    const limit = kind === "evs" ? 252 : 31;
    const normalized = Number.isFinite(nextValue)
      ? Math.min(limit, Math.max(0, Math.trunc(nextValue)))
      : 0;
    resetCalculatedOverrides({
      ...value,
      [kind]: { ...value[kind], [stat]: normalized },
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
              onChange={(event) =>
                resetCalculatedOverrides({ ...value, nature: event.target.value })
              }
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

        <section className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="font-black text-slate-950">努力値・個体値</h3>
              <p className="mt-1 text-xs text-slate-500">努力値は各252、合計510まで。</p>
            </div>
            <span
              className={`text-sm font-black ${evTotal > 510 ? "text-red-700" : "text-blue-800"}`}
            >
              EV {evTotal}/510
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[38rem] border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-2">能力</th>
                  <th className="px-2">EV</th>
                  <th className="px-2">IV</th>
                  <th className="px-2">実数値</th>
                </tr>
              </thead>
              <tbody>
                {PARTY_STAT_KEYS.map((stat) => (
                  <tr key={stat}>
                    <th className="px-2 font-bold">{PARTY_STAT_LABELS[stat]}</th>
                    <td className="px-2">
                      <input
                        aria-label={`ポケモン${value.slot} ${PARTY_STAT_LABELS[stat]} EV`}
                        type="number"
                        min="0"
                        max="252"
                        value={value.evs[stat]}
                        onChange={(event) =>
                          changeNumericStat("evs", stat, event.currentTarget.valueAsNumber)
                        }
                        className="w-24 rounded-lg border border-slate-300 px-2 py-2 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                      />
                    </td>
                    <td className="px-2">
                      <input
                        aria-label={`ポケモン${value.slot} ${PARTY_STAT_LABELS[stat]} IV`}
                        type="number"
                        min="0"
                        max="31"
                        value={value.ivs[stat]}
                        onChange={(event) =>
                          changeNumericStat("ivs", stat, event.currentTarget.valueAsNumber)
                        }
                        className="w-20 rounded-lg border border-slate-300 px-2 py-2 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                      />
                    </td>
                    <td className="px-2">
                      <input
                        aria-label={`ポケモン${value.slot} ${PARTY_STAT_LABELS[stat]} 実数値`}
                        type="number"
                        min="1"
                        value={displayedActualStats?.[stat] ?? ""}
                        disabled={calculated === null}
                        onChange={(event) => {
                          const nextValue = event.currentTarget.valueAsNumber;
                          if (Number.isSafeInteger(nextValue) && nextValue > 0) {
                            onChange({
                              ...value,
                              actualStatOverrides: {
                                ...value.actualStatOverrides,
                                [stat]: nextValue,
                              },
                            });
                          }
                        }}
                        className="w-24 rounded-lg border border-slate-300 bg-blue-50 px-2 py-2 font-bold text-blue-950 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {calculated === null && (
            <p className="mt-2 text-xs text-slate-500">
              ポケモン・性格・Ruleの対戦レベルが揃うと実数値を表示します。
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            実数値は自動計算されます。直接修正した値も保存できます。
          </p>
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
