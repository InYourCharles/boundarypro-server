import mongoose from 'mongoose';

// Connects to MongoDB once at startup. server.js only starts listening after this succeeds,
// so no request can arrive while the database is unreachable.
export default async function connectDB(uri) {
  // Give up after 10 seconds (the default is 30) so a wrong password or a blocked
  // Atlas IP address shows up as an error quickly instead of looking like a frozen server.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(`MongoDB connected: ${mongoose.connection.name}`);

  // The booking rules rely on the unique indexes (they stop two simultaneous bookings of one slot), so build
  // every index now instead of leaving it to run in the background while the first requests arrive.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
}
