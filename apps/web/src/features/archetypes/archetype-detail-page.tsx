import { useQuery } from "@tanstack/react-query";
import { archetypeDetailParamsSchema, type PublicArchetypeDetail } from "@pokemon-champions/shared";
import { Link, useParams } from "react-router-dom";
import { PartyShell } from "../parties/party-shell";
import { archetypeQueryKeys, fetchArchetypeDetail } from "./archetype-api";
import { getArchetypeDetailErrorMessage } from "./archetype-errors";

const TYPE_LABELS: Readonly<Record<string, string>> = {
  normal: "ノーマル",
  fire: "ほのお",
  water: "みず",
  electric: "でんき",
  grass: "くさ",
  ice: "こおり",
  fighting: "かくとう",
  poison: "どく",
  ground: "じめん",
  flying: "ひこう",
  psychic: "エスパー",
  bug: "むし",
  rock: "いわ",
  ghost: "ゴースト",
  dragon: "ドラゴン",
  dark: "あく",
  steel: "はがね",
  fairy: "フェアリー",
};

const ROLE_LABELS: Readonly<Record<string, string>> = {
  lead: "先発",
  sweeper: "アタッカー",
  wall: "受け",
  pivot: "サイクル",
  support: "サポート",
};

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  physical: "物理",
  special: "特殊",
  status: "変化",
};

const ACTUAL_STAT_LABELS = {
  hp: "HP",
  attack: "攻撃",
  defense: "防御",
  specialAttack: "特攻",
  specialDefense: "特防",
  speed: "素早さ",
} as const;

const EV_LABELS = {
  hp: "HP",
  atk: "攻撃",
  def: "防御",
  spa: "特攻",
  spd: "特防",
  spe: "素早さ",
} as const;

const STAT_DATA_STATUS_LABELS = {
  exact: "出典で確認済み",
  derived: "明示されたIV・EV・性格から算出",
  partial: "実数値未確認",
} as const;

type ArchetypePokemon = PublicArchetypeDetail["pokemons"][number];

