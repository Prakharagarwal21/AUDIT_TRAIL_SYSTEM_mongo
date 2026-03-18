import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { User } from "../models/User.js";
import { RevokedToken } from "../models/RevokedToken.js";
import { ACTIONS, isSuspiciousFailedLogin, logAction } from "../auditLogger.js";
import { getClientIp, getUserAgent } from "../middleware/auth.js";

const USERNAME_RE = /^[a-zA-Z0-9_. -]{3,100}$/;

const loginSchema = z.object({
  username: z.string().trim().min(3).max(100).regex(USERNAME_RE),
  password: z.string().min(1)
});

const registerSchema = z.object({
  username: z.string().trim().min(3).max(100).regex(USERNAME_RE),
  password: z.string().min(8).max(200),
  role: z.enum(["admin", "staff"]).default("staff")
});

export function authRoutes({ jwtSecret, jwtExpiresIn }) {
  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  async function login(req, res) {
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);

    const parsed = loginSchema.safeParse(req.body || {});
    if (!parsed.success) {
      await logAction({
        user: null,
        action: ACTIONS.LOGIN_FAILED,
        resource: `auth:login:unknown`,
        ipAddress,
        status: (await isSuspiciousFailedLogin({ username: "unknown", ipAddress })) ? "SUSPICIOUS" : "FAILED",
        userAgent
      });
      return res.status(401).json({ error: "invalid_credentials" });
    }

    const { username, password } = parsed.data;
    const user = await User.findOne({ username: { $regex: new RegExp(`^${escapeRegex(username)}$`, "i") } }).lean();
    if (!user) {
      await logAction({
        user: null,
        action: ACTIONS.LOGIN_FAILED,
        resource: `auth:login:${username}`,
        ipAddress,
        status: (await isSuspiciousFailedLogin({ username, ipAddress })) ? "SUSPICIOUS" : "FAILED",
        userAgent
      });
      return res.status(401).json({ error: "invalid_credentials" });
    }

    if (user.isBlocked && user.role !== "admin") {
      await logAction({
        user,
        action: ACTIONS.LOGIN_FAILED,
        resource: `auth:login:${username}`,
        ipAddress,
        status: "SUSPICIOUS",
        userAgent
      });
      return res.status(403).json({ error: "account_blocked", message: "Your account is locked. Contact an admin to unblock." });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await logAction({
        user,
        action: ACTIONS.LOGIN_FAILED,
        resource: `auth:login:${username}`,
        ipAddress,
        status: (await isSuspiciousFailedLogin({ username, ipAddress })) ? "SUSPICIOUS" : "FAILED",
        userAgent
      });
      return res.status(401).json({ error: "invalid_credentials" });
    }

    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

    const jti = crypto.randomUUID();
    const token = jwt.sign({ jti, tokenVersion: user.tokenVersion }, jwtSecret, {
      subject: String(user._id),
      expiresIn: jwtExpiresIn
    });

    await logAction({ user, action: ACTIONS.LOGIN_SUCCESS, resource: "auth:login", ipAddress, status: "SUCCESS", userAgent });
    return res.json({ ok: true, token, user: { id: String(user._id), username: user.username, role: user.role } });
  }

  async function logout(req, res) {
    const user = req.auth.user;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);

    const tokenJti = req.authToken?.jti;
    if (tokenJti) {
      // Revoke for 2 hours (covers typical 1h token) unless overridden; JWT exp is not decoded here by design.
      await RevokedToken.create({ jti: tokenJti, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) }).catch(() => {});
    }

    await logAction({ user, action: ACTIONS.UPDATE, resource: "auth:logout", ipAddress, status: "SUCCESS", userAgent });
    return res.json({ ok: true });
  }

  async function me(req, res) {
    const user = req.auth.user;
    return res.json({ authenticated: true, user: { id: String(user._id), username: user.username, role: user.role } });
  }

  async function register(req, res) {
    const adminUser = req.auth.user;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);

    const parsed = registerSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });

    const { username, password, role } = parsed.data;
    const exists = await User.findOne({ username }).lean();
    if (exists) return res.status(409).json({ error: "username_taken" });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, passwordHash, role });

    await logAction({
      user: adminUser,
      action: ACTIONS.USER_CREATED,
      resource: `users:${username}`,
      entityType: "user",
      entityId: String(user._id),
      newValues: { username, role },
      ipAddress,
      status: "SUCCESS",
      userAgent,
      severity: "MEDIUM"
    });

    return res.status(201).json({ ok: true, user: { id: String(user._id), username, role } });
  }

  return { login, logout, me, register };
}
