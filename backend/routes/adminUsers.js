import bcrypt from "bcryptjs";
import { z } from "zod";

import { User } from "../models/User.js";
import { SecurityAlert } from "../models/SecurityAlert.js";
import { ACTIONS, logAction } from "../auditLogger.js";
import { getClientIp, getUserAgent } from "../middleware/auth.js";

const createSchema = z.object({
  username: z.string().trim().min(3).max(100),
  password: z.string().min(8).max(200),
  role: z.enum(["admin", "staff"]).default("staff")
});

const resetSchema = z.object({
  newPassword: z.string().min(8).max(200)
});

export function adminUsersRoutes() {
  async function list(req, res) {
    const users = await User.find({})
      .select({ username: 1, role: 1, isBlocked: 1, blockedReason: 1, blockedAt: 1, lastLoginAt: 1, profilePhotoUrl: 1 })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ ok: true, users });
  }

  async function create(req, res) {
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });

    const { username, password, role } = parsed.data;
    const exists = await User.findOne({ username }).lean();
    if (exists) return res.status(409).json({ error: "username_taken" });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, passwordHash, role });

    await logAction({
      user: req.auth.user,
      action: ACTIONS.USER_CREATED,
      resource: `users:${username}`,
      entityType: "user",
      entityId: String(user._id),
      newValues: { username, role },
      ipAddress: getClientIp(req),
      status: "SUCCESS",
      userAgent: getUserAgent(req),
      severity: "MEDIUM"
    });

    return res.status(201).json({ ok: true, user: { id: String(user._id), username, role } });
  }

  async function block(req, res) {
    const id = String(req.params.id || "").trim();
    const target = await User.findById(id).lean();
    if (!target) return res.status(404).json({ error: "not_found" });
    if (target.role === "admin") return res.status(400).json({ error: "cannot_block_admin" });

    await User.updateOne({ _id: id }, { $set: { isBlocked: true, blockedReason: "Blocked by admin", blockedAt: new Date() } });
    await SecurityAlert.create({
      userId: target._id,
      username: target.username,
      alertType: "MANUAL_BLOCK",
      severity: "HIGH",
      message: `User blocked by admin`,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      isRead: false
    });

    await logAction({
      user: req.auth.user,
      action: ACTIONS.PERMISSION_CHANGED,
      resource: `users:${target.username}:blocked`,
      entityType: "user",
      entityId: id,
      newValues: { isBlocked: true, reason: "Blocked by admin" },
      ipAddress: getClientIp(req),
      status: "SUCCESS",
      userAgent: getUserAgent(req),
      severity: "HIGH"
    });

    return res.json({ ok: true });
  }

  async function unblock(req, res) {
    const id = String(req.params.id || "").trim();
    const target = await User.findById(id).lean();
    if (!target) return res.status(404).json({ error: "not_found" });

    await User.updateOne(
      { _id: id },
      { $set: { isBlocked: false, blockedReason: null, blockedAt: null }, $inc: { tokenVersion: 1 } }
    );

    await logAction({
      user: req.auth.user,
      action: ACTIONS.PERMISSION_CHANGED,
      resource: `users:${target.username}:unblocked`,
      entityType: "user",
      entityId: id,
      newValues: { isBlocked: false },
      ipAddress: getClientIp(req),
      status: "SUCCESS",
      userAgent: getUserAgent(req),
      severity: "MEDIUM"
    });

    return res.json({ ok: true });
  }

  async function resetPassword(req, res) {
    const id = String(req.params.id || "").trim();
    const target = await User.findById(id).lean();
    if (!target) return res.status(404).json({ error: "not_found" });

    const parsed = resetSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await User.updateOne({ _id: id }, { $set: { passwordHash }, $inc: { tokenVersion: 1 } });

    await logAction({
      user: req.auth.user,
      action: ACTIONS.UPDATE,
      resource: `users:${target.username}:password_reset`,
      entityType: "user",
      entityId: id,
      ipAddress: getClientIp(req),
      status: "SUCCESS",
      userAgent: getUserAgent(req),
      severity: "HIGH"
    });

    return res.json({ ok: true });
  }

  return { list, create, block, unblock, resetPassword };
}
