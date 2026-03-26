const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never return password hashes
    },
    role: {
      type: String,
      enum: ["subscriber", "admin"],
      default: "subscriber",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    profile: {
      name: { type: String, trim: true, default: "" },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);

