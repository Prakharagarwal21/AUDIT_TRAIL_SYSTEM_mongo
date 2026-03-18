import fs from "node:fs";
import path from "node:path";
import winston from "winston";

export function createLogger(level = "info") {
  const logDir = path.join(process.cwd(), "logs");
  fs.mkdirSync(logDir, { recursive: true });

  return winston.createLogger({
    level,
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
      new winston.transports.File({ filename: path.join(logDir, "app.log") }),
      new winston.transports.Console({ format: winston.format.simple() })
    ]
  });
}

