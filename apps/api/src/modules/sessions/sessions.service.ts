import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@pokemon-champions/database";
import {
  battleSessionResponseSchema,
  partyDetailSchema,
  pokemonAbilitiesSchema,
  type BattleSessionCreate,
  type BattleSessionResponse,
  type ProblemDetails,
} from "@pokemon-champions/shared";
import { PrismaService } from "../prisma/prisma.service";

const sessionSelect = {
  id: true,
  partyId: true,
  ruleId: true,
  status: true,
  startedAt: true,
  endedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BattleSessionSelect;

const partyStateSelect = {
  id: true,
  name: true,
  description: true,
  ruleId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  rule: {
    select: {
      id: true,
      teamSize: true,
    },
  },
  pokemons: {
    select: {
      slot: true,
      pokemonId: true,
      itemId: true,
      abilityId: true,
      nature: true,
      teraType: true,
      evs: true,
      ivs: true,
      actualStats: true,
      pokemon: {
        select: {
          abilities: true,
          learnableMoves: {
            select: { moveId: true },
          },
        },
      },
      ability: {
        select: { nameJa: true },
      },
      moves: {
        select: {
          slot: true,
          moveId: true,
        },
        orderBy: [{ slot: "asc" }, { moveId: "asc" }],
      },
    },
    orderBy: [{ slot: "asc" }, { pokemonId: "asc" }],
  },
} satisfies Prisma.PartySelect;

type SessionRecord = Prisma.BattleSessionGetPayload<{ select: typeof sessionSelect }>;
type PartyStateRecord = Prisma.PartyGetPayload<{ select: typeof partyStateSelect }>;

interface ValidationIssue {
  path: string;
  message: string;
}

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: BattleSessionCreate): Promise<BattleSessionResponse> {
    return this.translateErrors(() =>
      this.prisma.$transaction(async (transaction) => {
        const party = await transaction.party.findFirst({
          where: {
            id: input.partyId,
            userId,
          },
          select: partyStateSelect,
        });
        if (!party) {
          this.throwNotFound();
        }

        this.validatePartyState(party, input);

        const session = await transaction.battleSession.create({
          data: {
            user: { connect: { id: userId } },
            party: { connect: { id: party.id } },
            rule: { connect: { id: input.ruleId } },
            status: "active",
          },
          select: sessionSelect,
        });

        return this.serialize(session);
      }),
    );
  }

  async get(userId: string, id: string): Promise<BattleSessionResponse> {
    return this.translateErrors(async () => {
      const session = await this.prisma.battleSession.findFirst({
        where: { id, userId },
        select: sessionSelect,
      });
      if (!session) {
        this.throwNotFound();
      }

      return this.serialize(session);
    });
  }

  private validatePartyState(party: PartyStateRecord, input: BattleSessionCreate): void {
    const issues: ValidationIssue[] = [];
    const publicParty = {
      id: party.id,
      name: party.name,
      description: party.description,
      ruleId: party.ruleId,
      isActive: party.isActive,
      createdAt: party.createdAt.toISOString(),
      updatedAt: party.updatedAt.toISOString(),
      pokemons: party.pokemons.map(
        ({ pokemon: _pokemon, ability: _ability, ...pokemon }) => pokemon,
      ),
    };
    const partyContract = partyDetailSchema.safeParse(publicParty);

    if (!partyContract.success) {
      issues.push(
        ...partyContract.error.issues.map((issue) => ({
          path: issue.path.length === 0 ? "partyId" : issue.path.join("."),
          message: issue.message,
        })),
      );
    }
    if (!party.isActive) {
      issues.push({
        path: "partyId",
        message: "対戦開始にはactiveなパーティを指定してください",
      });
    }
    if (party.ruleId !== input.ruleId || party.rule.id !== input.ruleId) {
      issues.push({
        path: "ruleId",
        message: "指定したルールはパーティのルールと一致しません",
      });
    }
    if (party.pokemons.length !== party.rule.teamSize) {
      issues.push({
        path: "partyId",
        message: `パーティ人数はルールのteamSize（${party.rule.teamSize}）と一致していません`,
      });
    }

    for (const [pokemonIndex, pokemon] of party.pokemons.entries()) {
      if (pokemon.slot > party.rule.teamSize) {
        issues.push({
          path: `partyId.pokemons.${pokemonIndex}.slot`,
          message: `slotはルールのteamSize（${party.rule.teamSize}）以下である必要があります`,
        });
      }

      const learnableMoveIds = new Set(pokemon.pokemon.learnableMoves.map((move) => move.moveId));
      for (const [moveIndex, move] of pokemon.moves.entries()) {
        if (!learnableMoveIds.has(move.moveId)) {
          issues.push({
            path: `partyId.pokemons.${pokemonIndex}.moves.${moveIndex}.moveId`,
            message: "パーティ内ポケモンが習得できない技です",
          });
        }
      }

      if (pokemon.abilityId !== null) {
        const abilities = pokemonAbilitiesSchema.safeParse(pokemon.pokemon.abilities);
        if (
          !abilities.success ||
          pokemon.ability === null ||
          !abilities.data.includes(pokemon.ability.nameJa)
        ) {
          issues.push({
            path: `partyId.pokemons.${pokemonIndex}.abilityId`,
            message: "パーティ内ポケモンが持てない特性です",
          });
        }
      }
    }

    if (issues.length > 0) {
      this.throwInvalidPartyState(issues);
    }
  }

  private serialize(session: SessionRecord): BattleSessionResponse {
    return battleSessionResponseSchema.parse({
      ...session,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });
  }

  private async translateErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2003" || error.code === "P2025") {
          this.throwNotFound();
        }
        if (error.code === "P2004") {
          this.throwInvalidPartyState([{ path: "partyId", message: "パーティの状態が不正です" }]);
        }
      }
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

  private throwInvalidPartyState(errors: ValidationIssue[]): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Invalid Party State",
      status: 400,
      code: "INVALID_PARTY_STATE",
      errors,
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
