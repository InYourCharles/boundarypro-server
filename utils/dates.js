// All business dates in BoundaryPro are Asia/Manila calendar days.
// Manila is UTC+8 all year (the Philippines has no daylight saving time),
// so a fixed 8-hour offset is exact and we do not need a date library.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Midnight at the start of the Manila day that contains `date`.
// Example: 2026-10-10T16:30Z is 00:30 on Oct 11 in Manila, so it returns 2026-10-10T16:00Z.
export function startOfDayManila(date) {
  // Shift the clock to Manila so the UTC day boundary matches the Manila day boundary,
  // cut off the time of day, then shift back.
  const manilaClock = date.getTime() + MANILA_OFFSET_MS;
  const startOfManilaDay = Math.floor(manilaClock / DAY_MS) * DAY_MS;
  return new Date(startOfManilaDay - MANILA_OFFSET_MS);
}

// Start of today in Manila. Every "as of today" rule in the app uses this one function.
export function todayManila() {
  return startOfDayManila(new Date());
}

// Moves a date forward (or backward with a negative number) by whole days.
// Safe because a Manila day is always exactly 24 hours.
export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

// Whole Manila days from `from` to `to` (negative when `to` is earlier).
export function daysBetween(from, to) {
  return Math.round((startOfDayManila(to) - startOfDayManila(from)) / DAY_MS);
}

// Date -> "2026-10-10", the Manila calendar day, used in API responses.
export function formatManilaDate(date) {
  // After shifting to Manila time, the first 10 characters of the ISO string are the Manila day.
  return new Date(date.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

// "2026-10-10" -> start of that Manila day. Returns null for anything that is not a real calendar date,
// so the caller can answer 400 (for example "2026-02-30" or "10/10/2026").
export function parseManilaDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return null; // for example month 13
  // JavaScript rolls "2026-02-30" over to March 2, so check that the date survived unchanged.
  return formatManilaDate(date) === text ? date : null;
}

// The 1st of the month that contains `date`, at midnight Manila time ("2026-10-10" -> "2026-10-01").
export function startOfMonthManila(date) {
  return parseManilaDate(`${formatManilaDate(date).slice(0, 7)}-01`);
}

// True when `date` falls on a Manila day after today. We compare whole days, not exact moments,
// so a date picker value of "today" is still accepted in the early morning.
export function isFutureDate(date) {
  return startOfDayManila(date) > todayManila();
}
