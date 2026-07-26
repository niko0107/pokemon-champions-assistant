import type {
  CombatantSnapshot,
  CounterplanArchetypeSnapshot,
  MatchupMatrixCombatant,
  MoveSnapshot,
} from "@pokemon-champions/matchup";
import {
  POKEMON_TYPES,
  archetypePokemonRoleSchema,
  combatActualStatsSchema,
  moveCategorySchema,
  moveTagsSchema,
  type PokemonType,
} from "@pokemon-champions/shared";

const MAX_ROSTER_SIZE = 6;
const MAX_MOVE_COUNT = 4;

interface DecimalLike {
  toNumber(): number;
}

export interface CounterplanMoveRecord {
  type: string;
  category: string;
  power: number | null;
  accuracy: number | null;
  priority: number;
  tags: unknown;
}

export interface CounterplanPartyMoveRecord {
  slot: number;
  moveId: number;
  move: CounterplanMoveRecord;
}

export interface CounterplanPartyPokemonRecord {
  slot: number;
  pokemonId: number;
  actualStats: unknown;
  pokemon: {
    type1: string;
    type2: string | null;
    isMega: boolean;
  };
  moves: readonly CounterplanPartyMoveRecord[];
}

export interface CounterplanArchetypeMoveRecord {
  moveId: number;
  adoptionRate: DecimalLike;
  move: CounterplanMoveRecord;
}

export interface CounterplanArchetypePokemonRecord {
  slot: number;
  pokemonId: number;
  role: string;
  usageRate: DecimalLike;
  actualStats: unknown;
  threatNotes: string | null;
  pokemon: {
    type1: string;
    type2: string | null;
    isMega: boolean;
  };
  moves: readonly CounterplanArchetypeMoveRecord[];
}

export interface CounterplanObservedMoveRecord {
  seq: number;
  pokemonId: number | null;
  moveId: number | null;
  move: CounterplanMoveRecord | null;
}

interface SelectedOpponentMove {
  moveId: number;
  adoptionRate: number;
  move: CounterplanMoveRecord;
  observed: boolean;
}

export interface ArchetypeCounterplanSnapshots {
  combatants: MatchupMatrixCombatant[];
  archetype: CounterplanArchetypeSnapshot;
}

export class InvalidObservedMoveStateError extends Error {
  constructor() {
    super("Observed moves are inconsistent with the selected archetype");
    this.name = "InvalidObservedMoveStateError";
  }
}

function assertPositiveSafeInteger(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${path} must be a positive safe integer`);
  }
}

function assertIntegerInRange(value: number, min: number, max: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${path} must be an integer between ${min} and ${max}`);
  }
}

function parseRate(value: DecimalLike, path: string): number {
  const parsed = value.toNumber();
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new RangeError(`${path} must be between 0 and 1`);
  }
  return parsed;
}

function parsePokemonType(value: string, path: string): PokemonType {
  const parsed = POKEMON_TYPES.find((type) => type === value);
  if (parsed === undefined) {
    throw new RangeError(`${path} must be a supported Pokemon type`);
  }
  return parsed;
}

function parseTypes(pokemon: { type1: string; type2: string | null }, path: string): PokemonType[] {
  const type1 = parsePokemonType(pokemon.type1, `${path}.type1`);
  if (pokemon.type2 === null) {
    return [type1];
  }
  const type2 = parsePokemonType(pokemon.type2, `${path}.type2`);
  if (type1 === type2) {
    throw new RangeError(`${path} must not contain duplicate Pokemon types`);
  }
  return [type1, type2];
}

function toStats(actualStats: unknown, path: string): CombatantSnapshot["stats"] {
  const parsed = combatActualStatsSchema.safeParse(actualStats);
  if (!parsed.success) {
    throw new RangeError(`${path} must contain valid combat actual stats`);
  }
  return {
    hp: parsed.data.hp,
    atk: parsed.data.attack,
    def: parsed.data.defense,
    spa: parsed.data.specialAttack,
    spd: parsed.data.specialDefense,
    spe: parsed.data.speed,
  };
}

function toMoveSnapshot(
  moveId: number,
  move: CounterplanMoveRecord,
  adoptionRate: number,
  path: string,
): MoveSnapshot {
  assertPositiveSafeInteger(moveId, `${path}.moveId`);
  const type = parsePokemonType(move.type, `${path}.type`);
  const category = moveCategorySchema.safeParse(move.category);
  const tags = moveTagsSchema.safeParse(move.tags);
  if (!category.success || !tags.success) {
    throw new RangeError(`${path} contains invalid move metadata`);
  }
  if (
    move.power !== null &&
    (!Number.isSafeInteger(move.power) || move.power <= 0 || move.power > 300)
  ) {
    throw new RangeError(`${path}.power must be null or an integer between 1 and 300`);
  }
  if (
    move.accuracy !== null &&
    (!Number.isSafeInteger(move.accuracy) || move.accuracy < 1 || move.accuracy > 100)
  ) {
    throw new RangeError(`${path}.accuracy must be null or an integer between 1 and 100`);
  }
  assertIntegerInRange(move.priority, -7, 5, `${path}.priority`);
  if (!Number.isFinite(adoptionRate) || adoptionRate < 0 || adoptionRate > 1) {
    throw new RangeError(`${path}.adoptionRate must be between 0 and 1`);
  }
  return {
    moveId,
    type,
    category: category.data,
    power: move.power,
    accuracy: move.accuracy,
    priority: move.priority,
    tags: [...tags.data],
    adoptionRate,
  };
}

