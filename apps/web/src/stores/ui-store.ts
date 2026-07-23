import { create } from "zustand";

/**
 * クライアント状態(Zustand)の初期ストア。
 * 対戦画面のタブ状態など、サーバー状態(TanStack Query)と分離して管理する。
 */
export type BattleTab = "input" | "candidates" | "counterplan";

interface UiState {
  activeTab: BattleTab;
  setActiveTab: (tab: BattleTab) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: "input",
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
