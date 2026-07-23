import { expect, test } from "@playwright/test";

test("トップ画面が表示され、API ヘルスチェックに接続できる", async ({ page, request }) => {
  // API が直接ヘルスチェックに応答すること
  const health = await request.get("http://localhost:3000/api/v1/health");
  expect(health.ok()).toBe(true);
  expect(await health.json()).toEqual({ status: "ok" });

  // Web アプリが表示されること
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pokémon Champions 対戦支援" })).toBeVisible();

  // Web → API の疎通(TanStack Query 経由)が成功すること
  await expect(page.getByTestId("health-status")).toHaveAttribute("data-status", "ok", {
    timeout: 15_000,
  });
});
