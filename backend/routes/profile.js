import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import multer from "multer";
import { z } from "zod";

import { User } from "../models/User.js";
import { ACTIONS, logAction } from "../auditLogger.js";
import { getClientIp, getUserAgent } from "../middleware/auth.js";

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200)
});

function uploadsDir() {
  const dir = process.env.VERCEL ? path.join("/tmp", "uploads") : path.join(process.cwd(), "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir()),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "").slice(0, 10) || ".bin";
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

export function profileRoutes() {
  async function get(req, res) {
    const user = await User.findById(req.auth.user._id).lean();
    return res.json({
      ok: true,
      profile: {
        id: String(user._id),
        username: user.username,
        role: user.role,
        profilePhotoUrl: user.profilePhotoUrl,
        lastLoginAt: user.lastLoginAt
      }
    });
  }

  async function changePassword(req, res) {
    const parsed = passwordSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });

    const { currentPassword, newPassword } = parsed.data;
    const user = await User.findById(req.auth.user._id).lean();
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(400).json({ error: "invalid_current_password" });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await User.updateOne({ _id: user._id }, { $set: { passwordHash }, $inc: { tokenVersion: 1 } });

    await logAction({
      user: req.auth.user,
      action: ACTIONS.UPDATE,
      resource: "profile:password",
      entityType: "user",
      entityId: String(user._id),
      ipAddress: getClientIp(req),
      status: "SUCCESS",
      userAgent: getUserAgent(req),
      severity: "MEDIUM"
    });

    return res.json({ ok: true });
  }

  async function uploadPhoto(req, res) {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "missing_file" });

    const allowed = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
    if (!allowed.has(file.mimetype)) {
      safeUnlink(file.path);
      return res.status(400).json({ error: "unsupported_file_type" });
    }

    const user = await User.findById(req.auth.user._id).lean();
    const previousUrl = user.profilePhotoUrl;
    if (previousUrl?.startsWith("/uploads/")) {
      safeUnlink(path.join(uploadsDir(), path.basename(previousUrl)));
    }

    const url = `/uploads/${path.basename(file.path)}`;
    await User.updateOne({ _id: user._id }, { $set: { profilePhotoUrl: url } });

    await logAction({
      user: req.auth.user,
      action: ACTIONS.UPLOAD,
      resource: "profile:photo",
      entityType: "user",
      entityId: String(user._id),
      newValues: { profilePhotoUrl: url },
      ipAddress: getClientIp(req),
      status: "SUCCESS",
      userAgent: getUserAgent(req),
      severity: "LOW"
    });

    return res.json({ ok: true, profilePhotoUrl: url });
  }

  async function removePhoto(req, res) {
    const user = await User.findById(req.auth.user._id).lean();
    const previousUrl = user.profilePhotoUrl;
    if (previousUrl?.startsWith("/uploads/")) {
      safeUnlink(path.join(uploadsDir(), path.basename(previousUrl)));
    }
    await User.updateOne({ _id: user._id }, { $set: { profilePhotoUrl: null } });

    await logAction({
      user: req.auth.user,
      action: ACTIONS.DELETE,
      resource: "profile:photo",
      entityType: "user",
      entityId: String(user._id),
      ipAddress: getClientIp(req),
      status: "SUCCESS",
      userAgent: getUserAgent(req),
      severity: "LOW"
    });

    return res.json({ ok: true });
  }

  return { get, changePassword, uploadPhoto: [upload.single("file"), uploadPhoto], removePhoto };
}
