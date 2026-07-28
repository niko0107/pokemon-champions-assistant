import { validateChampionsV1DataQuality } from "../src/seed/champions-v1-validation";

const report = validateChampionsV1DataQuality();

console.log("✅ MASTER-009A Pokémon Champions v1.0 data quality validated");
console.log(JSON.stringify(report, null, 2));
