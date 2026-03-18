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
  if (!usernameArg) {
    console.error('Usage: node scripts/delete-user.js "username"');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  const username = usernameArg.trim();
  const user = await User.findOne({ username: { $regex: new RegExp(`^${escapeRegex(username)}$`, "i") } }).lean();
  if (!user) {
    console.log("No user found:", username);
    await mongoose.disconnect();
    return;
  }

  await User.deleteOne({ _id: user._id });
  console.log("Deleted user:", user.username);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

