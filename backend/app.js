import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { connectDb } from "./db.js";
import { createLogger } from "./logger.js";
import { authRequired, adminRequired } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { employeeRoutes } from "./routes/employees.js";
import { auditRoutes } from "./routes/audit.js";
import { securityRoutes } from "./security/routes.js";
import { profileRoutes } from "./routes/profile.js";
import { bonusRoutes } from "./routes/bonuses.js";
import { adminUsersRoutes } from "./routes/adminUsers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Local development reads backend/.env. On Vercel, use Project Settings → Environment Variables.
if (!process.env.VERCEL) dotenv.config({ path: path.join(__dirname, ".env") });

const PORT = parseInt(process.env.PORT || "5000", 10);
const HAS_MONGO_ENV = Boolean(process.env.MONGO_URI || process.env.MONGODB_URI);
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/audit_trail_system";
const JWT_SECRET = process.env.JWT_SECRET || "dev-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

const logger = createLogger(LOG_LEVEL);
if (process.env.VERCEL && !HAS_MONGO_ENV) {
  logger.error("Missing MongoDB env on Vercel. Set MONGO_URI (or MONGODB_URI) in Vercel Project Settings.");
}

const app = express();
app.set("trust proxy", false);

app.use(helmet());
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false
  })
);

app.use(express.json({ limit: "256kb" }));
app.use(morgan("combined"));
const frontendDir = path.resolve(__dirname, "..", "frontend");

// Frontend routes
app.get("/", (req, res) => res.sendFile(path.join(frontendDir, "login.html")));
app.get("/login", (req, res) => res.sendFile(path.join(frontendDir, "login.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(frontendDir, "dashboard.html")));
app.get("/audit-logs", (req, res) => res.sendFile(path.join(frontendDir, "audit-logs.html")));
app.get("/profile", (req, res) => res.sendFile(path.join(frontendDir, "profile.html")));
app.get("/staff-management", (req, res) => res.sendFile(path.join(frontendDir, "staff-management.html")));
app.get("/bonus-management", (req, res) => res.sendFile(path.join(frontendDir, "bonus-management.html")));
app.use(express.static(frontendDir));
const uploadsDir = process.env.VERCEL ? path.join("/tmp", "uploads") : path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadsDir));

// API
app.use("/api", async (req, res, next) => {
  if (process.env.VERCEL && !HAS_MONGO_ENV) {
    return res.status(500).json({ error: "missing_mongo_uri", message: "Set MONGO_URI in Vercel environment variables." });
  }
  try {
    await connectDb(MONGO_URI);
    return next();
  } catch (err) {
    logger.error("MongoDB connection failed", { err: String(err) });
    return res.status(500).json({ error: "db_unavailable" });
  }
});
app.get("/api/health", (req, res) => res.json({ ok: true }));

const auth = authRoutes({ jwtSecret: JWT_SECRET, jwtExpiresIn: JWT_EXPIRES_IN });
app.post("/api/login", auth.login);
app.post("/api/auth/login", auth.login);

app.post("/api/logout", authRequired({ jwtSecret: JWT_SECRET }), auth.logout);
app.post("/api/auth/logout", authRequired({ jwtSecret: JWT_SECRET }), auth.logout);

app.get("/api/me", authRequired({ jwtSecret: JWT_SECRET }), auth.me);
app.get("/api/auth/session", authRequired({ jwtSecret: JWT_SECRET }), auth.me);

app.post("/api/register", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), auth.register);

const profile = profileRoutes();
app.get("/api/profile", authRequired({ jwtSecret: JWT_SECRET }), profile.get);
app.post("/api/profile/password", authRequired({ jwtSecret: JWT_SECRET }), profile.changePassword);
app.post("/api/profile/photo", authRequired({ jwtSecret: JWT_SECRET }), ...profile.uploadPhoto);
app.delete("/api/profile/photo", authRequired({ jwtSecret: JWT_SECRET }), profile.removePhoto);

const employees = employeeRoutes();
app.get("/api/employees", authRequired({ jwtSecret: JWT_SECRET }), employees.list);
app.post("/api/employees", authRequired({ jwtSecret: JWT_SECRET }), employees.create);
app.put("/api/employees", authRequired({ jwtSecret: JWT_SECRET }), employees.update);
app.delete("/api/employees", authRequired({ jwtSecret: JWT_SECRET }), employees.remove);

const audit = auditRoutes();
app.get("/api/logs", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), audit.list);
app.get("/api/logs/filter", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), audit.filter);
app.get("/api/logs/search", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), audit.search);
app.get("/api/logs/export.csv", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), audit.exportCsv);
app.get("/api/audit/logs", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), audit.list);
app.get("/api/audit/logs/filter", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), audit.filter);
app.get("/api/audit/logs/search", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), audit.search);

const security = securityRoutes();
app.get("/api/admin/security", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), security.get);
app.post("/api/admin/security", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), security.post);

const bonuses = bonusRoutes();
app.get("/api/bonuses", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), bonuses.list);
app.post("/api/bonuses", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), bonuses.create);
app.delete("/api/bonuses", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), bonuses.remove);

const adminUsers = adminUsersRoutes();
app.get("/api/admin/users", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), adminUsers.list);
app.post("/api/admin/users", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), adminUsers.create);
app.post("/api/admin/users/:id/block", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), adminUsers.block);
app.post("/api/admin/users/:id/unblock", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), adminUsers.unblock);
app.post("/api/admin/users/:id/reset-password", authRequired({ jwtSecret: JWT_SECRET }), adminRequired(), adminUsers.resetPassword);

app.use((err, req, res, next) => {
  logger.error("Unhandled error", { err: String(err) });
  res.status(500).json({ error: "internal_error" });
});

if (!process.env.VERCEL) {
  app.listen(PORT, "127.0.0.1", () => {
    logger.info(`Server listening on http://127.0.0.1:${PORT}`);
  });
}

export default app;
