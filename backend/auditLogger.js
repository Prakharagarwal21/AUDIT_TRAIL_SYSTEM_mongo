import { AuditLog } from "./models/AuditLog.js";
import { SecurityAlert } from "./models/SecurityAlert.js";
import { User } from "./models/User.js";

export const ACTIONS = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  UPLOAD: "UPLOAD",
  DOWNLOAD: "DOWNLOAD",
  USER_CREATED: "USER_CREATED",
  PERMISSION_CHANGED: "PERMISSION_CHANGED"
};

const FAILED_LOGIN_WINDOW_MS = 10 * 60 * 1000;
const FAILED_LOGIN_SUSPICIOUS_THRESHOLD = 5;
const ACTION_RATE_WINDOW_MS = 5 * 60 * 1000;
const ACTION_RATE_SUSPICIOUS_THRESHOLD = 50;
const EMP_DELETE_WINDOW_MS = 60 * 1000;
const EMP_DELETE_THRESHOLD = 3;

function trunc(s, max) {
  const str = String(s || "");
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

export async function logAction({
  user,
  action,
  resource,
  ipAddress,
  status,
  userAgent = null,
  entityType = null,
  entityId = null,
  oldValues = null,
  newValues = null,
  severity = null
}) {
  let finalStatus = trunc(status, 20);
  const now = new Date();

  if (action !== ACTIONS.LOGIN_FAILED && user) {
    const since = new Date(now.getTime() - ACTION_RATE_WINDOW_MS);
    const count = await AuditLog.countDocuments({ userId: user._id, ipAddress, timestamp: { $gte: since } });
    if (count + 1 >= ACTION_RATE_SUSPICIOUS_THRESHOLD) finalStatus = "SUSPICIOUS";
  }

  await AuditLog.create({
    userId: user?._id || null,
    username: user?.username || null,
    action: trunc(action, 50),
    resource: trunc(resource, 255),
    entityType: entityType ? trunc(entityType, 50) : null,
    entityId: entityId ? trunc(entityId, 64) : null,
    oldValues,
    newValues,
    userAgent: userAgent ? trunc(userAgent, 255) : null,
    severity: severity ? trunc(severity, 20) : null,
    ipAddress: trunc(ipAddress, 50),
    status: finalStatus
  });
}

export async function isSuspiciousFailedLogin({ username, ipAddress }) {
  const since = new Date(Date.now() - FAILED_LOGIN_WINDOW_MS);
  const count = await AuditLog.countDocuments({
    action: ACTIONS.LOGIN_FAILED,
    ipAddress,
    resource: `auth:login:${username}`,
    timestamp: { $gte: since }
  });
  return count + 1 >= FAILED_LOGIN_SUSPICIOUS_THRESHOLD;
}

export async function maybeAutoBlockOnEmployeeDeletions({ user, ipAddress, userAgent }) {
  if (!user || user.role === "admin") return { blocked: false };
  if (user.isBlocked) return { blocked: true };

  const since = new Date(Date.now() - EMP_DELETE_WINDOW_MS);
  const count = await AuditLog.countDocuments({
    userId: user._id,
    action: ACTIONS.DELETE,
    entityType: "employee",
    timestamp: { $gte: since }
  });

  if (count >= EMP_DELETE_THRESHOLD) {
    await User.updateOne(
      { _id: user._id },
      { $set: { isBlocked: true, blockedReason: "Auto-block: excessive employee deletions", blockedAt: new Date() } }
    );
    await SecurityAlert.create({
      userId: user._id,
      username: user.username,
      alertType: "AUTO_BLOCK",
      severity: "CRITICAL",
      message: "Account auto-blocked: excessive employee deletions",
      ipAddress: trunc(ipAddress, 50) || "unknown",
      userAgent: userAgent ? trunc(userAgent, 255) : null,
      isRead: false
    });
    await AuditLog.create({
      userId: user._id,
      username: user.username,
      action: ACTIONS.PERMISSION_CHANGED,
      resource: `users:${user.username}:blocked`,
      entityType: "user",
      entityId: String(user._id),
      newValues: { isBlocked: true, reason: "Auto-block: excessive employee deletions" },
      userAgent: userAgent ? trunc(userAgent, 255) : null,
      severity: "CRITICAL",
      ipAddress: trunc(ipAddress, 50) || "unknown",
      status: "SUSPICIOUS"
    });
    return { blocked: true };
  }

  return { blocked: false };
}
