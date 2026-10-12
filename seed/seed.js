// Demo data for BoundaryPro. Run it with:  npm run seed
//
// WARNING: this ERASES the drivers, vehicles, assignments, payments and maintenance collections of
// the database named in MONGO_URI, then inserts a fresh fleet.
//
// Every date is counted from today in Manila (0 = today, -5 = five days ago, 2 = in two days), so the
// data always looks current. Run the seed again on any day to refresh it, for example before the defense.
//
// The tables below are written by hand, on purpose, so the examples in the proposal come out exactly:
//   Juan Dela Cruz   charged 960, paid 500, owes 460 (3 overdue charges)
//   ranking scores   Rogelio 100, Ernesto 89, Juan 42, and Marites too new to be ranked
//   stats            last 14 days: expected 42350, collected 38900, rate 91.9, maintenance 6200,
//                    net cash 32700, overdue 5870, top vehicle PUJ 7340, lowest NEA 4570
//   maintenance due  PUJ 7315 overdue, NEA 4618 never serviced, NEA 4533 due soon
// The README lists the requests to run and the values to expect.
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Driver from '../models/Driver.js';
import Vehicle from '../models/Vehicle.js';
import Assignment from '../models/Assignment.js';
import Payment from '../models/Payment.js';
import Maintenance from '../models/Maintenance.js';
import { todayManila, addDays, formatManilaDate } from '../utils/dates.js';
import penaltyFor from '../utils/penalty.js';

const MODELS = [Driver, Vehicle, Assignment, Payment, Maintenance];

// Three records get a fixed id. They are the ids used in the proposal's examples, so those example
// requests can be pasted as they are. Every other record gets a normal random id.
const JUAN_ID = '6650c1f2a9b3c4d5e6f70811';
const NEA_4521_ID = '6650c1f2a9b3c4d5e6f70921';
const NO_SHOW_DEMO_ID = '6650c1f2a9b3c4d5e6f70a07';

// ---------------------------------------------------------------------------------------------
// DRIVERS. `key` is only a nickname used inside this file to link assignments and payments.
// ---------------------------------------------------------------------------------------------
const DRIVERS = [
  { key: 'rogelio', fullName: 'Rogelio Pangilinan', licenseNumber: 'N01-18-204517', contactNumber: '09171230001', address: 'Purok 4, Brgy. Bagong Sikat, Cabanatuan City', status: 'active', hiredDaysAgo: 700 }, // pays every day: the perfect driver
  { key: 'ernesto', fullName: 'Ernesto Dizon', licenseNumber: 'N02-19-318842', contactNumber: '09171230002', address: '12 Mabini St., Brgy. Sangitan, Cabanatuan City', status: 'active', hiredDaysAgo: 540 }, // good, but his last boundary is unpaid
  { _id: JUAN_ID, key: 'juan', fullName: 'Juan Dela Cruz', licenseNumber: 'N01-21-482913', contactNumber: '09171230003', address: 'Blk 3 Lot 9, Brgy. Caalibangbangan, Cabanatuan City', status: 'active', hiredDaysAgo: 160 }, // the driver with an overdue balance
  { key: 'marites', fullName: 'Marites Manalo', licenseNumber: 'N03-24-117264', contactNumber: '09171230004', address: 'Purok 2, Brgy. Valdefuente, Cabanatuan City', status: 'active', hiredDaysAgo: 12 }, // new: too few assignments to rank
  { key: 'danilo', fullName: 'Danilo Hizon', licenseNumber: 'N01-16-093375', contactNumber: '09171230005', address: '45 Rizal Ave., Brgy. Dicarma, Cabanatuan City', status: 'active', hiredDaysAgo: 900 }, // busiest jeepney driver, pays in weekly lumps
  { key: 'arnel', fullName: 'Arnel Bautista', licenseNumber: 'N02-20-256108', contactNumber: '09171230006', address: 'Purok 7, Brgy. Kapitan Pepe, Cabanatuan City', status: 'active', hiredDaysAgo: 330 }, // pays late, owes the most
  { key: 'wilfredo', fullName: 'Wilfredo Sunga', licenseNumber: 'N01-15-071926', contactNumber: '09171230007', address: 'Brgy. Magsaysay Sur, Cabanatuan City', status: 'suspended', hiredDaysAgo: 1100 }, // suspended: cannot be assigned
  { key: 'rolando', fullName: 'Rolando Quiambao', licenseNumber: 'N03-17-140553', contactNumber: '09171230008', address: 'Brgy. Aduas Norte, Cabanatuan City', status: 'inactive', hiredDaysAgo: 800 }, // left the company
];