function assertRosterIdentity(
  pokemons: readonly { slot: number; pokemonId: number }[],
  path: string,
): void {
  if (pokemons.length === 0 || pokemons.length > MAX_ROSTER_SIZE) {
    throw new RangeError(`${path} must contain between 1 and ${MAX_ROSTER_SIZE} Pokemon`);
  }
  const slots = new Set<number>();
  const pokemonIds = new Set<number>();
  for (const pokemon of pokemons) {
    assertIntegerInRange(pokemon.slot, 1, MAX_ROSTER_SIZE, `${path}[].slot`);
    assertPositiveSafeInteger(pokemon.pokemonId, `${path}[].pokemonId`);
    if (slots.has(pokemon.slot) || pokemonIds.has(pokemon.pokemonId)) {
      throw new RangeError(`${path} must not contain duplicate slots or Pokemon IDs`);
    }
    slots.add(pokemon.slot);
    pokemonIds.add(pokemon.pokemonId);
  }
}

function toPartyMoves(moves: readonly CounterplanPartyMoveRecord[]): MoveSnapshot[] {
  if (moves.length === 0 || moves.length > MAX_MOVE_COUNT) {
    throw new RangeError(`party Pokemon must contain between 1 and ${MAX_MOVE_COUNT} moves`);
  }
  const slots = new Set<number>();
  const moveIds = new Set<number>();
  return [...moves]
    .sort((left, right) => left.slot - right.slot || left.moveId - right.moveId)
    .map((entry, index) => {
      assertIntegerInRange(entry.slot, 1, MAX_MOVE_COUNT, `party.moves[${index}].slot`);
      if (slots.has(entry.slot) || moveIds.has(entry.moveId)) {
        throw new RangeError("party Pokemon must not contain duplicate move slots or IDs");
      }
      slots.add(entry.slot);
      moveIds.add(entry.moveId);
      return toMoveSnapshot(entry.moveId, entry.move, 1, `party.moves[${index}]`);
    });
}

export function toPartyCounterplanCombatants(
  pokemons: readonly CounterplanPartyPokemonRecord[],
  battleLevel: number,
): MatchupMatrixCombatant[] {
  assertIntegerInRange(battleLevel, 1, 100, "rule.battleLevel");
  assertRosterIdentity(pokemons, "party.pokemons");
  return pokemons.map((entry, index) => ({
    level: battleLevel,
    combatant: {
      pokemonId: entry.pokemonId,
      types: parseTypes(entry.pokemon, `party.pokemons[${index}].pokemon`),
      stats: toStats(entry.actualStats, `party.pokemons[${index}].actualStats`),
      isMega: entry.pokemon.isMega,
      role: null,
      moves: toPartyMoves(entry.moves),
    },
  }));
}

function selectOpponentMoves(
  pokemons: readonly CounterplanArchetypePokemonRecord[],
  observations: readonly CounterplanObservedMoveRecord[],
): ReadonlyMap<number, readonly SelectedOpponentMove[]> {
  const pokemonIds = new Set(pokemons.map((pokemon) => pokemon.pokemonId));
  const observationSeqs = new Set<number>();
  const observedByPokemon = new Map<number, SelectedOpponentMove[]>();

  for (const [index, observation] of [...observations]
    .sort((left, right) => left.seq - right.seq)
    .entries()) {
    assertPositiveSafeInteger(observation.seq, `observations[${index}].seq`);
    if (observationSeqs.has(observation.seq)) {
      throw new RangeError("observations must not contain duplicate seq values");
    }
    observationSeqs.add(observation.seq);
    if (
      observation.pokemonId === null ||
      observation.moveId === null ||
      observation.move === null
    ) {
      throw new RangeError("move observations must contain Pokemon and Move references");
    }
    assertPositiveSafeInteger(observation.pokemonId, `observations[${index}].pokemonId`);
    assertPositiveSafeInteger(observation.moveId, `observations[${index}].moveId`);
    if (!pokemonIds.has(observation.pokemonId)) {
      throw new InvalidObservedMoveStateError();
    }
    const selected = observedByPokemon.get(observation.pokemonId) ?? [];
    if (!selected.some((move) => move.moveId === observation.moveId)) {
      selected.push({
        moveId: observation.moveId,
        adoptionRate: 1,
        move: observation.move,
        observed: true,
      });
    }
    if (selected.length > MAX_MOVE_COUNT) {
      throw new InvalidObservedMoveStateError();
    }
    observedByPokemon.set(observation.pokemonId, selected);
  }

  return new Map(
    pokemons.map((pokemon, pokemonIndex) => {
      const templateMoveIds = new Set<number>();
      const templateMoves = pokemon.moves
        .map((move, moveIndex): SelectedOpponentMove => {
          assertPositiveSafeInteger(
            move.moveId,
            `archetype.pokemons[${pokemonIndex}].moves[${moveIndex}].moveId`,
          );
          if (templateMoveIds.has(move.moveId)) {
            throw new RangeError("archetype Pokemon must not contain duplicate Move IDs");
          }
          templateMoveIds.add(move.moveId);
          return {
            moveId: move.moveId,
            adoptionRate: parseRate(
              move.adoptionRate,
              `archetype.pokemons[${pokemonIndex}].moves[${moveIndex}].adoptionRate`,
            ),
            move: move.move,
            observed: false,
          };
        })
        .sort(
          (left, right) => right.adoptionRate - left.adoptionRate || left.moveId - right.moveId,
        );
      const observedMoves = observedByPokemon.get(pokemon.pokemonId) ?? [];
      const observedMoveIds = new Set(observedMoves.map((move) => move.moveId));
      return [
        pokemon.pokemonId,
        [
          ...observedMoves,
          ...templateMoves.filter((move) => !observedMoveIds.has(move.moveId)),
        ].slice(0, MAX_MOVE_COUNT),
      ] as const;
    }),
  );
}

