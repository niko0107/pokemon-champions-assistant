import { useHealthQuery } from "./features/health/use-health-query";

function HealthBadge() {
  const { data, isLoading, isError } = useHealthQuery();

  if (isLoading) {
    return <span className="rounded-full bg-zinc-700 px-3 py-1 text-sm">API 確認中…</span>;
  }
  if (isError || data?.status !== "ok") {
    return (
      <span
        data-testid="health-status"
        data-status="error"
        className="rounded-full bg-red-900 px-3 py-1 text-sm text-red-200"
      >
        API 接続エラー
      </span>
    );
  }
  return (
    <span
      data-testid="health-status"
      data-status="ok"
      className="rounded-full bg-emerald-900 px-3 py-1 text-sm text-emerald-200"
    >
      API 接続 OK
    </span>
  );
}

export function App() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Pokémon Champions 対戦支援</h1>
          <p className="text-sm text-zinc-400">
            相手の構築を予測し、あなたのパーティに合わせた対策を提示します。
          </p>
        </header>

        <section className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <span className="text-sm text-zinc-300">サーバー状態:</span>
          <HealthBadge />
        </section>

        <footer className="text-xs text-zinc-500">
          本サービスは任天堂・株式会社ポケモンとは関係のない非公式ツールです。
        </footer>
      </div>
    </main>
  );
}