// ---------------------------------------------------------------------------------------------
// VEHICLES. odometerKm is the reading today. The last-service fields are not listed here: they are
// copied from each vehicle's newest completed maintenance record below.
// ---------------------------------------------------------------------------------------------
const VEHICLES = [
  { plateNumber: 'PUJ 7340', type: 'jeepney', model: 'Sarao Jeepney', boundaryRate: 1000, odometerKm: 48900, status: 'available' }, // highest earner
  { plateNumber: 'PUJ 7315', type: 'jeepney', model: 'Francisco Motors Jeepney', boundaryRate: 900, odometerKm: 66620, status: 'available' }, // overdue for service
  { plateNumber: 'PUJ 7352', type: 'jeepney', model: 'Isuzu Elf Jeepney', boundaryRate: 900, odometerKm: 39640, status: 'available' },
  { plateNumber: 'PUJ 7361', type: 'jeepney', model: 'Sarao Jeepney', boundaryRate: 850, odometerKm: 53120, status: 'available' },
  { plateNumber: 'PUJ 7378', type: 'jeepney', model: 'Hyundai H100 Jeepney', boundaryRate: 950, odometerKm: 73200, status: 'available' },
  { _id: NEA_4521_ID, plateNumber: 'NEA 4521', type: 'tricycle', model: 'Honda TMX 155 + sidecar', boundaryRate: 300, odometerKm: 22380, status: 'available' },
  { plateNumber: 'NEA 4533', type: 'tricycle', model: 'Kawasaki Barako 175 + sidecar', boundaryRate: 350, odometerKm: 19350, status: 'available' }, // due soon for service
  { plateNumber: 'NEA 4570', type: 'tricycle', model: 'Yamaha YTX 125 + sidecar', boundaryRate: 300, odometerKm: 31600, status: 'available' }, // lowest earner
  { plateNumber: 'NEA 4590', type: 'tricycle', model: 'Honda XRM 125 + sidecar', boundaryRate: 350, odometerKm: 20400, status: 'under-maintenance' }, // in the shop right now
  { plateNumber: 'NEA 4618', type: 'tricycle', model: 'Suzuki GD110 + sidecar', boundaryRate: 300, odometerKm: 9300, status: 'available' }, // never serviced: no record at all
];

