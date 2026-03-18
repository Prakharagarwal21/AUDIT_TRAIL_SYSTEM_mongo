import mongoose from "mongoose";

const AuditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    username: { type: String, default: null, index: true },
    action: { type: String, required: true, index: true, maxlength: 50 },
    resource: { type: String, required: true, maxlength: 255 },
    entityType: { type: String, default: null, index: true, maxlength: 50 },
    entityId: { type: String, default: null, maxlength: 64 },
    oldValues: { type: mongoose.Schema.Types.Mixed, default: null },
    newValues: { type: mongoose.Schema.Types.Mixed, default: null },
    userAgent: { type: String, default: null, maxlength: 255 },
    severity: { type: String, default: null, maxlength: 20 },
    ipAddress: { type: String, required: true, maxlength: 50 },
    status: { type: String, required: true, maxlength: 20 }
  },
  { timestamps: { createdAt: "timestamp", updatedAt: false }, collection: "audit_logs" }
);

export const AuditLog = mongoose.model("AuditLog", AuditLogSchema);
