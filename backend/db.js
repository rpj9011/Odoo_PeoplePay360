// backend/db.js
const mongoose = require('mongoose');
require('dotenv').config();

let isConnected = false;
let policyBucket = null;
let avatarBucket = null;

// ── Connection lifecycle listeners (registered once at module load) ──────────
//
// Reconnect strategy: we do NOT call mongoose.connect() again on 'disconnected'.
//
// Calling mongoose.connect() a second time creates a brand-new MongoClient and
// swaps it into mongoose.connection while any in-flight Mongoose sessions still
// hold a reference to the old client.  Subsequent queries or commits on those
// sessions throw:
//   MongoInvalidArgumentError: ClientSession must be from the same MongoClient
// …producing raw 500s on every transactional endpoint (POST /admin/leaves,
// PATCH /admin/leaves/:id/status, PUT /admin/attendance/log/:id, etc.).
//
// The Mongoose/MongoDB Node.js driver handles reconnection internally using the
// existing MongoClient, governed by serverSelectionTimeoutMS (30 s) and
// heartbeatFrequencyMS (15 s) — tuned for A2 Hosting → Atlas latency.  We only
// need to track isConnected and let the driver do its job.  Sessions created
// after the 'reconnected' event fires are guaranteed to use the live client.
//
// Listeners are registered here (module scope) rather than inside connectDB()
// so they are added exactly once, with no risk of duplication if connectDB()
// is ever called again (e.g. in tests).
// ────────────────────────────────────────────────────────────────────────────
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected. Driver will reconnect automatically (serverSelectionTimeoutMS=30s).');
  isConnected = false;
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected.');
  isConnected = true;
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
  isConnected = false;
});

const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/attendance-system';
    console.log('🔗 Connecting to MongoDB...');

    const options = {
      // ─── PERFORMANCE TUNING FOR A2 SHARED HOSTING ──────────────────────────
      // A2 Hosting shared environments have higher network latency to external
      // MongoDB (Atlas / VPS).  Key changes vs. original:
      //
      // 1. serverSelectionTimeoutMS: 30 s (up from 20 s) – Atlas replicas can
      //    take ~25 s to elect a new primary; short timeouts cause spurious
      //    errors during failover.
      //
      // 2. socketTimeoutMS: 60 s (up from 45 s) – slow A2 → Atlas round-trips
      //    for large aggregations can exceed 45 s, causing premature socket
      //    closes that look like dropped connections.
      //
      // 3. maxPoolSize: 10 (down from 20) – A2 shared plans cap outbound
      //    connections.  20 idle sockets waste FDs and can trigger "too many
      //    connections" on Atlas M0/M2 free tiers.
      //
      // 4. minPoolSize: 2 (down from 5) – keeps 2 warm connections to avoid
      //    cold-start latency without exhausting the Atlas connection limit.
      //
      // 5. heartbeatFrequencyMS: 15 000 (15 s, default 10 s) – reduces keep-
      //    alive overhead on a shared CPU host where background I/O competes
      //    with request handlers.
      // ───────────────────────────────────────────────────────────────────────
      serverSelectionTimeoutMS: 30_000,
      connectTimeoutMS:         20_000,
      socketTimeoutMS:          60_000,
      maxPoolSize:              10,
      minPoolSize:               2,
      heartbeatFrequencyMS:    15_000,
    };

    await mongoose.connect(mongoUri, options);

    await new Promise((resolve, reject) => {
      if (mongoose.connection.readyState === 1) return resolve();
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('MongoDB connection timeout')), 25_000);
    });

    isConnected = true;
    console.log('✅ MongoDB connected. Database:', mongoose.connection.name);

    if (!policyBucket) {
      policyBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'policyFiles' });
    }
    if (!avatarBucket) {
      avatarBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'avatars' });
    }

    return mongoose.connection;
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    isConnected = false;
    throw err;
  }
};

module.exports = connectDB;
module.exports.getPolicyBucket = () => {
  if (!policyBucket) throw new Error('Policy bucket not initialized.');
  return policyBucket;
};
module.exports.getAvatarBucket = () => {
  if (!avatarBucket) throw new Error('Avatar bucket not initialized.');
  return avatarBucket;
};