// ---------------------------------------------------------------------------------------------
// MAINTENANCE. day = when the service happened; odometerKm = the reading at that service.
// nextDueInDays / nextDueInKm are optional: a shop sticker saying when the next service is due.
// The three completed services between day -13 and today cost 2200 + 1900 + 2100 = 6200.
// ---------------------------------------------------------------------------------------------
const MAINTENANCE = [
  { plateNumber: 'PUJ 7340', day: -95, type: 'general-service', description: 'Tune-up, grease and filter change', cost: 3100, status: 'completed', odometerKm: 43200 },
  { plateNumber: 'PUJ 7340', day: -9, type: 'oil-change', description: 'Engine oil, oil filter and grease', cost: 2200, status: 'completed', odometerKm: 48200, nextDueInDays: 90, nextDueInKm: 5000 },
  { plateNumber: 'PUJ 7315', day: -160, type: 'oil-change', description: 'Engine oil and oil filter', cost: 1900, status: 'completed', odometerKm: 56000 },
  { plateNumber: 'PUJ 7315', day: -71, type: 'general-service', description: 'Tune-up and clutch adjustment', cost: 2600, status: 'completed', odometerKm: 61200 },
  { plateNumber: 'PUJ 7352', day: -70, type: 'oil-change', description: 'Engine oil and oil filter', cost: 2000, status: 'completed', odometerKm: 34800 },
  { plateNumber: 'PUJ 7352', day: -4, type: 'brakes', description: 'New brake pads, drums resurfaced', cost: 2100, status: 'completed', odometerKm: 39500 },
  { plateNumber: 'PUJ 7361', day: -30, type: 'oil-change', description: 'Engine oil and oil filter', cost: 1800, status: 'completed', odometerKm: 52000 },
  { plateNumber: 'PUJ 7378', day: -45, type: 'general-service', description: 'Tune-up and valve adjustment', cost: 2400, status: 'completed', odometerKm: 70300 },
  { plateNumber: 'NEA 4521', day: -62, type: 'oil-change', description: 'Engine oil', cost: 600, status: 'completed', odometerKm: 17200 },
  { plateNumber: 'NEA 4521', day: -10, type: 'tires', description: 'Three new tires', cost: 1900, status: 'completed', odometerKm: 21500 },
  { plateNumber: 'NEA 4533', day: -40, type: 'oil-change', description: 'Engine oil', cost: 650, status: 'completed', odometerKm: 14700 },
  { plateNumber: 'NEA 4570', day: -25, type: 'oil-change', description: 'Engine oil', cost: 600, status: 'completed', odometerKm: 30100 },
  { plateNumber: 'NEA 4590', day: -55, type: 'general-service', description: 'Tune-up and chain adjustment', cost: 900, status: 'completed', odometerKm: 17800 },
  { plateNumber: 'NEA 4590', day: -1, type: 'brakes', description: 'Brake overhaul, waiting for parts', cost: 1200, status: 'in-progress', odometerKm: 20400 }, // why NEA 4590 is under-maintenance
];

// ---------------------------------------------------------------------------------------------
// ASSIGNMENTS. book(driver, plate, shift, status, [days], extra) adds one assignment per day listed.
// The boundary, penalty and slot flag are worked out from the status further down.
// ---------------------------------------------------------------------------------------------
const ASSIGNMENTS = [];

function book(driver, plateNumber, shift, status, days, extra = {}) {
  for (const day of days) ASSIGNMENTS.push({ driver, plateNumber, shift, status, day, ...extra });
}

// Rogelio: the perfect driver. Completes every shift and pays on time.
book('rogelio', 'NEA 4521', 'morning', 'completed', [-20, -19, -18, -17, -16, -14, -13, -12, -11, -9, -8, -7, -6, -4, -3, -2, -1]);
book('rogelio', 'NEA 4521', 'morning', 'cancelled', [-10], { notes: 'Tricycle was in the shop for new tires' });
book('rogelio', 'NEA 4521', 'morning', 'active', [0]);
book('rogelio', 'NEA 4521', 'morning', 'scheduled', [1, 2, 3]);

// Juan: three completed shifts and one no-show. Owes 460, all of it overdue.
book('juan', 'NEA 4521', 'afternoon', 'completed', [-5, -4, -2]);
book('juan', 'NEA 4521', 'afternoon', 'no-show', [-3], { notes: 'Did not report and did not call' });
book('juan', 'NEA 4521', 'afternoon', 'cancelled', [-12], { notes: 'Driver asked to cancel: family matter' });
book('juan', 'NEA 4533', 'afternoon', 'scheduled', [1]);

// Marites: hired 12 days ago, only 2 chargeable assignments, so she is not ranked.
// Her shift today is still "scheduled" (she has not shown up): use it to try the no-show penalty.
book('marites', 'NEA 4570', 'morning', 'completed', [-8]);
book('marites', 'NEA 4618', 'morning', 'no-show', [-4], { notes: 'Did not report' });
book('marites', 'NEA 4570', 'morning', 'scheduled', [0], { _id: NO_SHOW_DEMO_ID, notes: 'Not at the terminal yet' });
book('marites', 'NEA 4570', 'morning', 'scheduled', [1, 2]);

