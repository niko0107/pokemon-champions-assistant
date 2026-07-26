import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { fetchParties, fetchRules, partyQueryKeys } from "../parties/party-api";
import { PartyShell } from "../parties/party-shell";
import { createBattleSession } from "./battle-api";
import { getBattleErrorMessage } from "./battle-errors";

export function BattleStartPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPartyId = searchParams.get("partyId");
  const parties = useQuery({
    queryKey: partyQueryKeys.all,
    queryFn: fetchParties,
  });
  const rules = useQuery({
    queryKey: partyQueryKeys.rules,
    queryFn: fetchRules,
  });
  const activeParties = parties.data?.items.filter((party) => party.isActive) ?? [];
  const requestedParty = activeParties.find((party) => party.id === requestedPartyId);
  const initialPartyId = requestedParty?.id ?? activeParties[0]?.id ?? "";
  const selectedPartyId = activeParties.some((party) => party.id === searchParams.get("selected"))
    ? (searchParams.get("selected") ?? initialPartyId)
    : initialPartyId;
  const selectedParty = activeParties.find((party) => party.id === selectedPartyId);
  const selectedRule = rules.data?.items.find((rule) => rule.id === selectedParty?.ruleId);

  const createSession = useMutation({
    mutationFn: createBattleSession,
    onSuccess: (session) => {
      void navigate(`/battle/${session.id}`);
    },
  });

  function selectParty(partyId: string): void {
    const next = new URLSearchParams(searchParams);
    next.set("selected", partyId);
    setSearchParams(next, { replace: true });
  }

  return (
    <PartyShell>
      <div className="mx-auto w-full max-w-5xl px-5 py-9 sm:px-8 sm:py-14">
        <nav aria-label="パンくず">
          <Link
            to="/"
            className="rounded-lg text-sm font-bold text-slate-500 outline-none hover:text-blue-900 focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            ← ホームへ戻る
          </Link>
        </nav>

        <header className="mt-8 max-w-3xl">
          <p className="text-xs font-black tracking-[0.18em] text-blue-700">NEW BATTLE</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
            対戦を始めるパーティを選択
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-500">
            activeなパーティとRuleを確認して、新しい対戦セッションを開始します。
          </p>
        </header>

        {parties.isLoading && (
          <div role="status" className="mt-10 flex items-center gap-3 py-10 text-sm text-slate-500">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800" />
            パーティを読み込んでいます…
          </div>
        )}

        {parties.isError && (
          <div
            role="alert"
            className="mt-10 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800"
          >
            {getBattleErrorMessage(parties.error)}
            <button
              type="button"
              onClick={() => void parties.refetch()}
              className="ml-3 rounded-lg underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-red-700"
            >
              再読み込み
            </button>
          </div>
        )}

        {parties.data && activeParties.length === 0 && (
          <section className="mt-10 border-y border-slate-200 py-12">
            <p className="text-xl font-black">activeなパーティがありません</p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
              対戦を始めるには、activeとして保存したパーティが必要です。
            </p>
            <Link
              to="/parties/new"
              className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white outline-none hover:bg-blue-900 focus-visible:ring-4 focus-visible:ring-blue-200"
            >
              パーティを登録する
            </Link>
          </section>
        )}

        {activeParties.length > 0 && (
          <form
            className="mt-10"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedParty) {
                return;
              }
              createSession.mutate({
                partyId: selectedParty.id,
                ruleId: selectedParty.ruleId,
              });
            }}
          >
            <fieldset disabled={createSession.isPending}>
              <legend className="text-sm font-black text-slate-800">activeパーティ</legend>
              <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                {activeParties.map((party, index) => {
                  const rule = rules.data?.items.find((item) => item.id === party.ruleId);
                  return (
                    <label
                      key={party.id}
                      className="grid min-h-24 cursor-pointer grid-cols-[auto_1fr] gap-4 px-2 py-5 outline-none transition hover:bg-blue-50/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-700 sm:grid-cols-[3rem_auto_1fr]"
                    >
                      <span className="hidden pt-1 text-xl font-black text-slate-200 sm:block">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <input
                        type="radio"
                        name="party"
                        value={party.id}
                        checked={party.id === selectedPartyId}
                        onChange={() => selectParty(party.id)}
                        className="mt-1 h-5 w-5 accent-blue-900"
                      />
                      <span>
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-black text-slate-950">{party.name}</span>
                          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-900">
                            ACTIVE
                          </span>
                        </span>
                        <span className="mt-2 block text-sm text-slate-500">
                          {rule
                            ? `${rule.name} · ${rule.teamSize}体登録 / ${rule.pickSize}体選出`
                            : `Rule #${party.ruleId}`}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {rules.isError && (
              <p role="alert" className="mt-4 text-sm font-semibold text-red-700">
                Rule情報を取得できませんでした。再読み込みしてからお試しください。
              </p>
            )}

            {selectedParty && (
              <aside className="mt-7 border-l-4 border-blue-800 bg-blue-50 px-5 py-4">
                <p className="text-xs font-black tracking-[0.14em] text-blue-800">SELECTED RULE</p>
                <p className="mt-2 font-black text-blue-950">
                  {selectedRule?.name ?? `Rule #${selectedParty.ruleId}`}
                </p>
                {selectedRule && (
                  <p className="mt-1 text-sm text-blue-900">
                    登録 {selectedRule.teamSize}体 / 選出 {selectedRule.pickSize}体
                  </p>
                )}
              </aside>
            )}

            {createSession.isError && (
              <p
                role="alert"
                className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
              >
                {getBattleErrorMessage(createSession.error)}
              </p>
            )}

            <div className="sticky bottom-4 mt-8 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl shadow-slate-900/10 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
              <button
                type="submit"
                disabled={!selectedParty || rules.isError || createSession.isPending}
                className="min-h-13 w-full rounded-xl bg-slate-950 px-6 py-3 text-sm font-black text-white outline-none transition hover:bg-blue-900 focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto sm:min-w-56"
              >
                {createSession.isPending ? "セッションを作成中…" : "このパーティで対戦開始"}
              </button>
            </div>
          </form>
        )}
      </div>
    </PartyShell>
  );
}
