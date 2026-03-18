import { z } from "zod";
import mongoose from "mongoose";

import { Bonus } from "../models/Bonus.js";
import { Employee } from "../models/Employee.js";
import { ACTIONS, logAction } from "../auditLogger.js";
import { getClientIp, getUserAgent } from "../middleware/auth.js";

const createSchema = z.object({
  employeeId: z.string().min(1),
  amount: z.coerce.number().positive(),
  note: z.string().max(255).optional().default("")
});

export function bonusRoutes() {
  async function list(req, res) {
    const employeeId = String(req.query.employeeId || "").trim();
    const q = employeeId ? { employeeId: new mongoose.Types.ObjectId(employeeId) } : {};
    const bonuses = await Bonus.find(q).sort({ _id: -1 }).limit(500).lean();
    return res.json({ ok: true, bonuses });
  }

  async function create(req, res) {
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });

    const { employeeId, amount, note } = parsed.data;
    const employee = await Employee.findById(employeeId).lean();
    if (!employee) return res.status(404).json({ error: "employee_not_found" });

    const user = req.auth.user;
    const bonus = await Bonus.create({
      employeeId: employee._id,
      amount,
      note,
      createdByUserId: user._id,
      createdByUsername: user.username
    });

    await logAction({
      user,
      action: ACTIONS.CREATE,
      resource: `bonus:${bonus._id}`,
      entityType: "bonus",
      entityId: String(bonus._id),
      newValues: { employeeId: String(employee._id), amount, note },
      ipAddress: getClientIp(req),
      status: "SUCCESS",
      userAgent: getUserAgent(req),
      severity: "LOW"
    });

    return res.status(201).json({ ok: true, bonus });
  }

  async function remove(req, res) {
    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).json({ error: "invalid_id" });

    const bonus = await Bonus.findById(id).lean();
    if (!bonus) return res.status(404).json({ error: "not_found" });
    await Bonus.deleteOne({ _id: id });

    await logAction({
      user: req.auth.user,
      action: ACTIONS.DELETE,
      resource: `bonus:${id}`,
      entityType: "bonus",
      entityId: id,
      oldValues: { employeeId: String(bonus.employeeId), amount: bonus.amount, note: bonus.note },
      ipAddress: getClientIp(req),
      status: "SUCCESS",
      userAgent: getUserAgent(req),
      severity: "MEDIUM"
    });

    return res.json({ ok: true, deleted: true });
  }

  return { list, create, remove };
}