// Ernesto: seven completed shifts on PUJ 7352; the first six are paid on time, the last is unpaid.
book('ernesto', 'PUJ 7352', 'morning', 'completed', [-19, -17, -11, -9, -7, -5, -3]);
book('ernesto', 'PUJ 7352', 'morning', 'cancelled', [-14], { notes: 'Franchise inspection' });
book('ernesto', 'PUJ 7352', 'morning', 'active', [0]);
book('ernesto', 'PUJ 7352', 'morning', 'scheduled', [1, 3]);

// Danilo: drives PUJ 7340 (the top earner) and fills in on other vehicles in the afternoon.
book('danilo', 'PUJ 7340', 'morning', 'completed', [-20, -19, -17, -16, -13, -12, -11, -8, -7, -6, -3, -2]);
book('danilo', 'PUJ 7340', 'morning', 'active', [0]);
book('danilo', 'PUJ 7340', 'morning', 'scheduled', [1, 2]);
book('danilo', 'NEA 4533', 'afternoon', 'completed', [-10, -5, -4]);
book('danilo', 'PUJ 7378', 'afternoon', 'completed', [-9, -1]);

// Arnel: afternoon driver of PUJ 7315, one no-show, pays late.
book('arnel', 'PUJ 7315', 'afternoon', 'completed', [-18, -17, -16, -13, -12, -10, -9, -7, -6, -4, -3]);
book('arnel', 'PUJ 7315', 'afternoon', 'no-show', [-5], { notes: 'No call, no show' });
book('arnel', 'PUJ 7315', 'afternoon', 'cancelled', [-14], { notes: 'Route flooded, trips suspended' });
book('arnel', 'PUJ 7315', 'afternoon', 'scheduled', [0, 1, 2]);
book('arnel', 'NEA 4618', 'morning', 'completed', [-11, -8, -2]);

// Wilfredo: suspended after repeated trouble. Nothing is booked for him after day -3.
book('wilfredo', 'PUJ 7361', 'afternoon', 'completed', [-20, -19, -13, -12, -11, -9, -8, -6]);
book('wilfredo', 'PUJ 7361', 'afternoon', 'no-show', [-18], { notes: 'Did not report; final warning given' });
book('wilfredo', 'PUJ 7378', 'afternoon', 'completed', [-7]);
book('wilfredo', 'NEA 4570', 'night', 'completed', [-5]);
book('wilfredo', 'NEA 4533', 'night', 'completed', [-3]);

// Rolando: inactive (left the company). Nothing is booked for him after day -3.
book('rolando', 'PUJ 7378', 'morning', 'completed', [-20, -19, -18, -17, -16, -15, -13, -12, -11, -9]);
book('rolando', 'NEA 4570', 'afternoon', 'completed', [-10]);
book('rolando', 'NEA 4590', 'night', 'completed', [-8, -6, -4, -3]);
book('rolando', 'PUJ 7352', 'afternoon', 'completed', [-7, -5]);

// ---------------------------------------------------------------------------------------------
// PAYMENTS. Cash and 14:00 unless a row says otherwise. Payments are applied to the oldest charge
// first, so the amounts below decide who is on time and who owes what.
// ---------------------------------------------------------------------------------------------
const DEFAULT_PAYMENT_TIME = '14:00';

