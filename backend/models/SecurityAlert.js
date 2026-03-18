import mongoose from "mongoose";

const SecurityAlertSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    username: { type: String, default: null },
    alertType: { type: String, required: true, maxlength: 50 },
    severity: { type: String, required: true, maxlength: 20 },
    message: { type: String, required: true, maxlength: 255 },
    ipAddress: { type: String, required: true, maxlength: 50 },
    userAgent: { type: String, default: null, maxlength: 255 },
    isRead: { type: Boolean, default: false, index: true }
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false }, collection: "security_alerts" }
);

export const SecurityAlert = mongoose.model("SecurityAlert", SecurityAlertSchema);
