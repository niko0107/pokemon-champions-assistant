import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@pokemon-champions/database";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
    } catch (error: unknown) {
      const message = `Prisma database connection check failed: ${getErrorMessage(error)}`;
      this.logger.error(message, error instanceof Error ? error.stack : undefined);
      throw new Error(message, { cause: error });
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
    } catch (error: unknown) {
      const message = `Prisma database disconnection failed: ${getErrorMessage(error)}`;
      this.logger.error(message, error instanceof Error ? error.stack : undefined);
      throw new Error(message, { cause: error });
    }
  }
}
