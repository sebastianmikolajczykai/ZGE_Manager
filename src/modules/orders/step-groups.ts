/**
 * Grupy kroków równoległych. Krok z `parallel = true` idzie razem z poprzednim,
 * więc grupa to krok „zwykły” i wszystkie następujące po nim kroki równoległe.
 * Krok bez kroków równoległych to grupa jednoosobowa (zachowanie jak dotąd).
 */
export interface GroupedStep {
  position: number;
  parallel: boolean;
}

/** Numery kroków (pozycje) w grupie, do której należy wskazany krok. */
export function groupOf(steps: readonly GroupedStep[], position: number): number[] {
  const sorted = [...steps].sort((a, b) => a.position - b.position);
  const index = sorted.findIndex((s) => s.position === position);
  if (index < 0) return [];
  let start = index;
  while (start > 0 && sorted[start]?.parallel) start--;
  let end = index;
  while (end + 1 < sorted.length && sorted[end + 1]?.parallel) end++;
  return sorted.slice(start, end + 1).map((s) => s.position);
}

/** Pozycje grupy następnej po grupie wskazanego kroku; pusta lista = to była ostatnia grupa. */
export function nextGroup(steps: readonly GroupedStep[], position: number): number[] {
  const last = Math.max(...groupOf(steps, position));
  const following = steps.filter((s) => s.position > last).map((s) => s.position);
  return following.length === 0 ? [] : groupOf(steps, Math.min(...following));
}

/** Pozycje pierwszej grupy (startuje przy przyjęciu zlecenia). */
export function firstGroup(steps: readonly GroupedStep[]): number[] {
  const positions = steps.map((s) => s.position);
  return positions.length === 0 ? [] : groupOf(steps, Math.min(...positions));
}
