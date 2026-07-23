import { describe, expect, it } from "vitest";
import { createPrismaClient } from "./index";

describe("createPrismaClient", () => {
  it("DB 接続なしでインスタンス化できる(遅延接続)", async () => {
    const prisma = createPrismaClient({
      datasourceUrl: "postgresql://user:pass@localhost:5432/dummy",
    });
    expect(prisma.$connect).toBeTypeOf("function");
    expect(prisma.$queryRaw).toBeTypeOf("function");
    await prisma.$disconnect();
  });
});
