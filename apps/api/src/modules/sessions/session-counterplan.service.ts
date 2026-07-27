import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@pokemon-champions/database";
import {
  buildCounterplan,
  buildMatchupMatrix,
  buildSelectionRecommendation,
} from "@pokemon-champions/matchup";
import {
  sessionCounterplanResponseSchema,
  type ProblemDetails,
  type SessionCounterplanResponse,
} from "@pokemon-champions/shared";
import {
  EXPLANATION_GENERATOR,
  type ExplanationGenerator,
} from "../explanations/explanation-generator";
import { PrismaService } from "../prisma/prisma.service";
import {
  InvalidObservedMoveStateError,
  resolvePriorityOpponentPokemonIds,
  toArchetypeCounterplanSnapshots,
  toPartyCounterplanCombatants,
} from "./session-counterplan";

const moveSelect = {
  type: true,
  category: true,
  power: true,
  accuracy: true,
  priority: true,
  tags: true,
} satisfies Prisma.MoveSelect;

const counterplanSessionSelect = {
  id: true,
  userId: true,
  status: true,
  ruleId: true,
  partyId: true,
  selectedArchetypeId: true,
  rule: {
    select: {
      id: true,
      teamSize: true,
      pickSize: true,
      battleLevel: true,
    },
  },
  party: {
    select: {
      id: true,
      ruleId: true,
      pokemons: {
        select: {
          slot: true,
          pokemonId: true,
          actualStats: true,
          pokemon: {
            select: {
              type1: true,
              type2: true,
              isMega: true,
            },
          },
          moves: {
            select: {
              slot: true,
              moveId: true,
              move: { select: moveSelect },
            },
            orderBy: [{ slot: "asc" }, { moveId: "asc" }],
          },
        },
        orderBy: [{ slot: "asc" }, { pokemonId: "asc" }],
      },
    },
  },
  selectedArchetype: {
    select: {
      id: true,
      ruleId: true,
      status: true,
      playstyleNotes: true,
      defaultLeads: true,
      rule: {
        select: {
          id: true,
          battleLevel: true,
        },
      },
      pokemons: {
        select: {
          slot: true,
          pokemonId: true,
          role: true,
          usageRate: true,
          actualStats: true,
          threatNotes: true,
          pokemon: {
            select: {
              type1: true,
              type2: true,
              isMega: true,
            },
          },
          moves: {
            select: {
              moveId: true,
              adoptionRate: true,
              move: { select: moveSelect },
            },
            orderBy: [{ moveId: "asc" }],
          },
        },
        orderBy: [{ slot: "asc" }, { pokemonId: "asc" }],
      },
    },
  },
  observations: {
    where: {
      kind: "move",
      isRevoked: false,
    },
    select: {
      seq: true,
      pokemonId: true,
      moveId: true,
      move: { select: moveSelect },
    },
    orderBy: [{ seq: "asc" }],
  },
} satisfies Prisma.BattleSessionSelect;

type CounterplanSessionRecord = Prisma.BattleSessionGetPayload<{
  select: typeof counterplanSessionSelect;
}>;

