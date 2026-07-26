import {
  authResponseSchema,
  refreshTokenSchema,
  userSchema,
  type AuthResponse,
} from "@pokemon-champions/shared";
import { z } from "zod";

export const AUTH_SESSION_STORAGE_KEY = "pokemon-champions.auth.v1";

const persistedAuthSessionSchema = z
  .object({
    version: z.literal(1),
    refreshToken: refreshTokenSchema,
    refreshExpiresAt: z.number().int().positive().safe(),
    user: userSchema,
  })
  .strict();

export type PersistedAuthSession = z.infer<typeof persistedAuthSessionSchema>;

export interface AuthSession extends PersistedAuthSession {
  accessToken: string | null;
  accessExpiresAt: number | null;
}

export interface AuthStorage {
  read: () => PersistedAuthSession | null;
  write: (session: PersistedAuthSession) => void;
  clear: () => void;
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export const browserAuthStorage: AuthStorage = {
  read() {
    const storage = getSessionStorage();
    if (!storage) {
      return null;
    }

    try {
      const raw = storage.getItem(AUTH_SESSION_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = persistedAuthSessionSchema.safeParse(JSON.parse(raw));
      if (!parsed.success || parsed.data.refreshExpiresAt <= Date.now()) {
        storage.removeItem(AUTH_SESSION_STORAGE_KEY);
        return null;
      }

      return parsed.data;
    } catch {
      try {
        storage.removeItem(AUTH_SESSION_STORAGE_KEY);
      } catch {
        // Storage自体が利用不可でも、メモリ内認証は継続できる。
      }
      return null;
    }
  },

  write(session) {
    const serialized = JSON.stringify(persistedAuthSessionSchema.parse(session));
    try {
      getSessionStorage()?.setItem(AUTH_SESSION_STORAGE_KEY, serialized);
    } catch {
      // 容量制限・ブラウザ設定で保存できない場合は、現在タブのメモリ内だけで継続する。
    }
  },

  clear() {
    try {
      getSessionStorage()?.removeItem(AUTH_SESSION_STORAGE_KEY);
    } catch {
      // 破棄不能なStorageには以後依存せず、メモリ内状態をanonymousへ戻す。
    }
  },
};

export function createAuthSession(response: AuthResponse, now = Date.now()): AuthSession {
  const auth = authResponseSchema.parse(response);

  return {
    version: 1,
    accessToken: auth.accessToken,
    accessExpiresAt: now + auth.expiresIn * 1_000,
    refreshToken: auth.refreshToken,
    refreshExpiresAt: now + auth.refreshExpiresIn * 1_000,
    user: auth.user,
  };
}

export function toPersistedAuthSession(session: AuthSession): PersistedAuthSession {
  return {
    version: session.version,
    refreshToken: session.refreshToken,
    refreshExpiresAt: session.refreshExpiresAt,
    user: session.user,
  };
}
