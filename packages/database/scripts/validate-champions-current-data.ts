import { validateChampionsCurrentDataQuality } from "../src/seed/champions-current-validation";

try {
  const report = validateChampionsCurrentDataQuality();
  console.log("✅ MASTER-009B Pokémon Champions current data validation succeeded");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error("❌ MASTER-009B Pokémon Champions current data validation failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
