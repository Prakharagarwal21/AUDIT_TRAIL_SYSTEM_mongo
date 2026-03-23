import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { User } from "../models/User.js";
import { Employee } from "../models/Employee.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/audit_trail_system";

async function upsertUser({ username, password, role }) {
  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  const desiredUsername = String(username || "").trim();
  const existing = await User.findOne({ username: { $regex: new RegExp(`^${escapeRegex(desiredUsername)}$`, "i") } });
  const passwordHash = await bcrypt.hash(password, 12);
  if (!existing) {
    await User.create({
      username: desiredUsername,
      passwordHash,
      role,
      tokenVersion: 0
    });
    return;
  }
  await User.updateOne(
    { _id: existing._id },
    {
      $set: {
        username: desiredUsername,
        passwordHash,
        role,
        isBlocked: false,
        blockedReason: null,
        blockedAt: null
      },
      $inc: { tokenVersion: 1 }
    }
  );
}

async function ensureEmployees() {
  const count = await Employee.countDocuments();
  if (count > 0) return;
  await Employee.insertMany([
    { name: "Alice Johnson", email: "alice.johnson@company.com", position: "Senior Developer", department: "Engineering", salary: 85000 },
    { name: "Bob Smith", email: "bob.smith@company.com", position: "QA Engineer", department: "Engineering", salary: 65000 },
    { name: "Carol Davis", email: "carol.davis@company.com", position: "HR Manager", department: "HR", salary: 78000 },
    { name: "David Lee", email: "david.lee@company.com", position: "Accountant", department: "Finance", salary: 70000 },
    { name: "Emma Wilson", email: "emma.wilson@company.com", position: "Product Manager", department: "Product", salary: 92000 },
    { name: "Frank Miller", email: "frank.miller@company.com", position: "Support Specialist", department: "Support", salary: 52000 },
    { name: "Grace Kim", email: "grace.kim@company.com", position: "Designer", department: "Design", salary: 68000 },
    { name: "Henry Brown", email: "henry.brown@company.com", position: "DevOps Engineer", department: "Engineering", salary: 88000 }
  ]);
}

async function main() {
  await mongoose.connect(MONGO_URI);
  // Cleanup old demo/admin usernames to keep seed deterministic
  await User.deleteOne({ username: { $regex: /^prakhar$/i } }).catch(() => {});
  await upsertUser({ username: "prakhar agarwal", password: "admin123", role: "admin" });
  await upsertUser({ username: "riya malhotra", password: "staff123", role: "staff" });
  await upsertUser({ username: "om panwar mantra", password: "staff123", role: "staff" });
  await upsertUser({ username: "nishika", password: "staff123", role: "staff" });
  await ensureEmployees();
  const safeUri = String(MONGO_URI).replace(/\/\/([^@]+)@/g, "//***:***@");
  console.log("Seeded users + employees into", safeUri);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
