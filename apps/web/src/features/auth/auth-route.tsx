import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../../stores/auth-store";

function RestoringScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 text-slate-950">
      <div role="status" className="flex items-center gap-3 text-sm font-semibold text-slate-600">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800" />
        ログイン状態を確認しています…
      </div>
    </main>
  );
}

export function RequireAuth() {
  const status = useAuthStore((state) => state.status);

  if (status === "restoring") {
    return <RestoringScreen />;
  }
  if (status === "anonymous") {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

export function AnonymousOnly() {
  const status = useAuthStore((state) => state.status);

  if (status === "restoring") {
    return <RestoringScreen />;
  }
  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
