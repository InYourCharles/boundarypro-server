import mongoose from 'mongoose';
import AppError from './AppError.js';
import { parseManilaDate, addDays } from './dates.js';

// Helpers that read and check query-string values such as ?status=active&sort=-dateHired.
// Each one returns undefined when the parameter was not sent (so the controller just skips it)
// and answers 400 with a clear message when the value is not acceptable.

// Express turns ?x=1&x=2 into an array and ?x[a]=1 into an object. Only plain text is accepted
// here, which also stops anyone from sneaking a MongoDB operator like { $ne: null } into a filter.
function readText(query, name) {
  const value = query[name];
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw new AppError(`Invalid ${name}`, 400);
  return value.trim() || undefined;
}

// ?q=juan -> "juan" (at most 50 characters)
export function readSearch(query) {
  const text = readText(query, 'q');
  if (text && text.length > 50) throw new AppError('Search text must be at most 50 characters', 400);
  return text;
}

// A value that must be one of a fixed list, for example ?status=active
export function readChoice(query, name, allowed) {
  const value = readText(query, name);
  if (value !== undefined && !allowed.includes(value)) {
    throw new AppError(`Invalid ${name}. Use one of: ${allowed.join(', ')}`, 400);
  }
  return value;
}

// A whole number such as ?limit=10. Text, decimals, negatives and anything outside min..max answer 400.
export function readInteger(query, name, { min, max = Infinity }) {
  const text = readText(query, name);
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value < min || value > max) {
    const allowed = max === Infinity ? `${min} or more` : `from ${min} to ${max}`;
    throw new AppError(`Invalid ${name}. Use a whole number ${allowed}`, 400);
  }
  return value;
}

// ?includeInactive=true or ?includeInactive=false
export function readBoolean(query, name) {
  const text = readText(query, name);
  if (text === undefined) return undefined;
  if (text !== 'true' && text !== 'false') throw new AppError(`Invalid ${name}. Use true or false`, 400);
  return text === 'true';
}

// A MongoDB id, for example ?driver=6650c1f2a9b3c4d5e6f70811
export function readObjectId(query, name) {
  const value = readText(query, name);
  if (value !== undefined && !mongoose.isObjectIdOrHexString(value)) {
    throw new AppError(`Invalid ${name} ID`, 400);
  }
  return value;
}

// A calendar day written YYYY-MM-DD, read as a Manila day. Returns the start of that day.
export function readDate(query, name) {
  const text = readText(query, name);
  if (text === undefined) return undefined;
  const date = parseManilaDate(text);
  if (!date) throw new AppError(`Invalid ${name}. Use a real date written YYYY-MM-DD`, 400);
  return date;
}

// ?from=2026-10-01&to=2026-10-10 -> a MongoDB range covering both whole days (Manila time).
// Returns undefined when neither was sent.
export function readDateRange(query) {
  const from = readDate(query, 'from');
  const to = readDate(query, 'to');
  if (from && to && from > to) throw new AppError('from must not be after to', 400);
  if (!from && !to) return undefined;

  const range = {};
  if (from) range.$gte = from;
  if (to) range.$lt = addDays(to, 1); // `to` is a whole day, so stop at the start of the next one
  return range;
}

// ?sort=-dateHired -> { dateHired: -1, _id: 1 }. A leading minus means descending.
// The _id keeps the order the same on every request when two records tie.
export function readSort(query, allowedFields, fallback) {
  const text = readText(query, 'sort') ?? fallback;
  const direction = text.startsWith('-') ? -1 : 1;
  const field = text.replace(/^-/, '');
  if (!allowedFields.includes(field)) {
    throw new AppError(`Invalid sort. Use one of: ${allowedFields.join(', ')} (put - in front for descending)`, 400);
  }
  return { [field]: direction, _id: 1 };
}

// Puts a backslash in front of characters that mean something inside a regular expression
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Turns what the user typed into a case-insensitive "contains" pattern. The special characters are
// escaped, so searching for "a.b" looks for the text a.b and not "a, anything, b".
export function searchPattern(text) {
  return new RegExp(escapeRegex(text), 'i');
}

// Same idea for plate numbers. "nea4521", "NEA 4521" and "nea  4521" all find the plate stored as
// "NEA 4521", because spaces are ignored in what was typed and allowed anywhere in the stored plate.
export function plateSearchPattern(text) {
  const characters = text.replace(/\s+/g, '').split('');
  return new RegExp(characters.map(escapeRegex).join('\\s*'), 'i');
}
