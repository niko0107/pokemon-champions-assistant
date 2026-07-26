import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../stores/auth-store";

export function PartyShell({ children }: { children: ReactNode }) {
  const clearAuthentication = useAuthStore((state) => state.clearAuthentication);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Link
            to="/"
            className="rounded-lg text-sm font-black tracking-[0.16em] outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-4"
          >
            POKÉ CHAMPIONS
          </Link>
          <button
            type="button"
            onClick={clearAuthentication}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 outline-none transition hover:border-slate-500 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
          >
            ログアウト
          </button>
        </div>
      </header>
      {children}
      <footer className="mx-auto max-w-6xl px-5 py-8 text-xs leading-5 text-slate-400 sm:px-8">
        本サービスは任天堂・株式会社ポケモンとは関係のない非公式ツールです。
      </footer>
    </main>
  );
}
