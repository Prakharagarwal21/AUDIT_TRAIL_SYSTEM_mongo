import { stringify } from "csv-stringify/sync";
import { AuditLog } from "../models/AuditLog.js";

function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function auditRoutes() {
  async function list(req, res) {
    const limit = Math.min(Math.max(parseInt(req.query.limit || "200", 10) || 200, 1), 1000);
    const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);
    const logs = await AuditLog.find({}).sort({ _id: -1 }).skip(offset).limit(limit).lean();
    return res.json({ ok: true, logs, limit, offset });
  }

  async function filter(req, res) {
    const limit = Math.min(Math.max(parseInt(req.query.limit || "200", 10) || 200, 1), 1000);
    const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);
    const username = String(req.query.user || "").trim();
    const action = String(req.query.action || "").trim();
    const start = parseDate(req.query.start);
    const end = parseDate(req.query.end);

    const q = {};
    if (username) q.username = username;
    if (action) q.action = action;
    if (start || end) q.timestamp = { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) };

    const logs = await AuditLog.find(q).sort({ _id: -1 }).skip(offset).limit(limit).lean();
    return res.json({ ok: true, logs, limit, offset });
  }

  async function search(req, res) {
    const limit = Math.min(Math.max(parseInt(req.query.limit || "200", 10) || 200, 1), 1000);
    const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);
    const keyword = String(req.query.q || "").trim();
    if (!keyword) return res.status(400).json({ error: "missing_query" });

    const rx = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const q = { $or: [{ username: rx }, { action: rx }, { resource: rx }, { ipAddress: rx }, { status: rx }] };

    const logs = await AuditLog.find(q).sort({ _id: -1 }).skip(offset).limit(limit).lean();
    return res.json({ ok: true, logs, limit, offset });
  }

  async function exportCsv(req, res) {
    const username = String(req.query.user || "").trim();
    const action = String(req.query.action || "").trim();
    const start = parseDate(req.query.start);
    const end = parseDate(req.query.end);
    const keyword = String(req.query.q || "").trim();

    const q = {};
    if (username) q.username = username;
    if (action) q.action = action;
    if (start || end) q.timestamp = { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) };
    if (keyword) {
      const rx = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      q.$or = [{ username: rx }, { action: rx }, { resource: rx }, { ipAddress: rx }, { status: rx }];
    }

    const logs = await AuditLog.find(q).sort({ _id: -1 }).limit(10000).lean();
    const records = logs.map((l) => [l.username || "", l.action || "", l.resource || "", l.timestamp?.toISOString?.() || "", l.ipAddress || "", l.status || ""]);
    const csv = stringify([["User", "Action", "Resource", "Timestamp", "IP Address", "Status"], ...records]);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=audit-logs.csv");
    return res.send(csv);
  }

  return { list, filter, search, exportCsv };
}

