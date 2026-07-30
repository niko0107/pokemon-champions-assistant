import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@pokemon-champions/database";
import {
  publicArchetypeDetailSchema,
  type ProblemDetails,
  type PublicArchetypeDetail,
} from "@pokemon-champions/shared";
import { PrismaService } from "../prisma/prisma.service";

const publicArchetypeDetailSelect = {
  id: true,
  name: true,
  description: true,
  defaultLeads: true,
  playstyleNotes: true,
  rule: {
    select: {
      id: true,
      name: true,
      teamSize: true,
      pickSize: true,
      battleLevel: true,
    },
  },
  season: {
    select: {
      id: true,
      name: true,
    },
  },
  pokemons: {
    select: {
      slot: true,
      usageRate: true,
      nature: true,
      teraType: true,
      evs: true,
      ivs: true,
      actualStats: true,
      statDataStatus: true,
      role: true,
      threatNotes: true,
      pokemon: {
        select: {
          id: true,
          nameJa: true,
          nameEn: true,
          form: true,
          type1: true,
          type2: true,
          isMega: true,
        },
      },
      item: {
        select: {
          id: true,
          nameJa: true,
          nameEn: true,
        },
      },
      ability: {
        select: {
          id: true,
          nameJa: true,
          nameEn: true,
        },
      },
      moves: {
        select: {
          moveId: true,
          adoptionRate: true,
          move: {
            select: {
              nameJa: true,
              nameEn: true,
              type: true,
              category: true,
              power: true,
              accuracy: true,
              priority: true,
              tags: true,
            },
          },
        },
        orderBy: [{ adoptionRate: "desc" }, { moveId: "asc" }],
      },
    },
    orderBy: [{ slot: "asc" }, { pokemonId: "asc" }],
  },
  sources: {
    select: {
      title: true,
      url: true,
      siteName: true,
    },
    orderBy: [{ title: "asc" }, { url: "asc" }],
  },
} satisfies Prisma.ArchetypeSelect;

type PublicArchetypeDetailRecord = Prisma.ArchetypeGetPayload<{
  select: typeof publicArchetypeDetailSelect;
}>;

@Injectable()
export class ArchetypesService {
  private readonly logger = new Logger(ArchetypesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(id: string): Promise<PublicArchetypeDetail> {
    let record: PublicArchetypeDetailRecord | null;

    try {
      record = await this.prisma.archetype.findFirst({
        where: {
          id,
          status: "published",
        },
        select: publicArchetypeDetailSelect,
      });
    } catch {
      this.throwInternalError("Public archetype detail query failed");
    }

    if (record === null) {
      this.throwNotFound();
    }

    const result = publicArchetypeDetailSchema.safeParse({
      ...record,
      pokemons: record.pokemons.map((pokemon) => ({
        ...pokemon,
        usageRate: pokemon.usageRate.toNumber(),
        moves: pokemon.moves.map(({ move, ...entry }) => ({
          ...move,
          ...entry,
          adoptionRate: entry.adoptionRate.toNumber(),
        })),
      })),
    });

    if (!result.success) {
      this.throwInternalError("Archetype contains invalid public detail values");
    }

    return result.data;
  }

  private throwNotFound(): never {
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Archetype Not Found",
      status: 404,
      code: "NOT_FOUND",
    };
    throw new NotFoundException(problem);
  }

  private throwInternalError(message: string): never {
    this.logger.error(message);
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Archetype Data Integrity Error",
      status: 500,
      code: "INTERNAL_ERROR",
    };
    throw new InternalServerErrorException(problem);
  }
}
