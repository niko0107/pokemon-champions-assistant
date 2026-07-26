import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { browserAuthStorage, createAuthSession, toPersistedAuthSession } from "./auth-session";
import { resetAuthStoreForTests, useAuthStore } from "../../stores/auth-store";

const authResponse = {
  accessToken: "header.payload.signature",
  tokenType: "Bearer" as const,
  expiresIn: 900,
  refreshToken: "r".repeat(43),
  refreshExpiresIn: 2_592_000,
  user: {
    id: "fecccd4a-a137-4b3b-bb09-239306040706",
    email: "trainer@example.com",
    displayName: "Trainer",
    role: "user" as const,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  },
};
const validPassword = "correct-horse-42";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function defaultFetch(input: RequestInfo | URL): Promise<Response> {
  if (String(input).endsWith("/health")) {
    return Promise.resolve(jsonResponse({ status: "ok" }));
  }
  return Promise.reject(new Error(`Unexpected request: ${String(input)}`));
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<App />, { wrapper });
}

async function fillLoginForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("メールアドレス"), authResponse.user.email);
  await user.type(screen.getByLabelText("パスワード"), validPassword);
}

async function fillRegisterForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("表示名"), authResponse.user.displayName);
  await user.type(screen.getByLabelText("メールアドレス"), authResponse.user.email);
  await user.type(screen.getByLabelText("パスワード"), validPassword);
}

function restoreFromPersistedSession(): void {
  const persisted = browserAuthStorage.read();
  if (!persisted) {
    throw new Error("Persisted auth session not found");
  }
  useAuthStore.setState({
    status: "restoring",
    session: { ...persisted, accessToken: null, accessExpiresAt: null },
    user: persisted.user,
  });
}

