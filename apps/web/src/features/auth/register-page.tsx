import { registerRequestSchema } from "@pokemon-champions/shared";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/api-client";
import { getAuthErrorMessage } from "./auth-errors";
import { PasswordField, TextField } from "./form-fields";

type RegisterField = "email" | "displayName" | "password";
type RegisterErrors = Partial<Record<RegisterField, string>>;

export function RegisterPage() {
  const navigate = useNavigate();
  const [fieldErrors, setFieldErrors] = useState<RegisterErrors>({});
  const mutation = useMutation({
    mutationFn: (input: { email: string; displayName: string; password: string }) =>
      apiClient.register(input),
    onSuccess: () => navigate("/", { replace: true }),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const result = registerRequestSchema.safeParse({
      email: formData.get("email"),
      displayName: formData.get("displayName"),
      password: formData.get("password"),
    });

    if (!result.success) {
      const errors: RegisterErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (
          (field === "email" || field === "displayName" || field === "password") &&
          !errors[field]
        ) {
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
        <p className="text-sm font-semibold text-blue-700">無料ではじめる</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">新規登録</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          対戦準備を始めるためのアカウントを作成します。
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
          id="register-display-name"
          name="displayName"
          label="表示名"
          placeholder="チャンピオン"
          autoComplete="nickname"
          disabled={mutation.isPending}
          error={fieldErrors.displayName}
        />
        <TextField
          id="register-email"
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
          id="register-password"
          name="password"
          label="パスワード"
          placeholder="12文字以上で入力"
          autoComplete="new-password"
          disabled={mutation.isPending}
          error={fieldErrors.password}
          hint="12文字以上で、英字と数字をそれぞれ1文字以上含めてください。"
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="mt-2 min-h-12 w-full rounded-2xl bg-slate-950 px-5 py-3 text-base font-bold text-white shadow-lg shadow-slate-950/10 outline-none transition hover:bg-blue-900 focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-wait disabled:bg-slate-400"
        >
          {mutation.isPending ? "登録中…" : "アカウントを作成"}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-slate-600">
        アカウントをお持ちの方は{" "}
        <Link
          to="/login"
          className="rounded font-bold text-blue-800 underline decoration-blue-200 underline-offset-4 outline-none hover:decoration-blue-700 focus-visible:ring-2 focus-visible:ring-blue-700"
        >
          ログイン
        </Link>
      </p>
    </div>
  );
}
