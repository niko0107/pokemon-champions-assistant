import { useAuthStore } from "../../stores/auth-store";

export function AccountPage() {
  const user = useAuthStore((state) => state.user);
  const clearAuthentication = useAuthStore((state) => state.clearAuthentication);

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 sm:px-8">
        <header className="flex items-center justify-between border-b border-slate-200 py-6">
          <span className="text-sm font-black tracking-[0.16em]">POKÉ CHAMPIONS</span>
          <button
            type="button"
            onClick={clearAuthentication}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 outline-none transition hover:border-slate-500 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
          >
            ログアウト
          </button>
        </header>

        <section className="flex flex-1 items-center py-16">
          <div className="max-w-2xl">
            <p className="text-sm font-bold tracking-wide text-blue-700">ログイン済み</p>
            <h1 className="mt-4 text-4xl leading-tight font-black tracking-tight sm:text-6xl">
              {user.displayName}さん、
              <br />
              準備ができました。
            </h1>
            <p className="mt-6 text-base leading-8 text-slate-600">
              {user.email}
              <br />
              パーティ登録と対戦開始は、次のWebタスクで利用できるようになります。
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
