/**
 * PostgreSQL への接続確認スクリプト。
 * 使い方: pnpm db:check(packages/database/.env の DATABASE_URL を使用)
 */
import { createPrismaClient } from "../src/index";

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    if (result[0]?.ok !== 1) {
      throw new Error(`unexpected result: ${JSON.stringify(result)}`);
    }
    const count = await prisma.systemHealthCheck.count();
    console.log(`✅ PostgreSQL connection OK (system_health_checks rows: ${count})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("❌ PostgreSQL connection FAILED");
  console.error(error);
  process.exit(1);
});
