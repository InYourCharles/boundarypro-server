import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { readDate, readChoice } from '../utils/query.js';
import { todayManila, startOfMonthManila, daysBetween } from '../utils/dates.js';
import { collectionStats } from '../services/stats.service.js';

const MAX_RANGE_DAYS = 366;

// GET /api/stats/collections?from=2026-10-01&to=2026-10-10&groupBy=day
// Without dates the range is the current month so far: the 1st up to today.
export const getCollectionStats = asyncHandler(async (req, res) => {
  const to = readDate(req.query, 'to') ?? todayManila();
  const from = readDate(req.query, 'from') ?? startOfMonthManila(to);
  const groupBy = readChoice(req.query, 'groupBy', ['day', 'month']) ?? 'day';

  if (from > to) throw new AppError('from must not be after to', 400);
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) throw new AppError(`The range cannot be longer than ${MAX_RANGE_DAYS} days`, 400);

  res.json(await collectionStats({ from, to, groupBy }));
});
