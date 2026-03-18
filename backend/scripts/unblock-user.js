import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { User } from "../models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/audit_trail_system";

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  const usernameArg = process.argv.slice(2).join(" ").trim();
  const username = usernameArg || "riya malhotra";
  await mongoose.connect(MONGO_URI);

  const user = await User.findOne({ username: { $regex: new RegExp(`^${escapeRegex(username)}$`, "i") } }).lean();
  if (!user) {
    console.error("User not found:", username);
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }

  await User.updateOne({ _id: user._id }, { $set: { isBlocked: false, blockedReason: null, blockedAt: null }, $inc: { tokenVersion: 1 } });
  console.log("Unblocked:", user.username);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

