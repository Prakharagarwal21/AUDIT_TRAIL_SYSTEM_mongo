import { z } from "zod";
import { Employee } from "../models/Employee.js";
import { Bonus } from "../models/Bonus.js";
import { ACTIONS, logAction, maybeAutoBlockOnEmployeeDeletions } from "../auditLogger.js";
import { getClientIp, getUserAgent } from "../middleware/auth.js";

const employeeSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(255),
  position: z.string().min(1).max(120),
  department: z.string().min(1).max(120),
  salary: z.coerce.number().positive()
});

export function employeeRoutes() {
  async function list(req, res) {
    const search = String(req.query.search || "").trim();
    const department = String(req.query.department || "").trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit || "200", 10) || 200, 1), 1000);
    const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);

    const q = {};
    if (department) q.department = department;
    if (search) q.$or = [{ name: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }, { position: { $regex: search, $options: "i" } }];

    const employees = await Employee.find(q).sort({ _id: -1 }).skip(offset).limit(limit).lean();

    const ids = employees.map((e) => e._id);
    const totals = await Bonus.aggregate([
      { $match: { employeeId: { $in: ids } } },
      { $group: { _id: "$employeeId", total: { $sum: "$amount" } } }
    ]);
    const totalMap = new Map(totals.map((t) => [String(t._id), t.total]));

    const withTotals = employees.map((e) => ({ ...e, totalBonuses: totalMap.get(String(e._id)) || 0 }));
    return res.json({ ok: true, employees: withTotals, limit, offset });
  }

  async function create(req, res) {
    const parsed = employeeSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });

    const user = req.auth.user;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);

    try {
      const employee = await Employee.create(parsed.data);
      await logAction({
        user,
        action: ACTIONS.CREATE,
        resource: `employee:${employee._id}`,
        entityType: "employee",
        entityId: String(employee._id),
        newValues: parsed.data,
        ipAddress,
        status: "SUCCESS",
        userAgent,
        severity: "LOW"
      });
      return res.status(201).json({ ok: true, employee });
    } catch (e) {
      return res.status(409).json({ error: "employee_create_failed" });
    }
  }

  async function update(req, res) {
    const id = String(req.body?.id || "").trim();
    if (!id) return res.status(400).json({ error: "invalid_id" });

    const parsed = employeeSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });

    const existing = await Employee.findById(id).lean();
    if (!existing) return res.status(404).json({ error: "not_found" });

    const user = req.auth.user;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);

    await Employee.updateOne({ _id: id }, { $set: parsed.data });
    const employee = await Employee.findById(id).lean();

    await logAction({
      user,
      action: ACTIONS.UPDATE,
      resource: `employee:${id}`,
      entityType: "employee",
      entityId: id,
      oldValues: { name: existing.name, email: existing.email, position: existing.position, department: existing.department, salary: existing.salary },
      newValues: parsed.data,
      ipAddress,
      status: "SUCCESS",
      userAgent,
      severity: "LOW"
    });

    return res.json({ ok: true, employee });
  }

  async function remove(req, res) {
    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).json({ error: "invalid_id" });

    const existing = await Employee.findById(id).lean();
    if (!existing) return res.status(404).json({ error: "not_found" });

    const user = req.auth.user;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);

    await Employee.deleteOne({ _id: id });
    await logAction({
      user,
      action: ACTIONS.DELETE,
      resource: `employee:${id}`,
      entityType: "employee",
      entityId: id,
      oldValues: { name: existing.name, email: existing.email, position: existing.position, department: existing.department, salary: existing.salary },
      ipAddress,
      status: "SUCCESS",
      userAgent,
      severity: "HIGH"
    });

    const { blocked } = await maybeAutoBlockOnEmployeeDeletions({ user, ipAddress, userAgent });
    if (blocked) {
      return res.json({
        ok: true,
        deleted: true,
        blocked: true,
        message: "Your account has been locked due to suspicious activity. Contact admin to unblock."
      });
    }

    return res.json({ ok: true, deleted: true });
  }

  return { list, create, update, remove };
}
