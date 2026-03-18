import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, required: true, trim: true, minlength: 3, maxlength: 100 },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "staff"], required: true },
    profilePhotoUrl: { type: String, default: null, maxlength: 255 },
    lastLoginAt: { type: Date, default: null },
    isBlocked: { type: Boolean, default: false },
    blockedReason: { type: String, default: null },
    blockedAt: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 }
  },
  { timestamps: true, collection: "users" }
);

export const User = mongoose.model("User", UserSchema);
