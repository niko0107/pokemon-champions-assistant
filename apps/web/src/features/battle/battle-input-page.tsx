import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BattleSessionResponse,
  MasterRule,
  MoveSummary,
  PokemonSummary,
} from "@pokemon-champions/shared";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchParties,
  fetchRules,
  partyQueryKeys,
  searchMoves,
  searchPokemons,
} from "../parties/party-api";
import { PartyShell } from "../parties/party-shell";
import { useDebouncedValue } from "../parties/use-debounced-value";
import {
  addMoveObservation,
  addPokemonObservation,
  battleQueryKeys,
  fetchBattleCandidates,
  fetchBattleSession,
} from "./battle-api";
import { BattleCandidatesPanel } from "./battle-candidates";
import { getBattleErrorMessage } from "./battle-errors";
import {
  loadBattleObservations,
  saveBattleObservations,
  toStoredMoveObservation,
  toStoredPokemonObservation,
  type StoredBattleObservation,
  type StoredMoveObservation,
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

function MoveFacts({ move }: { move: MoveSummary }) {
  const categoryLabel = {
    physical: "物理",
    special: "特殊",
    status: "変化",
  }[move.category];

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-slate-500">
      <span className="uppercase text-blue-800">{move.type}</span>
      <span>{categoryLabel}</span>
      <span>威力 {move.power ?? "—"}</span>
      <span>命中 {move.accuracy ?? "—"}</span>
      <span>優先度 {move.priority > 0 ? `+${move.priority}` : move.priority}</span>
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
  const queryClient = useQueryClient();
  const [pokemonQuery, setPokemonQuery] = useState("");
  const [moveQuery, setMoveQuery] = useState("");
  const [observations, setObservations] = useState<StoredBattleObservation[]>(() =>
    loadBattleObservations(session.id),
  );
  const observationsRef = useRef(observations);
  const [selectedPokemonId, setSelectedPokemonId] = useState<number | null>(null);
  const [pokemonClientError, setPokemonClientError] = useState<string | null>(null);
  const [moveClientError, setMoveClientError] = useState<string | null>(null);
  const submissionInFlight = useRef(false);
  const debouncedPokemonQuery = useDebouncedValue(pokemonQuery.trim(), 300);
  const debouncedMoveQuery = useDebouncedValue(moveQuery.trim(), 300);
  const normalizedMoveQuery = moveQuery.trim();
  const maximumPokemonCount = rule.teamSize;
  const isActive = session.status === "active";
  const pokemonObservations = observations.filter(
    (item): item is StoredPokemonObservation => item.type === "pokemon",
  );
  const moveObservations = observations.filter(
    (item): item is StoredMoveObservation => item.type === "move",
  );
  const hasReachedLimit = pokemonObservations.length >= maximumPokemonCount;
  const observedPokemonIds = new Set(pokemonObservations.map((item) => item.observation.pokemonId));
  const selectedPokemon =
    pokemonObservations.find((item) => item.observation.pokemonId === selectedPokemonId) ?? null;
  const selectedPokemonMoves = selectedPokemon
    ? moveObservations.filter(
        (item) => item.observation.pokemonId === selectedPokemon.observation.pokemonId,
      )
    : [];
  const selectedMoveIds = new Set(
    selectedPokemonMoves.map((item) => item.observation.moveId).filter((id) => id !== null),
  );
  const candidates = useQuery({
    queryKey: battleQueryKeys.candidates(session.id),
    queryFn: () => fetchBattleCandidates(session.id),
    enabled: isActive,
    retry: false,
  });

  useEffect(() => {
    if (
      pokemonObservations.length > 0 &&
      !pokemonObservations.some((item) => item.observation.pokemonId === selectedPokemonId)
    ) {
      setSelectedPokemonId(pokemonObservations[0]?.observation.pokemonId ?? null);
    }
  }, [pokemonObservations, selectedPokemonId]);

  function commitObservations(next: StoredBattleObservation[]): void {
    saveBattleObservations(session.id, next);
    observationsRef.current = next;
    setObservations(next);
  }

  function refreshCandidatesAfterObservation(): void {
    void queryClient
      .cancelQueries({
        queryKey: battleQueryKeys.candidates(session.id),
        exact: true,
      })
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: battleQueryKeys.candidates(session.id),
          exact: true,
        }),
      );
  }

  const pokemonSearch = useQuery({
    queryKey: battleQueryKeys.pokemonSearch(debouncedPokemonQuery),
    queryFn: () => searchPokemons(debouncedPokemonQuery),
    enabled: isActive && !hasReachedLimit && debouncedPokemonQuery.length >= 2,
  });
  const availablePokemonCandidates =
    !isActive || hasReachedLimit
      ? []
      : (pokemonSearch.data?.items ?? []).filter((pokemon) => !observedPokemonIds.has(pokemon.id));

  const moveSearch = useQuery({
    queryKey: battleQueryKeys.moveSearch(selectedPokemonId ?? 0, debouncedMoveQuery),
    queryFn: () => searchMoves(selectedPokemonId ?? 0, debouncedMoveQuery),
    enabled:
      isActive &&
      selectedPokemonId !== null &&
      normalizedMoveQuery.length >= 2 &&
      debouncedMoveQuery.length >= 2,
  });
  const availableMoveCandidates =
    selectedPokemon && normalizedMoveQuery.length >= 2
      ? (moveSearch.data?.items ?? []).filter((move) => !selectedMoveIds.has(move.id))
      : [];

  const addPokemon = useMutation({
    mutationFn: (pokemon: PokemonSummary) => addPokemonObservation(session.id, pokemon.id),
    onSuccess: (observation, pokemon) => {
      refreshCandidatesAfterObservation();
      try {
        const stored = toStoredPokemonObservation(pokemon, observation);
        const current = observationsRef.current;
        if (
          current.some(
            (item) => item.type === "pokemon" && item.observation.pokemonId === pokemon.id,
          )
        ) {
          return;
        }
        commitObservations([...current, stored]);
        setSelectedPokemonId(pokemon.id);
        setPokemonQuery("");
        setMoveQuery("");
        setPokemonClientError(null);
      } catch {
        setPokemonClientError(
          "APIレスポンスを画面へ反映できませんでした。再読み込みしてください。",
        );
      }
    },
    onSettled: () => {
      submissionInFlight.current = false;
    },
  });

  const addMove = useMutation({
    mutationFn: ({ pokemonId, move }: { pokemonId: number; move: MoveSummary }) =>
      addMoveObservation(session.id, pokemonId, move.id),
    onSuccess: (observation, { pokemonId, move }) => {
      refreshCandidatesAfterObservation();
      try {
        const current = observationsRef.current;
        const targetExists = current.some(
          (item) => item.type === "pokemon" && item.observation.pokemonId === pokemonId,
        );
        const duplicateExists = current.some(
          (item) =>
            item.type === "move" &&
            item.observation.pokemonId === pokemonId &&
            item.observation.moveId === move.id,
        );
        if (!targetExists || duplicateExists) {
          setMoveClientError("技の入力対象を確認し、もう一度お試しください。");
          return;
        }
        const stored = toStoredMoveObservation(move, observation);
        commitObservations([...current, stored]);
        setMoveQuery("");
        setMoveClientError(null);
      } catch {
        setMoveClientError("APIレスポンスを画面へ反映できませんでした。再読み込みしてください。");
      }
    },
    onSettled: () => {
      submissionInFlight.current = false;
    },
  });

  function selectPokemonCandidate(pokemon: PokemonSummary): void {
    if (
      submissionInFlight.current ||
      !isActive ||
      hasReachedLimit ||
      observationsRef.current.some(
        (item) => item.type === "pokemon" && item.observation.pokemonId === pokemon.id,
      )
    ) {
      return;
    }
    submissionInFlight.current = true;
    setPokemonClientError(null);
    addPokemon.mutate(pokemon);
  }

  function selectMoveCandidate(move: MoveSummary): void {
    const pokemonId = selectedPokemonId;
    const current = observationsRef.current;
    if (
      submissionInFlight.current ||
      !isActive ||
      pokemonId === null ||
      !current.some(
        (item) => item.type === "pokemon" && item.observation.pokemonId === pokemonId,
      ) ||
      current.some(
        (item) =>
          item.type === "move" &&
          item.observation.pokemonId === pokemonId &&
          item.observation.moveId === move.id,
      )
    ) {
      return;
    }
    submissionInFlight.current = true;
    setMoveClientError(null);
    addMove.mutate({ pokemonId, move });
  }

  function chooseMoveTarget(pokemonId: number): void {
    if (pokemonId === selectedPokemonId) {
      return;
    }
    setSelectedPokemonId(pokemonId);
    setMoveQuery("");
    setMoveClientError(null);
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
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">相手の情報を入力</h1>
              <p className="mt-3 text-sm text-slate-500">
                {partyName ?? "使用パーティ"} · {rule.name}
              </p>
            </div>
            <p className="text-sm font-black tabular-nums text-slate-700">
              <span className="text-3xl text-blue-900">{pokemonObservations.length}</span>
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

        <BattleCandidatesPanel
          sessionId={session.id}
          isActive={isActive}
          response={candidates.data}
          observations={observations}
          isLoading={candidates.isLoading}
          isFetching={candidates.isFetching}
          error={candidates.error}
          onRetry={() => {
            void candidates.refetch();
          }}
        />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:items-start">
          <section
            aria-labelledby="pokemon-search-heading"
            className="lg:border-r lg:border-slate-200 lg:pr-8"
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
                  value={pokemonQuery}
                  onChange={(event) => {
                    setPokemonQuery(event.target.value);
                    setPokemonClientError(null);
                  }}
                  disabled={!isActive || hasReachedLimit || addPokemon.isPending}
                  placeholder={
                    hasReachedLimit ? "入力可能な最大数に達しました" : "ポケモン名を2文字以上入力"
                  }
                  autoComplete="off"
                  maxLength={50}
                  className="min-h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 pr-12 text-base font-semibold outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-blue-800 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
                {pokemonSearch.isFetching && (
                  <span
                    aria-hidden="true"
                    className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800"
                  />
                )}
              </div>

              {pokemonQuery.trim().length > 0 && pokemonQuery.trim().length < 2 && (
                <p className="mt-2 text-xs text-slate-500">2文字以上入力してください。</p>
              )}
              {pokemonSearch.isFetching && (
                <p role="status" className="mt-3 text-sm text-slate-500">
                  候補を検索中…
                </p>
              )}
              {pokemonSearch.isError && (
                <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
                  ポケモン候補を取得できませんでした。通信環境を確認してください。
                </p>
              )}
              {pokemonSearch.isSuccess &&
                isActive &&
                !hasReachedLimit &&
                debouncedPokemonQuery.length >= 2 &&
                availablePokemonCandidates.length === 0 && (
                  <p className="mt-3 text-sm text-slate-500">
                    {pokemonSearch.data.items.length > 0
                      ? "検索結果はすべて入力済みです。"
                      : "一致するポケモンはいません。"}
                  </p>
                )}

              {availablePokemonCandidates.length > 0 && (
                <ul
                  aria-label="ポケモン検索候補"
                  className="mt-3 max-h-[28rem] divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/8"
                >
                  {availablePokemonCandidates.map((pokemon) => (
                    <li key={pokemon.id}>
                      <button
                        type="button"
                        onClick={() => selectPokemonCandidate(pokemon)}
                        disabled={addPokemon.isPending}
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

              {(addPokemon.isError || pokemonClientError) && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-800"
                >
                  {pokemonClientError ?? getBattleErrorMessage(addPokemon.error)}
                </p>
              )}
            </div>
          </section>

          <section aria-labelledby="observed-heading">
            <p className="text-xs font-bold tracking-[0.15em] text-slate-400">
              STEP 2 · SELECT TARGET
            </p>
            <h2 id="observed-heading" className="mt-2 text-xl font-black">
              入力済みポケモン
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              技を入力するポケモンを選んでください。青い行が現在の入力対象です。
            </p>

            {pokemonObservations.length === 0 && (
              <div className="mt-6 border-y border-dashed border-slate-300 py-12 text-center">
                <p className="font-black text-slate-700">まだ観測はありません</p>
                <p className="mt-2 text-sm text-slate-500">
                  左の検索欄から最初のポケモンを追加してください。
                </p>
              </div>
            )}

            {pokemonObservations.length > 0 && (
              <ol className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
                {pokemonObservations.map(({ pokemon, observation }, index) => {
                  const moveCount = moveObservations.filter(
                    (item) => item.observation.pokemonId === observation.pokemonId,
                  ).length;
                  const isSelected = observation.pokemonId === selectedPokemonId;
                  return (
                    <li key={observation.id} className="py-2">
                      <button
                        type="button"
                        onClick={() => chooseMoveTarget(observation.pokemonId)}
                        aria-pressed={isSelected}
                        aria-label={`${pokemon.nameJa}を技入力対象にする`}
                        className={`grid min-h-20 w-full grid-cols-[2.5rem_1fr] gap-3 rounded-xl px-2 py-3 text-left outline-none transition sm:grid-cols-[3rem_1fr_auto] sm:items-center ${
                          isSelected
                            ? "bg-blue-950 text-white shadow-lg shadow-blue-950/15"
                            : "hover:bg-blue-50 focus-visible:bg-blue-50"
                        } focus-visible:ring-2 focus-visible:ring-blue-700`}
                      >
                        <span
                          className={`text-2xl font-black tabular-nums ${
                            isSelected ? "text-blue-300" : "text-blue-200"
                          }`}
                        >
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span>
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-black">{pokemon.nameJa}</span>
                            <span
                              className={`text-xs font-bold ${
                                isSelected ? "text-blue-200" : "text-slate-400"
                              }`}
                            >
                              {pokemon.form}
                            </span>
                            {pokemon.isMega && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[0.65rem] font-black ${
                                  isSelected ? "bg-white text-blue-950" : "bg-blue-900 text-white"
                                }`}
                              >
                                MEGA
                              </span>
                            )}
                          </span>
                          <span
                            className={`mt-1 block text-xs ${
                              isSelected ? "text-blue-200" : "text-slate-400"
                            }`}
                          >
                            観測 seq {observation.seq} · 技 {moveCount}件
                          </span>
                        </span>
                        <span
                          className={`col-start-2 text-xs font-black sm:col-start-auto ${
                            isSelected ? "text-blue-200" : "text-blue-800"
                          }`}
                        >
                          {isSelected ? "選択中" : "技を入力"}
                        </span>
                      </button>
                    </li>
                  );
                })}
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

        <section
          aria-labelledby="move-input-heading"
          className="mt-10 border-t-2 border-blue-950 pt-8 sm:mt-14 sm:pt-10"
        >
          <p className="text-xs font-bold tracking-[0.15em] text-slate-400">STEP 3 · MOVE</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="move-input-heading" className="text-xl font-black sm:text-2xl">
                使用した技を追加
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                選択中のポケモンが習得できる技だけを検索します。
              </p>
            </div>
            {selectedPokemon && (
              <p
                aria-live="polite"
                className="rounded-full bg-blue-100 px-4 py-2 text-sm font-black text-blue-950"
              >
                入力対象: {selectedPokemon.pokemon.nameJa}
              </p>
            )}
          </div>

          <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]">
            <div>
              <label htmlFor="opponent-move-search" className="text-sm font-black text-slate-800">
                技名
              </label>
              <div className="relative mt-2">
                <input
                  id="opponent-move-search"
                  type="search"
                  value={moveQuery}
                  onChange={(event) => {
                    setMoveQuery(event.target.value);
                    setMoveClientError(null);
                  }}
                  disabled={!isActive || !selectedPokemon || addMove.isPending}
                  placeholder={
                    selectedPokemon ? "技名を2文字以上入力" : "先にポケモンを追加してください"
                  }
                  autoComplete="off"
                  maxLength={50}
                  className="min-h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 pr-12 text-base font-semibold outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-blue-800 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
                {moveSearch.isFetching && (
                  <span
                    aria-hidden="true"
                    className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800"
                  />
                )}
              </div>

              {!selectedPokemon && (
                <p className="mt-3 text-sm text-slate-500">
                  Pokemon観測を追加すると技入力が有効になります。
                </p>
              )}
              {moveQuery.trim().length > 0 && moveQuery.trim().length < 2 && (
                <p className="mt-2 text-xs text-slate-500">2文字以上入力してください。</p>
              )}
              {moveSearch.isFetching && (
                <p role="status" className="mt-3 text-sm text-slate-500">
                  習得可能技を検索中…
                </p>
              )}
              {moveSearch.isError && (
                <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
                  技候補を取得できませんでした。通信環境を確認してください。
                </p>
              )}
              {moveSearch.isSuccess &&
                selectedPokemon &&
                normalizedMoveQuery.length >= 2 &&
                debouncedMoveQuery.length >= 2 &&
                availableMoveCandidates.length === 0 && (
                  <p className="mt-3 text-sm text-slate-500">
                    {moveSearch.data.items.length > 0
                      ? "検索結果はすべてこのポケモンへ入力済みです。"
                      : "一致する習得可能技はありません。"}
                  </p>
                )}

              {availableMoveCandidates.length > 0 && selectedPokemon && (
                <ul
                  aria-label="技検索候補"
                  className="mt-3 max-h-[28rem] divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/8"
                >
                  {availableMoveCandidates.map((move) => (
                    <li key={move.id}>
                      <button
                        type="button"
                        onClick={() => selectMoveCandidate(move)}
                        disabled={addMove.isPending}
                        aria-label={`${move.nameJa}を${selectedPokemon.pokemon.nameJa}の技として追加`}
                        className="grid min-h-20 w-full gap-2 rounded-xl px-4 py-3 text-left outline-none transition hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-wait disabled:opacity-60 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      >
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-black text-slate-950">{move.nameJa}</span>
                            <span className="truncate text-xs text-slate-400">{move.nameEn}</span>
                          </span>
                          <span className="mt-2 block">
                            <MoveFacts move={move} />
                          </span>
                        </span>
                        <span className="text-xs font-black text-blue-800">追加</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {(addMove.isError || moveClientError) && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-800"
                >
                  {moveClientError ?? getBattleErrorMessage(addMove.error)}
                </p>
              )}
            </div>

            <div aria-labelledby="observed-moves-heading" className="lg:border-l lg:pl-8">
              <h3 id="observed-moves-heading" className="text-sm font-black text-slate-800">
                {selectedPokemon ? `${selectedPokemon.pokemon.nameJa}の観測済み技` : "観測済み技"}
              </h3>
              {!selectedPokemon || selectedPokemonMoves.length === 0 ? (
                <div className="mt-3 border-y border-dashed border-slate-300 py-8 text-center">
                  <p className="text-sm font-semibold text-slate-500">
                    {selectedPokemon ? "まだ技観測はありません" : "入力対象を選択してください"}
                  </p>
                </div>
              ) : (
                <ol className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                  {selectedPokemonMoves.map(({ move, observation }, index) => (
                    <li key={observation.id} className="grid grid-cols-[2rem_1fr] gap-3 py-4">
                      <span className="text-lg font-black tabular-nums text-blue-200">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-black text-slate-950">{move.nameJa}</span>
                          <span className="text-xs text-slate-400">seq {observation.seq}</span>
                        </span>
                        <span className="mt-2 block">
                          <MoveFacts move={move} />
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>
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
