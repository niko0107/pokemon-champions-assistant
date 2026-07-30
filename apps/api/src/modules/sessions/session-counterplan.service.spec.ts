import { Prisma } from "@pokemon-champions/database";
import { sessionCounterplanResponseSchema } from "@pokemon-champions/shared";
import { describe, expect, it, vi } from "vitest";
import type { CounterplanExplanationStatusReader } from "../explanations/counterplan-explanation-status";
import type { ExplanationGenerator } from "../explanations/explanation-generator";
import { TemplateExplanationGenerator } from "../explanations/template-explanation-generator";
import { PrismaService } from "../prisma/prisma.service";
import type { CounterplanObservedMoveRecord } from "./session-counterplan";
import { SessionCounterplanService } from "./session-counterplan.service";

const userId = "fecccd4a-a137-4b3b-bb09-239306040706";
const sessionId = "0a6de75e-3972-47e2-b1fe-e599b330c52f";
const partyId = "8b0c1732-e931-41d0-b3d0-b9b62ed506b9";
const archetypeId = "e7e7a0d4-5e2d-4f3d-9f09-8576ca1ca94e";

const actualStats = {
  hp: 180,
  attack: 120,
  defense: 110,
  specialAttack: 140,
  specialDefense: 120,
  speed: 100,
};

function move(
  id: number,
  overrides: Partial<{
    type: string;
    category: string;
    power: number | null;
    accuracy: number | null;
    priority: number;
    tags: string[];
  }> = {},
) {
  return {
    id,
    type: "water",
    category: "special",
    power: 90,
    accuracy: 100,
    priority: 0,
    tags: [],
    ...overrides,
  };
}

function makeSession(teamSize = 1, pickSize = 1) {
  const partyPokemons = Array.from({ length: teamSize }, (_, index) => {
    const pokemonId = index + 1;
    const moveRecord = move(10 + pokemonId);
    return {
      slot: pokemonId,
      pokemonId,
      actualStats,
      pokemon: {
        type1: index % 2 === 0 ? "water" : "grass",
        type2: null,
        isMega: false,
      },
      moves: [
        {
          slot: 1,
          moveId: moveRecord.id,
          move: {
            type: moveRecord.type,
            category: moveRecord.category,
            power: moveRecord.power,
            accuracy: moveRecord.accuracy,
            priority: moveRecord.priority,
            tags: moveRecord.tags,
          },
        },
      ],
    };
  });
  const archetypePokemons = Array.from({ length: teamSize }, (_, index) => {
    const pokemonId = 101 + index;
    const damagingMove = move(20 + pokemonId, {
      type: index % 2 === 0 ? "fire" : "normal",
      category: "physical",
      power: 80,
    });
    const cautionMove = move(200 + pokemonId, {
      type: "normal",
      category: "status",
      power: null,
      tags: index === 0 ? ["setup", "status"] : [],
    });
    return {
      slot: index + 1,
      pokemonId,
      role: index === 0 ? "sweeper" : "support",
      usageRate: new Prisma.Decimal(index === 0 ? "1" : "0.8"),
      actualStats,
      threatNotes: index === 0 ? "積み展開に注意" : null,
      pokemon: {
        type1: index % 2 === 0 ? "fire" : "normal",
        type2: null,
        isMega: false,
      },
      moves: [
        {
          moveId: damagingMove.id,
          adoptionRate: new Prisma.Decimal("1"),
          move: {
            type: damagingMove.type,
            category: damagingMove.category,
            power: damagingMove.power,
            accuracy: damagingMove.accuracy,
            priority: damagingMove.priority,
            tags: damagingMove.tags,
          },
        },
        {
          moveId: cautionMove.id,
          adoptionRate: new Prisma.Decimal("0.8"),
          move: {
            type: cautionMove.type,
            category: cautionMove.category,
            power: cautionMove.power,
            accuracy: cautionMove.accuracy,
            priority: cautionMove.priority,
            tags: cautionMove.tags,
          },
        },
      ],
    };
  });
  return {
    id: sessionId,
    userId,
    status: "active",
    ruleId: 1,
    partyId,
    selectedArchetypeId: archetypeId,
    rule: {
      id: 1,
      teamSize,
      pickSize,
      battleLevel: 50,
    },
    party: {
      id: partyId,
      ruleId: 1,
      pokemons: partyPokemons,
    },
    selectedArchetype: {
      id: archetypeId,
      ruleId: 1,
      status: "published",
      playstyleNotes: "  壁から展開する  ",
      defaultLeads: [1],
      rule: {
        id: 1,
        battleLevel: 50,
      },
      pokemons: archetypePokemons,
    },
    observations: [] as CounterplanObservedMoveRecord[],
  };
}

