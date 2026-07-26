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
  undoObservationIds: string[];
  candidateRequests: number;
  rejectNextObservation: boolean;
  rejectNextUndo: boolean;
}

async function mockBattleApis(page: Page): Promise<BattleMockState> {
  const state: BattleMockState = {
    createBodies: [],
    observationBodies: [],
    undoObservationIds: [],
    candidateRequests: 0,
    rejectNextObservation: false,
    rejectNextUndo: false,
  };
  const observations = new Map<
    string,
    {
      id: string;
      sessionId: string;
      seq: number;
      kind: "pokemon" | "move";
      pokemonId: number;
      moveId: number | null;
      itemId: null;
      abilityId: null;
      position: null;
      isRevoked: boolean;
      createdAt: string;
    }
  >();

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
  await page.route("**/api/v1/master/pokemons/25", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        id: 25,
        dexNo: 25,
        nameJa: "ピカチュウ",
        nameEn: "Pikachu",
        form: "normal",
        type1: "electric",
        type2: null,
        isMega: false,
        basePokemonId: null,
        baseHp: 35,
        baseAtk: 55,
        baseDef: 40,
        baseSpa: 50,
        baseSpd: 50,
        baseSpe: 90,
      },
    });
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
    const response = {
      id: `20000000-0000-4000-8000-${String(state.observationBodies.length).padStart(12, "0")}`,
      sessionId,
      seq: state.observationBodies.length,
      kind: input.kind,
      pokemonId: input.pokemonId,
      moveId: input.kind === "move" ? (input.moveId ?? null) : null,
      itemId: null,
      abilityId: null,
      position: null,
      isRevoked: false,
      createdAt: "2026-07-26T00:00:00.000Z",
    };
    observations.set(response.id, response);
    await route.fulfill({
      status: 201,
      json: response,
    });
  });
  await page.route(`**/api/v1/sessions/${sessionId}/observations/*`, async (route) => {
    const observationId = route.request().url().split("/").at(-1) ?? "";
    state.undoObservationIds.push(observationId);
    const latestActive = [...observations.values()]
      .filter((observation) => !observation.isRevoked)
      .sort((left, right) => right.seq - left.seq)[0];
    if (
      state.rejectNextUndo ||
      route.request().method() !== "DELETE" ||
      !latestActive ||
      latestActive.id !== observationId
    ) {
      state.rejectNextUndo = false;
      await route.fulfill({
        status: 409,
        json: {
          type: "about:blank",
          title: "Observation conflict",
          status: 409,
          detail: "internal detail",
          code: "OBSERVATION_CONFLICT",
        },
      });
      return;
    }
    latestActive.isRevoked = true;
    await route.fulfill({ status: 200, json: latestActive });
  });
  await page.route(`**/api/v1/sessions/${sessionId}/candidates`, async (route) => {
    state.candidateRequests += 1;
    const activeObservations = [...observations.values()].filter(
      (observation) => !observation.isRevoked,
    );
    const activePokemon = activeObservations.find((observation) => observation.kind === "pokemon");
    const activeMove = activeObservations.find((observation) => observation.kind === "move");
    const pokemonMatched = {
      observationSeq: activePokemon?.seq ?? 1,
      kind: "pokemon",
      matched: true,
      points: 10,
      pokemonId: 6,
    };
    const moveMatched = {
      observationSeq: activeMove?.seq ?? 2,
      kind: "move",
      matched: true,
      points: 15,
      pokemonId: 6,
      moveId: 53,
    };
    const candidate = (
      id: string,
      name: string,
      rank: number,
      matchRate: number,
      popularityTier: "high" | "mid" | "low",
    ) => ({
      archetypeId: id,
      name,
      rank,
      matchRate,
      popularityTier,
      matched:
        activePokemon && activeMove
          ? [pokemonMatched, moveMatched]
          : activePokemon
            ? [pokemonMatched]
            : [],
      contradictions: [],
      exclusionCodes: [],
      likelyUnseen: [{ pokemonId: 25, usageRate: 0.8 }],
      threatMoveIds: [85],
    });
    const candidates =
      activeObservations.length === 0
        ? []
        : !activeMove
          ? [
              candidate("30000000-0000-4000-8000-000000000001", "リザードン展開", 1, 80, "high"),
              candidate("30000000-0000-4000-8000-000000000002", "雨展開", 2, 70, "mid"),
              candidate("30000000-0000-4000-8000-000000000003", "対面構築", 3, 60, "low"),
            ]
          : [
              candidate("30000000-0000-4000-8000-000000000002", "雨展開", 1, 100, "mid"),
              candidate("30000000-0000-4000-8000-000000000001", "リザードン展開", 2, 92.5, "high"),
              candidate("30000000-0000-4000-8000-000000000003", "対面構築", 3, 75, "low"),
            ];
    await route.fulfill({ status: 200, json: { sessionId, candidates } });
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
  await expect(page.getByText("表示できる候補はまだありません")).toBeVisible();

  await page.getByLabel("相手ポケモン").fill("リザ");
  await page.getByRole("button", { name: "リザードン（normal）を追加" }).click();
  await expect(page.getByText(/観測 seq 1/u)).toBeVisible();
  await expect(page.getByRole("heading", { name: "リザードン展開" })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "構築候補上位3件" }).getByRole("heading", { level: 3 }),
  ).toHaveCount(3);
  await expect(page.getByText("ピカチュウ").first()).toBeVisible();
  await expect(page.getByText("技 ID: 85").first()).toBeVisible();
  expect(state.observationBodies).toEqual([{ kind: "pokemon", pokemonId: 6 }]);

  await page.getByLabel("相手ポケモン").fill("リザ");
  await expect(page.getByRole("button", { name: "リザードン（normal）を追加" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "メガリザードンX（mega-x）を追加" })).toBeVisible();

  await page.getByLabel("技名").fill("かえ");
  await page.getByRole("button", { name: "かえんほうしゃをリザードンの技として追加" }).click();
  await expect(page.getByRole("heading", { name: "リザードンの観測済み技" })).toBeVisible();
  await expect(page.getByText("seq 2")).toBeVisible();
  await expect(page.getByRole("heading", { name: "雨展開" })).toBeVisible();
  await expect(page.getByLabel("2位から1位へ上昇")).toBeVisible();
  await expect(page.getByText("100").first()).toBeVisible();
  await expect(page.getByText("人気度 中")).toBeVisible();
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
  await expect(page.getByText("かえんほうしゃ", { exact: true }).last()).toBeVisible();
  await expect(page.getByRole("heading", { name: "雨展開" })).toBeVisible();

  await page.getByRole("button", { name: "ひとつ戻す" }).click();
  await expect(page.getByText(/技観測「かえんほうしゃ」を取り消しました/u)).toBeVisible();
  await expect(page.getByText("まだ技観測はありません")).toBeVisible();
  await expect(page.getByRole("heading", { name: "リザードン展開" })).toBeVisible();
  expect(state.undoObservationIds).toEqual(["20000000-0000-4000-8000-000000000002"]);

  await page.getByLabel("技名").fill("かえ");
  await page.getByRole("button", { name: "かえんほうしゃをリザードンの技として追加" }).click();
  await expect(page.getByText("seq 3")).toBeVisible();
  await page.getByRole("button", { name: "ひとつ戻す" }).click();
  await expect(page.getByText(/取消済みの履歴 2件/u)).toBeVisible();
  await page.getByRole("button", { name: "ひとつ戻す" }).click();
  await expect(page.getByText(/ポケモン観測「リザードン」を取り消しました/u)).toBeVisible();
  await expect(page.getByText("まだ観測はありません")).toBeVisible();
  await expect(page.getByText("Undoできる有効な観測はありません。")).toBeVisible();

  const stored = await page.evaluate((id) => {
    const raw = sessionStorage.getItem(`pokemon-champions.battle.observations.v2:${id}`);
    return raw ? JSON.parse(raw) : null;
  }, sessionId);
  expect(stored.observations).toHaveLength(3);
  expect(
    stored.observations.map((item: { observation: { seq: number } }) => item.observation.seq),
  ).toEqual([1, 2, 3]);
  expect(
    stored.observations.every(
      (item: { observation: { isRevoked: boolean } }) => item.observation.isRevoked,
    ),
  ).toBe(true);

  await page.reload();
  await expect(page.getByText(/取消済みの履歴 3件/u)).toBeVisible();
  await expect(page.getByText("Undoできる有効な観測はありません。")).toBeVisible();
  expect(state.candidateRequests).toBeGreaterThanOrEqual(3);
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

  state.rejectNextObservation = false;
  await candidate.click();
  await expect(page.getByText("seq 3")).toBeVisible();
  state.rejectNextUndo = true;
  await page.getByRole("button", { name: "ひとつ戻す" }).click();
  await expect(page.getByRole("alert")).toContainText("観測状態が更新されています");
  await expect(page.getByText("seq 3")).toBeVisible();

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL("/login");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
