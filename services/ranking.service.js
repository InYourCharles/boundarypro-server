import Driver from '../models/Driver.js';
import { getLedgers } from './balance.service.js';
import { todayManila, startOfDayManila, formatManilaDate } from '../utils/dates.js';

// GET /api/drivers/ranking: a punctuality score for each driver.
//
//   onTimeRate     = charges paid in full by their due date / charges that are paid or already past due
//   attendanceRate = completed / (completed + no-show)
//   clearanceRate  = 1 - outstanding / totalCharged
//   score          = round(100 * (0.60 * onTimeRate + 0.25 * attendanceRate + 0.15 * clearanceRate))

const round2 = (x) => Math.round(x * 100) / 100;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function rankDrivers({ limit, minAssignments, includeInactive }) {
  const today = todayManila();
  const drivers = await Driver.find(includeInactive ? {} : { status: 'active' }).lean();
  const ledgers = await getLedgers(drivers.map((driver) => driver._id));

  const ranked = [];
  const unranked = [];

  for (const driver of drivers) {
    const { charges } = ledgers.get(String(driver._id));
    const who = { driverId: driver._id, fullName: driver.fullName };

    // Too little history would give a misleading score (one paid charge is "100%"), so these drivers are listed apart
    if (charges.length === 0) {
      unranked.push({ ...who, reason: 'No completed or no-show assignments yet' });
      continue;
    }
    if (charges.length < minAssignments) {
      unranked.push({ ...who, reason: `Only ${plural(charges.length, 'chargeable assignment')} (minimum is ${minAssignments})` });
      continue;
    }

    // A charge that is unpaid and not yet past due is neither on time nor late, so it is left out of the on-time rate
    const judged = charges.filter((charge) => charge.outstanding === 0 || today > charge.dueDate);
    if (judged.length === 0) {
      unranked.push({ ...who, reason: 'No charge is paid or past due yet' });
      continue;
    }

    // "On time" = fully paid on or before the due day (compare whole Manila days, not exact moments)
    const onTime = judged.filter((charge) => charge.outstanding === 0 && startOfDayManila(charge.paidInFullAt) <= charge.dueDate);
    const completed = charges.filter((charge) => charge.type === 'boundary').length;
    const totalCharged = charges.reduce((sum, charge) => sum + charge.amount, 0);
    const outstanding = charges.reduce((sum, charge) => sum + charge.outstanding, 0);

    // The score uses the exact rates; only the numbers shown are rounded
    const onTimeRate = onTime.length / judged.length;
    const attendanceRate = completed / charges.length;
    const clearanceRate = 1 - outstanding / totalCharged;
    const score = Math.round(100 * (0.6 * onTimeRate + 0.25 * attendanceRate + 0.15 * clearanceRate));

    ranked.push({
      ...who,
      score,
      onTimeRate: round2(onTimeRate),
      attendanceRate: round2(attendanceRate),
      clearanceRate: round2(clearanceRate),
      outstanding,
    });
  }

  // Highest score first; if tied, the driver who owes less; if still tied, A to Z
  ranked.sort((a, b) => b.score - a.score || a.outstanding - b.outstanding || a.fullName.localeCompare(b.fullName));
  unranked.sort((a, b) => a.fullName.localeCompare(b.fullName));

  return {
    asOf: formatManilaDate(today),
    ranked: ranked.slice(0, limit).map((driver, index) => ({ rank: index + 1, ...driver })),
    unranked,
  };
}