function makeService(
  record: ReturnType<typeof makeSession> | null,
  explanationGenerator: ExplanationGenerator = new TemplateExplanationGenerator(),
) {
  const findFirst = vi.fn().mockResolvedValue(record);
  const prisma = {
    battleSession: { findFirst },
  } as unknown as PrismaService;
  const explanationStatus: CounterplanExplanationStatusReader = {
    getCounterplanExplanationStatus: vi
      .fn()
      .mockResolvedValue({ status: "unavailable", explanation: null }),
  };
  return {
    service: new SessionCounterplanService(prisma, explanationGenerator, explanationStatus),
    findFirst,
    getCounterplanExplanationStatus: explanationStatus.getCounterplanExplanationStatus,
  };
}

describe("SessionCounterplanService", () => {
  it("生成済み説明状態は同じ所有権・Session検証後のCounterplanResultだけをReaderへ渡す", async () => {
    const { service, getCounterplanExplanationStatus } = makeService(makeSession());
    await expect(service.getExplanationStatus(userId, sessionId)).resolves.toEqual({
      status: "unavailable",
      explanation: null,
    });
    expect(getCounterplanExplanationStatus).toHaveBeenCalledTimes(1);
    expect(getCounterplanExplanationStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        perOpponent: expect.any(Array),
        selection: expect.any(Object),
        strategyCodes: expect.any(Array),
      }),
    );
  });

  it("activeな1×1 SessionからMATCHUP-005→006→007の構造化結果を返す", async () => {
    const { service, findFirst } = makeService(makeSession());

    const response = await service.get(userId, sessionId);

    expect(sessionCounterplanResponseSchema.parse(response)).toEqual(response);
    expect(response).toMatchObject({
      sessionId,
      selectedArchetypeId: archetypeId,
      playstyleNotes: "  壁から展開する  ",
      strategyCodes: ["PREVENT_SETUP", "MANAGE_STATUS"],
      threatNotes: [{ opponentPokemonId: 101, note: "積み展開に注意" }],
      explanation: {
        summary: "相手ポケモン1体への対策です。警戒技は1件、未対応の相手は0体です。",
        strategyExplanation:
          "積み技を自由に使わせない。状態異常を受ける展開を避ける。登録された立ち回り:   壁から展開する  ",
      },
    });
    expect(response.perOpponent).toHaveLength(1);
    expect(response.perOpponent[0]?.recommendations).toHaveLength(1);
    expect(response.selection.selectedPokemonIds).toHaveLength(1);
    expect(response.selection.leadPokemonId).toBe(1);
    expect(response.cautionMoves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          opponentPokemonId: 101,
          primaryTag: "setup",
        }),
      ]),
    );
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: sessionId, userId },
      select: expect.objectContaining({
        party: expect.any(Object),
        selectedArchetype: expect.any(Object),
        observations: expect.objectContaining({
          where: { kind: "move", isRevoked: false },
        }),
      }),
    });
  });

  it("MATCHUP計算後にGeneratorを1回呼び、構造化結果を変更せず説明を追加する", async () => {
    const template = new TemplateExplanationGenerator();
    const generateCounterplanExplanation = vi.fn(
      template.generateCounterplanExplanation.bind(template),
    );
    const generator: ExplanationGenerator = { generateCounterplanExplanation };
    const { service } = makeService(makeSession(), generator);

    const response = await service.get(userId, sessionId);
    const input = generateCounterplanExplanation.mock.calls[0]?.[0];

    expect(generateCounterplanExplanation).toHaveBeenCalledTimes(1);
    expect(input).toMatchObject({
      perOpponent: response.perOpponent,
      selection: response.selection,
      playstyleNotes: response.playstyleNotes,
      strategyCodes: response.strategyCodes,
      cautionMoves: response.cautionMoves,
      threatNotes: response.threatNotes,
    });
    expect(response.explanation.perOpponent[0]).toMatchObject({
      opponentPokemonId: 101,
      explanation: expect.stringContaining("ポケモンID 101"),
    });
  });

  it("6×6 matrixを構築し、Rule.pickSize=3とdefaultLeads priorityを反映する", async () => {
    const { service } = makeService(makeSession(6, 3));

    const response = await service.get(userId, sessionId);

    expect(response.perOpponent).toHaveLength(6);
    expect(response.perOpponent.every(({ recommendations }) => recommendations.length === 3)).toBe(
      true,
    );
    expect(response.selection.selectedPokemonIds).toHaveLength(3);
    expect(response.selection.assignmentsByOpponent).toHaveLength(6);
    expect(response.selection.leadPokemonId).not.toBeNull();
  });

  it("defaultLeads空配列でも選出を算出し、仮の先発を生成しない", async () => {
    const session = makeSession(6, 3);
    session.selectedArchetype.defaultLeads = [];
    const { service } = makeService(session);

    const response = await service.get(userId, sessionId);

    expect(response.perOpponent).toHaveLength(6);
    expect(response.selection.selectedPokemonIds).toHaveLength(3);
    expect(response.selection.assignmentsByOpponent).toHaveLength(6);
    expect(response.selection.leadPokemonId).toBeNull();
  });

  it("ended Sessionでも同じ読み取り専用counterplanを返す", async () => {
    const session = makeSession();
    session.status = "ended";
    const { service, findFirst } = makeService(session);

    await expect(service.get(userId, sessionId)).resolves.toMatchObject({ sessionId });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("未取消観測技をテンプレより優先し、revoked除外条件をDB queryへ固定する", async () => {
    const session = makeSession();
    const observed = move(999, {
      type: "electric",
      category: "status",
      power: null,
      tags: ["screen"],
    });
    session.observations = [
      {
        seq: 1,
        pokemonId: 101,
        moveId: observed.id,
        move: {
          type: observed.type,
          category: observed.category,
          power: observed.power,
          accuracy: observed.accuracy,
          priority: observed.priority,
          tags: observed.tags,
        },
      },
    ];
    const { service, findFirst } = makeService(session);

    const response = await service.get(userId, sessionId);

    expect(response.cautionMoves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moveId: 999,
          opponentPokemonId: 101,
          adoptionRate: 1,
          primaryTag: "screen",
        }),
      ]),
    );
    expect(findFirst.mock.calls[0]?.[0]?.select.observations.where).toEqual({
      kind: "move",
      isRevoked: false,
    });
  });

  it.each([
    ["archived", { status: "archived" }, "INVALID_SESSION_STATE"],
    [
      "selected未設定",
      { selectedArchetypeId: null, selectedArchetype: null },
      "INVALID_ARCHETYPE_SELECTION",
    ],
  ])("%sを400で拒否する", async (_label, override, code) => {
    const session = { ...makeSession(), ...override };
    const { service } = makeService(session as unknown as ReturnType<typeof makeSession>);

    await expect(service.get(userId, sessionId)).rejects.toMatchObject({
      status: 400,
      response: { code },
    });
  });

  it("Party rule不一致とpickSize超過をINVALID_PARTY_STATEにする", async () => {
    const ruleMismatch = makeSession();
    ruleMismatch.party.ruleId = 2;
    await expect(makeService(ruleMismatch).service.get(userId, sessionId)).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_PARTY_STATE" },
    });

    const pickSize = makeSession(2, 2);
    pickSize.party.pokemons.pop();
    await expect(makeService(pickSize).service.get(userId, sessionId)).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_PARTY_STATE" },
    });
  });

  it("Archetype rule不一致・archivedをINVALID_ARCHETYPE_SELECTIONにする", async () => {
    const mismatch = makeSession();
    mismatch.selectedArchetype.ruleId = 2;
    await expect(makeService(mismatch).service.get(userId, sessionId)).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_ARCHETYPE_SELECTION" },
    });

    const archived = makeSession();
    archived.selectedArchetype.status = "archived";
    await expect(makeService(archived).service.get(userId, sessionId)).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_ARCHETYPE_SELECTION" },
    });
  });

  it("party actualStats nullを秘密情報なしの500へ変換する", async () => {
    const session = makeSession();
    session.party.pokemons[0]!.actualStats = null as unknown as typeof actualStats;

    await expect(makeService(session).service.get(userId, sessionId)).rejects.toMatchObject({
      status: 500,
      response: {
        type: "about:blank",
        title: "Internal Server Error",
        code: "INTERNAL_ERROR",
      },
    });
  });

  it("archetype actualStats nullでもtype-only counterplanと選出を返す", async () => {
    const session = makeSession();
    session.selectedArchetype.pokemons[0]!.actualStats = null as unknown as typeof actualStats;

    const response = await makeService(session).service.get(userId, sessionId);

    expect(response.perOpponent[0]?.recommendations[0]?.matchupResult).toMatchObject({
      calculationMode: "type_only",
      outgoingDamage: null,
      incomingDamage: null,
      outgoingKnockoutCount: null,
      incomingKnockoutCount: null,
    });
    expect(response.selection.selectedPokemonIds).toEqual([1]);
  });

  it("5種類を超える観測技をINVALID_SESSION_STATEにする", async () => {
    const session = makeSession();
    session.observations = Array.from({ length: 5 }, (_, index) => {
      const observed = move(900 + index);
      return {
        seq: index + 1,
        pokemonId: 101,
        moveId: observed.id,
        move: {
          type: observed.type,
          category: observed.category,
          power: observed.power,
          accuracy: observed.accuracy,
          priority: observed.priority,
          tags: observed.tags,
        },
      };
    });

    await expect(makeService(session).service.get(userId, sessionId)).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_SESSION_STATE" },
    });
  });

  it("他人・不存在Sessionを同じ404にし、DB例外を安全な500へ変換する", async () => {
    const missing = makeService(null);
    await expect(missing.service.get(userId, sessionId)).rejects.toMatchObject({
      status: 404,
      response: { code: "NOT_FOUND" },
    });

    const findFirst = vi.fn().mockRejectedValue(new Error("database details"));
    const prisma = { battleSession: { findFirst } } as unknown as PrismaService;
    await expect(
      new SessionCounterplanService(prisma, new TemplateExplanationGenerator(), {
        getCounterplanExplanationStatus: vi
          .fn()
          .mockResolvedValue({ status: "unavailable", explanation: null }),
      }).get(userId, sessionId),
    ).rejects.toMatchObject({
      status: 500,
      response: {
        type: "about:blank",
        title: "Internal Server Error",
        status: 500,
        code: "INTERNAL_ERROR",
      },
    });
  });

  it("Generatorの入力不整合を秘密情報なしの500へ変換する", async () => {
    const generator: ExplanationGenerator = {
      generateCounterplanExplanation: vi
        .fn()
        .mockRejectedValue(new RangeError("unknown reason code and private details")),
    };

    await expect(
      makeService(makeSession(), generator).service.get(userId, sessionId),
    ).rejects.toMatchObject({
      status: 500,
      response: {
        type: "about:blank",
        title: "Internal Server Error",
        status: 500,
        code: "INTERNAL_ERROR",
      },
    });
  });
});
