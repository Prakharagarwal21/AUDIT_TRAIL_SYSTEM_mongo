import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { RevokedToken } from "../models/RevokedToken.js";

export function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.ip || req.connection?.remoteAddress || "unknown";
}

export function getUserAgent(req) {
  return String(req.headers["user-agent"] || "").slice(0, 255);
}

export function authRequired({ jwtSecret }) {
  return async (req, res, next) => {
    try {
      const auth = String(req.headers.authorization || "");
      if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "authentication_required" });
      const token = auth.slice("Bearer ".length);

      const decoded = jwt.verify(token, jwtSecret);
      const { sub, jti, tokenVersion } = decoded;

      const revoked = await RevokedToken.findOne({ jti }).lean();
      if (revoked) return res.status(401).json({ error: "token_revoked" });

      const user = await User.findById(sub).lean();
      if (!user) return res.status(401).json({ error: "authentication_required" });
      if (user.tokenVersion !== tokenVersion) return res.status(401).json({ error: "token_revoked" });
      if (user.isBlocked && user.role !== "admin") return res.status(403).json({ error: "account_blocked" });

      req.auth = { user };
      req.authToken = { jti };
      return next();
    } catch (e) {
      return res.status(401).json({ error: "authentication_required" });
    }
  };
}

export function adminRequired() {
  return (req, res, next) => {
    const user = req.auth?.user;
    if (!user) return res.status(401).json({ error: "authentication_required" });
    if (user.role !== "admin") return res.status(403).json({ error: "admin_required" });
    return next();
  };
}

