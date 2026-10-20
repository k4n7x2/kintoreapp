// Expression selection is independent of the selected day's outfit.
// All candidates must already belong to a single logical outfit version.
export function choosePortraitVariant(candidates, previous = null, reroll = false, random = Math.random) {
  if (!candidates.length) return null;
  if (!reroll && previous && candidates.some((item) => item.src === previous.src)) return previous;
  const alternatives = candidates.filter((item) => item.src !== previous?.src);
  const pool = alternatives.length ? alternatives : candidates;
  const index = Math.max(0, Math.min(pool.length - 1, Math.floor(random() * pool.length)));
  return pool[index];
}
