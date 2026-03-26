const mongoose = require("mongoose");

const JackpotCarrySchema = new mongoose.Schema(
  {
    fromMonthKey: { type: String, required: true, index: true },
    toMonthKey: { type: String, required: true, unique: true, index: true },
    amountCents: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("JackpotCarry", JackpotCarrySchema);

