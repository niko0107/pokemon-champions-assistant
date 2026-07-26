import { expect, test, type Page } from "@playwright/test";

const user = {
  id: "fecccd4a-a137-4b3b-bb09-239306040706",
  email: "trainer@example.com",
  displayName: "Trainer",
  role: "user",
  createdAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-25T00:00:00.000Z",
};

function authResponse(suffix: string) {
  return {
    accessToken: `header.${suffix}.signature`,
    tokenType: "Bearer",
    expiresIn: 900,
    refreshToken: suffix.padEnd(43, "r").slice(0, 43),
    refreshExpiresIn: 2_592_000,
    user,
  };
}

async function mockAuth(page: Page): Promise<{ refreshCalls: () => number }> {
  let refreshCallCount = 0;
  await page.route("**/api/v1/parties", async (route) => {
    await route.fulfill({ status: 200, json: { items: [] } });
  });
  await page.route("**/api/v1/master/rules", async (route) => {
    await route.fulfill({ status: 200, json: { items: [] } });
  });
  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({ status: 200, json: authResponse("login") });
  });
  await page.route("**/api/v1/auth/register", async (route) => {
    const body = route.request().postDataJSON() as { email?: string };
    if (body.email === "existing@example.com") {
      await route.fulfill({
        status: 409,
        json: {
          type: "about:blank",
          title: "Email Already Registered",
          status: 409,
          code: "EMAIL_ALREADY_REGISTERED",
        },
      });
      return;
    }
    await route.fulfill({ status: 201, json: authResponse("register") });
  });
  await page.route("**/api/v1/auth/refresh", async (route) => {
    refreshCallCount += 1;
    await route.fulfill({ status: 200, json: authResponse(`refresh${refreshCallCount}`) });
  });

  return { refreshCalls: () => refreshCallCount };
}

test("ログイン、再読み込みrefresh、ログアウトが一連で動作する", async ({ page }) => {
  const auth = await mockAuth(page);
  await page.goto("/login");

  await page.getByLabel("メールアドレス").fill(user.email);
  await page.locator("#login-password").fill("correct-horse-42");
  await page.getByRole("button", { name: "パスワードを表示" }).click();
  await expect(page.locator("#login-password")).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("ログイン済み")).toBeVisible();

  await page.reload();
  await expect(page.getByText("ログイン済み")).toBeVisible();
  expect(auth.refreshCalls()).toBe(1);

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
});

test("登録、重複email、ログイン済み認証ルート制御が動作する", async ({ page }) => {
  await mockAuth(page);
  await page.goto("/register");

  await page.getByLabel("表示名").fill(user.displayName);
  await page.getByLabel("メールアドレス").fill(user.email);
  await page.locator("#register-password").fill("correct-horse-42");
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByText("ログイン済み")).toBeVisible();

  await page.goto("/login");
  await expect(page).toHaveURL("/");

  await page.getByRole("button", { name: "ログアウト" }).click();
  await page.goto("/register");
  await page.getByLabel("表示名").fill(user.displayName);
  await page.getByLabel("メールアドレス").fill("existing@example.com");
  await page.locator("#register-password").fill("correct-horse-42");
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByText("このメールアドレスはすでに登録されています。")).toBeVisible();
});

test("375px幅で横スクロールせず、キーボードで操作できる", async ({ page }) => {
  await mockAuth(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");

  const viewportFits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(viewportFits).toBe(true);

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("メールアドレス")).toBeFocused();
  await page.getByLabel("メールアドレス").fill(user.email);
  await page.keyboard.press("Tab");
  await expect(page.locator("#login-password")).toBeFocused();
});
