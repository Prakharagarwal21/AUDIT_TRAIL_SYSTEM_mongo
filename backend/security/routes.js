import { SecurityAlert } from "../models/SecurityAlert.js";
import { User } from "../models/User.js";
import { ACTIONS, logAction } from "../auditLogger.js";
import { getClientIp, getUserAgent } from "../middleware/auth.js";

export function securityRoutes() {
  async function get(req, res) {
    const alerts = await SecurityAlert.find({}).sort({ _id: -1 }).limit(50).lean();
    const blockedUsers = await User.find({ isBlocked: true }).select({ username: 1, role: 1, blockedReason: 1, blockedAt: 1 }).sort({ blockedAt: -1 }).lean();
    return res.json({ ok: true, alerts, blocked_users: blockedUsers });
  }

  async function post(req, res) {
    const action = String(req.body?.action || "").trim();
    if (action === "unblock") {
      const userId = String(req.body?.user_id || "").trim();
      const target = await User.findById(userId).lean();
      if (!target) return res.status(404).json({ error: "not_found" });

      await User.updateOne({ _id: userId }, { $set: { isBlocked: false, blockedReason: null, blockedAt: null }, $inc: { tokenVersion: 1 } });

      await logAction({
        user: req.auth.user,
        action: ACTIONS.PERMISSION_CHANGED,
        resource: `users:${target.username}:unblocked`,
        ipAddress: getClientIp(req),
        status: "SUCCESS",
        userAgent: getUserAgent(req),
        entityType: "user",
        entityId: userId,
        newValues: { isBlocked: false },
        severity: "MEDIUM"
      });

      return res.json({ ok: true });
    }

    if (action === "mark_read") {
      const alertId = String(req.body?.alert_id || "").trim();
      await SecurityAlert.updateOne({ _id: alertId }, { $set: { isRead: true } });
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "invalid_action" });
  }

  return { get, post };
}
