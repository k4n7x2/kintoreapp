// A weekly rule applies only within its ISO-date interval.
// Weekdays use 1=Monday through 7=Sunday, bit 0 through bit 6.
export function weekdaysToMask(days) {
  if (!Array.isArray(days) || !days.length || days.length > 7 ||
      new Set(days).size !== days.length ||
      days.some(day => !Number.isInteger(day) || day < 1 || day > 7)) return null;
  return days.reduce((mask, day) => mask | (1 << (day - 1)), 0);
}

export function maskToWeekdays(mask) {
  return Array.from({length: 7}, (_, i) => i + 1).filter(day => (mask & (1 << (day - 1))) !== 0);
}

export function previousISODate(date) {
  const [year, month, day] = date.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return [previous.getUTCFullYear(), String(previous.getUTCMonth() + 1).padStart(2, "0"),
    String(previous.getUTCDate()).padStart(2, "0")].join("-");
}

export function calendarWeekday(date) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function recurringOn(date, rules) {
  const bit = 1 << (calendarWeekday(date) - 1);
  return rules.some(rule => rule.start_on <= date && (!rule.end_on || date <= rule.end_on) &&
    (rule.weekdays_mask & bit) !== 0);
}

// An explicit per-day exception wins even against a legacy one-off planned flag.
export function effectivePlan(date, manualPlanned, rules, override = null) {
  if (override !== null && override !== undefined) return Number(override) === 1;
  return Boolean(manualPlanned) || recurringOn(date, rules);
}