function formatRate(rate: number): string {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(rate * 100);
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

function PokemonStats({ pokemon }: { pokemon: ArchetypePokemon }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <section aria-labelledby={`evs-${pokemon.slot}`}>
        <h4
          id={`evs-${pokemon.slot}`}
          className="text-xs font-black tracking-[0.12em] text-slate-400"
        >
          努力値
        </h4>
        {pokemon.evs ? (
          <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
            {Object.entries(EV_LABELS).map(([key, label]) => (
              <div key={key} className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-black tabular-nums text-slate-800">
                  {pokemon.evs?.[key as keyof typeof pokemon.evs]}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-500">データ未登録</p>
        )}
      </section>

      <section aria-labelledby={`ivs-${pokemon.slot}`}>
        <h4
          id={`ivs-${pokemon.slot}`}
          className="text-xs font-black tracking-[0.12em] text-slate-400"
        >
          個体値
        </h4>
        {pokemon.ivs ? (
          <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
            {Object.entries(EV_LABELS).map(([key, label]) => (
              <div key={key} className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-black tabular-nums text-slate-800">
                  {pokemon.ivs?.[key as keyof typeof pokemon.ivs] ?? "未確認"}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-500">未確認</p>
        )}
      </section>

      <section aria-labelledby={`stats-${pokemon.slot}`}>
        <h4
          id={`stats-${pokemon.slot}`}
          className="text-xs font-black tracking-[0.12em] text-slate-400"
        >
          実数値
        </h4>
        <p className="mt-2 text-xs font-bold text-slate-500">
          {STAT_DATA_STATUS_LABELS[pokemon.statDataStatus]}
        </p>
        {pokemon.actualStats ? (
          <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
            {Object.entries(ACTUAL_STAT_LABELS).map(([key, label]) => (
              <div key={key} className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-black tabular-nums text-slate-800">
                  {pokemon.actualStats?.[key as keyof typeof pokemon.actualStats]}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-500">ダメージ・確定数計算には使用しません</p>
        )}
      </section>
    </div>
  );
}

function PokemonEntry({ pokemon }: { pokemon: ArchetypePokemon }) {
  return (
    <li className="grid gap-5 py-7 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
      <div>
        <p className="text-xs font-black tracking-[0.14em] text-slate-400">
          SLOT {String(pokemon.slot).padStart(2, "0")}
        </p>
        <h3 className="mt-2 break-words text-xl font-black text-slate-950">
          {pokemon.pokemon.nameJa}
        </h3>
        <p className="mt-1 break-words text-xs text-slate-500">
          {pokemon.pokemon.nameEn} · {pokemon.pokemon.form}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <TypeBadge type={pokemon.pokemon.type1} />
          {pokemon.pokemon.type2 && <TypeBadge type={pokemon.pokemon.type2} />}
          {pokemon.pokemon.isMega && (
            <span className="rounded-full bg-fuchsia-100 px-2.5 py-1 text-xs font-black text-fuchsia-900">
              メガシンカ
            </span>
          )}
        </div>
        <p className="mt-4 text-sm font-bold text-slate-600">
          採用率 {formatRate(pokemon.usageRate)}%
        </p>
      </div>

      <div className="min-w-0 space-y-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs font-black tracking-[0.1em] text-slate-400">持ち物</dt>
            <dd className="mt-1 break-words font-bold text-slate-800">
              {pokemon.item?.nameJa ?? "持ち物なし"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-black tracking-[0.1em] text-slate-400">特性</dt>
            <dd className="mt-1 break-words font-bold text-slate-800">
              {pokemon.ability?.nameJa ?? "データ未登録"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-black tracking-[0.1em] text-slate-400">性格</dt>
            <dd className="mt-1 break-words font-bold text-slate-800">
              {pokemon.nature ?? "データ未登録"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-black tracking-[0.1em] text-slate-400">
              役割・テラスタイプ
            </dt>
            <dd className="mt-1 break-words font-bold text-slate-800">
              {ROLE_LABELS[pokemon.role] ?? pokemon.role}
              {pokemon.teraType
                ? ` · ${TYPE_LABELS[pokemon.teraType] ?? pokemon.teraType}`
                : " · 未登録"}
            </dd>
          </div>
        </dl>

        <section aria-labelledby={`moves-${pokemon.slot}`}>
          <h4
            id={`moves-${pokemon.slot}`}
            className="text-xs font-black tracking-[0.12em] text-slate-400"
          >
            技
          </h4>
          {pokemon.moves.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">技データ未登録</p>
          ) : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {pokemon.moves.map((move) => (
                <li
                  key={move.moveId}
                  className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="break-words font-black text-slate-900">{move.nameJa}</span>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-slate-500">
                      採用率 {formatRate(move.adoptionRate)}%
                    </span>
                  </div>
                  <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                    {TYPE_LABELS[move.type] ?? move.type} ·{" "}
                    {CATEGORY_LABELS[move.category] ?? move.category} · 威力 {move.power ?? "—"} ·
                    命中 {move.accuracy ?? "—"}
                    {move.priority !== 0 ? ` · 優先度 ${move.priority}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <PokemonStats pokemon={pokemon} />

        <section aria-labelledby={`threat-${pokemon.slot}`}>
          <h4
            id={`threat-${pokemon.slot}`}
            className="text-xs font-black tracking-[0.12em] text-slate-400"
          >
            警戒メモ
          </h4>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
            {pokemon.threatNotes ?? "備考なし"}
          </p>
        </section>
      </div>
    </li>
  );
}

function ArchetypeDetail({
  detail,
  sessionId,
}: {
  detail: PublicArchetypeDetail;
  sessionId: string;
}) {
  const pokemonBySlot = new Map(detail.pokemons.map((pokemon) => [pokemon.slot, pokemon]));

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
          <Link
            to={`/battle/${sessionId}`}
            className="inline-flex min-h-11 items-center rounded-lg text-sm font-black text-blue-900 underline decoration-blue-200 underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-4"
          >
            ← 対戦画面へ戻る
          </Link>
          <p className="mt-8 text-xs font-black tracking-[0.18em] text-blue-800">
            ARCHETYPE DETAIL
          </p>
          <h1 className="mt-3 break-words text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">
            {detail.name}
          </h1>
          <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600 sm:text-base">
            {detail.description}
          </p>
          <dl className="mt-6 flex flex-wrap gap-x-7 gap-y-3 text-sm">
            <div>
              <dt className="text-xs font-black tracking-[0.1em] text-slate-400">RULE</dt>
              <dd className="mt-1 font-black text-slate-800">{detail.rule.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-black tracking-[0.1em] text-slate-400">SEASON</dt>
              <dd className="mt-1 font-black text-slate-800">{detail.season.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-black tracking-[0.1em] text-slate-400">FORMAT</dt>
              <dd className="mt-1 font-black text-slate-800">
                {detail.rule.teamSize}体構築 · {detail.rule.pickSize}体選出 · Lv.
                {detail.rule.battleLevel}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <section aria-labelledby="archetype-pokemons">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-[0.16em] text-blue-800">TEAM</p>
              <h2 id="archetype-pokemons" className="mt-2 text-2xl font-black text-slate-950">
                採用ポケモン
              </h2>
            </div>
            <p className="text-sm font-bold text-slate-500">{detail.pokemons.length}体</p>
          </div>
          <ol className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
            {detail.pokemons.map((pokemon) => (
              <PokemonEntry key={pokemon.slot} pokemon={pokemon} />
            ))}
          </ol>
        </section>

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.6fr)]">
          <div className="space-y-8">
            <section
              aria-labelledby="default-leads"
              className="rounded-2xl border border-blue-100 bg-blue-50 p-5 sm:p-7"
            >
              <p className="text-xs font-black tracking-[0.16em] text-blue-800">DEFAULT PICKS</p>
              <h2 id="default-leads" className="mt-2 text-xl font-black text-blue-950">
                基本選出
              </h2>
              {detail.defaultLeads.length === 0 ? (
                <p className="mt-4 text-sm text-blue-900">基本選出の登録なし</p>
              ) : (
                <ol className="mt-4 flex flex-wrap gap-3">
                  {detail.defaultLeads.map((slot, index) => {
                    const pokemon = pokemonBySlot.get(slot);
                    return (
                      <li
                        key={slot}
                        className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm text-blue-950"
                      >
                        <span className="mr-2 text-xs font-black text-blue-500">{index + 1}</span>
                        <span className="font-black">{pokemon?.pokemon.nameJa}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <section aria-labelledby="playstyle" className="border-l-4 border-slate-900 pl-5">
              <p className="text-xs font-black tracking-[0.16em] text-slate-400">PLAYSTYLE</p>
              <h2 id="playstyle" className="mt-2 text-xl font-black text-slate-950">
                立ち回り
              </h2>
              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                {detail.playstyleNotes ?? "立ち回りメモの登録なし"}
              </p>
            </section>
          </div>

          <section aria-labelledby="sources" className="min-w-0 border-t border-slate-300 pt-5">
            <p className="text-xs font-black tracking-[0.16em] text-slate-400">SOURCES</p>
            <h2 id="sources" className="mt-2 text-xl font-black text-slate-950">
              出典
            </h2>
            {detail.sources.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">出典の登録なし</p>
            ) : (
              <ol className="mt-4 space-y-4">
                {detail.sources.map((source, index) => (
                  <li key={source.url} className="min-w-0">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${source.title}（外部サイトを新しいタブで開く）`}
                      className="block min-h-11 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-4"
                    >
                      <span className="block break-words text-sm font-black text-blue-900 underline decoration-blue-200 underline-offset-4">
                        {source.title || `出典${index + 1}`}
                      </span>
                      <span className="mt-1 block break-all text-xs leading-5 text-slate-500">
                        {source.siteName} · {source.url}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export function ArchetypeDetailPage() {
  const { sessionId = "", archetypeId = "" } = useParams<{
    sessionId: string;
    archetypeId: string;
  }>();
  const params = archetypeDetailParamsSchema.safeParse({ id: archetypeId });
  const query = useQuery({
    queryKey: archetypeQueryKeys.detail(archetypeId),
    queryFn: () => fetchArchetypeDetail(archetypeId),
    enabled: params.success,
  });

  return (
    <PartyShell>
      {!params.success ? (
        <div
          role="alert"
          className="mx-auto my-12 max-w-3xl rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-red-900 sm:px-8"
        >
          <h1 className="text-xl font-black">構築詳細を表示できません</h1>
          <p className="mt-2 text-sm leading-6">構築IDが正しくありません。</p>
          <Link
            to={`/battle/${sessionId}`}
            className="mt-5 inline-flex min-h-11 items-center rounded-lg font-black underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-red-700"
          >
            対戦画面へ戻る
          </Link>
        </div>
      ) : query.isLoading ? (
        <div
          role="status"
          className="mx-auto flex min-h-[50vh] max-w-6xl items-center justify-center gap-3 px-5 text-sm font-semibold text-slate-600"
        >
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800" />
          構築詳細を読み込んでいます…
        </div>
      ) : query.error ? (
        <div
          role="alert"
          className="mx-auto my-12 max-w-3xl rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-red-900 sm:px-8"
        >
          <h1 className="text-xl font-black">構築詳細を表示できません</h1>
          <p className="mt-2 text-sm leading-6">{getArchetypeDetailErrorMessage(query.error)}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="min-h-11 rounded-xl bg-red-900 px-5 py-2 text-sm font-black text-white outline-none focus-visible:ring-4 focus-visible:ring-red-200"
            >
              再読み込み
            </button>
            <Link
              to={`/battle/${sessionId}`}
              className="inline-flex min-h-11 items-center rounded-lg px-2 font-black underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-red-700"
            >
              対戦画面へ戻る
            </Link>
          </div>
        </div>
      ) : query.data ? (
        <ArchetypeDetail detail={query.data} sessionId={sessionId} />
      ) : null}
    </PartyShell>
  );
}
