import {
  API_BASE_PATH,
  authResponseSchema,
  loginRequestSchema,
  problemDetailsSchema,
  refreshRequestSchema,
  registerRequestSchema,
  type AuthResponse,
  type LoginRequest,
  type ProblemDetails,
  type RegisterRequest,
} from "@pokemon-champions/shared";
import type { ZodType, ZodTypeDef } from "zod";
import { useAuthStore } from "../stores/auth-store";

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
const ACCESS_TOKEN_EXPIRY_MARGIN_MS = 5_000;

export type FetchImplementation = typeof fetch;

export interface ApiAuthSessionAdapter {
  getSession: () => ReturnType<typeof useAuthStore.getState>["session"];
  setAuthenticated: (response: AuthResponse) => void;
  clearAuthentication: () => void;
}

export class ApiError extends Error {
  readonly status: number | null;
  readonly problem: ProblemDetails | null;

  constructor(message: string, options: { status?: number; problem?: ProblemDetails } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? null;
    this.problem = options.problem ?? null;
  }
}

interface ApiRequestOptions<T> {
  method?: "DELETE" | "GET" | "POST";
  body?: unknown;
  responseSchema: ZodType<T, ZodTypeDef, unknown>;
  authenticated?: boolean;
}

async function parseProblem(response: Response): Promise<ProblemDetails | null> {
  try {
    const result = problemDetailsSchema.safeParse(await response.json());
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export class ApiClient {
  private refreshPromise: Promise<AuthResponse> | null = null;

  constructor(
    private readonly fetchImplementation: FetchImplementation,
    private readonly authSession: ApiAuthSessionAdapter,
    private readonly apiBaseUrl = baseUrl,
  ) {}

  register(input: RegisterRequest): Promise<AuthResponse> {
    return this.authenticate("/auth/register", registerRequestSchema.parse(input));
  }

  login(input: LoginRequest): Promise<AuthResponse> {
    return this.authenticate("/auth/login", loginRequestSchema.parse(input));
  }

  async restoreAuthentication(): Promise<boolean> {
    const session = this.authSession.getSession();
    if (!session) {
      this.authSession.clearAuthentication();
      return false;
    }

    try {
      await this.refreshAccessToken();
      return true;
    } catch {
      return false;
    }
  }

  async request<T>(path: string, options: ApiRequestOptions<T>): Promise<T> {
    let accessToken: string | null = null;

    if (options.authenticated) {
      accessToken = await this.getUsableAccessToken();
    }

    let response = await this.fetch(path, options, accessToken);
    if (options.authenticated && response.status === 401) {
      await this.refreshAccessToken();
      accessToken = this.authSession.getSession()?.accessToken ?? null;
      response = await this.fetch(path, options, accessToken);
    }

    if (!response.ok) {
      throw await this.createResponseError(response);
    }

    try {
      return options.responseSchema.parse(await response.json());
    } catch {
      throw new ApiError("APIレスポンスの形式が正しくありません。");
    }
  }

  private async authenticate(path: string, body: unknown): Promise<AuthResponse> {
    const response = await this.request(path, {
      method: "POST",
      body,
      responseSchema: authResponseSchema,
    });
    this.authSession.setAuthenticated(response);
    return response;
  }

  private async getUsableAccessToken(): Promise<string> {
    const session = this.authSession.getSession();
    if (
      session?.accessToken &&
      session.accessExpiresAt &&
      session.accessExpiresAt > Date.now() + ACCESS_TOKEN_EXPIRY_MARGIN_MS
    ) {
      return session.accessToken;
    }

    const refreshed = await this.refreshAccessToken();
    return refreshed.accessToken;
  }

  private refreshAccessToken(): Promise<AuthResponse> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const session = this.authSession.getSession();
    if (!session || session.refreshExpiresAt <= Date.now()) {
      this.authSession.clearAuthentication();
      return Promise.reject(new ApiError("認証の有効期限が切れました。", { status: 401 }));
    }

    this.refreshPromise = this.request("/auth/refresh", {
      method: "POST",
      body: refreshRequestSchema.parse({ refreshToken: session.refreshToken }),
      responseSchema: authResponseSchema,
    })
      .then((response) => {
        this.authSession.setAuthenticated(response);
        return response;
      })
      .catch((error: unknown) => {
        this.authSession.clearAuthentication();
        throw error;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  private async fetch<T>(
    path: string,
    options: ApiRequestOptions<T>,
    accessToken: string | null,
  ): Promise<Response> {
    const headers = new Headers({ Accept: "application/json" });
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    try {
      return await this.fetchImplementation(`${this.apiBaseUrl}${API_BASE_PATH}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new ApiError("サーバーへ接続できませんでした。通信環境を確認してください。");
    }
  }

  private async createResponseError(response: Response): Promise<ApiError> {
    const problem = await parseProblem(response);
    return new ApiError(problem?.title ?? "APIリクエストに失敗しました。", {
      status: response.status,
      ...(problem ? { problem } : {}),
    });
  }
}

const authSessionAdapter: ApiAuthSessionAdapter = {
  getSession: () => useAuthStore.getState().session,
  setAuthenticated: (response) => useAuthStore.getState().setAuthenticated(response),
  clearAuthentication: () => useAuthStore.getState().clearAuthentication(),
};

export const apiClient = new ApiClient((input, init) => fetch(input, init), authSessionAdapter);

export function apiGet<T>(path: string, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  return apiClient.request(path, { responseSchema: schema });
}
