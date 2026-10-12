import express from 'express';
import cors from 'cors';
import requestLogger from './middleware/requestLogger.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';
import driversRoutes from './routes/drivers.routes.js';
import vehiclesRoutes from './routes/vehicles.routes.js';
import paymentsRoutes from './routes/payments.routes.js';
import maintenanceRoutes from './routes/maintenance.routes.js';
import assignmentsRoutes from './routes/assignments.routes.js';
import statsRoutes from './routes/stats.routes.js';

// This file only configures the app and mounts middleware. No business logic lives here.
const app = express();

// The order below is the contract: a request passes through these lines from top to bottom.
// cors -> json parser -> logger -> routers -> 404 -> error handler
app.use(cors({ origin: process.env.CLIENT_URL })); // only the React app may call the API from a browser
app.use(express.json()); // turns a JSON request body into req.body
app.use(requestLogger);

app.use('/api/drivers', driversRoutes);
app.use('/api/vehicles', vehiclesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.use('/api/stats', statsRoutes);

app.use(notFound); // no route answered, so reply with a JSON 404
app.use(errorHandler); // last on purpose: it catches errors from everything above

export default app;
