import fs from "node:fs";
import path from "node:path";
import winston from "winston";

export function createLogger(level = "info") {
  const logDir = process.env.VERCEL ? path.join("/tmp", "logs") : path.join(process.cwd(), "logs");
  const transports = [new winston.transports.Console({ format: winston.format.simple() })];

  // On Vercel, the filesystem is read-only except for /tmp.
  // If file logging can't be initialized, fall back to console-only logging.
  try {
    fs.mkdirSync(logDir, { recursive: true });
    transports.unshift(new winston.transports.File({ filename: path.join(logDir, "app.log") }));
  } catch {}

  return winston.createLogger({
    level,
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports
  });
}
