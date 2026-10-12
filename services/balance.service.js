import Assignment from '../models/Assignment.js';
import Driver from '../models/Driver.js';
import Payment from '../models/Payment.js';
import AppError from '../utils/AppError.js';
import { todayManila, addDays, formatManilaDate } from '../utils/dates.js';
import { SHIFT_ORDER } from '../utils/shifts.js';

// Works out what a driver owes.
//
// A "charge" is money owed for one assignment (BR3):
//   completed -> boundaryDue (plus penaltyFee, which is 0 for a completed shift)
//   no-show   -> penaltyFee only, because the boundary is waived
// Scheduled, active and cancelled assignments are not charges.
// Every charge is due one day after its assignment date (BR5).
// Payments are applied to the oldest charge first, FIFO (BR6).

// Pure function: no database inside, so the same code serves one driver or the whole list.
// `assignments` and `payments` belong to ONE driver. `today` is the start of today in Manila.
function buildLedger(assignments, payments, today) {
  const charges = assignments
    .filter((a) => a.status === 'completed' || a.status === 'no-show')
    .map((a) => ({
      assignmentId: a._id,
      date: a.date,
      shift: a.shift,
      type: a.status === 'completed' ? 'boundary' : 'no-show penalty',
      amount: a.status === 'completed' ? a.boundaryDue + a.penaltyFee : a.penaltyFee,
      dueDate: addDays(a.date, 1),
    }))
    .sort((x, y) => x.date - y.date || SHIFT_ORDER[x.shift] - SHIFT_ORDER[y.shift]); // oldest first

  // Running total of payments after each payment. It tells us the moment a charge was fully paid.
  let running = 0;
  const timeline = [...payments]
    .sort((a, b) => a.paidAt - b.paidAt)
    .map((p) => ({ paidAt: p.paidAt, runningTotal: (running += p.amountPaid) }));
  const totalPaid = running;

  let chargedSoFar = 0;
  for (const charge of charges) {
    const chargedBefore = chargedSoFar;
    chargedSoFar += charge.amount;

    // FIFO: the first `totalPaid` pesos go to the oldest charges, so this charge gets whatever is left after the older ones
    charge.paid = Math.min(charge.amount, Math.max(0, totalPaid - chargedBefore));
    charge.outstanding = charge.amount - charge.paid;
    charge.overdue = charge.outstanding > 0 && today > charge.dueDate; // BR5: due today is not overdue yet

    // The payment that lifted the running total of payments up to the running total of charges finished this charge
    const finishing = timeline.find((t) => t.runningTotal >= chargedSoFar);
    charge.paidInFullAt = charge.outstanding === 0 && finishing ? finishing.paidAt : null;
  }

  const overdueCharges = charges.filter((c) => c.overdue);
  return {
    charges,
    totalCharged: chargedSoFar,
    totalPaid,
    balance: chargedSoFar - totalPaid,
    overdueAmount: overdueCharges.reduce((sum, c) => sum + c.outstanding, 0),
    overdueCount: overdueCharges.length,
  };
}

// Puts documents into one list per driver, keyed by the driver's id as text
function groupByDriver(documents) {
  const groups = new Map();
  for (const doc of documents) {
    const key = String(doc.driver);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
  }
  return groups;
}

// Ledgers for many drivers with two queries in total, instead of two queries per driver.
// Returns a Map: driver id (text) -> ledger. A driver with no charges gets an empty ledger.
export async function getLedgers(driverIds) {
  const [assignments, payments] = await Promise.all([
    Assignment.find({ driver: { $in: driverIds }, status: { $in: ['completed', 'no-show'] } }).lean(),
    Payment.find({ driver: { $in: driverIds } }).lean(),
  ]);
  const assignmentsByDriver = groupByDriver(assignments);
  const paymentsByDriver = groupByDriver(payments);

  const today = todayManila();
  const ledgers = new Map();
  for (const id of driverIds) {
    const key = String(id);
    ledgers.set(key, buildLedger(assignmentsByDriver.get(key) ?? [], paymentsByDriver.get(key) ?? [], today));
  }
  return ledgers;
}

export async function getLedger(driverId) {
  const ledgers = await getLedgers([driverId]);
  return ledgers.get(String(driverId));
}

// GET /api/drivers/:id/balance: the ledger in the shape the API returns (dates as Manila days, internal fields left out)
export async function getBalanceReport(driverId) {
  const driver = await Driver.findById(driverId).select('fullName').lean();
  if (!driver) throw new AppError('Driver not found', 404);

  const ledger = await getLedger(driver._id);
  return {
    driverId: driver._id,
    fullName: driver.fullName,
    asOf: formatManilaDate(todayManila()),
    totalCharged: ledger.totalCharged,
    totalPaid: ledger.totalPaid,
    balance: ledger.balance,
    overdueAmount: ledger.overdueAmount,
    overdueCount: ledger.overdueCount,
    charges: ledger.charges.map((charge) => ({
      assignmentId: charge.assignmentId, // lets the screen use a stable key and link back to the assignment
      date: formatManilaDate(charge.date),
      shift: charge.shift,
      type: charge.type,
      amount: charge.amount,
      paid: charge.paid,
      outstanding: charge.outstanding,
      dueDate: formatManilaDate(charge.dueDate),
      overdue: charge.overdue,
    })),
  };
}
