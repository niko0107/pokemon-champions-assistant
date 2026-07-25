import {
  BadRequestException,
  ConflictException,
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
  type ObservationCreate,
  type ObservationResponse,
  type ProblemDetails,
  observationResponseSchema,
} from "@pokemon-champions/shared";
import { PrismaService } from "../prisma/prisma.service";

const OBSERVATION_TRANSACTION_MAX_ATTEMPTS = 3;

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

const observationSelect = {
  id: true,
  sessionId: true,
  seq: true,
  kind: true,
  pokemonId: true,
  moveId: true,
  itemId: true,
  abilityId: true,
  position: true,
  isRevoked: true,
  observedAt: true,
} satisfies Prisma.ObservationSelect;

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
type ObservationRecord = Prisma.ObservationGetPayload<{ select: typeof observationSelect }>;

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

  async addObservation(
    userId: string,
    sessionId: string,
    input: ObservationCreate,
  ): Promise<ObservationResponse> {
    for (let attempt = 1; attempt <= OBSERVATION_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const session = await transaction.battleSession.findFirst({
              where: { id: sessionId, userId },
              select: { id: true, status: true },
            });
            if (!session) {
              this.throwNotFound();
            }
            if (session.status !== "active") {
              this.throwInvalidSessionState();
            }

            await this.validateObservationReferences(transaction, input);

            const latest = await transaction.observation.aggregate({
              where: { sessionId: session.id },
              _max: { seq: true },
            });
            const seq = (latest._max.seq ?? 0) + 1;
            if (!Number.isSafeInteger(seq)) {
              this.throwObservationConflict();
            }

            const observation = await transaction.observation.create({
              data: this.buildObservationData(session.id, seq, input),
              select: observationSelect,
            });

            return this.serializeObservation(observation);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error: unknown) {
        if (
          this.isRetryableObservationConflict(error) &&
          attempt < OBSERVATION_TRANSACTION_MAX_ATTEMPTS
        ) {
          continue;
        }
        this.translateObservationError(error);
      }
    }

    return this.throwObservationConflict();
  }

  private async validateObservationReferences(
    transaction: Prisma.TransactionClient,
    input: ObservationCreate,
  ): Promise<void> {
    const pokemon = await transaction.pokemon.findUnique({
      where: { id: input.pokemonId },
      select: { abilities: true, isMega: true },
    });
    if (!pokemon) {
      this.throwInvalidMasterReference("pokemonId", "存在しないポケモンです");
    }

    if (input.kind === "move") {
      const [move, pokemonMove] = await Promise.all([
        transaction.move.findUnique({
          where: { id: input.moveId },
          select: { id: true },
        }),
        transaction.pokemonMove.findUnique({
          where: {
            pokemonId_moveId: {
              pokemonId: input.pokemonId,
              moveId: input.moveId,
            },
          },
          select: { pokemonId: true },
        }),
      ]);
      if (!move || !pokemonMove) {
        this.throwInvalidMasterReference(
          "moveId",
          move ? "対象ポケモンが習得できない技です" : "存在しない技です",
        );
      }
    }

    if (input.kind === "item") {
      const item = await transaction.item.findUnique({
        where: { id: input.itemId },
        select: { id: true },
      });
      if (!item) {
        this.throwInvalidMasterReference("itemId", "存在しない持ち物です");
      }
    }

    if (input.kind === "ability") {
      const ability = await transaction.ability.findUnique({
        where: { id: input.abilityId },
        select: { nameJa: true },
      });
      const abilities = pokemonAbilitiesSchema.safeParse(pokemon.abilities);
      if (!ability || !abilities.success || !abilities.data.includes(ability.nameJa)) {
        this.throwInvalidMasterReference(
          "abilityId",
          ability ? "対象ポケモンが持てない特性です" : "存在しない特性です",
        );
      }
    }

    if (input.kind === "mega" && !pokemon.isMega) {
      this.throwInvalidMasterReference("pokemonId", "メガ形態ではないポケモンです");
    }
  }

  private buildObservationData(
    sessionId: string,
    seq: number,
    input: ObservationCreate,
  ): Prisma.ObservationUncheckedCreateInput {
    return {
      sessionId,
      seq,
      kind: input.kind,
      pokemonId: input.pokemonId,
      moveId: input.kind === "move" ? input.moveId : null,
      itemId: input.kind === "item" ? input.itemId : null,
      abilityId: input.kind === "ability" ? input.abilityId : null,
      position: input.kind === "position" ? input.position : null,
      isRevoked: false,
    };
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

  private serializeObservation(observation: ObservationRecord): ObservationResponse {
    return observationResponseSchema.parse({
      id: observation.id,
      sessionId: observation.sessionId,
      seq: observation.seq,
      kind: observation.kind,
      pokemonId: observation.pokemonId,
      moveId: observation.moveId,
      itemId: observation.itemId,
      abilityId: observation.abilityId,
      position: observation.position,
      isRevoked: observation.isRevoked,
      createdAt: observation.observedAt.toISOString(),
    });
  }

  private isRetryableObservationConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    );
  }

  private translateObservationError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }
    if (this.isRetryableObservationConflict(error)) {
      this.throwObservationConflict();
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003" || error.code === "P2004") {
        this.throwInvalidMasterReference("observation", "観測対象のマスタ参照が不正です");
      }
      if (error.code === "P2025") {
        this.throwNotFound();
      }
    }
    this.throwInternalError();
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

  private throwInvalidSessionState(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Invalid Session State",
      status: 400,
      code: "INVALID_SESSION_STATE",
      errors: [{ path: "id", message: "activeなセッションにのみ観測を追加できます" }],
    };
    throw new BadRequestException(problem);
  }

  private throwInvalidMasterReference(path: string, message: string): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Invalid Master Reference",
      status: 400,
      code: "INVALID_MASTER_REFERENCE",
      errors: [{ path, message }],
    };
    throw new BadRequestException(problem);
  }

  private throwObservationConflict(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Observation Conflict",
      status: 409,
      code: "OBSERVATION_CONFLICT",
    };
    throw new ConflictException(problem);
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
