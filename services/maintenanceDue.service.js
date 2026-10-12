import Vehicle from '../models/Vehicle.js';
import Maintenance from '../models/Maintenance.js';
import { todayManila, addDays, daysBetween, formatManilaDate } from '../utils/dates.js';

// BR8 in code: which vehicles need a service.
// A vehicle is "overdue" once it has reached its service limit, either in kilometres or in days,
// and "due soon" once it is within a margin of that limit. The worse of the two checks wins.

export const DEFAULT_MARGINS = { withinDays: 14, withinKm: 500 };

const number = (n) => n.toLocaleString('en-US'); // 5420 -> "5,420"
const days = (n) => (n === 1 ? '1 day' : `${n} days`);

// The newest completed service of each vehicle, as a Map: vehicle id (text) -> maintenance record.
// One query for any number of vehicles. Its nextDue values (if it set any) override the vehicle's default interval.
export async function newestServices(vehicleIds) {
  const services = await Maintenance.find({ vehicle: { $in: vehicleIds }, status: 'completed' })
    .sort({ serviceDate: -1, _id: -1 }) // newest first, so the first one we see per vehicle is the newest
    .lean();

  const newest = new Map();
  for (const service of services) {
    const key = String(service.vehicle);
    if (!newest.has(key)) newest.set(key, service);
  }
  return newest;
}

// Judges ONE vehicle. `lastService` is its newest completed service, or undefined if there is none.
// Returns null when nothing needs attention (and for retired vehicles, which are out of service for good).
// This is the only place the rule lives: the list below and the booking warning both call it.
export function evaluateVehicle(vehicle, lastService, today, margins = DEFAULT_MARGINS) {
  if (vehicle.status === 'retired') return null;

  const summary = {
    _id: vehicle._id,
    plateNumber: vehicle.plateNumber,
    inShop: vehicle.status === 'under-maintenance', // already being serviced, so the screen can show "In shop"
  };

  if (!vehicle.lastServiceDate) {
    return { ...summary, severity: 'overdue', kmSinceService: null, daysSinceService: null, percentUsed: null, reasons: ['No service record'] };
  }

  const kmSince = vehicle.odometerKm - vehicle.lastServiceOdometerKm;
  const daysSince = daysBetween(vehicle.lastServiceDate, today);

  // The service itself may have said when the next one is due; if not, use the vehicle's normal interval
  const kmLimit = lastService?.nextDueOdometerKm ?? vehicle.lastServiceOdometerKm + vehicle.serviceIntervalKm;
  const dateLimit = lastService?.nextDueDate ?? addDays(vehicle.lastServiceDate, vehicle.serviceIntervalDays);

  const intervalKm = kmLimit - vehicle.lastServiceOdometerKm; // the limit, counted from the last service
  const intervalDays = daysBetween(vehicle.lastServiceDate, dateLimit);
  const kmLeft = kmLimit - vehicle.odometerKm;
  const daysLeft = daysBetween(today, dateLimit);

  const kmOverdue = kmLeft <= 0;
  const daysOverdue = daysLeft <= 0; // overdue on the limit day itself: "today >= dateLimit"
  const kmDueSoon = kmLeft <= margins.withinKm;
  const daysDueSoon = daysLeft <= margins.withinDays;
  if (!kmDueSoon && !daysDueSoon) return null;

  // One reason per check that fired, worded like the examples in the proposal
  const reasons = [];
  if (kmOverdue) {
    reasons.push(`${number(kmSince)} km since last service (limit ${number(intervalKm)})`);
  } else if (kmDueSoon) {
    reasons.push(`${number(kmSince)} km since last service (due at ${number(intervalKm)}, within ${number(margins.withinKm)})`);
  }
  if (daysOverdue) {
    reasons.push(`${days(daysSince)} since last service (limit ${intervalDays})`);
  } else if (daysDueSoon) {
    reasons.push(`${days(daysSince)} since last service (due at ${intervalDays}, within ${margins.withinDays})`);
  }

  // How much of the interval is used up, by whichever check is further along (Math.max(..., 1) avoids dividing by 0)
  const used = Math.max(kmSince / Math.max(intervalKm, 1), daysSince / Math.max(intervalDays, 1));

  return {
    ...summary,
    severity: kmOverdue || daysOverdue ? 'overdue' : 'due-soon',
    kmSinceService: kmSince,
    daysSinceService: daysSince,
    percentUsed: Math.round(100 * used),
    reasons,
  };
}

// GET /api/vehicles/maintenance-due: every vehicle that is overdue or due soon, most urgent first
export async function findMaintenanceDue({ withinDays, withinKm }) {
  const today = todayManila();
  const vehicles = await Vehicle.find().lean(); // retired ones are dropped by evaluateVehicle
  const newest = await newestServices(vehicles.map((vehicle) => vehicle._id));

  const due = vehicles
    .map((vehicle) => evaluateVehicle(vehicle, newest.get(String(vehicle._id)), today, { withinDays, withinKm }))
    .filter((item) => item !== null);

  // Overdue before due-soon, then the vehicle that has used more of its interval, then the plate so the order never jumps around.
  // A vehicle with no service record has percentUsed null, which counts as 0 here.
  const rank = (item) => (item.severity === 'overdue' ? 0 : 1);
  due.sort((a, b) => rank(a) - rank(b) || (b.percentUsed ?? 0) - (a.percentUsed ?? 0) || a.plateNumber.localeCompare(b.plateNumber));

  return { asOf: formatManilaDate(today), count: due.length, vehicles: due };
}
