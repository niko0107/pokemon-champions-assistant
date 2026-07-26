import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@pokemon-champions/database";
import {
  masterPokemonDetailSchema,
  type MasterPokemonDetail,
  type ProblemDetails,
} from "@pokemon-champions/shared";
import { PrismaService } from "../prisma/prisma.service";

const pokemonDetailSelect = {
  id: true,
  dexNo: true,
  nameJa: true,
  nameEn: true,
  form: true,
  type1: true,
  type2: true,
  isMega: true,
  basePokemonId: true,
  baseHp: true,
  baseAtk: true,
  baseDef: true,
  baseSpa: true,
  baseSpd: true,
  baseSpe: true,
} satisfies Prisma.PokemonSelect;

@Injectable()
export class PokemonDetailService {
  private readonly logger = new Logger(PokemonDetailService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(id: number): Promise<MasterPokemonDetail> {
    let record: unknown;

    try {
      record = await this.prisma.pokemon.findUnique({
        where: { id },
        select: pokemonDetailSelect,
      });
    } catch {
      this.throwInternalError("Pokemon detail query failed");
    }

    if (record === null) {
      const problem: ProblemDetails = {
        type: "about:blank",
        title: "Pokemon Not Found",
        status: 404,
        code: "NOT_FOUND",
      };
      throw new NotFoundException(problem);
    }

    const result = masterPokemonDetailSchema.safeParse(record);
    if (!result.success) {
      this.throwInternalError("Pokemon master contains invalid public detail values");
    }

    return result.data;
  }

  private throwInternalError(message: string): never {
    this.logger.error(message);
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Master Data Integrity Error",
      status: 500,
      code: "INTERNAL_ERROR",
    };
    throw new InternalServerErrorException(problem);
  }
}
