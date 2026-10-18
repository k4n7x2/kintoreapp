// SD栞タップの抽選・連打履歴・本文検査。DOM・時刻・乱数をここでは取得しない。
export const SD_TOUCH_CONFIG = Object.freeze({
  normalWeight: 0.60,
  screenWeight: 0.35,
  rareWeight: 0.05,
  repeatWindowMs: 5000,
  idleResetMs: 8000,
  maxTapHistory: 64
});
export const SD_TOUCH_COUNTS = Object.freeze({
  "touch.normal": 12, "touch.record": 4, "touch.calendar": 4,
  "touch.analysis": 4, "touch.repeat": 4, "touch.rare": 2
});
const touchPages = new Set(["record", "calendar", "analysis"]);

export function chooseSdTouchGroup(page, random, repeat = false, config = SD_TOUCH_CONFIG) {
  if (!touchPages.has(page)) return null;
  if (repeat) return "touch.repeat";
  const roll = Number.isFinite(random) ? Math.max(0, Math.min(random, 1 - Number.EPSILON)) : 0;
  if (roll < config.normalWeight) return "touch.normal";
  if (roll < config.normalWeight + config.screenWeight) return "touch." + page;
  return "touch.rare";
}

// performance.now() の値を呼び出し元が渡す。経過時間のみメモリに保存する。
export function registerSdTap(previous, at, config = SD_TOUCH_CONFIG) {
  const source = Array.isArray(previous) ? previous : [];
  const last = source[source.length - 1];
  const expired = !Number.isFinite(last) || at < last || at - last >= config.idleResetMs;
  const taps = (expired ? [] : source.filter(t => Number.isFinite(t) &&
    t <= at && at - t < config.idleResetMs)).slice(1 - config.maxTapHistory);
  const history = [...taps, at];
  const repeat = history.filter(t => at - t <= config.repeatWindowMs).length >= 3;
  return { history, repeat };
}

export function chooseLineWithoutRepeat(entries, previous, fallback, random) {
  const valid = Array.isArray(entries) ? entries.map(row =>
    typeof row === "string" ? row : row?.text).filter(line =>
      typeof line === "string" && line.trim()) : [];
  const alternatives = valid.filter(line => line !== previous);
  const pool = alternatives.length ? alternatives : valid;
  const roll = Number.isFinite(random) ? Math.max(0, Math.min(random, 1 - Number.EPSILON)) : 0;
  return pool.length ? pool[Math.floor(roll * pool.length)] : fallback;
}

export function isValidSdTouchData(data) {
  if (!data || data.version !== "0.1" || !data.groups ||
      Object.keys(data.groups).length !== Object.keys(SD_TOUCH_COUNTS).length) return false;
  const ids = new Set(), texts = new Set();
  for (const [group, count] of Object.entries(SD_TOUCH_COUNTS)) {
    const rows = data.groups[group];
    if (!Array.isArray(rows) || rows.length !== count) return false;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const expectedId = group + "." + String(i + 1).padStart(2, "0");
      if (row?.id !== expectedId || typeof row.text !== "string" ||
          !row.text.trim() || ids.has(row.id) || texts.has(row.text)) return false;
      ids.add(row.id);
      texts.add(row.text);
    }
  }
  return ids.size === 30;
}
