import Assignment from '../models/Assignment.js';
import Payment from '../models/Payment.js';
import Maintenance from '../models/Maintenance.js';
import Vehicle from '../models/Vehicle.js';
import Driver from '../models/Driver.js';
import { getLedgers } from './balance.service.js';
import { addDays, formatManilaDate } from '../utils/dates.js';

// GET /api/stats/collections: how much was owed, how much came in, and what it cost, for a range of Manila days.
//
//   expected         = charges of completed and no-show assignments dated in the range
//   collected        = payments made in the range
//   collectionRate   = min(collected, expected) / expected * 100   (capped so old debt can't push it past 100%)
//   maintenanceCost  = cost of services completed in the range
//   netCash          = collected - maintenanceCost
//   overdueTotal     = everything overdue today, across all drivers

const add = (totals, key, amount) => totals.set(key, (totals.get(key) ?? 0) + amount);

// `from` and `to` are the first and last day of the range (Manila midnights), `groupBy` is 'day' or 'month'
export async function collectionStats({ from, to, groupBy }) {
  const inRange = { $gte: from, $lt: addDays(to, 1) }; // up to the end of the `to` day

  const [assignments, payments, services, vehicles, drivers] = await Promise.all([
    Assignment.find({ date: inRange, status: { $in: ['completed', 'no-show'] } }).select('date vehicle boundaryDue penaltyFee').lean(),
    Payment.find({ paidAt: inRange }).select('paidAt amountPaid').lean(),
    Maintenance.find({ serviceDate: inRange, status: 'completed' }).select('cost').lean(),
    Vehicle.find().select('plateNumber status').lean(),
    Driver.find().select('_id').lean(),
  ]);

  // A day ("2026-10-10") or a month ("2026-10"), always read on the Manila calendar so an 11 PM payment stays on its own day
  const periodOf = (date) => (groupBy === 'month' ? formatManilaDate(date).slice(0, 7) : formatManilaDate(date));

  const expectedByPeriod = new Map();
  const collectedByPeriod = new Map();
  const revenueByVehicle = new Map();
  let expected = 0;
  for (const assignment of assignments) {
    const charge = assignment.boundaryDue + assignment.penaltyFee; // a no-show has boundaryDue 0, so this is just the penalty
    expected += charge;
    add(expectedByPeriod, periodOf(assignment.date), charge);
    add(revenueByVehicle, String(assignment.vehicle), charge);
  }

  let collected = 0;
  for (const payment of payments) {
    collected += payment.amountPaid;
    add(collectedByPeriod, periodOf(payment.paidAt), payment.amountPaid);
  }

  const maintenanceCost = services.reduce((sum, service) => sum + service.cost, 0);

  // One entry for every day (or month) in the range, including the quiet ones
  const series = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const period = periodOf(day);
    if (series.at(-1)?.period !== period) {
      series.push({ period, expected: expectedByPeriod.get(period) ?? 0, collected: collectedByPeriod.get(period) ?? 0 });
    }
  }

  // Best and worst earners. A vehicle with no charge in the range is "idle", which is different from earning little,
  // so it is listed separately and never counts as the lowest. Retired vehicles are not expected to earn.
  const earners = vehicles
    .filter((vehicle) => revenueByVehicle.has(String(vehicle._id)))
    .map((vehicle) => ({ _id: vehicle._id, plateNumber: vehicle.plateNumber, revenue: revenueByVehicle.get(String(vehicle._id)) }))
    .sort((a, b) => b.revenue - a.revenue || a.plateNumber.localeCompare(b.plateNumber));
  const idleVehicles = vehicles
    .filter((vehicle) => vehicle.status !== 'retired' && !revenueByVehicle.has(String(vehicle._id)))
    .map((vehicle) => ({ _id: vehicle._id, plateNumber: vehicle.plateNumber }))
    .sort((a, b) => a.plateNumber.localeCompare(b.plateNumber));

  const ledgers = await getLedgers(drivers.map((driver) => driver._id));
  const overdueTotal = [...ledgers.values()].reduce((sum, ledger) => sum + ledger.overdueAmount, 0);

  return {
    range: { from: formatManilaDate(from), to: formatManilaDate(to), groupBy },
    expected,
    collected,
    collectionRate: expected > 0 ? Math.round((Math.min(collected, expected) / expected) * 1000) / 10 : 0, // one decimal
    maintenanceCost,
    netCash: collected - maintenanceCost,
    overdueTotal,
    topVehicle: earners[0] ?? null,
    lowestVehicle: earners.at(-1) ?? null,
    idleVehicles,
    series,
  };
}
