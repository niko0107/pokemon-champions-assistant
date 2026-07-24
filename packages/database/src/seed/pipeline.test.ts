import type { Prisma } from "../index";
import { describe, expect, it, vi } from "vitest";
import { seedSampleMasters, type SeedTransactionRunner } from "./pipeline";
import { sampleMasterData } from "./sample-data";

describe("seedSampleMasters", () => {
  it("不正なデータではトランザクションを開始せずDBを変更しない", async () => {
    const runner: SeedTransactionRunner = {
      async $transaction<T>(
        _operation: (transaction: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> {
        throw new Error("不正入力では呼び出されない");
      },
    };
    const transactionSpy = vi.spyOn(runner, "$transaction");
    const invalidData = {
      ...sampleMasterData,
      moves: sampleMasterData.moves.map((move, index) =>
        index === 0 ? { ...move, tags: ["not_allowed"] } : move,
      ),
    };

    await expect(seedSampleMasters(runner, invalidData)).rejects.toThrow();
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it("参照不整合でもトランザクションを開始しない", async () => {
    const runner: SeedTransactionRunner = {
      async $transaction<T>(
        _operation: (transaction: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> {
        throw new Error("参照不整合では呼び出されない");
      },
    };
    const transactionSpy = vi.spyOn(runner, "$transaction");
    const invalidData = {
      ...sampleMasterData,
      pokemons: sampleMasterData.pokemons.map((pokemon) =>
        pokemon.dexNo === 130 && pokemon.form === "mega"
          ? {
              ...pokemon,
              basePokemon: { dexNo: 9999, form: "normal" },
            }
          : pokemon,
      ),
    };

    await expect(seedSampleMasters(runner, invalidData)).rejects.toThrow();
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it("DB処理の失敗理由とロールバックを示すエラーを返す", async () => {
    const runner: SeedTransactionRunner = {
      async $transaction<T>(
        _operation: (transaction: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> {
        throw new Error("一意制約違反");
      },
    };

    await expect(seedSampleMasters(runner, sampleMasterData)).rejects.toThrow(
      "トランザクションはロールバックされました: 一意制約違反",
    );
  });
});