const PAYMENTS = [
  // Rogelio pays every second day, covering that day and the day before, so nothing is ever late
  { driver: 'rogelio', day: -19, amountPaid: 600 },
  { driver: 'rogelio', day: -17, amountPaid: 600 },
  { driver: 'rogelio', day: -16, amountPaid: 300 },
  { driver: 'rogelio', day: -13, amountPaid: 600 },
  { driver: 'rogelio', day: -11, amountPaid: 600 },
  { driver: 'rogelio', day: -8, amountPaid: 600 },
  { driver: 'rogelio', day: -6, amountPaid: 600 },
  { driver: 'rogelio', day: -3, amountPaid: 600 },
  { driver: 'rogelio', day: -1, amountPaid: 600 },

  // Ernesto pays the previous day's boundary by GCash before his shift (06:40); the shift on day -3 is unpaid
  { driver: 'ernesto', day: -18, amountPaid: 900, method: 'gcash', time: '06:40', referenceNo: 'GC-7140385521' },
  { driver: 'ernesto', day: -16, amountPaid: 900, method: 'gcash', time: '06:40', referenceNo: 'GC-7140662094' },
  { driver: 'ernesto', day: -10, amountPaid: 900, method: 'gcash', time: '06:40', referenceNo: 'GC-7142208867' },
  { driver: 'ernesto', day: -8, amountPaid: 900, method: 'gcash', time: '06:40', referenceNo: 'GC-7142574310' },
  { driver: 'ernesto', day: -6, amountPaid: 900, method: 'gcash', time: '06:40', referenceNo: 'GC-7142971456' },
  { driver: 'ernesto', day: -4, amountPaid: 900, method: 'gcash', time: '06:40', referenceNo: 'GC-7143390782' },

  // Juan paid 500 of 960: the first boundary in full, 200 of the second
  { driver: 'juan', day: -4, amountPaid: 300, time: '21:20' },
  { driver: 'juan', day: -3, amountPaid: 200, method: 'gcash', time: '21:20', referenceNo: 'GC-7143122509', remarks: 'Partial payment' },

  { driver: 'marites', day: -7, amountPaid: 300, time: '14:30' },

  // Danilo pays in lumps; the one at 05:50 on the first day of the stats window checks Manila-time handling
  { driver: 'danilo', day: -15, amountPaid: 3000, method: 'bank-transfer', time: '10:15', referenceNo: 'BT-48210937' },
  { driver: 'danilo', day: -13, amountPaid: 1000, time: '05:50', remarks: 'Paid at the garage before the shift' },
  { driver: 'danilo', day: -8, amountPaid: 3350, method: 'bank-transfer', time: '10:15', referenceNo: 'BT-48226415' },
  { driver: 'danilo', day: -2, amountPaid: 4650, method: 'bank-transfer', time: '10:15', referenceNo: 'BT-48239078' },
  { driver: 'danilo', day: 0, amountPaid: 1000, method: 'bank-transfer', time: '08:05', referenceNo: 'BT-48241563' },

  // Arnel always pays a few days late; the last payment is made late in the evening
  { driver: 'arnel', day: -14, amountPaid: 2700, time: '21:45' },
  { driver: 'arnel', day: -7, amountPaid: 3900, method: 'gcash', time: '21:45', referenceNo: 'GC-7142744018' },
  { driver: 'arnel', day: -1, amountPaid: 2280, time: '23:30' },

  { driver: 'wilfredo', day: -17, amountPaid: 1700, time: '20:30' },
  { driver: 'wilfredo', day: -9, amountPaid: 2720, time: '20:30' },
  { driver: 'wilfredo', day: -3, amountPaid: 3500, time: '20:30' },

  { driver: 'rolando', day: -16, amountPaid: 3800, method: 'bank-transfer', time: '15:00', referenceNo: 'BT-48208841' },
  { driver: 'rolando', day: -9, amountPaid: 4750, time: '15:00' },
  { driver: 'rolando', day: -4, amountPaid: 3750, method: 'gcash', time: '15:00', referenceNo: 'GC-7143364207' },
];

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

// "06:40" on a given Manila day -> the exact moment (the day starts at Manila midnight)
function atTime(manilaMidnight, hhmm) {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return new Date(manilaMidnight.getTime() + (hours * 60 + minutes) * 60 * 1000);
}

// A vehicle's newest completed service, or undefined if it was never serviced
function newestCompletedService(plateNumber) {
  const completed = MAINTENANCE.filter((m) => m.plateNumber === plateNumber && m.status === 'completed');
  return completed.sort((a, b) => b.day - a.day)[0];
}

