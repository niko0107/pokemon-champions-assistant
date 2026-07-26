import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AccountPage } from "./features/auth/account-page";
import { AnonymousOnly, RequireAuth } from "./features/auth/auth-route";
import { AuthLayout } from "./features/auth/auth-layout";
import { LoginPage } from "./features/auth/login-page";
import { RegisterPage } from "./features/auth/register-page";
import { apiClient } from "./lib/api-client";
import { useAuthStore } from "./stores/auth-store";

export function App() {
  const authStatus = useAuthStore((state) => state.status);

  useEffect(() => {
    if (authStatus === "restoring") {
      void apiClient.restoreAuthentication();
    }
  }, [authStatus]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AnonymousOnly />}>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
        </Route>
        <Route element={<RequireAuth />}>
          <Route path="/" element={<AccountPage />} />
        </Route>
        <Route
          path="*"
          element={<Navigate to={authStatus === "authenticated" ? "/" : "/login"} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
