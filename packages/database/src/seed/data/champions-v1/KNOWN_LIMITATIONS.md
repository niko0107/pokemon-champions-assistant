# Pokémon Champions v1.0 master data — known limitations

- This snapshot contains only PokéAPI version group `32` (`champions`) and move method `12`
  (`train`) from PokéAPI PR #1532. Regulation M-B and every post-v1.0 change are deferred to
  MASTER-009B.
- PokéAPI PR #1532 states that 261 disabled Pokémon/Move relations were omitted upstream. This
  repository does not recreate them.
- PR #1532 added Mega Meowstic♀ and its learnset but did not include its stats, type, or ability.
  Those three records come from the official follow-up PR #1584. No value is copied from the male
  form or inferred locally.
- Morpeko Hangry Mode has five fewer source relations than Full Belly Mode. PR #1532 documents that
  the in-game Box always edits Full Belly Mode; the raw upstream distinction is retained.
- Vivillon, Florges, Furfrou, Polteageist, Alcremie, and Sinistcha have cosmetic form rows that
  PokéAPI intentionally consolidates under one battle Pokémon ID. `sourceFormIds` records those rows,
  while this application stores one Pokémon record per PokéAPI battle Pokémon ID.
- Mega Meowstic♂ and Mega Meowstic♀ remain separate Pokémon records and retain their gender-specific
  learnsets.
- PokéAPI reports zero, rather than an ordinary fixed value, for eight referenced move powers and for
  Dragon Cheer accuracy. The current schema represents “no fixed value” as `null`, so those zero
  placeholders are converted to `null` and are not treated as calculated damage inputs.
- Only the mechanically determined `priority` move tag is generated when `priority > 0`. Setup,
  hazard, screen, pivot, and status tags are not inferred from prose or move names. Ability tags are
  also empty.
- PR #1532 does not define a version-group-scoped held-item legality list and changes no item CSV.
  MASTER-009A therefore retains the three existing development items without claiming complete
  Champions legality. Item coverage and Champions-specific items are deferred to MASTER-009B.
- The application schema does not persist PokéAPI IDs, version group, move method, move PP, target,
  hidden-ability flags, cosmetic form rows, source timestamps, or source licenses. Source IDs and
  provenance remain in the reviewed seed files and manifest instead.
- Normal `db:seed` reads only committed local files and performs no network access.