// ---------------------------------------------------------------------------------------------
// The seed itself
// ---------------------------------------------------------------------------------------------
async function seed() {
  const { MONGO_URI } = process.env;
  if (!MONGO_URI) {
    throw new Error('MONGO_URI must be set. Copy .env.example to .env and fill it in.');
  }

  await connectDB(MONGO_URI);
  const today = todayManila();

  // connectDB has already built the indexes, so just start from empty
  await Promise.all(MODELS.map((model) => model.deleteMany({})));

  // Drivers
  const driverId = {};
  for (const { key, hiredDaysAgo, ...fields } of DRIVERS) {
    const driver = await Driver.create({ ...fields, dateHired: addDays(today, -hiredDaysAgo) });
    driverId[key] = driver._id;
  }

  // Vehicles: last service date and odometer come from the newest completed maintenance record,
  // the same thing the API does when a service is completed (BR8)
  const vehicleByPlate = {};
  for (const row of VEHICLES) {
    const lastService = newestCompletedService(row.plateNumber);
    vehicleByPlate[row.plateNumber] = await Vehicle.create({
      ...row,
      lastServiceDate: lastService ? addDays(today, lastService.day) : undefined,
      lastServiceOdometerKm: lastService ? lastService.odometerKm : 0,
    });
  }

  await Maintenance.insertMany(
    MAINTENANCE.map(({ plateNumber, day, nextDueInDays, nextDueInKm, ...fields }) => {
      const serviceDate = addDays(today, day);
      return {
        ...fields,
        vehicle: vehicleByPlate[plateNumber]._id,
        serviceDate,
        nextDueDate: nextDueInDays ? addDays(serviceDate, nextDueInDays) : undefined,
        nextDueOdometerKm: nextDueInKm ? fields.odometerKm + nextDueInKm : undefined,
      };
    })
  );

  await Assignment.insertMany(
    ASSIGNMENTS.map(({ driver, plateNumber, day, shift, status, ...extra }) => {
      const vehicle = vehicleByPlate[plateNumber];
      const isNoShow = status === 'no-show';
      return {
        ...extra, // the optional fixed _id and notes
        driver: driverId[driver],
        vehicle: vehicle._id,
        date: addDays(today, day),
        shift,
        status,
        boundaryDue: isNoShow ? 0 : vehicle.boundaryRate, // BR1 rate snapshot; BR3 waives it on a no-show
        penaltyFee: isNoShow ? penaltyFor(vehicle.boundaryRate) : 0,
        holdsSlot: status === 'scheduled' || status === 'active', // finished or cancelled slots are free again
        startOdometerKm: status === 'active' ? vehicle.odometerKm : undefined, // an active shift has started
      };
    })
  );

  await Payment.insertMany(
    PAYMENTS.map(({ driver, day, time = DEFAULT_PAYMENT_TIME, ...fields }) => ({
      ...fields,
      driver: driverId[driver],
      paidAt: atTime(addDays(today, day), time),
    }))
  );

  printSummary(today, driverId, vehicleByPlate);
}

function printSummary(today, driverId, vehicleByPlate) {
  console.log(`Seeded "${mongoose.connection.name}". Everything that was there before was erased.`);
  console.log(
    `  ${DRIVERS.length} drivers, ${VEHICLES.length} vehicles, ${ASSIGNMENTS.length} assignments, ` +
      `${PAYMENTS.length} payments, ${MAINTENANCE.length} maintenance records`
  );
  console.log(`  TODAY in Manila: ${formatManilaDate(today)}`);

  console.log('\nValues for the README test list (the dates move with the day you run the seed):');
  console.log(`  Stats range         from=${formatManilaDate(addDays(today, -13))}&to=${formatManilaDate(today)}`);
  console.log(`  TODAY+2             ${formatManilaDate(addDays(today, 2))}  (two days from now)`);

  console.log('\nDriver ids:');
  for (const { key, fullName, status } of DRIVERS) {
    console.log(`  ${fullName.padEnd(20)} ${driverId[key]}  ${status}`);
  }
  console.log('\nVehicle ids:');
  for (const { plateNumber, status } of VEHICLES) {
    console.log(`  ${plateNumber.padEnd(20)} ${vehicleByPlate[plateNumber]._id}  ${status}`);
  }
  console.log(`\nMarites's shift today (try the no-show on it): ${NO_SHOW_DEMO_ID}`);
}

try {
  await seed();
} catch (err) {
  console.error(`Seeding failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