export function toArchetypeCounterplanSnapshots(
  pokemons: readonly CounterplanArchetypePokemonRecord[],
  observations: readonly CounterplanObservedMoveRecord[],
  battleLevel: number,
  playstyleNotes: string | null,
): ArchetypeCounterplanSnapshots {
  assertIntegerInRange(battleLevel, 1, 100, "rule.battleLevel");
  assertRosterIdentity(pokemons, "archetype.pokemons");
  const selectedMoves = selectOpponentMoves(pokemons, observations);

  const combatants: MatchupMatrixCombatant[] = [];
  const counterplanPokemons: CounterplanArchetypeSnapshot["pokemons"][number][] = [];
  for (const [index, entry] of pokemons.entries()) {
    const moves = selectedMoves.get(entry.pokemonId);
    if (moves === undefined) {
      throw new RangeError("selected moves are missing for an archetype Pokemon");
    }
    const usageRate = parseRate(entry.usageRate, `archetype.pokemons[${index}].usageRate`);
    const role = archetypePokemonRoleSchema.safeParse(entry.role);
    if (!role.success) {
      throw new RangeError(`archetype.pokemons[${index}].role is invalid`);
    }
    const moveSnapshots = moves.map((move, moveIndex) =>
      toMoveSnapshot(
        move.moveId,
        move.move,
        move.adoptionRate,
        `archetype.pokemons[${index}].selectedMoves[${moveIndex}]`,
      ),
    );
    combatants.push({
      level: battleLevel,
      combatant: {
        pokemonId: entry.pokemonId,
        types: parseTypes(entry.pokemon, `archetype.pokemons[${index}].pokemon`),
        stats: toStats(entry.actualStats, `archetype.pokemons[${index}].actualStats`),
        isMega: entry.pokemon.isMega,
        role: role.data,
        moves: moveSnapshots,
        isObserved: moves.some((move) => move.observed),
      },
    });
    counterplanPokemons.push({
      pokemonId: entry.pokemonId,
      usageRate,
      threatNotes: entry.threatNotes,
      moves: moveSnapshots.map((move) => ({
        moveId: move.moveId,
        tags: [...move.tags],
        adoptionRate: move.adoptionRate,
      })),
    });
  }

  return {
    combatants,
    archetype: {
      pokemons: counterplanPokemons,
      playstyleNotes,
    },
  };
}

export function resolvePriorityOpponentPokemonIds(
  defaultLeads: unknown,
  pokemons: readonly { slot: number; pokemonId: number }[],
): number[] {
  if (defaultLeads === null || (Array.isArray(defaultLeads) && defaultLeads.length === 0)) {
    return [];
  }
  if (!Array.isArray(defaultLeads)) {
    throw new RangeError("archetype.defaultLeads must be an array or null");
  }
  assertRosterIdentity(pokemons, "archetype.pokemons");
  const slotToPokemonId = new Map(pokemons.map((pokemon) => [pokemon.slot, pokemon.pokemonId]));
  const leadSlots = new Set<number>();
  const priorityIds = new Set<number>();
  const result: number[] = [];
  for (const [index, value] of defaultLeads.entries()) {
    if (typeof value !== "number") {
      throw new RangeError(`archetype.defaultLeads[${index}] must be an integer`);
    }
    assertIntegerInRange(value, 1, MAX_ROSTER_SIZE, `archetype.defaultLeads[${index}]`);
    if (leadSlots.has(value)) {
      throw new RangeError("archetype.defaultLeads must not contain duplicate slots");
    }
    leadSlots.add(value);
    const pokemonId = slotToPokemonId.get(value);
    if (pokemonId === undefined || priorityIds.has(pokemonId)) {
      throw new RangeError("archetype.defaultLeads contains an invalid slot or duplicate Pokemon");
    }
    priorityIds.add(pokemonId);
    result.push(pokemonId);
  }
  return result;
}
