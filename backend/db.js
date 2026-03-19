import mongoose from "mongoose";

const cached = globalThis.__auditTrailMongoose || (globalThis.__auditTrailMongoose = { conn: null, promise: null });

export async function connectDb(mongoUri) {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    mongoose.set("strictQuery", true);
    cached.promise = mongoose
      .connect(mongoUri, {
        autoIndex: true
      })
      .then((m) => {
        cached.conn = m.connection;
        return cached.conn;
      })
      .catch((err) => {
        cached.promise = null;
        throw err;
      });
  }
  return cached.promise;
}
