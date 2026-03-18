import mongoose from "mongoose";

const EmployeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, trim: true, maxlength: 255 },
    position: { type: String, required: true, trim: true, maxlength: 120 },
    department: { type: String, required: true, trim: true, maxlength: 120 },
    salary: { type: Number, required: true, min: 0 }
  },
  { timestamps: true, collection: "employees" }
);

export const Employee = mongoose.model("Employee", EmployeeSchema);
