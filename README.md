# BoundaryPro Server

**Know who owes, who is booked, and which unit needs a mechanic before the day starts.**

The REST API of BoundaryPro, a fleet and boundary management system for tricycle and jeepney operators. It is built with Node.js, Express and MongoDB (Mongoose). The React app that uses it lives in a separate repository, `boundarypro-client`.

Advanced Web Programming (CTADWEBL), School of Architecture, Technology, and Computing, NU Clark. Final project, A.Y. 2026-2027.

## Contents

1. [Project, group and concept](#project-group-and-concept)
2. [What the application does and the data it processes](#what-the-application-does-and-the-data-it-processes)
3. [Features](#features)
4. [Tech stack](#tech-stack)
5. [Setup](#setup)
6. [Project structure](#project-structure)
7. [How a request is handled](#how-a-request-is-handled)
8. [API documentation](#api-documentation)
9. [The six processing endpoints](#the-six-processing-endpoints)
10. [Request test list](#request-test-list)
11. [Screenshots](#screenshots)
12. [Known limitations](#known-limitations)

## Project, group and concept

| | |
|---|---|
| **System name** | BoundaryPro |
| **Tagline** | Know who owes, who is booked, and which unit needs a mechanic before the day starts. |
| **Group** | [Group name] |
| **Course and section** | CTADWEBL, [Section] |

### Group members

| Member | GitHub account | Main contributions |
|---|---|---|
| [Member 1 full name] | [github username] | [files and features this member wrote] |
| [Member 2 full name] | [github username] | [files and features this member wrote] |
| [Member 3 full name] | [github username] | [files and features this member wrote] |
| [Member 4 full name] | [github username] | [files and features this member wrote] |
| [Member 5 full name] | [github username] | [files and features this member wrote] |

### Concept

In many Philippine towns, tricycle and jeepney owners lease their units to drivers on a daily **boundary** system: the driver pays a fixed amount per shift to the owner and keeps the rest of what he earns. Most small operators run this on notebooks, Messenger threads and memory, which causes four recurring problems:

1. **Unpaid boundaries pile up quietly.** Nobody knows a driver's running balance or how many days he is overdue.
2. **Units get double-assigned.** Two drivers are promised the same vehicle, or one driver is booked on two units in the same shift.
3. **No-shows have no record or consequence.** Reliable and unreliable drivers look the same on paper.
4. **Maintenance is reactive.** Units are serviced after they break down, so the operator loses income for every day the unit is off the road.

BoundaryPro replaces the notebook with a system that computes balances, blocks conflicting assignments, enforces the assignment rules and flags vehicles for servicing before they fail.

| Persona (there are no logins) | What they need | Main data |
|---|---|---|
| Operator / owner | Collections, overdue drivers, earnings per vehicle, maintenance costs | Statistics, ranking |
| Dispatcher | Schedule drivers on vehicles without conflicts, record shift outcomes | Assignments |
| Cashier / bookkeeper | Record boundary payments, see balances | Payments, balances |
| Fleet supervisor | Know which units are due for service | Maintenance |

## What the application does and the data it processes

The API stores five related collections in MongoDB. Every document has `createdAt` and `updatedAt` (Mongoose `timestamps`).

| Collection | What it holds | Fields and rules worth knowing |
|---|---|---|
| `drivers` | The people who lease units | `fullName` (2 to 80 characters), `licenseNumber` (**unique**, shaped like `N01-21-482913`, stored in capitals), `contactNumber` (`09` plus 9 digits), `address`, `status` (`active`, `suspended`, `inactive`), `dateHired` (not in the future) |
| `vehicles` | Tricycles and jeepneys | `plateNumber` (**unique**, always stored as `ABC 1234`), `type` (`tricycle`, `jeepney`), `model`, `boundaryRate` (100 to 2000 pesos), `odometerKm`, `serviceIntervalKm` (default 5000), `serviceIntervalDays` (default 90), `lastServiceDate`, `lastServiceOdometerKm`, `status` (`available`, `under-maintenance`, `retired`) |
| `assignments` | One driver on one vehicle for one date and shift | `driver` and `vehicle` (references), `date` (stored as midnight in Manila), `shift` (`morning`, `afternoon`, `night`), `status` (`scheduled`, `active`, `completed`, `no-show`, `cancelled`), `boundaryDue` (copy of the vehicle's rate), `penaltyFee`, `startOdometerKm`, `endOdometerKm`, `holdsSlot`, `notes`. Two **partial unique indexes** (vehicle + date + shift, driver + date + shift, only while `holdsSlot` is true) make a double booking impossible at the database level |
| `payments` | Money received from a driver. Append-only: they are never edited or deleted | `driver` (reference), `assignment` (optional reference), `amountPaid` (1 to 100000), `method` (`cash`, `gcash`, `bank-transfer`), `paidAt` (not in the future), `referenceNo`, `remarks` |
| `maintenance` | Service records | `vehicle` (reference), `type` (`oil-change`, `tires`, `brakes`, `engine`, `electrical`, `general-service`, `other`), `description`, `cost`, `status` (`in-progress`, `completed`), `serviceDate`, `odometerKm`, `nextDueDate`, `nextDueOdometerKm` |

The application does not only store and show these records. It computes things from them:

| Computed value | Endpoint |
|---|---|
| A driver's running balance and overdue amount, with payments applied to the oldest charge first | `GET /api/drivers/:id/balance` |
| A punctuality score and rank for every driver | `GET /api/drivers/ranking` |
| Whether a driver and vehicle can take a date and shift, with every reason and warning | `POST /api/assignments/check-availability` |
| The assignment lifecycle, the one-time no-show penalty and the odometer update | `PATCH /api/assignments/:id/status` |
| Which vehicles are overdue or due soon for service | `GET /api/vehicles/maintenance-due` |
| Totals, collection rate, best and worst vehicle, and a day or month series | `GET /api/stats/collections` |

### Business rules

These nine rules are the single source of truth. The last column says where each one is written in the code.

| ID | Rule | Where |
|---|---|---|
| BR1 | **Rate snapshot.** A new assignment copies the vehicle's current boundary rate into `boundaryDue`, so later rate changes do not rewrite history. | `controllers/assignments.controller.js` |
| BR2 | **Shifts.** Morning is 5:00 AM to 1:00 PM, afternoon 1:00 PM to 9:00 PM, night 9:00 PM to 5:00 AM (a night shift belongs to the date it starts). A driver and a vehicle can each hold only one open (scheduled or active) assignment per date and shift. | `models/Assignment.js`, `services/availability.service.js`, `utils/shifts.js` (the server compares dates and shift names, not clock times) |
| BR3 | **Chargeable assignments.** Completed charges `boundaryDue`. No-show waives the boundary and charges only the penalty. Scheduled, active and cancelled charge nothing. | `services/balance.service.js` |
| BR4 | **Penalty.** The no-show penalty is the larger of 50 pesos or 20% of the vehicle's boundary rate, rounded to the nearest peso, and it is applied once. | `utils/penalty.js`, `services/assignmentStatus.service.js` |
| BR5 | **Due date and overdue.** A charge is due at the end of the day after the assignment date (Asia/Manila time). It is overdue when today is later than the due date and it is not fully paid. | `services/balance.service.js`, `utils/dates.js` |
| BR6 | **Payments.** Payments go to the oldest charge first (FIFO). A payment cannot exceed the driver's outstanding balance. Payments are append-only. | `services/balance.service.js`, `controllers/payments.controller.js` |
| BR7 | **Eligibility.** Only drivers with status `active` and vehicles with status `available` can be assigned. | `services/availability.service.js` |
| BR8 | **Maintenance.** A vehicle is due when the kilometers since its last service reach its service interval, or the days since its last service reach its day interval. It is due soon when within a margin (14 days or 500 km by default). An in-progress service sets the vehicle to `under-maintenance`; completing it sets the vehicle back to `available` and updates its last service date and odometer. | `services/maintenanceDue.service.js`, `controllers/maintenance.controller.js` |
| BR9 | **Delete guard.** A driver or vehicle that already has assignments, payments or maintenance history cannot be deleted. It must be set to `inactive` or `retired` instead. | `controllers/drivers.controller.js`, `controllers/vehicles.controller.js` |

## Features

- 24 REST endpoints over 5 related collections, with full CRUD on drivers and vehicles and append-only payments.
- Mongoose schemas with required fields, `min`, `max`, `enum`, `default`, `unique`, custom validators and timestamps.
- Six endpoints with real processing: FIFO balance and overdue, punctuality ranking, availability checking, rule-based status changes, maintenance-due detection and collection statistics.
- Double bookings are blocked twice: by the availability rules, and by two partial unique indexes in MongoDB, so two dispatchers booking the same slot at the same moment cannot both succeed.
- The no-show penalty is applied exactly once, even if the request is sent twice, because the status change is a single conditional update.
- One JSON error format for every failure, with a per-field `errors` list that a form can show under each input.
- Search, filter and sort on every list endpoint, with clear 400 messages for bad query values.
- All date logic uses Asia/Manila time (due dates, overdue flags, shifts, daily and monthly totals).
- A seed script that fills the database with realistic data relative to today, including the worked examples of the project proposal.

## Tech stack

| Part | Technology |
|---|---|
| Runtime | Node.js 20 or newer (ES modules) |
| Web framework | Express 4 |
| Database | MongoDB Atlas, through Mongoose 8 |
| Configuration | `dotenv` (`.env` file) |
| Browser access | `cors`, limited to the React app's address |

## Setup

### 1. What you need

- [Node.js](https://nodejs.org) 20 or newer (check with `node -v`)
- A free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster
- An API client to try the requests: Postman, Thunder Client (a VS Code extension) or Insomnia. Plain `GET` requests also work if you paste the address into a browser.

### 2. MongoDB Atlas (once)

1. Create a free **M0** cluster.
2. **Database Access**: add a database user and remember its username and password.
3. **Network Access**: add your current IP address (or allow access from anywhere while you are testing).
4. **Database, Connect, Drivers**: copy the connection string. Put the database name `boundarypro` between the `/` after `mongodb.net` and the `?`.

### 3. Install and configure

```bash
git clone <this repository's URL>
cd boundarypro-server
npm install
```

Copy the example environment file and fill in your own values. The real `.env` is ignored by Git and must never be committed.

```bash
# macOS / Linux / Git Bash
cp .env.example .env

# Windows (Command Prompt or PowerShell)
copy .env.example .env
```

### Environment variables

| Variable | Required | Meaning | Example |
|---|---|---|---|
| `PORT` | no (default 5000) | Port the API listens on | `5000` |
| `MONGO_URI` | **yes** | Atlas connection string, ending in the database name | `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/boundarypro?retryWrites=true&w=majority` |
| `CLIENT_URL` | **yes** | Address of the React app. The API accepts browser requests only from here (CORS) | `http://localhost:5173` |

If the password contains characters such as `@`, `:` or `/`, write them percent-encoded in `MONGO_URI` (for example `@` becomes `%40`). The server refuses to start, with a clear message, if `MONGO_URI` or `CLIENT_URL` is missing.

### 4. Seed the database

```bash
npm run seed
```

**Warning:** the seed erases the five collections of the database named in `MONGO_URI` before it inserts the demo data. It prints a summary like this one (the ids that are not fixed, and the dates, differ on your machine):

```text
MongoDB connected: boundarypro
Seeded "boundarypro". Everything that was there before was erased.
  8 drivers, 10 vehicles, 112 assignments, 32 payments, 14 maintenance records
  TODAY in Manila: 2026-10-10

Values for the README test list (the dates move with the day you run the seed):
  Stats range         from=2026-09-27&to=2026-10-10
  TODAY+2             2026-10-12  (two days from now)

Driver ids:
  Rogelio Pangilinan   6ac9b8407e4076de6e52a9d9  active
  Ernesto Dizon        6ac9b8407e4076de6e52a9db  active
  Juan Dela Cruz       6650c1f2a9b3c4d5e6f70811  active
  Marites Manalo       6ac9b8407e4076de6e52a9df  active
  Danilo Hizon         6ac9b8407e4076de6e52a9e1  active
  Arnel Bautista       6ac9b8407e4076de6e52a9e3  active
  Wilfredo Sunga       6ac9b8407e4076de6e52a9e5  suspended
  Rolando Quiambao     6ac9b8407e4076de6e52a9e7  inactive

Vehicle ids:
  PUJ 7340             6ac9b8407e4076de6e52a9e9  available
  PUJ 7315             6ac9b8407e4076de6e52a9eb  available
  PUJ 7352             6ac9b8407e4076de6e52a9ed  available
  PUJ 7361             6ac9b8407e4076de6e52a9ef  available
  PUJ 7378             6ac9b8407e4076de6e52a9f1  available
  NEA 4521             6650c1f2a9b3c4d5e6f70921  available
  NEA 4533             6ac9b8407e4076de6e52a9f5  available
  NEA 4570             6ac9b8407e4076de6e52a9f7  available
  NEA 4590             6ac9b8407e4076de6e52a9f9  under-maintenance
  NEA 4618             6ac9b8407e4076de6e52a9fb  available

Marites's shift today (try the no-show on it): 6650c1f2a9b3c4d5e6f70a07
```

### 5. Run the server

```bash
npm run dev     # restarts automatically when you save a file
npm start       # plain start, for the demo
```

The terminal shows:

```text
MongoDB connected: boundarypro
API listening on http://localhost:5000
```

Open <http://localhost:5000/api/drivers> in a browser. You should see the list of drivers as JSON.

| Script | What it does |
|---|---|
| `npm start` | `node server.js` |
| `npm run dev` | `node --watch server.js` (restart on change) |
| `npm run seed` | `node seed/seed.js` (wipe and refill the database) |

### Seed data

| Collection | Records | Notes |
|---|---|---|
| drivers | 8 | 6 active, 1 suspended (Wilfredo Sunga), 1 inactive (Rolando Quiambao) |
| vehicles | 10 | 5 jeepneys (`PUJ ...`) and 5 tricycles (`NEA ...`); `NEA 4590` is in the shop |
| assignments | 112 | From 20 days ago to 3 days ahead, with every status and every shift |
| payments | 32 | Cash, GCash and bank transfer |
| maintenance | 14 | One in progress, the rest completed |

The dates are relative to the day you run the seed, so the data always looks current: **run `npm run seed` again on the day of your demo.** The amounts, scores and rates do not depend on the day.

Three records have fixed ids, so the examples of the project proposal work exactly as written:

| Record | Id |
|---|---|
| Driver Juan Dela Cruz | `6650c1f2a9b3c4d5e6f70811` |
| Vehicle NEA 4521 | `6650c1f2a9b3c4d5e6f70921` |
| Marites Manalo's shift today (for the no-show demo) | `6650c1f2a9b3c4d5e6f70a07` |

Every other id is random and is printed by the seed.

## Project structure

```text
boundarypro-server/
├── .env.example                 PORT, MONGO_URI, CLIENT_URL (copy to .env, never commit .env)
├── .gitignore                   node_modules and .env
├── package.json
├── server.js                    loads .env, connects to MongoDB, then starts listening
├── app.js                       configuration and mounting only
├── config/
│   └── db.js                    MongoDB connection, then builds the indexes
├── models/                      Mongoose schemas
│   ├── Driver.js
│   ├── Vehicle.js
│   ├── Assignment.js            includes the two partial unique indexes
│   ├── Payment.js
│   └── Maintenance.js
├── routes/                      one express.Router() per resource
│   ├── drivers.routes.js
│   ├── vehicles.routes.js
│   ├── assignments.routes.js
│   ├── payments.routes.js
│   ├── maintenance.routes.js
│   └── stats.routes.js
├── controllers/                 read the request, call a service or a model, send the response
│   ├── drivers.controller.js
│   ├── vehicles.controller.js
│   ├── assignments.controller.js
│   ├── payments.controller.js
│   ├── maintenance.controller.js
│   └── stats.controller.js
├── services/                    the business rules, one file per processing endpoint
│   ├── balance.service.js            FIFO allocation, shared by balance, ranking, payments and the driver list
│   ├── ranking.service.js
│   ├── availability.service.js       shared by check-availability and create assignment
│   ├── assignmentStatus.service.js
│   ├── maintenanceDue.service.js     also used for the service warning when booking
│   └── stats.service.js
├── middleware/
│   ├── requestLogger.js
│   ├── validateObjectId.js
│   ├── notFound.js
│   └── errorHandler.js
├── utils/
│   ├── dates.js                      Asia/Manila date helpers
│   ├── AppError.js                   an error that carries its HTTP status
│   ├── asyncHandler.js               passes errors from async controllers to the error handler
│   ├── query.js                      reads and checks query-string values
│   ├── penalty.js                    the no-show penalty formula (BR4)
│   ├── shifts.js                     the order of the shifts
│   └── pick.js                       copies only the fields a client may write
└── seed/
    └── seed.js                       npm run seed
```

## How a request is handled

`app.js` registers the middleware in this order, and a request passes through them from top to bottom:

1. `cors({ origin: CLIENT_URL })`: only the React app may call the API from a browser.
2. `express.json()`: turns a JSON body into `req.body`.
3. `requestLogger`: prints one line per request.
4. The routers, mounted under `/api` (`/drivers`, `/vehicles`, `/payments`, `/maintenance`, `/assignments`, `/stats`). Routes with an `:id` run `validateObjectId` first. Static paths (`/ranking`, `/maintenance-due`, `/check-availability`) are declared before the `/:id` routes so Express does not mistake them for ids.
5. `notFound`: any request no route answered gets a JSON 404.
6. `errorHandler`: last on purpose, so it catches the errors of everything above.

The logger prints the method, URL, status and duration of each request, for example:

```text
GET /api/drivers 200 79ms
GET /api/drivers/ranking 200 32ms
POST /api/drivers 400 3ms
POST /api/drivers 409 6ms
GET /api/drivers/abc 400 1ms
GET /api/drivers/6650c1f2a9b3c4d5e6f7ffff 404 2ms
GET /api/unknown 404 1ms
```

### Error format

Every error is JSON with a `message`. Validation errors add an `errors` list with one `{ field, message }` per bad field, which the React forms show under the matching input. A refused booking adds `reasons` and `warnings`.

A single message (HTTP 404):

```jsonc
// HTTP 404 Not Found
{
  "message": "Driver not found"
}
```

Field errors (HTTP 400):

```jsonc
// HTTP 400 Bad Request
{
  "message": "Validation failed",
  "errors": [
    {
      "field": "licenseNumber",
      "message": "License number is required"
    },
    {
      "field": "fullName",
      "message": "Full name must be at least 2 characters"
    },
    {
      "field": "contactNumber",
      "message": "Contact number must be 09 followed by 9 digits"
    }
  ]
}
```

A refused booking (HTTP 409):

```jsonc
// HTTP 409 Conflict
{
  "message": "Juan Dela Cruz is already assigned to NEA 4521 on 2026-10-12 (afternoon). NEA 4521 is already assigned to Juan Dela Cruz on 2026-10-12 (afternoon)",
  "reasons": [
    {
      "code": "DRIVER_BOOKED",
      "message": "Juan Dela Cruz is already assigned to NEA 4521 on 2026-10-12 (afternoon)"
    },
    {
      "code": "VEHICLE_BOOKED",
      "message": "NEA 4521 is already assigned to Juan Dela Cruz on 2026-10-12 (afternoon)"
    }
  ],
  "warnings": [
    {
      "code": "DRIVER_OVERDUE",
      "message": "Juan Dela Cruz has 460 pesos overdue, at least one day of boundary"
    }
  ]
}
```

### Status codes

| Code | When |
|---|---|
| 200 | Successful read, update, delete or processing result |
| 201 | Successful create |
| 400 | Mongoose validation error, malformed id (`Invalid ID`), invalid query value, malformed JSON, past date, invalid status transition |
| 404 | Record not found, or an unknown route (JSON catch-all) |
| 409 | A duplicate license or plate, a double booking, deleting a record that has history (BR9), starting a service on a vehicle already in the shop. The proposal uses 409; if only the five codes of the course rubric are allowed, change the one constant `CONFLICT` in `utils/AppError.js` to `400` |
| 500 | An unexpected error. The body is always `{ "message": "Internal server error" }`; the details are written to the terminal only |

## API documentation

Base URL: `http://localhost:5000/api`. **Processing** marks the six endpoints that compute something beyond plain CRUD. The sample requests and responses below are real: they were copied from a server running on a freshly seeded database, by following the [request test list](#request-test-list) in order. Long responses are shortened with `…`.

Conventions:

- Bodies are JSON, so send the header `Content-Type: application/json` with `POST`, `PUT` and `PATCH`.
- Ids are 24-character MongoDB ObjectIds. A malformed id is a 400 (`Invalid ID`), an unknown one a 404.
- Money is in whole pesos.
- Dates you send (`date`, `from`, `to`) are written `YYYY-MM-DD` and mean a day in Manila. Stored dates come back as ISO timestamps in UTC, so an assignment on 12 October in Manila appears as `2026-10-11T16:00:00.000Z`. The processing endpoints return plain Manila days (`2026-10-12`).
- Lists are plain arrays and are not paginated. Fields a client may not write (for example `holdsSlot` of an assignment or `lastServiceDate` of a vehicle) are ignored if sent.
- The samples were captured when the seed ran on 2026-10-10, the day the proposal's examples use. Your dates move with the day you seed; the amounts, scores and rates do not.

| # | Method | Path | Purpose | Sample request | Sample response |
|---|--------|------|---------|----------------|-----------------|
| 1 | GET | `/api/drivers` | List drivers. Query: `q` (name, license or contact number), `status`, `sort` (`fullName` default, `dateHired`, `status`; `-` in front = descending). Every driver carries a computed `balance` and `overdueAmount`. Errors: 400. | `GET /api/drivers?q=juan&sort=fullName` | **200**<br>`[ { "_id": "6650c1f2a9b3c4d5e6f70811", "fullName": "Juan Dela Cruz", "status": "active", "balance": 460, "overdueAmount": 460, … } ]` |
| 2 | GET | `/api/drivers/ranking` | **Processing.** Rank drivers by punctuality score. Query: `limit` (10, max 50), `minAssignments` (3), `includeInactive` (false). Errors: 400. | `GET /api/drivers/ranking` | **200**<br>`{ "asOf": "2026-10-10", "ranked": [ { "rank": 1, "fullName": "Rogelio Pangilinan", "score": 100, "onTimeRate": 1, "attendanceRate": 1, "clearanceRate": 1, … }, { "rank": 2, "fullName": "Ernesto Dizon", "score": 89, "onTimeRate": 0.86, "attendanceRate": 1, "clearanceRate": 0.86, … }, … ], "unranked": [ { "fullName": "Marites Manalo", "reason": "Only 2 chargeable assignments (minimum is 3)", … } ] }` |
| 3 | GET | `/api/drivers/:id` | Get one driver. Errors: 400 (bad id), 404. | `GET /api/drivers/6650c1f2a9b3c4d5e6f70811` | **200**<br>`{ "_id": "6650c1f2a9b3c4d5e6f70811", "fullName": "Juan Dela Cruz", "licenseNumber": "N01-21-482913", "contactNumber": "09171230003", "status": "active", … }` |
| 4 | POST | `/api/drivers` | Create a driver. Errors: 400 (validation), 409 (license already used). | `POST /api/drivers`<br>`{ "fullName": "Pedro Penduko", "licenseNumber": "N05-22-123456", "contactNumber": "09171239999", "address": "Brgy. Sumacab Este, Cabanatuan City" }` | **201**<br>`{ "_id": "6ac9b841e349854fed9c7235", "fullName": "Pedro Penduko", "licenseNumber": "N05-22-123456", "status": "active", "dateHired": "2026-10-10T04:00:01.173Z", … }` |
| 5 | PUT | `/api/drivers/:id` | Update a driver; fields you leave out keep their value. Errors: 400, 404, 409. | `PUT /api/drivers/6ac9b841e349854fed9c7235`<br>`{ "contactNumber": "09171230000", "status": "suspended" }` | **200**<br>`{ "_id": "6ac9b841e349854fed9c7235", "fullName": "Pedro Penduko", "contactNumber": "09171230000", "status": "suspended", … }` |
| 6 | DELETE | `/api/drivers/:id` | Delete a driver. Blocked when the driver has assignments or payments (BR9). Errors: 400, 404, 409. | `DELETE /api/drivers/6ac9b841e349854fed9c7235` | **200**<br>`{ "message": "Driver deleted" }` |
| 7 | GET | `/api/drivers/:id/balance` | **Processing.** Running balance, overdue amount and charge-by-charge breakdown (FIFO). Errors: 400, 404. | `GET /api/drivers/6650c1f2a9b3c4d5e6f70811/balance` | **200**<br>`{ "driverId": "6650c1f2a9b3c4d5e6f70811", "fullName": "Juan Dela Cruz", "asOf": "2026-10-10", "totalCharged": 960, "totalPaid": 500, "balance": 460, "overdueAmount": 460, "overdueCount": 3, "charges": [ { "date": "2026-10-05", "type": "boundary", "amount": 300, "paid": 300, "outstanding": 0, "dueDate": "2026-10-06", "overdue": false, … }, { "date": "2026-10-06", "type": "boundary", "amount": 300, "paid": 200, "outstanding": 100, "dueDate": "2026-10-07", "overdue": true, … }, … ] }` |
| 8 | GET | `/api/vehicles` | List vehicles. Query: `type`, `status`, `q` (plate or model), `sort` (`plateNumber` default, `type`, `status`, `boundaryRate`, `odometerKm`). Errors: 400. | `GET /api/vehicles?type=tricycle&status=available&sort=-boundaryRate` | **200**<br>`[ { "_id": "6ac9b8407e4076de6e52a9f5", "plateNumber": "NEA 4533", "type": "tricycle", "boundaryRate": 350, "odometerKm": 19350, "status": "available", … }, { "_id": "6650c1f2a9b3c4d5e6f70921", "plateNumber": "NEA 4521", "type": "tricycle", "boundaryRate": 300, "odometerKm": 22380, "status": "available", … }, … ]` |
| 9 | GET | `/api/vehicles/maintenance-due` | **Processing.** Vehicles that are overdue or due soon for service. Query: `withinDays` (14), `withinKm` (500). Errors: 400. | `GET /api/vehicles/maintenance-due` | **200**<br>`{ "asOf": "2026-10-10", "count": 3, "vehicles": [ { "plateNumber": "PUJ 7315", "severity": "overdue", "kmSinceService": 5420, "daysSinceService": 71, "reasons": [ "5,420 km since last service (limit 5,000)" ], … }, { "plateNumber": "NEA 4618", "severity": "overdue", "kmSinceService": null, "daysSinceService": null, "reasons": [ "No service record" ], … }, … ] }` |
| 10 | GET | `/api/vehicles/:id` | Get one vehicle. Errors: 400, 404. | `GET /api/vehicles/6650c1f2a9b3c4d5e6f70921` | **200**<br>`{ "_id": "6650c1f2a9b3c4d5e6f70921", "plateNumber": "NEA 4521", "type": "tricycle", "boundaryRate": 300, "odometerKm": 22380, "status": "available", … }` |
| 11 | POST | `/api/vehicles` | Create a vehicle. The plate is stored as `ABC 1234`, so `nea4700` and `NEA 4700` are the same plate. Errors: 400, 409. | `POST /api/vehicles`<br>`{ "plateNumber": "NEA 4700", "type": "tricycle", "model": "Honda TMX 155 + sidecar", "boundaryRate": 320 }` | **201**<br>`{ "_id": "6ac9b841e349854fed9c7243", "plateNumber": "NEA 4700", "boundaryRate": 320, "odometerKm": 0, "status": "available", … }` |
| 12 | PUT | `/api/vehicles/:id` | Update a vehicle. Errors: 400, 404, 409. | `PUT /api/vehicles/6ac9b841e349854fed9c7243`<br>`{ "boundaryRate": 350, "odometerKm": 120 }` | **200**<br>`{ "_id": "6ac9b841e349854fed9c7243", "plateNumber": "NEA 4700", "boundaryRate": 350, "odometerKm": 120, "status": "available", … }` |
| 13 | DELETE | `/api/vehicles/:id` | Delete a vehicle. Blocked when it has assignments or maintenance records (BR9). Errors: 400, 404, 409. | `DELETE /api/vehicles/6ac9b841e349854fed9c7243` | **200**<br>`{ "message": "Vehicle deleted" }` |
| 14 | GET | `/api/assignments` | List assignments. Query: `from`, `to` (YYYY-MM-DD, both days included), `shift`, `status`, `driver`, `vehicle` (ids), `sort` (`date` or `-date`). Errors: 400. | `GET /api/assignments?from=2026-10-10&to=2026-10-10&shift=morning` | **200**<br>`[ { "_id": "6650c1f2a9b3c4d5e6f70a07", "driver": { "fullName": "Marites Manalo", … }, "vehicle": { "plateNumber": "NEA 4570", … }, "date": "2026-10-09T16:00:00.000Z", "shift": "morning", "status": "scheduled", "boundaryDue": 300, … }, { "_id": "6ac9b8407e4076de6e52aa1e", "driver": { "fullName": "Rogelio Pangilinan", … }, "vehicle": { "plateNumber": "NEA 4521", … }, "date": "2026-10-09T16:00:00.000Z", "shift": "morning", "status": "active", "boundaryDue": 300, … }, … ]` |
| 15 | GET | `/api/assignments/:id` | Get one assignment with its driver and vehicle details. Errors: 400, 404. | `GET /api/assignments/6650c1f2a9b3c4d5e6f70a07` | **200**<br>`{ "_id": "6650c1f2a9b3c4d5e6f70a07", "driver": { "fullName": "Marites Manalo", "licenseNumber": "N03-24-117264", … }, "vehicle": { "plateNumber": "NEA 4570", "boundaryRate": 300, … }, "shift": "morning", "status": "scheduled", "boundaryDue": 300, … }` |
| 16 | POST | `/api/assignments` | Create an assignment after running the availability rules; copies the vehicle's rate into `boundaryDue` (BR1). Errors: 400, 404, 409 (with `reasons`). | `POST /api/assignments`<br>`{ "driverId": "6650c1f2a9b3c4d5e6f70811", "vehicleId": "6650c1f2a9b3c4d5e6f70921", "date": "2026-10-12", "shift": "afternoon", "notes": "Barangay fiesta trips" }` | **201**<br>`{ "_id": "6ac9b841e349854fed9c7258", "driver": { "fullName": "Juan Dela Cruz", … }, "vehicle": { "plateNumber": "NEA 4521", … }, "shift": "afternoon", "status": "scheduled", "boundaryDue": 300, "holdsSlot": true, … }` |
| 17 | POST | `/api/assignments/check-availability` | **Processing.** Check a driver, vehicle, date and shift without saving anything. Errors: 400 (including `PAST_DATE`), 404. | `POST /api/assignments/check-availability`<br>`{ "driverId": "6650c1f2a9b3c4d5e6f70811", "vehicleId": "6650c1f2a9b3c4d5e6f70921", "date": "2026-10-12", "shift": "morning" }` | **200**<br>`{ "available": false, "reasons": [ { "code": "VEHICLE_BOOKED", "message": "NEA 4521 is already assigned to Rogelio Pangilinan on 2026-10-12 (morning)" } ], "warnings": [ { "code": "DRIVER_OVERDUE", "message": "Juan Dela Cruz has 460 pesos overdue, at least one day of boundary" } ] }` |
| 18 | PATCH | `/api/assignments/:id/status` | **Processing.** Move an assignment through its lifecycle; applies the no-show penalty once and updates the odometer. Errors: 400, 404. | `PATCH /api/assignments/6650c1f2a9b3c4d5e6f70a07/status`<br>`{ "status": "no-show" }` | **200**<br>`{ "message": "Marked as no-show. Penalty of 60 pesos charged; boundary waived.", "assignment": { "_id": "6650c1f2a9b3c4d5e6f70a07", "status": "no-show", "boundaryDue": 0, "penaltyFee": 60, "holdsSlot": false, … } }` |
| 19 | GET | `/api/payments` | List payments. Query: `driver` (id), `method`, `from`, `to`, `sort` (`-paidAt` default, `paidAt`, `amountPaid`). Errors: 400. | `GET /api/payments?driver=6650c1f2a9b3c4d5e6f70811&sort=paidAt` | **200**<br>`[ { "_id": "6ac9b8407e4076de6e52aa8c", "driver": { "fullName": "Juan Dela Cruz", … }, "amountPaid": 300, "method": "cash", "paidAt": "2026-10-06T13:20:00.000Z", … }, { "_id": "6ac9b8407e4076de6e52aa8d", "driver": { "fullName": "Juan Dela Cruz", … }, "amountPaid": 200, "method": "gcash", "paidAt": "2026-10-07T13:20:00.000Z", "referenceNo": "GC-7143122509", … } ]` |
| 20 | POST | `/api/payments` | Record a payment. It cannot be larger than the driver's outstanding balance (BR6). Errors: 400, 404. | `POST /api/payments`<br>`{ "driver": "6650c1f2a9b3c4d5e6f70811", "amountPaid": 200, "method": "gcash", "referenceNo": "GC-7144001122", "remarks": "Partial payment" }` | **201**<br>`{ "_id": "6ac9b841e349854fed9c728e", "driver": { "fullName": "Juan Dela Cruz", … }, "amountPaid": 200, "method": "gcash", "paidAt": "2026-10-10T04:00:01.500Z", "referenceNo": "GC-7144001122", … }` |
| 21 | GET | `/api/maintenance` | List maintenance records. Query: `vehicle` (id), `status`, `type`, `sort` (`-serviceDate` default, `serviceDate`, `cost`). Errors: 400. | `GET /api/maintenance?status=in-progress` | **200**<br>`[ { "_id": "6ac9b8407e4076de6e52aa0a", "vehicle": { "plateNumber": "NEA 4590", … }, "type": "brakes", "cost": 1200, "status": "in-progress", "serviceDate": "2026-10-08T16:00:00.000Z", … } ]` |
| 22 | POST | `/api/maintenance` | Log a service. In progress puts the vehicle under maintenance (BR8). Errors: 400, 404, 409. | `POST /api/maintenance`<br>`{ "vehicle": "6ac9b8407e4076de6e52a9fb", "type": "general-service", "description": "First service", "cost": 700, "odometerKm": 9320 }` | **201**<br>`{ "_id": "6ac9b841e349854fed9c729b", "vehicle": { "plateNumber": "NEA 4618", … }, "type": "general-service", "cost": 700, "status": "in-progress", "odometerKm": 9320, … }` |
| 23 | PATCH | `/api/maintenance/:id/complete` | Finish a service: the vehicle becomes available and its last service date and odometer are updated. Errors: 400, 404. | `PATCH /api/maintenance/6ac9b841e349854fed9c729b/complete`<br>`{ "cost": 750, "nextDueOdometerKm": 14300 }` | **200**<br>`{ "_id": "6ac9b841e349854fed9c729b", "vehicle": { "plateNumber": "NEA 4618", … }, "status": "completed", "cost": 750, "nextDueOdometerKm": 14300, … }` |
| 24 | GET | `/api/stats/collections` | **Processing.** Totals, collection rate, best and worst vehicles and a day or month series. Query: `from`, `to` (default: 1st of this month to today), `groupBy` (`day` or `month`). Errors: 400. | `GET /api/stats/collections?from=2026-09-27&to=2026-10-10` | **200**<br>`{ "range": { "from": "2026-09-27", "to": "2026-10-10", "groupBy": "day" }, "expected": 42350, "collected": 38900, "collectionRate": 91.9, "maintenanceCost": 6200, "netCash": 32700, "overdueTotal": 5870, "topVehicle": { "plateNumber": "PUJ 7340", "revenue": 8000, … }, "lowestVehicle": { "plateNumber": "NEA 4570", "revenue": 900, … }, "idleVehicles": [], "series": [ { "period": "2026-09-27", "expected": 4000, "collected": 1600 }, { "period": "2026-09-28", "expected": 4000, "collected": 0 }, … ] }` |

Body field names follow the collection: `POST /api/assignments` and `check-availability` use `driverId` and `vehicleId`; `POST /api/payments` uses `driver` (and an optional `assignment`); `POST /api/maintenance` uses `vehicle`.

## The six processing endpoints

### 1. `GET /api/drivers/:id/balance`

**Rule.** A charge exists for every completed assignment (`boundaryDue` plus `penaltyFee`) and every no-show (`penaltyFee` only). Each charge is due the day after its assignment date. The driver's total payments are applied to the charges oldest first (FIFO).

```text
totalCharged  = sum of all charges          totalPaid = sum of all payments
balance       = totalCharged - totalPaid
charge.paid   = FIFO share of totalPaid, capped at charge.amount
overdueAmount = outstanding of the charges where today is after the due date
```

```http
GET /api/drivers/6650c1f2a9b3c4d5e6f70811/balance
```

```jsonc
// HTTP 200 OK
{
  "driverId": "6650c1f2a9b3c4d5e6f70811",
  "fullName": "Juan Dela Cruz",
  "asOf": "2026-10-10",
  "totalCharged": 960,
  "totalPaid": 500,
  "balance": 460,
  "overdueAmount": 460,
  "overdueCount": 3,
  "charges": [
    {
      "assignmentId": "6ac9b8407e4076de6e52aa22",
      "date": "2026-10-05",
      "shift": "afternoon",
      "type": "boundary",
      "amount": 300,
      "paid": 300,
      "outstanding": 0,
      "dueDate": "2026-10-06",
      "overdue": false
    },
    {
      "assignmentId": "6ac9b8407e4076de6e52aa23",
      "date": "2026-10-06",
      "shift": "afternoon",
      "type": "boundary",
      "amount": 300,
      "paid": 200,
      "outstanding": 100,
      "dueDate": "2026-10-07",
      "overdue": true
    },
    {
      "assignmentId": "6ac9b8407e4076de6e52aa25",
      "date": "2026-10-07",
      "shift": "afternoon",
      "type": "no-show penalty",
      "amount": 60,
      "paid": 0,
      "outstanding": 60,
      "dueDate": "2026-10-08",
      "overdue": true
    },
    {
      "assignmentId": "6ac9b8407e4076de6e52aa24",
      "date": "2026-10-08",
      "shift": "afternoon",
      "type": "boundary",
      "amount": 300,
      "paid": 0,
      "outstanding": 300,
      "dueDate": "2026-10-09",
      "overdue": true
    }
  ]
}
```

Edge cases: a malformed id is 400, an unknown driver is 404, a driver with no charges gets zeros and an empty `charges` list, and a charge due today is not overdue yet.

### 2. `GET /api/drivers/ranking`

**Query.** `limit` (default 10, at most 50), `minAssignments` (default 3), `includeInactive` (default false).

**Rule.** A charge counts as on time if it was fully paid on or before its due date. Charges that are neither fully paid nor past due yet are left out of the on-time count.

```text
onTimeRate     = charges paid in full by the due date / charges that are paid or past due
attendanceRate = completed / (completed + no-show)
clearanceRate  = 1 - (outstanding / totalCharged)
score          = round(100 * (0.60 * onTimeRate + 0.25 * attendanceRate + 0.15 * clearanceRate))
```

Sorted by score (highest first), then lower outstanding, then name. A driver with fewer chargeable assignments than `minAssignments` goes to `unranked` with the reason, instead of getting a misleading 100. Suspended and inactive drivers are left out unless `includeInactive=true`.

```http
GET /api/drivers/ranking
```

```jsonc
// HTTP 200 OK
{
  "asOf": "2026-10-10",
  "ranked": [
    {
      "rank": 1,
      "driverId": "6ac9b8407e4076de6e52a9d9",
      "fullName": "Rogelio Pangilinan",
      "score": 100,
      "onTimeRate": 1,
      "attendanceRate": 1,
      "clearanceRate": 1,
      "outstanding": 0
    },
    {
      "rank": 2,
      "driverId": "6ac9b8407e4076de6e52a9db",
      "fullName": "Ernesto Dizon",
      "score": 89,
      "onTimeRate": 0.86,
      "attendanceRate": 1,
      "clearanceRate": 0.86,
      "outstanding": 900
    },
    {
      "rank": 3,
      "driverId": "6650c1f2a9b3c4d5e6f70811",
      "fullName": "Juan Dela Cruz",
      "score": 42,
      "onTimeRate": 0.25,
      "attendanceRate": 0.75,
      "clearanceRate": 0.52,
      "outstanding": 460
    },
    {
      "rank": 4,
      "driverId": "6ac9b8407e4076de6e52a9e1",
      "fullName": "Danilo Hizon",
      "score": 38,
      "onTimeRate": 0,
      "attendanceRate": 1,
      "clearanceRate": 0.87,
      "outstanding": 1950
    },
    {
      "rank": 5,
      "driverId": "6ac9b8407e4076de6e52a9e3",
      "fullName": "Arnel Bautista",
      "score": 35,
      "onTimeRate": 0,
      "attendanceRate": 0.93,
      "clearanceRate": 0.81,
      "outstanding": 2100
    }
  ],
  "unranked": [
    {
      "driverId": "6ac9b8407e4076de6e52a9df",
      "fullName": "Marites Manalo",
      "reason": "Only 2 chargeable assignments (minimum is 3)"
    }
  ]
}
```

### 3. `POST /api/assignments/check-availability`

**Body.** `driverId`, `vehicleId`, `date` (`YYYY-MM-DD`), `shift`. Nothing is saved. `POST /api/assignments` runs the same function before it saves, so the preview and the real booking can never disagree.

| Reason code (blocks the booking) | When |
|---|---|
| `DRIVER_UNAVAILABLE` | the driver's status is not `active` |
| `VEHICLE_UNAVAILABLE` | the vehicle is `under-maintenance` or `retired` |
| `DRIVER_BOOKED` | the driver already holds an open assignment on that date and shift |
| `VEHICLE_BOOKED` | the vehicle already holds an open assignment on that date and shift |
| `PAST_DATE` | the date is before today (this one is a 400, not an `available: false` answer) |

All reasons are collected, with no early exit. **Warnings** never block: `DRIVER_OVERDUE` when the driver's overdue amount is at least one day of the vehicle's boundary rate, and `VEHICLE_SERVICE_DUE` when the vehicle is overdue for service. An unknown driver or vehicle is 404; a malformed id or an invalid shift is 400. Completed, no-show and cancelled assignments free their slot.

```http
POST /api/assignments/check-availability
Content-Type: application/json

{
  "driverId": "6650c1f2a9b3c4d5e6f70811",
  "vehicleId": "6650c1f2a9b3c4d5e6f70921",
  "date": "2026-10-12",
  "shift": "morning"
}
```

```jsonc
// HTTP 200 OK
{
  "available": false,
  "reasons": [
    {
      "code": "VEHICLE_BOOKED",
      "message": "NEA 4521 is already assigned to Rogelio Pangilinan on 2026-10-12 (morning)"
    }
  ],
  "warnings": [
    {
      "code": "DRIVER_OVERDUE",
      "message": "Juan Dela Cruz has 460 pesos overdue, at least one day of boundary"
    }
  ]
}
```

A date in the past (HTTP 400):

```jsonc
// HTTP 400 Bad Request
{
  "message": "Date cannot be before today (2026-10-10)",
  "code": "PAST_DATE",
  "errors": [
    {
      "field": "date",
      "message": "Date cannot be before today (2026-10-10)"
    }
  ]
}
```

### 4. `PATCH /api/assignments/:id/status`

**Body.** `status`, plus `startOdometerKm` (optional, when starting) and `endOdometerKm` (required, when completing).

```text
scheduled -> active | no-show | cancelled
active    -> completed
completed, no-show and cancelled are final
```

| From, to | Guard | Side effects |
|---|---|---|
| scheduled, active | the date is today or earlier | `startOdometerKm` defaults to the vehicle's odometer |
| scheduled, no-show | the date is today or earlier | `boundaryDue` becomes 0, `penaltyFee` becomes max(50, round(20% of the rate)), `holdsSlot` false |
| scheduled, cancelled | none | no charge, `holdsSlot` false |
| active, completed | `endOdometerKm` is not below the start reading | the vehicle's odometer moves forward, `holdsSlot` false, the boundary becomes a charge |
| anything else | not allowed | 400 `Invalid transition: <from> cannot change to <to>` |

The update is `findOneAndUpdate({ _id, status: <current status> })`, so when two requests arrive together only one can win. The other one gets the 400 below, and the penalty is applied exactly once.

```http
PATCH /api/assignments/6650c1f2a9b3c4d5e6f70a07/status
Content-Type: application/json

{
  "status": "no-show"
}
```

```jsonc
// HTTP 200 OK
{
  "message": "Marked as no-show. Penalty of 60 pesos charged; boundary waived.",
  "assignment": {
    "driver": {
      "fullName": "Marites Manalo",
      "_id": "6ac9b8407e4076de6e52a9df"
    },
    "vehicle": {
      "plateNumber": "NEA 4570",
      "type": "tricycle",
      "_id": "6ac9b8407e4076de6e52a9f7"
    },
    "date": "2026-10-09T16:00:00.000Z",
    "shift": "morning",
    "status": "no-show",
    "boundaryDue": 0,
    "penaltyFee": 60,
    "holdsSlot": false,
    "notes": "Not at the terminal yet",
    "_id": "6650c1f2a9b3c4d5e6f70a07",
    "__v": 0,
    "createdAt": "2026-10-10T04:00:00.559Z",
    "updatedAt": "2026-10-10T04:00:01.403Z"
  }
}
```

Sending it again (HTTP 400):

```jsonc
// HTTP 400 Bad Request
{
  "message": "Invalid transition: no-show cannot change to no-show"
}
```

### 5. `GET /api/vehicles/maintenance-due`

**Query.** `withinDays` (default 14) and `withinKm` (default 500); negative or non-numeric values are a 400.

**Rule.** For every vehicle that is not retired:

```text
kmSince   = odometerKm - lastServiceOdometerKm
daysSince = today - lastServiceDate
kmLimit   = newest completed service's nextDueOdometerKm if set, else lastServiceOdometerKm + serviceIntervalKm
dateLimit = newest completed service's nextDueDate if set, else lastServiceDate + serviceIntervalDays

overdue : odometerKm >= kmLimit  OR  today >= dateLimit
due-soon: odometerKm >= kmLimit - withinKm  OR  today >= dateLimit - withinDays
```

The severity is the worse of the two checks. The list is sorted overdue first, then by how much of the interval is used. A vehicle with no service record is overdue ("No service record"); a vehicle that is due and already in the shop is returned with `inShop: true`, so the screen can show "In shop" instead of a service warning; a fleet that is fully up to date returns an empty list.

```http
GET /api/vehicles/maintenance-due
```

```jsonc
// HTTP 200 OK
{
  "asOf": "2026-10-10",
  "count": 3,
  "vehicles": [
    {
      "_id": "6ac9b8407e4076de6e52a9eb",
      "plateNumber": "PUJ 7315",
      "inShop": false,
      "severity": "overdue",
      "kmSinceService": 5420,
      "daysSinceService": 71,
      "percentUsed": 108,
      "reasons": [
        "5,420 km since last service (limit 5,000)"
      ]
    },
    {
      "_id": "6ac9b8407e4076de6e52a9fb",
      "plateNumber": "NEA 4618",
      "inShop": false,
      "severity": "overdue",
      "kmSinceService": null,
      "daysSinceService": null,
      "percentUsed": null,
      "reasons": [
        "No service record"
      ]
    },
    {
      "_id": "6ac9b8407e4076de6e52a9f5",
      "plateNumber": "NEA 4533",
      "inShop": false,
      "severity": "due-soon",
      "kmSinceService": 4650,
      "daysSinceService": 40,
      "percentUsed": 93,
      "reasons": [
        "4,650 km since last service (due at 5,000, within 500)"
      ]
    }
  ]
}
```

### 6. `GET /api/stats/collections`

**Query.** `from`, `to` (`YYYY-MM-DD`, default: the 1st of this month up to today), `groupBy` (`day` or `month`, default `day`). A `from` after `to`, a bad date, a range longer than 366 days or an unknown `groupBy` is a 400.

```text
expected        = charges of the completed and no-show assignments dated in the range
collected       = sum of amountPaid where paidAt is in the range
collectionRate  = expected > 0 ? min(collected, expected) / expected * 100 : 0     (1 decimal)
vehicle revenue = charges per vehicle in the range      maintenanceCost = cost of services completed in the range
netCash         = collected - maintenanceCost           overdueTotal    = every driver's overdueAmount as of today
```

`collected` is capped at `expected` only inside the rate, so paying old debt cannot push the rate above 100%. A vehicle with no chargeable assignment is listed in `idleVehicles` and is not counted as the lowest earner. Days and months are cut in Manila time, so a payment made late in the evening lands on the right day. An empty range returns zeros and empty lists, never `NaN`.

```http
GET /api/stats/collections?from=2026-09-27&to=2026-10-10
```

```jsonc
// HTTP 200 OK
{
  "range": {
    "from": "2026-09-27",
    "to": "2026-10-10",
    "groupBy": "day"
  },
  "expected": 42350,
  "collected": 38900,
  "collectionRate": 91.9,
  "maintenanceCost": 6200,
  "netCash": 32700,
  "overdueTotal": 5870,
  "topVehicle": {
    "_id": "6ac9b8407e4076de6e52a9e9",
    "plateNumber": "PUJ 7340",
    "revenue": 8000
  },
  "lowestVehicle": {
    "_id": "6ac9b8407e4076de6e52a9f7",
    "plateNumber": "NEA 4570",
    "revenue": 900
  },
  "idleVehicles": [],
  "series": [
    {
      "period": "2026-09-27",
      "expected": 4000,
      "collected": 1600
    },
    {
      "period": "2026-09-28",
      "expected": 4000,
      "collected": 0
    },
    {
      "period": "2026-09-29",
      "expected": 4300,
      "collected": 600
    },
    // … 11 more
  ]
}
```

## Request test list

Use these requests to check the whole API, in this order. Every expected value below was produced by the real server on a freshly seeded database.

- Run `npm run seed`, then `npm start`. The base URL is `http://localhost:5000`.
- **`<TODAY>`** is the date after `TODAY in Manila` in the seed output, and **`<TODAY+2>`** is the date on the `TODAY+2` line. The seed also prints the **stats range** (`from=...&to=...`) and the ids of every driver and vehicle.
- Part A only reads, so you can repeat it freely. **From part B on, the data changes**: run `npm run seed` again to start over.
- The checks marked **400** and **404** are the validation error and the not-found case to show in a demo (tests 21 and 49).

### Part A: reads on the fresh seed

| # | Request | Status | What to check |
|---|---|---|---|
| 1 | `GET /api/drivers` | 200 | 8 drivers, each with `balance` / `overdueAmount`: Rogelio 0 / 0, Marites 60 / 60, Juan 460 / 460, Ernesto 900 / 900, Wilfredo 650 / 650, Rolando 700 / 700, Danilo 1950 / 1000, Arnel 2100 / 2100 |
| 2 | `GET /api/drivers?q=juan&sort=fullName` | 200 | Exactly one driver: Juan Dela Cruz |
| 3 | `GET /api/drivers?status=suspended` | 200 | Exactly one driver: Wilfredo Sunga |
| 4 | `GET /api/drivers/6650c1f2a9b3c4d5e6f70811` | 200 | Juan Dela Cruz, license `N01-21-482913` |
| 5 | `GET /api/drivers/6650c1f2a9b3c4d5e6f70811/balance` | 200 | `totalCharged` 960, `totalPaid` 500, `balance` 460, `overdueAmount` 460, `overdueCount` 3. Four charges: 300 paid in full, 300 with 200 paid, a 60 `no-show penalty` unpaid, 300 unpaid |
| 6 | `GET /api/drivers/ranking` | 200 | 1 Rogelio 100, 2 Ernesto 89, 3 Juan 42, 4 Danilo 38, 5 Arnel 35. `unranked`: Marites ("Only 2 chargeable assignments (minimum is 3)"). Wilfredo (suspended) and Rolando (inactive) are not listed |
| 7 | `GET /api/drivers/ranking?includeInactive=true` | 200 | Rolando (score 46, rank 3) and Wilfredo (37, rank 6) now appear |
| 8 | `GET /api/vehicles?type=tricycle&status=available&sort=-boundaryRate` | 200 | 4 tricycles, NEA 4533 (350 pesos) first. NEA 4590 is missing because it is under maintenance |
| 9 | `GET /api/vehicles/maintenance-due` | 200 | `count` 3: PUJ 7315 overdue ("5,420 km since last service (limit 5,000)", 71 days), NEA 4618 overdue ("No service record"), NEA 4533 due soon ("4,650 km since last service (due at 5,000, within 500)") |
| 10 | `GET /api/vehicles/6650c1f2a9b3c4d5e6f70921` | 200 | NEA 4521, `boundaryRate` 300 |
| 11 | `GET /api/assignments?from=<TODAY>&to=<TODAY>&shift=morning` | 200 | 4 assignments: Marites on NEA 4570 (scheduled), Rogelio on NEA 4521, Ernesto on PUJ 7352 and Danilo on PUJ 7340 (all active) |
| 12 | `GET /api/assignments/6650c1f2a9b3c4d5e6f70a07` | 200 | Marites Manalo on NEA 4570, `status` scheduled, `boundaryDue` 300, with driver and vehicle details |
| 13 | `GET /api/payments?driver=6650c1f2a9b3c4d5e6f70811&sort=paidAt` | 200 | Two payments: 300 cash, then 200 GCash with a `GC-...` reference |
| 14 | `GET /api/maintenance?status=in-progress` | 200 | One record: NEA 4590, brakes, cost 1200 |
| 15 | `GET /api/stats/collections?from=<seed's from>&to=<TODAY>` | 200 | `expected` 42350, `collected` 38900, `collectionRate` 91.9, `maintenanceCost` 6200, `netCash` 32700, `overdueTotal` 5870. `topVehicle` PUJ 7340 (8000), `lowestVehicle` NEA 4570 (900), `idleVehicles` empty, 14 entries in `series` |
| 16 | `POST /api/assignments/check-availability` with `{"driverId":"6650c1f2a9b3c4d5e6f70811","vehicleId":"6650c1f2a9b3c4d5e6f70921","date":"<TODAY+2>","shift":"morning"}` | 200 | `available` false. Reason `VEHICLE_BOOKED` ("NEA 4521 is already assigned to Rogelio Pangilinan on <TODAY+2> (morning)"). Warning `DRIVER_OVERDUE` |
| 17 | The same body with `"shift":"afternoon"` | 200 | `available` true, `reasons` empty, and still the `DRIVER_OVERDUE` warning: warnings never block |
| 18 | The same with Wilfredo's id as `driverId` and NEA 4590's id as `vehicleId` (both printed by the seed), `"shift":"morning"` | 200 | `available` false with two reasons at once: `DRIVER_UNAVAILABLE` (suspended) and `VEHICLE_UNAVAILABLE` (under maintenance) |

### Part B: writes

| # | Request | Status | What to check |
|---|---|---|---|
| 19 | `POST /api/drivers` with `{"fullName":"Pedro Penduko","licenseNumber":"N05-22-123456","contactNumber":"09171239999","address":"Brgy. Sumacab Este, Cabanatuan City"}` | 201 | `status` "active" and a `dateHired` of now. Copy its `_id` for tests 22 and 23 |
| 20 | The same body with `"licenseNumber":"n05-22-123456"` | 409 | "License number already exists" (letter case is ignored), `errors[0].field` is `licenseNumber` |
| 21 | `POST /api/drivers` with `{"fullName":"P","contactNumber":"12345"}` | **400** | "Validation failed", with one entry in `errors` per bad field: `licenseNumber` (required), `fullName` (at least 2 characters), `contactNumber` (09 followed by 9 digits) |
| 22 | `PUT /api/drivers/<_id from 19>` with `{"contactNumber":"09171230000","status":"suspended"}` | 200 | Those two fields changed, the rest unchanged |
| 23 | `DELETE /api/drivers/<_id from 19>` | 200 | `{"message":"Driver deleted"}` (a new driver has no history, so the delete is allowed) |
| 24 | `DELETE /api/drivers/6650c1f2a9b3c4d5e6f70811` | 409 | "This driver has assignments or payments and cannot be deleted. Set the status to inactive instead." (BR9) |
| 25 | `POST /api/vehicles` with `{"plateNumber":"NEA 4700","type":"tricycle","model":"Honda TMX 155 + sidecar","boundaryRate":320}` | 201 | Defaults filled in: `odometerKm` 0, `serviceIntervalKm` 5000, `serviceIntervalDays` 90, `status` available. Copy its `_id` for tests 28 and 29 |
| 26 | `POST /api/vehicles` with `{"plateNumber":"nea4700","type":"tricycle","boundaryRate":320}` | 409 | "Plate number already exists" (case and spacing are normalized) |
| 27 | `POST /api/vehicles` with `{"plateNumber":"NEA 4701","type":"bus","boundaryRate":50}` | 400 | Errors for `type` (must be tricycle or jeepney) and `boundaryRate` (at least 100 pesos) |
| 28 | `PUT /api/vehicles/<_id from 25>` with `{"boundaryRate":350,"odometerKm":120}` | 200 | Both values changed |
| 29 | `DELETE /api/vehicles/<_id from 25>` | 200 | `{"message":"Vehicle deleted"}` |
| 30 | `DELETE /api/vehicles/6650c1f2a9b3c4d5e6f70921` | 409 | "This vehicle has assignments or maintenance records and cannot be deleted. Set the status to retired instead." (BR9) |
| 31 | `POST /api/assignments/check-availability` with the body of test 16 but `"date":"2020-01-01"` | 400 | `code` "PAST_DATE" and "Date cannot be before today (<TODAY>)" |
| 32 | `POST /api/assignments` with `{"driverId":"6650c1f2a9b3c4d5e6f70811","vehicleId":"6650c1f2a9b3c4d5e6f70921","date":"<TODAY+2>","shift":"afternoon","notes":"Barangay fiesta trips"}` | 201 | `status` scheduled, `boundaryDue` 300 (copied from NEA 4521's rate, BR1), `holdsSlot` true. Copy its `_id` for tests 34 and 35 |
| 33 | Send the request of test 32 again | 409 | Two reasons at once: `DRIVER_BOOKED` and `VEHICLE_BOOKED` (BR2) |
| 34 | `PATCH /api/assignments/<_id from 32>/status` with `{"status":"no-show"}` | 400 | "This assignment is on <TODAY+2>, so it cannot be marked as a no-show yet" |
| 35 | The same URL with `{"status":"cancelled"}` | 200 | "Assignment cancelled. No charge." and `holdsSlot` false |
| 36 | Repeat test 17 | 200 | `available` true again: cancelling freed the slot |
| 37 | `PATCH /api/assignments/6650c1f2a9b3c4d5e6f70a07/status` with `{"status":"no-show"}` | 200 | "Marked as no-show. Penalty of 60 pesos charged; boundary waived." with `boundaryDue` 0, `penaltyFee` 60, `holdsSlot` false |
| 38 | Repeat test 37 | 400 | "Invalid transition: no-show cannot change to no-show". The penalty is never charged twice |
| 39 | `GET /api/drivers/ranking` | 200 | Marites now has 3 chargeable assignments, so she is ranked 3rd with score 49, and `unranked` is empty |
| 40 | `GET /api/assignments?driver=<Arnel's id>&status=scheduled&from=<TODAY>&to=<TODAY>`, then `PATCH /api/assignments/<that _id>/status` with `{"status":"active"}` | 200, 200 | One assignment (Arnel on PUJ 7315, afternoon); then "Assignment started at 66620 km." (the vehicle's own odometer) |
| 41 | The same PATCH with `{"status":"completed","endOdometerKm":100}` | 400 | "End odometer cannot be lower than the start odometer (66620 km)" |
| 42 | The same PATCH with `{"status":"completed","endOdometerKm":66650}`, then `GET /api/vehicles/<PUJ 7315's id>` | 200, 200 | "Assignment completed. Boundary of 900 pesos is now due."; the vehicle's `odometerKm` is now 66650 |
| 43 | `POST /api/payments` with `{"driver":"6650c1f2a9b3c4d5e6f70811","amountPaid":200,"method":"gcash","referenceNo":"GC-7144001122","remarks":"Partial payment"}` | 201 | The saved payment, with `paidAt` set to now |
| 44 | `GET /api/drivers/6650c1f2a9b3c4d5e6f70811/balance` | 200 | `totalPaid` 700, `balance` 260, `overdueCount` 1. FIFO: the first three charges are fully paid (300, 300, 60) and the fourth shows 40 of 300 paid |
| 45 | `POST /api/payments` with `{"driver":"6650c1f2a9b3c4d5e6f70811","amountPaid":99999}` | 400 | "Payment of 99999 pesos is more than the outstanding balance of 260 pesos" (BR6) |
| 46 | `POST /api/maintenance` with `{"vehicle":"<NEA 4618's id>","type":"general-service","description":"First service","cost":700,"odometerKm":9320}`, then `GET /api/vehicles/<NEA 4618's id>` | 201, 200 | The record is `in-progress` and the vehicle's `status` is now `under-maintenance` |
| 47 | `PATCH /api/maintenance/<_id from 46>/complete` with `{"cost":750,"nextDueOdometerKm":14300}`, then `GET` the vehicle again | 200, 200 | `status` completed, cost 750. The vehicle is `available` again, with `lastServiceOdometerKm` 9320 and a `lastServiceDate` |
| 48 | `GET /api/vehicles/maintenance-due` | 200 | `count` 2: NEA 4618 is gone, and PUJ 7315 now reads "5,450 km" because test 42 moved its odometer 30 km |

### Part C: errors and middleware

| # | Request | Status | What to check |
|---|---|---|---|
| 49 | `GET /api/drivers/6650c1f2a9b3c4d5e6f7ffff` | **404** | `{"message":"Driver not found"}`: a valid id that matches no driver |
| 50 | `GET /api/drivers/abc` | 400 | `{"message":"Invalid ID"}` |
| 51 | `GET /api/unknown` | 404 | `{"message":"Route not found: GET /api/unknown"}`: the JSON catch-all |
| 52 | `POST /api/drivers` with the broken body `{"fullName": "Pedro",` | 400 | `{"message":"Request body is not valid JSON"}` |
| 53 | `GET /api/stats/collections?groupBy=week` | 400 | "Invalid groupBy. Use one of: day, month" |
| 54 | `GET /api/vehicles/maintenance-due?withinDays=-1` | 400 | "Invalid withinDays. Use a whole number 0 or more" |
| 55 | `POST /api/maintenance` with `{"vehicle":"6650c1f2a9b3c4d5e6f7ffff","type":"tires","cost":100,"odometerKm":10}` | 404 | `{"message":"Vehicle not found"}` |
| 56 | Look at the terminal that runs the server | | One line for each request: method, URL, status and duration (the request of test 52 is the only one missing, see the limitations) |

A 500 does not appear in this list because normal requests never cause one. Any unexpected error is answered with `{ "message": "Internal server error" }`, and its details are printed in the terminal.

## Screenshots

This repository is only the API, so it has no screens of its own. The screenshots of the application are in the README of the client repository, `boundarypro-client`. The terminal output and the JSON responses in this README show the server working.

## Known limitations

- **No login or roles.** Authentication, online payments, file uploads and deployment are out of scope. Anyone who can reach the API can use it.
- **No pagination.** Lists return every matching record, which is fine for the size of one fleet but would need paging for thousands of records.
- **Rule values are fixed in code.** The 50-peso minimum and 20% of the no-show penalty, the ranking weights (60/25/15), the 3-assignment minimum, the 14-day and 500-km margins and the 366-day stats limit are constants or query defaults, not settings an operator can edit.
- **Manila time only.** All date logic uses a fixed UTC+8 offset (the Philippines has no daylight saving time), so the API is not meant for several time zones.
- **Seed dates are relative.** The demo data is generated around the day you run the seed. Run it again on the day of the demo.
- **Payments can race.** BR6 is checked first and the payment is saved afterwards, with no transaction in between. Two payments sent at the very same moment could together exceed the balance. The status change and the booking do not have this problem; they are protected by a conditional update and by unique indexes.
- **Some changes are two writes.** Completing an assignment and moving the vehicle's odometer, or completing a service and updating the vehicle, are separate writes without a transaction. If the second write failed, the first would stay.
- **Reports are computed in the server.** The balance, ranking and statistics load the needed records and add them up in JavaScript. For a very large fleet they should become MongoDB aggregation pipelines.
- **Malformed JSON is not logged.** The request logger sits after `express.json()`, as in the proposal, so a body that cannot be parsed is rejected before the logger runs. The client still receives the 400.
- **409 for conflicts.** The rubric lists 200, 201, 400, 404 and 500. Conflicts (duplicates, double bookings, deleting a record with history) answer 409 as the proposal says; changing `CONFLICT` in `utils/AppError.js` makes them 400.
- **Field names differ by endpoint.** Bookings use `driverId` and `vehicleId`; payments and maintenance use `driver` and `vehicle`, the names of the schema fields.
- **No automated tests.** The request test list above is the way to check the API.
