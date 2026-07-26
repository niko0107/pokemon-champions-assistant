import { Link, Outlet } from "react-router-dom";
import { useHealthQuery } from "../health/use-health-query";

function HealthStatus() {
  const { data, isLoading, isError } = useHealthQuery();
  const isHealthy = !isLoading && !isError && data?.status === "ok";

  return (
    <span
      data-testid="health-status"
      data-status={isLoading ? "loading" : isHealthy ? "ok" : "error"}
      className="inline-flex items-center gap-2 text-xs text-slate-500"
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${
          isLoading ? "bg-slate-300" : isHealthy ? "bg-blue-500" : "bg-red-500"
        }`}
      />
      {isLoading ? "API確認中" : isHealthy ? "API接続済み" : "API接続エラー"}
    </span>
  );
}

export function AuthLayout() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-950">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-36 -right-28 h-80 w-80 rounded-full bg-blue-100/70 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-10 -left-32 h-72 w-72 rounded-full bg-slate-200/80 blur-3xl"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 sm:px-8">
        <header className="flex items-center justify-between py-6 sm:py-8">
          <Link
            to="/"
            className="rounded-lg text-sm font-black tracking-[0.16em] text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-4"
          >
            POKÉ CHAMPIONS
          </Link>
          <HealthStatus />
        </header>

        <div className="grid flex-1 items-center gap-10 py-6 lg:grid-cols-[1fr_31rem] lg:gap-20 lg:py-12">
          <section className="max-w-xl">
            <p className="mb-5 text-xs font-bold tracking-[0.18em] text-blue-700">
              BATTLE DECISION SUPPORT
            </p>
            <h1 className="text-4xl leading-[1.12] font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              対戦の読みを、
              <br />
              次の一手へ。
            </h1>
            <p className="mt-6 max-w-lg text-base leading-8 text-slate-600 sm:text-lg">
              相手の情報を入力しながら構築候補を絞り込み、選出と立ち回りの判断を支えます。
            </p>
            <div className="mt-8 hidden items-center gap-3 text-sm text-slate-500 lg:flex">
              <span className="h-px w-12 bg-slate-300" />
              非公式の対戦支援ツール
            </div>
          </section>

          <section className="w-full rounded-[2rem] border border-slate-200/80 bg-white/90 p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur sm:p-9">
            <Outlet />
          </section>
        </div>

        <footer className="py-6 text-center text-xs leading-5 text-slate-400 sm:text-left">
          本サービスは任天堂・株式会社ポケモンとは関係のない非公式ツールです。
        </footer>
      </div>
    </main>
  );
}
