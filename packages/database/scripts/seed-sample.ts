import { createPrismaClient } from "../src/index";
import {
  seedEntityNames,
  seedMasterSnapshot,
  type SeedChangeCounts,
  type SeedEntityName,
} from "../src/seed/pipeline";
import { championsV1MasterData } from "../src/seed/champions-v1-data";

const entityLabels: Record<SeedEntityName, string> = {
  pokemons: "Pokemon",
  moves: "Move",
  items: "Item",
  abilities: "Ability",
  pokemonMoves: "PokemonMove",
  seasons: "Season",
  rules: "Rule",
};

function formatCounts(counts: SeedChangeCounts): string {
  return `追加=${counts.created}, 更新=${counts.updated}, 変更なし=${counts.unchanged}, 削除=${counts.deleted}`;
}

async function main(): Promise<void> {
  const prisma = createPrismaClient();

  try {
    const summary = await seedMasterSnapshot(prisma, championsV1MasterData);

    console.log("✅ MASTER-009A Pokémon Champions v1.0 master data seeded");
    for (const entity of seedEntityNames) {
      console.log(`  ${entityLabels[entity]}: ${formatCounts(summary[entity])}`);
    }
    console.log(`  合計: ${formatCounts(summary.total)}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("❌ MASTER-009A Pokémon Champions v1.0 master data seed failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
