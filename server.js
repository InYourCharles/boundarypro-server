import 'dotenv/config'; // must be first: it fills process.env from .env before any other file reads it
import app from './app.js';
import connectDB from './config/db.js';

const { PORT = 5000, MONGO_URI, CLIENT_URL } = process.env;

async function start() {
  // Stop with a clear message instead of failing later in a confusing way
  if (!MONGO_URI || !CLIENT_URL) {
    throw new Error('MONGO_URI and CLIENT_URL must be set. Copy .env.example to .env and fill them in.');
  }

  await connectDB(MONGO_URI); // connect first, then listen
  app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error(`Startup failed: ${err.message}`);
  process.exit(1);
});
