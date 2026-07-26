import { loginRequestSchema } from "@pokemon-champions/shared";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/api-client";
import { getAuthErrorMessage } from "./auth-errors";
import { PasswordField, TextField } from "./form-fields";

type LoginField = "email" | "password";
type LoginErrors = Partial<Record<LoginField, string>>;

export function LoginPage() {
  const navigate = useNavigate();
  const [fieldErrors, setFieldErrors] = useState<LoginErrors>({});
  const mutation = useMutation({
    mutationFn: (input: { email: string; password: string }) => apiClient.login(input),
    onSuccess: () => navigate("/", { replace: true }),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const result = loginRequestSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!result.success) {
      const errors: LoginErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if ((field === "email" || field === "password") && !errors[field]) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    mutation.reset();
    mutation.mutate(result.data);
  }

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-semibold text-blue-700">おかえりなさい</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">ログイン</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          登録したメールアドレスで続けてください。
        </p>
      </div>

      {mutation.isError && (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 font-medium text-red-800"
        >
          {getAuthErrorMessage(mutation.error)}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <TextField
          id="login-email"
          name="email"
          type="email"
          label="メールアドレス"
          placeholder="trainer@example.com"
          autoComplete="email"
          inputMode="email"
          disabled={mutation.isPending}
          error={fieldErrors.email}
        />
        <PasswordField
          id="login-password"
          name="password"
          label="パスワード"
          placeholder="パスワードを入力"
          autoComplete="current-password"
          disabled={mutation.isPending}
          error={fieldErrors.password}
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="mt-2 min-h-12 w-full rounded-2xl bg-slate-950 px-5 py-3 text-base font-bold text-white shadow-lg shadow-slate-950/10 outline-none transition hover:bg-blue-900 focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-wait disabled:bg-slate-400"
        >
          {mutation.isPending ? "ログイン中…" : "ログイン"}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-slate-600">
        はじめて利用する方は{" "}
        <Link
          to="/register"
          className="rounded font-bold text-blue-800 underline decoration-blue-200 underline-offset-4 outline-none hover:decoration-blue-700 focus-visible:ring-2 focus-visible:ring-blue-700"
        >
          新規登録
        </Link>
      </p>
    </div>
  );
}
