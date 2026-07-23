import { describe, expect, it } from "vitest";
import { useUiStore } from "./ui-store";

describe("useUiStore", () => {
  it("初期タブは input", () => {
    expect(useUiStore.getState().activeTab).toBe("input");
  });

  it("setActiveTab でタブを切り替えられる", () => {
    useUiStore.getState().setActiveTab("candidates");
    expect(useUiStore.getState().activeTab).toBe("candidates");
    useUiStore.getState().setActiveTab("input");
  });
});