describe("WEB-005 auth pages", () => {
  beforeEach(() => {
    resetAuthStoreForTests();
    window.history.replaceState({}, "", "/login");
    vi.stubGlobal("fetch", vi.fn(defaultFetch));
  });

  it("ログイン画面と入力ラベルを表示する", async () => {
    renderApp();

    expect(screen.getByRole("heading", { name: "ログイン" })).toBeVisible();
    expect(screen.getByLabelText("メールアドレス")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("パスワード")).toHaveAttribute("type", "password");
    await waitFor(() =>
      expect(screen.getByTestId("health-status")).toHaveAttribute("data-status", "ok"),
    );
  });

  it("登録画面を表示し、パスワード表示を切り替える", async () => {
    window.history.replaceState({}, "", "/register");
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByRole("heading", { name: "新規登録" })).toBeVisible();
    expect(screen.getByLabelText("表示名")).toBeVisible();
    const password = screen.getByLabelText("パスワード");
    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "パスワードを表示" }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "パスワードを隠す" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("不正入力をフィールドへ表示し、APIを呼ばない", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    renderApp();

    await user.type(screen.getByLabelText("メールアドレス"), "invalid");
    await user.type(screen.getByLabelText("パスワード"), "short");
    await user.click(screen.getByRole("button", { name: "ログイン" }));

    expect(screen.getByText("メールアドレスの形式が正しくありません")).toBeVisible();
    expect(screen.getByText("パスワードは12文字以上必要です")).toBeVisible();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/auth/"))).toHaveLength(
      0,
    );
  });

  it("正常登録後に認証状態を反映して保護画面へ遷移する", async () => {
    window.history.replaceState({}, "", "/register");
    const fetchMock = vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).endsWith("/auth/register")) {
        return Promise.resolve(jsonResponse(authResponse, 201));
      }
      return defaultFetch(input);
    });
    const user = userEvent.setup();
    renderApp();
    await fillRegisterForm(user);

    await user.click(screen.getByRole("button", { name: "アカウントを作成" }));

    expect(await screen.findByText("ログイン済み")).toBeVisible();
    expect(
      screen.getByText(
        (_content, element) => element?.textContent?.startsWith(authResponse.user.email) ?? false,
      ),
    ).toBeVisible();
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/auth/register")),
    ).toHaveLength(1);
  });

  it("重複emailをユーザー向け文言で表示する", async () => {
    window.history.replaceState({}, "", "/register");
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).endsWith("/auth/register")) {
        return Promise.resolve(
          jsonResponse(
            {
              type: "about:blank",
              title: "Email Already Registered",
              status: 409,
              code: "EMAIL_ALREADY_REGISTERED",
            },
            409,
          ),
        );
      }
      return defaultFetch(input);
    });
    const user = userEvent.setup();
    renderApp();
    await fillRegisterForm(user);
    await user.click(screen.getByRole("button", { name: "アカウントを作成" }));

    expect(await screen.findByText("このメールアドレスはすでに登録されています。")).toBeVisible();
  });

  it("正常ログイン後に保護画面へ遷移する", async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).endsWith("/auth/login")) {
        return Promise.resolve(jsonResponse(authResponse));
      }
      return defaultFetch(input);
    });
    const user = userEvent.setup();
    renderApp();
    await fillLoginForm(user);
    await user.click(screen.getByRole("button", { name: "ログイン" }));

    expect(await screen.findByText("ログイン済み")).toBeVisible();
    expect(window.location.pathname).toBe("/");
  });

  it("誤認証情報はユーザー不存在とパスワード不一致を区別せず表示する", async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).endsWith("/auth/login")) {
        return Promise.resolve(
          jsonResponse(
            {
              type: "about:blank",
              title: "Invalid Credentials",
              status: 401,
              code: "INVALID_CREDENTIALS",
            },
            401,
          ),
        );
      }
      return defaultFetch(input);
    });
    const user = userEvent.setup();
    renderApp();
    await fillLoginForm(user);
    await user.click(screen.getByRole("button", { name: "ログイン" }));

    expect(
      await screen.findByText("メールアドレスまたはパスワードが正しくありません。"),
    ).toBeVisible();
  });

  it("通信エラーを安全な文言で表示する", async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).endsWith("/auth/login")) {
        return Promise.reject(new Error("private network detail"));
      }
      return defaultFetch(input);
    });
    const user = userEvent.setup();
    renderApp();
    await fillLoginForm(user);
    await user.click(screen.getByRole("button", { name: "ログイン" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("サーバーへ接続できませんでした。通信環境を確認してください。");
    expect(alert).not.toHaveTextContent("private network detail");
  });

  it("送信中はボタンを無効化し、二重送信しない", async () => {
    let resolveLogin: ((value: Response) => void) | undefined;
    const pendingLogin = new Promise<Response>((resolve) => {
      resolveLogin = resolve;
    });
    const fetchMock = vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).endsWith("/auth/login")) {
        return pendingLogin;
      }
      return defaultFetch(input);
    });
    const user = userEvent.setup();
    renderApp();
    await fillLoginForm(user);
    const submit = screen.getByRole("button", { name: "ログイン" });

    await user.click(submit);
    expect(screen.getByRole("button", { name: "ログイン中…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "ログイン中…" }));
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/auth/login")),
    ).toHaveLength(1);

    resolveLogin?.(jsonResponse(authResponse));
    expect(await screen.findByText("ログイン済み")).toBeVisible();
  });

  it("ログアウトで保存情報を破棄してログイン画面へ戻る", async () => {
    useAuthStore.getState().setAuthenticated(authResponse);
    window.history.replaceState({}, "", "/");
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "ログアウト" }));

    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeVisible();
    expect(browserAuthStorage.read()).toBeNull();
  });

  it("再読み込み相当の復元時にrefreshし、認証状態を維持する", async () => {
    const persisted = toPersistedAuthSession(createAuthSession(authResponse));
    browserAuthStorage.write(persisted);
    restoreFromPersistedSession();
    window.history.replaceState({}, "", "/");
    const refreshed = {
      ...authResponse,
      accessToken: "new.header.signature",
      refreshToken: "n".repeat(43),
    };
    const fetchMock = vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).endsWith("/auth/refresh")) {
        return Promise.resolve(jsonResponse(refreshed));
      }
      return defaultFetch(input);
    });
    renderApp();

    expect(screen.getByRole("status")).toHaveTextContent("ログイン状態を確認しています");
    expect(await screen.findByText("ログイン済み")).toBeVisible();
    expect(useAuthStore.getState().session?.accessToken).toBe(refreshed.accessToken);
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/auth/refresh")),
    ).toHaveLength(1);
  });

  it("refresh失敗時は認証を破棄してログイン画面へ遷移する", async () => {
    browserAuthStorage.write(toPersistedAuthSession(createAuthSession(authResponse)));
    restoreFromPersistedSession();
    window.history.replaceState({}, "", "/");
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).endsWith("/auth/refresh")) {
        return Promise.resolve(
          jsonResponse(
            {
              type: "about:blank",
              title: "Invalid Refresh Token",
              status: 401,
              code: "INVALID_REFRESH_TOKEN",
            },
            401,
          ),
        );
      }
      return defaultFetch(input);
    });
    renderApp();

    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeVisible();
    expect(useAuthStore.getState().status).toBe("anonymous");
  });

  it.each(["/login", "/register"])(
    "ログイン済みで%sへアクセスすると保護画面へ戻す",
    async (path) => {
      useAuthStore.getState().setAuthenticated(authResponse);
      window.history.replaceState({}, "", path);
      renderApp();

      expect(await screen.findByText("ログイン済み")).toBeVisible();
      expect(window.location.pathname).toBe("/");
    },
  );
});
