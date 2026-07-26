import { expect, test, type Page } from "@playwright/test";

const user = {
  id: "fecccd4a-a137-4b3b-bb09-239306040706",
  email: "party-trainer@example.com",
  displayName: "Party Trainer",
  role: "user",
  createdAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-25T00:00:00.000Z",
};

const authResponse = {
  accessToken: "header.party.signature",
  tokenType: "Bearer",
  expiresIn: 900,
  refreshToken: "p".repeat(43),
  refreshExpiresIn: 2_592_000,
  user,
};

const rule = {
  id: 1,
  name: "シングルバトル",
  teamSize: 1,
  pickSize: 1,
  battleLevel: 50,
};
const pokemon = {
  id: 1,
  dexNo: 130,
  nameJa: "ギャラドス",
  nameEn: "Gyarados",
  form: "normal",
  type1: "water",
  type2: "flying",
  isMega: false,
  basePokemonId: null,
};
const moves = ["たきのぼり", "じしん", "こおりのキバ", "りゅうのまい"].map((nameJa, index) => ({
  id: index + 1,
  nameJa,
  nameEn: `Move ${index + 1}`,
  type: index === 0 ? "water" : "normal",
  category: index === 3 ? "status" : "physical",
  power: index === 3 ? null : 80,
  accuracy: 100,
  priority: 0,
  tags: index === 3 ? ["setup"] : [],
}));

interface MockState {
  createdBody: Record<string, unknown> | null;
}

async function mockPartyApis(page: Page): Promise<MockState> {
  const state: MockState = { createdBody: null };

  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({ status: 200, json: authResponse });
  });
  await page.route("**/api/v1/auth/refresh", async (route) => {
    await route.fulfill({ status: 200, json: authResponse });
  });
  await page.route("**/api/v1/parties", async (route) => {
    if (route.request().method() === "POST") {
      state.createdBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        json: {
          id: "00000000-0000-4000-8000-000000000001",
          name: state.createdBody.name,
          description: state.createdBody.description,
          ruleId: 1,
          isActive: true,
          pokemons: state.createdBody.pokemons,
          createdAt: "2026-07-26T00:00:00.000Z",
          updatedAt: "2026-07-26T00:00:00.000Z",
        },
      });
      return;
    }

    await route.fulfill({
      status: 200,
      json: {
        items: state.createdBody
          ? [
              {
                id: "00000000-0000-4000-8000-000000000001",
                name: state.createdBody.name,
                description: state.createdBody.description,
                ruleId: 1,
                isActive: true,
                createdAt: "2026-07-26T00:00:00.000Z",
                updatedAt: "2026-07-26T00:00:00.000Z",
              },
            ]
          : [],
      },
    });
  });
  await page.route("**/api/v1/master/rules", async (route) => {
    await route.fulfill({ status: 200, json: { items: [rule] } });
  });
  await page.route("**/api/v1/master/pokemons?*", async (route) => {
    await route.fulfill({ status: 200, json: { items: [pokemon] } });
  });
  await page.route("**/api/v1/master/pokemons/1", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        ...pokemon,
        baseHp: 95,
        baseAtk: 125,
        baseDef: 79,
        baseSpa: 60,
        baseSpd: 100,
        baseSpe: 81,
      },
    });
  });
  await page.route("**/api/v1/master/items?*", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        items: [
          {
            id: 1,
            nameJa: "オボンのみ",
            nameEn: "Sitrus Berry",
            effectTags: ["berry"],
          },
        ],
      },
    });
  });
  await page.route("**/api/v1/master/abilities?*", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        items: [{ id: 1, nameJa: "いかく", nameEn: "Intimidate", effectTags: [] }],
      },
    });
  });
  await page.route("**/api/v1/master/moves?*", async (route) => {
    expect(route.request().url()).toContain("pokemon_id=1");
    await route.fulfill({ status: 200, json: { items: moves } });
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

test("375pxでPartyを登録し、再読み込み後も一覧へ反映する", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const state = await mockPartyApis(page);
  await login(page);

  await expect(page.getByText("まだパーティがありません")).toBeVisible();
  await page.getByRole("link", { name: "新しいパーティを登録" }).click();
  await expect(page).toHaveURL("/parties/new");

  await page.getByLabel("パーティ名").fill("E2Eパーティ");
  await page.getByLabel("Rule").selectOption("1");
  await expect(page.getByLabel("対戦レベル")).toContainText("Lv. 50");
  await expect(page.getByRole("spinbutton", { name: "実数値の計算レベル" })).toHaveCount(0);
  await page.getByLabel("ポケモン", { exact: true }).fill("ギャ");
  await page.getByRole("button", { name: "ギャラドス（normal）" }).click();
  await page.getByLabel("性格").selectOption("まじめ");

  await expect(page.getByLabel("ポケモン1 HP 実数値")).toHaveValue("170");
  await page.getByLabel("ポケモン1 HP EV").fill("252");
  await expect(page.getByLabel("ポケモン1 HP 実数値")).toHaveValue("202");

  await page.getByLabel("持ち物（任意）").fill("オボ");
  await page.getByRole("button", { name: "オボンのみ" }).click();
  await page.getByLabel("特性（任意）").selectOption("1");

  for (const [index, move] of moves.entries()) {
    await page.getByLabel(`技 ${index + 1}`, { exact: true }).fill("わざ");
    await page.getByRole("button", { name: new RegExp(move.nameJa) }).click();
  }

  await page.getByRole("button", { name: "パーティを保存" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("E2Eパーティ")).toBeVisible();
  expect(state.createdBody).toMatchObject({
    name: "E2Eパーティ",
    ruleId: 1,
    pokemons: [
      {
        pokemonId: 1,
        itemId: 1,
        abilityId: 1,
        actualStats: {
          hp: 202,
          attack: 145,
          defense: 99,
          specialAttack: 80,
          specialDefense: 120,
          speed: 101,
        },
      },
    ],
  });

  await page.reload();
  await expect(page.getByText("E2Eパーティ")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("1440pxでホームと登録画面をキーボード操作できる", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockPartyApis(page);
  await login(page);

  await page.getByRole("link", { name: "新しいパーティを登録" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/parties/new");
  await page.getByLabel("パーティ名").focus();
  await expect(page.getByLabel("パーティ名")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Rule")).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
