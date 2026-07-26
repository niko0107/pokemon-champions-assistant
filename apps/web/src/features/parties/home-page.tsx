import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../stores/auth-store";
import { fetchParties, fetchRules, partyQueryKeys } from "./party-api";
import { getPartyErrorMessage } from "./party-errors";
import { PartyShell } from "./party-shell";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function HomePage() {
  const user = useAuthStore((state) => state.user);
  const parties = useQuery({
    queryKey: partyQueryKeys.all,
    queryFn: fetchParties,
  });
  const rules = useQuery({
    queryKey: partyQueryKeys.rules,
    queryFn: fetchRules,
  });
  const ruleById = new Map(rules.data?.items.map((rule) => [rule.id, rule]) ?? []);

  if (!user) {
    return null;
  }

  return (
    <PartyShell>
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="grid gap-8 border-b border-slate-200 pb-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-black tracking-[0.18em] text-blue-700">YOUR TEAM ROOM</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
              {user.displayName}さんの
              <br className="sm:hidden" />
              パーティ
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-900">
                ログイン済み
              </span>
              <span>{user.email}</span>
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              対戦で使う6体と技構成を、ここから準備できます。
            </p>
          </div>
          <Link
            to="/parties/new"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/10 outline-none transition hover:bg-blue-900 focus-visible:ring-4 focus-visible:ring-blue-200"
          >
            新しいパーティを登録
          </Link>
        </section>

        <section aria-labelledby="party-list-heading" className="py-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.15em] text-slate-400">PARTY LIST</p>
              <h2 id="party-list-heading" className="mt-2 text-2xl font-black">
                登録済みパーティ
              </h2>
            </div>
            {parties.data && (
              <span className="text-sm font-bold text-slate-500">
                {parties.data.items.length}件
              </span>
            )}
          </div>

          {parties.isLoading && (
            <div
              role="status"
              className="mt-8 flex items-center gap-3 py-12 text-sm text-slate-500"
            >
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800" />
              パーティを読み込んでいます…
            </div>
          )}

          {parties.isError && (
            <div
              role="alert"
              className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800"
            >
              {getPartyErrorMessage(parties.error)}
              <button
                type="button"
                onClick={() => void parties.refetch()}
                className="ml-3 rounded-lg underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-red-700"
              >
                再読み込み
              </button>
            </div>
          )}

          {parties.data?.items.length === 0 && (
            <div className="mt-8 border-y border-slate-200 py-14 text-center">
              <p className="text-lg font-black text-slate-900">まだパーティがありません</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                最初のパーティを登録すると、対戦準備を始められます。
              </p>
              <Link
                to="/parties/new"
                className="mt-6 inline-flex rounded-xl border border-blue-300 bg-white px-5 py-3 text-sm font-black text-blue-900 outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-700"
              >
                パーティ登録へ
              </Link>
            </div>
          )}

          {parties.data && parties.data.items.length > 0 && (
            <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
              {parties.data.items.map((party, index) => {
                const rule = ruleById.get(party.ruleId);
                return (
                  <article
                    key={party.id}
                    className="grid gap-5 py-7 md:grid-cols-[3rem_1fr_auto] md:items-center"
                  >
                    <span className="hidden text-2xl font-black text-slate-200 md:block">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-xl font-black">{party.name}</h3>
                        {party.isActive && (
                          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-900">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      {party.description && (
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                          {party.description}
                        </p>
                      )}
                      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                        <div>
                          <dt className="sr-only">Rule</dt>
                          <dd>{rule?.name ?? `Rule #${party.ruleId}`}</dd>
                        </div>
                        <div>
                          <dt className="sr-only">登録ポケモン数</dt>
                          <dd>{rule ? `${rule.teamSize}体登録済み` : "登録数を確認中"}</dd>
                        </div>
                        <div>
                          <dt className="sr-only">更新日時</dt>
                          <dd>更新 {dateFormatter.format(new Date(party.updatedAt))}</dd>
                        </div>
                      </dl>
                    </div>
                    {party.isActive ? (
                      <Link
                        to={`/battle/new?partyId=${party.id}`}
                        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-black text-blue-900 outline-none transition hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-700"
                      >
                        このパーティで対戦
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        title="対戦開始にはactiveなパーティが必要です"
                        className="min-h-11 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-400"
                      >
                        inactive
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {rules.isError && parties.data && parties.data.items.length > 0 && (
            <p role="alert" className="mt-4 text-xs font-semibold text-red-700">
              Rule名を取得できなかったため、Rule IDを表示しています。
            </p>
          )}
        </section>
      </div>
    </PartyShell>
  );
}
