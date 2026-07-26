import { expect, test, type Page } from "@playwright/test";

const partyId = "00000000-0000-4000-8000-000000000001";
const sessionId = "10000000-0000-4000-8000-000000000001";

const user = {
  id: "fecccd4a-a137-4b3b-bb09-239306040706",
  email: "battle-trainer@example.com",
  displayName: "Battle Trainer",
  role: "user",
  createdAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-25T00:00:00.000Z",
};
const authResponse = {
  accessToken: "header.battle.signature",
  tokenType: "Bearer",
  expiresIn: 900,
  refreshToken: "b".repeat(43),
  refreshExpiresIn: 2_592_000,
  user,
};
const party = {
  id: partyId,
  name: "対戦用パーティ",
  description: null,
  ruleId: 1,
  isActive: true,
  createdAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
};
const charizard = {
  id: 6,
  dexNo: 6,
  nameJa: "リザードン",
  nameEn: "Charizard",
  form: "normal",
  type1: "fire",
  type2: "flying",
  isMega: false,
  basePokemonId: null,
};
const megaCharizard = {
  ...charizard,
  id: 10006,
  nameJa: "メガリザードンX",
  nameEn: "Mega Charizard X",
  form: "mega-x",
  type2: "dragon",
  isMega: true,
  basePokemonId: 6,
};
const flamethrower = {
  id: 53,
  nameJa: "かえんほうしゃ",
  nameEn: "Flamethrower",
  type: "fire",
  category: "special",
  power: 90,
  accuracy: 100,
  priority: 0,
  tags: [],
};

interface BattleMockState {
  createBodies: unknown[];
  observationBodies: unknown[];
  rejectNextObservation: boolean;
}

async function mockBattleApis(page: Page): Promise<BattleMockState> {
  const state: BattleMockState = {
    createBodies: [],
    observationBodies: [],
    rejectNextObservation: false,
  };

  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({ status: 200, json: authResponse });
  });
  await page.route("**/api/v1/auth/refresh", async (route) => {
    await route.fulfill({ status: 200, json: authResponse });
  });
  await page.route("**/api/v1/parties", async (route) => {
    await route.fulfill({ status: 200, json: { items: [party] } });
  });
  await page.route("**/api/v1/master/rules", async (route) => {
    await route.fulfill({
      status: 200,
      json: { items: [{ id: 1, name: "シングルバトル", teamSize: 6, pickSize: 3 }] },
    });
  });
  await page.route("**/api/v1/master/pokemons?*", async (route) => {
    await route.fulfill({ status: 200, json: { items: [charizard, megaCharizard] } });
  });
  await page.route("**/api/v1/master/moves?*", async (route) => {
    await route.fulfill({ status: 200, json: { items: [flamethrower] } });
  });
  await page.route(`**/api/v1/sessions/${sessionId}/observations`, async (route) => {
    const body = route.request().postDataJSON();
    state.observationBodies.push(body);
    if (state.rejectNextObservation) {
      state.rejectNextObservation = false;
      await route.fulfill({
        status: 429,
        json: {
          type: "about:blank",
          title: "Rate limited",
          status: 429,
          detail: "internal detail",
          code: "RATE_LIMITED",
        },
      });
      return;
    }
    const input = body as { kind: "pokemon" | "move"; pokemonId: number; moveId?: number };
    await route.fulfill({
      status: 201,
      json: {
        id: `20000000-0000-4000-8000-${String(state.observationBodies.length).padStart(12, "0")}`,
        sessionId,
        seq: state.observationBodies.length,
        kind: input.kind,
        pokemonId: input.pokemonId,
        moveId: input.kind === "move" ? input.moveId : null,
        itemId: null,
        abilityId: null,
        position: null,
        isRevoked: false,
        createdAt: "2026-07-26T00:00:00.000Z",
      },
    });
  });
  await page.route(`**/api/v1/sessions/${sessionId}`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        id: sessionId,
        partyId,
        ruleId: 1,
        status: "active",
        startedAt: "2026-07-26T00:00:00.000Z",
        endedAt: null,
        createdAt: "2026-07-26T00:00:00.000Z",
        updatedAt: "2026-07-26T00:00:00.000Z",
      },
    });
  });
  await page.route("**/api/v1/sessions", async (route) => {
    state.createBodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      json: {
        id: sessionId,
        partyId,
        ruleId: 1,
        status: "active",
        startedAt: "2026-07-26T00:00:00.000Z",
        endedAt: null,
        createdAt: "2026-07-26T00:00:00.000Z",
        updatedAt: "2026-07-26T00:00:00.000Z",
      },
    });
  });

  return state;
}

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(user.email);
  await page.locator("#login-password").fill("correct-horse-42");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL("/");
}

test("375pxでSession作成・Pokemonと技観測・重複防止・reload復元が動く", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const state = await mockBattleApis(page);
  await login(page);

  await page.getByRole("link", { name: "このパーティで対戦" }).click();
  await expect(page).toHaveURL(new RegExp("/battle/new"));
  await expect(page.getByText("シングルバトル", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "このパーティで対戦開始" }).click();
  await expect(page).toHaveURL(`/battle/${sessionId}`);
  expect(state.createBodies).toEqual([{ partyId, ruleId: 1 }]);

  await page.getByLabel("相手ポケモン").fill("リザ");
  await page.getByRole("button", { name: "リザードン（normal）を追加" }).click();
  await expect(page.getByText(/観測 seq 1/u)).toBeVisible();
  expect(state.observationBodies).toEqual([{ kind: "pokemon", pokemonId: 6 }]);

  await page.getByLabel("相手ポケモン").fill("リザ");
  await expect(page.getByRole("button", { name: "リザードン（normal）を追加" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "メガリザードンX（mega-x）を追加" })).toBeVisible();

  await page.getByLabel("技名").fill("かえ");
  await page.getByRole("button", { name: "かえんほうしゃをリザードンの技として追加" }).click();
  await expect(page.getByRole("heading", { name: "リザードンの観測済み技" })).toBeVisible();
  await expect(page.getByText("seq 2")).toBeVisible();
  expect(state.observationBodies).toEqual([
    { kind: "pokemon", pokemonId: 6 },
    { kind: "move", pokemonId: 6, moveId: 53 },
  ]);

  await page.getByLabel("技名").fill("かえ");
  await expect(
    page.getByRole("button", { name: "かえんほうしゃをリザードンの技として追加" }),
  ).toHaveCount(0);

  await page.reload();
  await expect(page.getByText(/観測 seq 1/u)).toBeVisible();
  await expect(page.getByText("seq 2")).toBeVisible();
  await expect(page.getByText("かえんほうしゃ")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("1440pxで技をキーボード入力でき、429を安全に表示してログアウトできる", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await mockBattleApis(page);
  await login(page);
  await page.goto(`/battle/${sessionId}`);

  const pokemonSearch = page.getByLabel("相手ポケモン");
  await pokemonSearch.fill("リザ");
  await page.getByRole("button", { name: "リザードン（normal）を追加" }).click();

  const moveSearch = page.getByLabel("技名");
  await expect(moveSearch).toBeEnabled();
  await moveSearch.focus();
  await expect(moveSearch).toBeFocused();
  await moveSearch.fill("かえ");
  const candidate = page.getByRole("button", {
    name: "かえんほうしゃをリザードンの技として追加",
  });
  await candidate.focus();
  state.rejectNextObservation = true;
  await page.keyboard.press("Enter");

  await expect(page.getByRole("alert")).toContainText("少し待って");
  await expect(page.getByText("まだ技観測はありません")).toBeVisible();
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL("/login");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
