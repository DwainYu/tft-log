import { encounterRepository } from "../../data/tft/repositories";
import type { EncounterData } from "../../data/tft/types";
import { Select } from "../ui/Field";

/**
 * Opening encounter picker.
 *
 * Three answers matter and all three stay distinguishable:
 *  - `""`         → 未记录 (nothing chosen — the state of every old match)
 *  - the none id  → 本局确实没有开局事件
 *  - any other id → 该开局事件生效
 *
 * The catalog is set-scoped and hand-maintained, and it may legitimately be
 * empty for a future set. Rather than inventing options, that case renders a
 * read-only control that says so.
 */
export function EncounterSelector({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
}): React.ReactNode {
  const encounters = encounterRepository.getEncounters();

  if (encounters.length === 0) {
    return (
      <Select id={id} value="" disabled>
        <option value="">当前赛季没有已收录的开局事件</option>
      </Select>
    );
  }

  // The "nothing happened" outcome is a real answer, so it sits up top beside
  // 未记录 rather than disappearing inside the longer list.
  const none = encounters.filter((e) => e.isNone);
  const named = encounters.filter((e) => !e.isNone);
  const selected = encounterRepository.getEncounterById(value);

  return (
    <>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">未记录</option>
        {none.map((e) => (
          <option key={e.id} value={e.id}>
            {encounterLabel(e)}
          </option>
        ))}
        <optgroup label="赛季开局事件">
          {named.map((e) => (
            <option key={e.id} value={e.id}>
              {encounterLabel(e)}
            </option>
          ))}
        </optgroup>
      </Select>
      {selected && (
        <p className="mt-1 text-[11px] leading-relaxed text-ink-600">{selected.description}</p>
      )}
    </>
  );
}

/** "纹章合奏（拉克丝）" — the champion is the actor the wiki pairs it with. */
export function encounterLabel(encounter: EncounterData): string {
  return encounter.champion ? `${encounter.name}（${encounter.champion}）` : encounter.name;
}

/** Fallback for ids the catalog no longer carries; keeps the raw id visible. */
export function encounterNameOrId(id?: string): string | undefined {
  if (!id) return undefined;
  return encounterRepository.getEncounterById(id)?.name ?? id;
}
