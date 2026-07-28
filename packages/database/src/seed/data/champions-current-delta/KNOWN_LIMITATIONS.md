# Pokémon Champions current master known limitations

This delta updates the MASTER-009A Pokémon Champions v1.0 snapshot to the public data associated
with Regulation Set M-B (content added in Ver. 1.1.0 and used by the current Ver. 1.1.4 client).
It is intentionally limited to data that can be reproduced from the fixed PokéAPI commits and
the official sources recorded in `source-manifest.json`.

## Item catalog

The three existing Item records are retained unchanged. They are a source-confirmed catalog, not
a complete list of every Item legal in Pokémon Champions. PokéAPI does not expose a complete
Champions-version legality set for Items, so this delta does not import all PokéAPI Items or infer
legality from earlier games.

ARCHETYPE-004 may add an Item only when the selected public build source explicitly identifies it.
A build whose held Item cannot be confirmed is excluded; `null` is reserved for a confirmed
no-held-Item case. If a complete official legality list becomes available, it can be added in a
future versioned update.

## Version boundary

- Ver. 1.1.0 added the Regulation Set M-B content represented by this delta.
- Ver. 1.1.4 is the current client version at the verification date. Its official notes contain
  fixes but do not define another public master-data delta after Ver. 1.1.0.
- Rule and Season records remain the existing development data. A Regulation Set M-B Rule and
  Season must be established from the source used by ARCHETYPE-004 rather than inferred here.

## Upstream representation

- The PokéAPI `champions` version group and `train` move method are the only learnset relations
  imported. Earlier-generation learnsets are not unioned into the snapshot.
- The added Pyroar record consolidates PokéAPI form rows `668` and `10551` into the male/default
  Pokemon record. The source representation does not create a second learnset-bearing female
  Pokemon record in this delta.
- Mega forms use a separate Pokemon record and point to their non-Mega base record. Their
  Champions learnsets are verified to match the base record.
- PokéAPI had no Japanese names for Eelevate and Fire Mane at the fixed commit. Their Japanese
  names are supplied only from the official Pokédex URLs recorded in the manifest.

## Tags and text

Move tags contain `priority` only when the structured numeric priority is positive. Other Move,
Item, and Ability tags remain empty unless a future structured and versioned source supports a
deterministic mapping. Effect text, descriptions, images, and game-extracted private data are not
included.