@Injectable()
export class SessionCounterplanService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXPLANATION_GENERATOR)
    private readonly explanationGenerator: ExplanationGenerator,
  ) {}

  async get(userId: string, sessionId: string): Promise<SessionCounterplanResponse> {
    try {
      const session = await this.prisma.battleSession.findFirst({
        where: { id: sessionId, userId },
        select: counterplanSessionSelect,
      });
      if (!session) {
        this.throwNotFound();
      }

      return await this.buildResponse(session, userId);
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof InvalidObservedMoveStateError) {
        this.throwInvalidSessionState();
      }
      this.throwInternalError();
    }
  }

  private async buildResponse(
    session: CounterplanSessionRecord,
    expectedUserId: string,
  ): Promise<SessionCounterplanResponse> {
    if (session.userId !== expectedUserId) {
      this.throwInternalError();
    }
    if (session.status === "archived") {
      this.throwInvalidSessionState();
    }
    if (session.status !== "active" && session.status !== "ended") {
      this.throwInternalError();
    }
    if (session.selectedArchetypeId === null || session.selectedArchetype === null) {
      this.throwInvalidArchetypeSelection();
    }

    const { rule, party, selectedArchetype } = session;
    this.validateRule(rule);
    if (party.id !== session.partyId || party.ruleId !== session.ruleId) {
      this.throwInvalidPartyState();
    }
    if (
      party.pokemons.length < 1 ||
      party.pokemons.length > 6 ||
      party.pokemons.length !== rule.teamSize ||
      rule.pickSize > party.pokemons.length
    ) {
      this.throwInvalidPartyState();
    }
    if (
      selectedArchetype.id !== session.selectedArchetypeId ||
      selectedArchetype.ruleId !== session.ruleId ||
      selectedArchetype.rule.id !== session.ruleId ||
      selectedArchetype.status !== "published" ||
      selectedArchetype.pokemons.length < 1 ||
      selectedArchetype.pokemons.length > 6 ||
      selectedArchetype.pokemons.length !== rule.teamSize
    ) {
      this.throwInvalidArchetypeSelection();
    }
    if (selectedArchetype.rule.battleLevel !== rule.battleLevel) {
      this.throwInternalError();
    }

    const self = toPartyCounterplanCombatants(party.pokemons, rule.battleLevel);
    const opponents = toArchetypeCounterplanSnapshots(
      selectedArchetype.pokemons,
      session.observations,
      selectedArchetype.rule.battleLevel,
      selectedArchetype.playstyleNotes,
    );
    const priorityOpponentPokemonIds = resolvePriorityOpponentPokemonIds(
      selectedArchetype.defaultLeads,
      selectedArchetype.pokemons,
    );
    const matrix = buildMatchupMatrix({
      self,
      opponents: opponents.combatants,
    });
    const selection = buildSelectionRecommendation({
      matrix,
      pickSize: rule.pickSize,
      priorityOpponentPokemonIds,
    });
    const counterplan = buildCounterplan({
      archetype: opponents.archetype,
      matrix,
      selection,
    });
    const explanation = await this.explanationGenerator.generateCounterplanExplanation(counterplan);

    return sessionCounterplanResponseSchema.parse({
      sessionId: session.id,
      selectedArchetypeId: selectedArchetype.id,
      ...counterplan,
      explanation,
    });
  }

  private validateRule(rule: CounterplanSessionRecord["rule"]): void {
    if (
      !Number.isSafeInteger(rule.id) ||
      rule.id <= 0 ||
      !Number.isSafeInteger(rule.teamSize) ||
      rule.teamSize < 1 ||
      rule.teamSize > 6 ||
      !Number.isSafeInteger(rule.pickSize) ||
      rule.pickSize <= 0 ||
      rule.pickSize > rule.teamSize ||
      !Number.isSafeInteger(rule.battleLevel) ||
      rule.battleLevel < 1 ||
      rule.battleLevel > 100
    ) {
      this.throwInternalError();
    }
  }

  private throwNotFound(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Session Resource Not Found",
      status: 404,
      code: "NOT_FOUND",
    };
    throw new NotFoundException(problem);
  }

  private throwInvalidSessionState(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Invalid Session State",
      status: 400,
      code: "INVALID_SESSION_STATE",
    };
    throw new BadRequestException(problem);
  }

  private throwInvalidPartyState(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Invalid Party State",
      status: 400,
      code: "INVALID_PARTY_STATE",
    };
    throw new BadRequestException(problem);
  }

  private throwInvalidArchetypeSelection(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Invalid Archetype Selection",
      status: 400,
      code: "INVALID_ARCHETYPE_SELECTION",
    };
    throw new BadRequestException(problem);
  }

  private throwInternalError(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      code: "INTERNAL_ERROR",
    };
    throw new InternalServerErrorException(problem);
  }
}
