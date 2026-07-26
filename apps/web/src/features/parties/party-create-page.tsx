import {
  partyWriteSchema,
  type MasterPokemonDetail,
  type PartyWrite,
} from "@pokemon-champions/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createParty, fetchRules, partyQueryKeys } from "./party-api";
import { getPartyErrorMessage } from "./party-errors";
import {
  PARTY_STAT_KEYS,
  createEmptyPokemonSlot,
  type PartyPokemonFormState,
} from "./party-form-types";
import { PartyShell } from "./party-shell";
import { calculateActualStats } from "./party-stats";
import { PokemonSlotEditor } from "./pokemon-slot-editor";

interface ValidationState {
  general: string[];
  slots: Readonly<Record<number, string[]>>;
}

const emptyValidation: ValidationState = { general: [], slots: {} };

function appendSlotError(errors: Record<number, string[]>, slot: number, message: string): void {
  errors[slot] = [...(errors[slot] ?? []), message];
}

export function PartyCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ruleId, setRuleId] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [pokemons, setPokemons] = useState<PartyPokemonFormState[]>([]);
  const [validation, setValidation] = useState<ValidationState>(emptyValidation);

  const rules = useQuery({
    queryKey: partyQueryKeys.rules,
    queryFn: fetchRules,
  });
  const selectedRule = rules.data?.items.find((rule) => rule.id === ruleId) ?? null;
  const level = selectedRule?.battleLevel ?? null;

  const createMutation = useMutation({
    mutationFn: createParty,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: partyQueryKeys.all });
      navigate("/", { replace: true });
    },
  });

  function updatePokemon(index: number, value: PartyPokemonFormState): void {
    setPokemons((current) =>
      current.map((pokemon, pokemonIndex) => (pokemonIndex === index ? value : pokemon)),
    );
  }

  function selectRule(nextRuleId: number): void {
    const rule = rules.data?.items.find((item) => item.id === nextRuleId);
    setRuleId(rule?.id ?? null);
    setPokemons((current) =>
      rule
        ? Array.from({ length: rule.teamSize }, (_, index) => {
            const existing = current[index];
            return existing
              ? { ...existing, slot: index + 1, actualStatOverrides: {} }
              : createEmptyPokemonSlot(index + 1);
          })
        : [],
    );
    setValidation(emptyValidation);
  }

  function buildInput(): PartyWrite | null {
    const general: string[] = [];
    const slotErrors: Record<number, string[]> = {};

    if (!selectedRule) {
      general.push("Ruleを選択してください。");
    }
    if (!name.trim()) {
      general.push("パーティ名を入力してください。");
    }

    const preparedPokemons = pokemons.flatMap((pokemon, index) => {
      const slot = index + 1;
      if (!pokemon.pokemon) {
        appendSlotError(slotErrors, slot, "ポケモンを選択してください。");
      }
      if (!pokemon.nature) {
        appendSlotError(slotErrors, slot, "性格を選択してください。");
      }
      if (pokemon.moves.some((move) => move === null)) {
        appendSlotError(slotErrors, slot, "技を4件選択してください。");
      }
      const evTotal = PARTY_STAT_KEYS.reduce((total, stat) => total + pokemon.evs[stat], 0);
      if (evTotal > 510) {
        appendSlotError(slotErrors, slot, "努力値の合計を510以下にしてください。");
      }

      const detail = pokemon.pokemon
        ? queryClient.getQueryData<MasterPokemonDetail>(
            partyQueryKeys.pokemonDetail(pokemon.pokemon.id),
          )
        : null;
      if (pokemon.pokemon && !detail) {
        appendSlotError(slotErrors, slot, "ポケモン詳細の取得完了を待ってください。");
      }
      if (!pokemon.pokemon || !detail || !pokemon.nature || level === null) {
        return [];
      }

      let calculated;
      try {
        calculated = calculateActualStats({
          pokemon: detail,
          evs: pokemon.evs,
          ivs: pokemon.ivs,
          level,
          nature: pokemon.nature,
        });
      } catch {
        appendSlotError(slotErrors, slot, "実数値を計算できませんでした。");
        return [];
      }

      return [
        {
          slot: pokemon.slot,
          pokemonId: pokemon.pokemon.id,
          itemId: pokemon.item?.id ?? null,
          abilityId: pokemon.ability?.id ?? null,
          nature: pokemon.nature,
          teraType: pokemon.teraType || null,
          evs: pokemon.evs,
          ivs: pokemon.ivs,
          actualStats: {
            hp: pokemon.actualStatOverrides.hp ?? calculated.hp,
            attack: pokemon.actualStatOverrides.atk ?? calculated.attack,
            defense: pokemon.actualStatOverrides.def ?? calculated.defense,
            specialAttack: pokemon.actualStatOverrides.spa ?? calculated.specialAttack,
            specialDefense: pokemon.actualStatOverrides.spd ?? calculated.specialDefense,
            speed: pokemon.actualStatOverrides.spe ?? calculated.speed,
          },
          moves: pokemon.moves.flatMap((move, moveIndex) =>
            move ? [{ slot: moveIndex + 1, moveId: move.id }] : [],
          ),
        },
      ];
    });

    const rawInput = {
      name,
      description: description.trim() || null,
      ruleId,
      isActive,
      pokemons: preparedPokemons,
    };
    const result = partyWriteSchema.safeParse(rawInput);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const pokemonIndex = issue.path[0] === "pokemons" ? issue.path[1] : null;
        if (typeof pokemonIndex === "number") {
          appendSlotError(slotErrors, pokemonIndex + 1, issue.message);
        } else if (!general.includes(issue.message)) {
          general.push(issue.message);
        }
      }
    }

    if (general.length > 0 || Object.keys(slotErrors).length > 0 || !result.success) {
      setValidation({ general, slots: slotErrors });
      return null;
    }

    setValidation(emptyValidation);
    return result.data;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (createMutation.isPending) {
      return;
    }
    const input = buildInput();
    if (input) {
      createMutation.reset();
      createMutation.mutate(input);
    }
  }

  return (
    <PartyShell>
      <form onSubmit={handleSubmit} noValidate>
        <div className="mx-auto w-full max-w-6xl px-5 pt-8 pb-36 sm:px-8 sm:pt-12">
          <Link
            to="/"
            className="inline-flex rounded-lg text-sm font-bold text-blue-900 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            ← ホームへ戻る
          </Link>

          <div className="mt-7 max-w-3xl">
            <p className="text-xs font-black tracking-[0.18em] text-blue-700">NEW PARTY</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">パーティを登録</h1>
            <p className="mt-4 text-sm leading-7 text-slate-500">
              Ruleを選び、slot順にポケモンと技構成を登録します。外部画像は使用せず、名前と番号で確認できます。
            </p>
          </div>

          {createMutation.isError && (
            <div
              role="alert"
              className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800"
            >
              {getPartyErrorMessage(createMutation.error)}
            </div>
          )}
          {validation.general.length > 0 && (
            <div
              role="alert"
              className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800"
            >
              <p className="font-black">入力内容を確認してください</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {validation.general.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="mt-10 border-y border-slate-200 py-8">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label htmlFor="party-name" className="mb-2 block text-sm font-bold">
                  パーティ名
                </label>
                <input
                  id="party-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  placeholder="ランクバトル用"
                  className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-700 focus:ring-3 focus:ring-blue-100"
                />
              </div>
              <div>
                <label htmlFor="party-rule" className="mb-2 block text-sm font-bold">
                  Rule
                </label>
                <select
                  id="party-rule"
                  value={ruleId ?? ""}
                  disabled={rules.isLoading || rules.isError}
                  onChange={(event) => selectRule(Number(event.target.value))}
                  className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-700 focus:ring-3 focus:ring-blue-100 disabled:bg-slate-100"
                >
                  <option value="">
                    {rules.isLoading
                      ? "Ruleを取得中…"
                      : rules.isError
                        ? "Ruleを取得できません"
                        : "Ruleを選択"}
                  </option>
                  {rules.data?.items.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name}（{rule.teamSize}体 / {rule.pickSize}体選出）
                    </option>
                  ))}
                </select>
                {rules.isError && (
                  <button
                    type="button"
                    onClick={() => void rules.refetch()}
                    className="mt-2 text-xs font-bold text-red-700 underline underline-offset-4"
                  >
                    Ruleを再取得
                  </button>
                )}
              </div>
              <div className="md:col-span-2">
                <label htmlFor="party-description" className="mb-2 block text-sm font-bold">
                  説明（任意）
                </label>
                <textarea
                  id="party-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  placeholder="構築の狙いや使う場面"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-700 focus:ring-3 focus:ring-blue-100"
                />
              </div>
              <div
                aria-label="対戦レベル"
                className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3"
              >
                <p className="text-sm font-bold">実数値の計算レベル</p>
                <p className="mt-1 text-lg font-black text-blue-950">
                  {selectedRule ? `Lv. ${selectedRule.battleLevel}` : "Rule選択後に表示"}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  選択したRuleの対戦レベルを使用します。Party APIへlevelは送信しません。
                </p>
              </div>
              <label className="flex min-h-12 items-center gap-3 self-start rounded-xl border border-slate-300 bg-white px-4 py-3">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                  className="h-5 w-5 accent-blue-800"
                />
                <span>
                  <span className="block text-sm font-bold">このPartyをactiveにする</span>
                  <span className="block text-xs text-slate-500">
                    既存active Partyがある場合は切り替わります。
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold tracking-[0.15em] text-slate-400">TEAM SLOTS</p>
                <h2 className="mt-2 text-2xl font-black">ポケモン構成</h2>
              </div>
              {selectedRule && (
                <p className="text-sm font-bold text-blue-900">
                  {selectedRule.teamSize}枠 · {selectedRule.pickSize}体選出
                </p>
              )}
            </div>

            {!selectedRule && (
              <div className="mt-6 border-y border-slate-200 py-12 text-center text-sm text-slate-500">
                Ruleを選択すると必要なslotが表示されます。
              </div>
            )}
            <div className="mt-6 space-y-4">
              {pokemons.map((pokemon, index) => (
                <PokemonSlotEditor
                  key={pokemon.slot}
                  value={pokemon}
                  level={level}
                  excludedPokemonIds={
                    new Set(
                      pokemons.flatMap((item, itemIndex) =>
                        itemIndex === index || !item.pokemon ? [] : [item.pokemon.id],
                      ),
                    )
                  }
                  errors={validation.slots[index + 1] ?? []}
                  onChange={(next) => updatePokemon(index, next)}
                  onRemove={() => updatePokemon(index, createEmptyPokemonSlot(index + 1))}
                />
              ))}
            </div>
          </section>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-5 py-4 shadow-[0_-12px_36px_-24px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <p className="hidden text-sm text-slate-500 sm:block">
              {selectedRule
                ? `${pokemons.filter((pokemon) => pokemon.pokemon).length}/${selectedRule.teamSize}体を選択`
                : "Ruleを選択してください"}
            </p>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="min-h-12 w-full rounded-2xl bg-slate-950 px-7 py-3 text-sm font-black text-white outline-none transition hover:bg-blue-900 focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-wait disabled:bg-slate-400 sm:w-auto"
            >
              {createMutation.isPending ? "保存中…" : "パーティを保存"}
            </button>
          </div>
        </div>
      </form>
    </PartyShell>
  );
}
