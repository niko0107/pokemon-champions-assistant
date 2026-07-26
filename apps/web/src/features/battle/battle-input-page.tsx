import { useMutation, useQuery } from "@tanstack/react-query";
import type { BattleSessionResponse, MasterRule, PokemonSummary } from "@pokemon-champions/shared";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchParties, fetchRules, partyQueryKeys, searchPokemons } from "../parties/party-api";
import { PartyShell } from "../parties/party-shell";
import { useDebouncedValue } from "../parties/use-debounced-value";
import { addPokemonObservation, battleQueryKeys, fetchBattleSession } from "./battle-api";
import { getBattleErrorMessage } from "./battle-errors";
import {
  loadBattleObservations,
  saveBattleObservations,
  toStoredPokemonObservation,
  type StoredPokemonObservation,
} from "./battle-session-storage";

function PokemonTypes({ pokemon }: { pokemon: PokemonSummary }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {[pokemon.type1, pokemon.type2].filter(Boolean).map((type) => (
        <span
          key={type}
          className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide text-slate-600"
        >
          {type}
        </span>
      ))}
    </span>
  );
}

function BattleWorkspace({
  session,
  rule,
  partyName,
}: {
  session: BattleSessionResponse;
  rule: MasterRule;
  partyName: string | undefined;
}) {
  const [query, setQuery] = useState("");
  const [observations, setObservations] = useState<StoredPokemonObservation[]>(() =>
    loadBattleObservations(session.id),
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const submissionInFlight = useRef(false);
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const maximumPokemonCount = rule.teamSize;
  const hasReachedLimit = observations.length >= maximumPokemonCount;
  const isActive = session.status === "active";
  const observedPokemonIds = new Set(observations.map((item) => item.pokemon.id));

  const search = useQuery({
    queryKey: battleQueryKeys.pokemonSearch(debouncedQuery),
    queryFn: () => searchPokemons(debouncedQuery),
    enabled: session.status === "active" && !hasReachedLimit && debouncedQuery.length >= 2,
  });
  const availableCandidates =
    !isActive || hasReachedLimit
      ? []
      : (search.data?.items ?? []).filter((pokemon) => !observedPokemonIds.has(pokemon.id));

  const addObservation = useMutation({
    mutationFn: (pokemon: PokemonSummary) => addPokemonObservation(session.id, pokemon.id),
    onSuccess: (observation, pokemon) => {
      try {
        const stored = toStoredPokemonObservation(pokemon, observation);
        setObservations((current) => {
          if (current.some((item) => item.pokemon.id === pokemon.id)) {
            return current;
          }
          const next = [...current, stored];
          saveBattleObservations(session.id, next);
          return next;
        });
        setQuery("");
        setClientError(null);
      } catch {
        setClientError("APIレスポンスを画面へ反映できませんでした。再読み込みしてください。");
      }
    },
    onSettled: () => {
      submissionInFlight.current = false;
    },
  });

  function selectPokemon(pokemon: PokemonSummary): void {
    if (submissionInFlight.current || hasReachedLimit || observedPokemonIds.has(pokemon.id)) {
      return;
    }
    submissionInFlight.current = true;
    setClientError(null);
    addObservation.mutate(pokemon);
  }

  return (
    <PartyShell>
      <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
          <Link
            to="/"
            className="rounded-lg text-sm font-bold text-slate-500 outline-none hover:text-blue-900 focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            ← ホーム
          </Link>
          <span
            className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${
              isActive ? "bg-blue-100 text-blue-900" : "bg-slate-200 text-slate-600"
            }`}
          >
            {session.status}
          </span>
        </div>

        <header className="py-7 sm:py-9">
          <p className="text-xs font-black tracking-[0.18em] text-blue-700">BATTLE INPUT</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">相手ポケモンを入力</h1>
              <p className="mt-3 text-sm text-slate-500">
                {partyName ?? "使用パーティ"} · {rule.name}
              </p>
            </div>
            <p className="text-sm font-black tabular-nums text-slate-700">
              <span className="text-3xl text-blue-900">{observations.length}</span>
              <span className="mx-1 text-slate-300">/</span>
              {maximumPokemonCount}体
            </p>
          </div>
        </header>

        {!isActive && (
          <div
            role="alert"
            className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-900"
          >
            この対戦セッションはactiveではないため、観測を追加できません。
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:items-start">
          <section
            aria-labelledby="pokemon-search-heading"
            className="lg:sticky lg:top-5 lg:border-r lg:border-slate-200 lg:pr-8"
          >
            <p className="text-xs font-bold tracking-[0.15em] text-slate-400">STEP 1 · SEARCH</p>
            <h2 id="pokemon-search-heading" className="mt-2 text-xl font-black">
              見えたポケモンを検索
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              名前を2文字以上入力し、候補をタップするとすぐに観測として保存されます。
            </p>

            <div className="mt-6">
              <label
                htmlFor="opponent-pokemon-search"
                className="text-sm font-black text-slate-800"
              >
                相手ポケモン
              </label>
              <div className="relative mt-2">
                <input
                  id="opponent-pokemon-search"
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setClientError(null);
                  }}
                  disabled={!isActive || hasReachedLimit || addObservation.isPending}
                  placeholder={
                    hasReachedLimit ? "入力可能な最大数に達しました" : "ポケモン名を2文字以上入力"
                  }
                  autoComplete="off"
                  className="min-h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 pr-12 text-base font-semibold outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-blue-800 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
                {search.isFetching && (
                  <span
                    aria-hidden="true"
                    className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800"
                  />
                )}
              </div>

              {query.trim().length > 0 && query.trim().length < 2 && (
                <p className="mt-2 text-xs text-slate-500">2文字以上入力してください。</p>
              )}
              {search.isFetching && (
                <p role="status" className="mt-3 text-sm text-slate-500">
                  候補を検索中…
                </p>
              )}
              {search.isError && (
                <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
                  ポケモン候補を取得できませんでした。通信環境を確認してください。
                </p>
              )}
              {search.isSuccess &&
                isActive &&
                !hasReachedLimit &&
                debouncedQuery.length >= 2 &&
                availableCandidates.length === 0 && (
                  <p className="mt-3 text-sm text-slate-500">
                    {search.data.items.length > 0
                      ? "検索結果はすべて入力済みです。"
                      : "一致するポケモンはいません。"}
                  </p>
                )}

              {availableCandidates.length > 0 && (
                <ul
                  aria-label="ポケモン検索候補"
                  className="mt-3 max-h-[28rem] divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/8"
                >
                  {availableCandidates.map((pokemon) => (
                    <li key={pokemon.id}>
                      <button
                        type="button"
                        onClick={() => selectPokemon(pokemon)}
                        disabled={addObservation.isPending}
                        aria-label={`${pokemon.nameJa}（${pokemon.form}）を追加`}
                        className="grid min-h-20 w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl px-3 py-3 text-left outline-none transition hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-wait disabled:opacity-60"
                      >
                        <span className="text-xs font-black tabular-nums text-slate-300">
                          #{pokemon.dexNo}
                        </span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-black text-slate-950">{pokemon.nameJa}</span>
                            <span className="truncate text-xs text-slate-400">
                              {pokemon.nameEn}
                            </span>
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-500">{pokemon.form}</span>
                            {pokemon.isMega && (
                              <span className="rounded-full bg-blue-900 px-2 py-0.5 text-[0.65rem] font-black text-white">
                                MEGA
                              </span>
                            )}
                          </span>
                        </span>
                        <PokemonTypes pokemon={pokemon} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {(addObservation.isError || clientError) && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-800"
                >
                  {clientError ?? getBattleErrorMessage(addObservation.error)}
                </p>
              )}
            </div>
          </section>

          <section aria-labelledby="observed-heading">
            <p className="text-xs font-bold tracking-[0.15em] text-slate-400">STEP 2 · OBSERVED</p>
            <h2 id="observed-heading" className="mt-2 text-xl font-black">
              入力済みポケモン
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              サーバーへ保存できた順番で表示しています。
            </p>

            {observations.length === 0 && (
              <div className="mt-6 border-y border-dashed border-slate-300 py-12 text-center">
                <p className="font-black text-slate-700">まだ観測はありません</p>
                <p className="mt-2 text-sm text-slate-500">
                  左の検索欄から最初のポケモンを追加してください。
                </p>
              </div>
            )}

            {observations.length > 0 && (
              <ol className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
                {observations.map(({ pokemon, observation }, index) => (
                  <li
                    key={observation.id}
                    className="grid grid-cols-[2.5rem_1fr] gap-3 py-5 sm:grid-cols-[3rem_1fr_auto] sm:items-center"
                  >
                    <span className="text-2xl font-black tabular-nums text-blue-200">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-slate-950">{pokemon.nameJa}</span>
                        <span className="text-xs font-bold text-slate-400">{pokemon.form}</span>
                        {pokemon.isMega && (
                          <span className="rounded-full bg-blue-900 px-2 py-0.5 text-[0.65rem] font-black text-white">
                            MEGA
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
                        #{pokemon.dexNo} · 観測 seq {observation.seq}
                      </span>
                    </span>
                    <span className="col-start-2 sm:col-start-auto">
                      <PokemonTypes pokemon={pokemon} />
                    </span>
                  </li>
                ))}
              </ol>
            )}

            {hasReachedLimit && (
              <p
                role="status"
                className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900"
              >
                Ruleの最大入力数 {maximumPokemonCount}体に達しました。
              </p>
            )}
          </section>
        </div>
      </div>
    </PartyShell>
  );
}

export function BattleInputPage() {
  const { sessionId = "" } = useParams();
  const session = useQuery({
    queryKey: battleQueryKeys.session(sessionId),
    queryFn: () => fetchBattleSession(sessionId),
    enabled: sessionId.length > 0,
    retry: false,
  });
  const parties = useQuery({
    queryKey: partyQueryKeys.all,
    queryFn: fetchParties,
  });
  const rules = useQuery({
    queryKey: partyQueryKeys.rules,
    queryFn: fetchRules,
  });

  if (session.isLoading) {
    return (
      <PartyShell>
        <div
          role="status"
          className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-20 text-sm text-slate-500 sm:px-8"
        >
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800" />
          対戦セッションを読み込んでいます…
        </div>
      </PartyShell>
    );
  }

  if (session.isError || !session.data) {
    return (
      <PartyShell>
        <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
          <p role="alert" className="text-lg font-black text-red-800">
            {getBattleErrorMessage(session.error)}
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-800 outline-none hover:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            ホームへ戻る
          </Link>
        </div>
      </PartyShell>
    );
  }

  const rule = rules.data?.items.find((item) => item.id === session.data.ruleId);
  const partyName = parties.data?.items.find((item) => item.id === session.data.partyId)?.name;

  if (rules.isLoading) {
    return (
      <PartyShell>
        <div
          role="status"
          className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-20 text-sm text-slate-500 sm:px-8"
        >
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800" />
          Rule情報を読み込んでいます…
        </div>
      </PartyShell>
    );
  }

  if (rules.isError || !rule) {
    return (
      <PartyShell>
        <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
          <p role="alert" className="text-lg font-black text-red-800">
            Rule情報を確認できないため、対戦入力を開始できません。再読み込みしてください。
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-800 outline-none hover:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            ホームへ戻る
          </Link>
        </div>
      </PartyShell>
    );
  }

  return (
    <BattleWorkspace
      key={session.data.id}
      session={session.data}
      rule={rule}
      partyName={partyName}
    />
  );
}
