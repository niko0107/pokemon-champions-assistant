import type { AuthResponse, User } from "@pokemon-champions/shared";
import { create } from "zustand";
import {
  browserAuthStorage,
  createAuthSession,
  toPersistedAuthSession,
  type AuthSession,
} from "../features/auth/auth-session";

export type AuthStatus = "restoring" | "authenticated" | "anonymous";

interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  user: User | null;
  setAuthenticated: (response: AuthResponse) => void;
  clearAuthentication: () => void;
}

const persistedSession = browserAuthStorage.read();

export const useAuthStore = create<AuthState>((set) => ({
  status: persistedSession ? "restoring" : "anonymous",
  session: persistedSession
    ? {
        ...persistedSession,
        accessToken: null,
        accessExpiresAt: null,
      }
    : null,
  user: persistedSession?.user ?? null,

  setAuthenticated(response) {
    const session = createAuthSession(response);
    browserAuthStorage.write(toPersistedAuthSession(session));
    set({
      status: "authenticated",
      session,
      user: session.user,
    });
  },

  clearAuthentication() {
    browserAuthStorage.clear();
    set({
      status: "anonymous",
      session: null,
      user: null,
    });
  },
}));

export function resetAuthStoreForTests(): void {
  browserAuthStorage.clear();
  useAuthStore.setState({
    status: "anonymous",
    session: null,
    user: null,
  });
}
