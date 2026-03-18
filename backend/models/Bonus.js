import mongoose from "mongoose";

const BonusSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, default: "", maxlength: 255 },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdByUsername: { type: String, required: true }
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false }, collection: "bonuses" }
);

export const Bonus = mongoose.model("Bonus", BonusSchema);

