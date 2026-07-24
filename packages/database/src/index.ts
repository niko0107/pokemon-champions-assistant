import { PrismaClient } from "@prisma/client";

export { PrismaClient, Prisma } from "@prisma/client";
export type { Move, Pokemon, SystemHealthCheck } from "@prisma/client";

/**
 * PrismaClient を生成する。接続は最初のクエリ実行時に確立される(遅延接続)。
 * アプリ側(NestJS)ではライフサイクル管理された Service でラップして使うこと。
 */
export function createPrismaClient(options?: { datasourceUrl?: string }): PrismaClient {
  return new PrismaClient(
    options?.datasourceUrl ? { datasources: { db: { url: options.datasourceUrl } } } : undefined,
  );
}
