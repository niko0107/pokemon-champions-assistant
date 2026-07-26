import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import type { ItemSummary, MoveSummary, PokemonSummary } from "@pokemon-champions/shared";
import { partyQueryKeys, searchItems, searchMoves, searchPokemons } from "./party-api";
import { useDebouncedValue } from "./use-debounced-value";

interface PickerShellProps<T> {
  label: string;
  placeholder: string;
  selectedLabel: string | null;
  queryKey: readonly unknown[];
  queryFn: (query: string) => Promise<{ items: T[] }>;
  getKey: (item: T) => number;
  getLabel: (item: T) => string;
  onSelect: (item: T) => void;
  onClear?: () => void;
  excludedIds?: ReadonlySet<number>;
  disabled?: boolean;
}

function SearchPicker<T>({
  label,
  placeholder,
  selectedLabel,
  queryKey,
  queryFn,
  getKey,
  getLabel,
  onSelect,
  onClear,
  excludedIds,
  disabled,
}: PickerShellProps<T>) {
  const id = useId();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim());
  const search = useQuery({
    queryKey: [...queryKey, debouncedQuery],
    queryFn: () => queryFn(debouncedQuery),
    enabled: !disabled && debouncedQuery.length >= 2,
  });
  const availableItems = (search.data?.items ?? []).filter(
    (item) => !excludedIds?.has(getKey(item)),
  );

  if (selectedLabel) {
    return (
      <div>
        <span className="mb-2 block text-sm font-bold text-slate-800">{label}</span>
        <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
          <span className="min-w-0 truncate text-sm font-semibold text-blue-950">
            {selectedLabel}
          </span>
          {onClear && (
            <button
              type="button"
              onClick={() => {
                onClear();
                setQuery("");
              }}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-blue-800 outline-none hover:bg-blue-100 focus-visible:ring-2 focus-visible:ring-blue-700"
            >
              選び直す
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-bold text-slate-800">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-3 focus:ring-blue-100 disabled:bg-slate-100"
      />
      {query.trim().length > 0 && query.trim().length < 2 && (
        <p className="mt-2 text-xs text-slate-500">2文字以上入力してください。</p>
      )}
      {debouncedQuery.length >= 2 && search.isLoading && (
        <p role="status" className="mt-2 text-xs text-slate-500">
          候補を検索中…
        </p>
      )}
      {search.isError && (
        <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
          候補を取得できませんでした。
        </p>
      )}
      {search.isSuccess && debouncedQuery.length >= 2 && availableItems.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">一致する候補はありません。</p>
      )}
      {availableItems.length > 0 && (
        <ul className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {availableItems.map((item) => (
            <li key={getKey(item)}>
              <button
                type="button"
                onClick={() => {
                  onSelect(item);
                  setQuery("");
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-800 outline-none hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-700"
              >
                {getLabel(item)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PokemonPicker(props: {
  selected: PokemonSummary | null;
  excludedIds: ReadonlySet<number>;
  onSelect: (pokemon: PokemonSummary) => void;
  onClear: () => void;
}) {
  return (
    <SearchPicker
      label="ポケモン"
      placeholder="名前を2文字以上入力"
      selectedLabel={
        props.selected
          ? `${props.selected.nameJa}（No.${props.selected.dexNo} / ${props.selected.form}）`
          : null
      }
      queryKey={partyQueryKeys.pokemonSearch("")}
      queryFn={searchPokemons}
      getKey={(item: PokemonSummary) => item.id}
      getLabel={(item) => `${item.nameJa}（${item.form}）`}
      onSelect={props.onSelect}
      onClear={props.onClear}
      excludedIds={props.excludedIds}
    />
  );
}

export function ItemPicker(props: {
  selected: ItemSummary | null;
  onSelect: (item: ItemSummary) => void;
  onClear: () => void;
}) {
  return (
    <SearchPicker
      label="持ち物（任意）"
      placeholder="持ち物名を2文字以上入力"
      selectedLabel={props.selected?.nameJa ?? null}
      queryKey={partyQueryKeys.itemSearch("")}
      queryFn={searchItems}
      getKey={(item: ItemSummary) => item.id}
      getLabel={(item) => item.nameJa}
      onSelect={props.onSelect}
      onClear={props.onClear}
    />
  );
}

export function MovePicker(props: {
  pokemonId: number | null;
  slot: number;
  selected: MoveSummary | null;
  excludedIds: ReadonlySet<number>;
  onSelect: (move: MoveSummary) => void;
  onClear: () => void;
}) {
  const pokemonId = props.pokemonId ?? 0;
  return (
    <SearchPicker
      label={`技 ${props.slot}`}
      placeholder={props.pokemonId ? "技名を2文字以上入力" : "先にポケモンを選択"}
      selectedLabel={props.selected?.nameJa ?? null}
      queryKey={partyQueryKeys.moveSearch(pokemonId, "")}
      queryFn={(query) => searchMoves(pokemonId, query)}
      getKey={(item: MoveSummary) => item.id}
      getLabel={(item) => `${item.nameJa} / ${item.type}`}
      onSelect={props.onSelect}
      onClear={props.onClear}
      excludedIds={props.excludedIds}
      disabled={!props.pokemonId}
    />
  );
}
