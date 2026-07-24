import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

describe("PrismaService", () => {
  let service: PrismaService;

  beforeEach(() => {
    service = new PrismaService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("初期化時に接続し、SELECT 1 相当のクエリを実行する", async () => {
    const connectMock = vi.spyOn(service, "$connect").mockResolvedValue();
    const queryMock = vi.spyOn(service, "$queryRaw").mockResolvedValue([{ value: 1 }]);

    await service.onModuleInit();

    expect(connectMock).toHaveBeenCalledOnce();
    expect(queryMock).toHaveBeenCalledOnce();
    expect(queryMock.mock.calls[0]?.[0]).toEqual(["SELECT 1"]);
  });

  it("接続失敗時に元の原因を含むエラーを送出する", async () => {
    const connectionError = new Error("P1001: PostgreSQL server is unreachable");
    vi.spyOn(service, "$connect").mockRejectedValue(connectionError);
    const queryMock = vi.spyOn(service, "$queryRaw");
    const loggerMock = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const initialization = service.onModuleInit();

    await expect(initialization).rejects.toThrow(
      "Prisma database connection check failed: P1001: PostgreSQL server is unreachable",
    );
    await expect(initialization).rejects.toMatchObject({ cause: connectionError });
    expect(queryMock).not.toHaveBeenCalled();
    expect(loggerMock).toHaveBeenCalledWith(
      "Prisma database connection check failed: P1001: PostgreSQL server is unreachable",
      connectionError.stack,
    );
  });

  it("終了時にPrismaクライアントを切断する", async () => {
    const disconnectMock = vi.spyOn(service, "$disconnect").mockResolvedValue();

    await service.onModuleDestroy();

    expect(disconnectMock).toHaveBeenCalledOnce();
  });
});
