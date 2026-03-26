const mongoose = require("mongoose");

const WinnerEligibilitySchema = new mongoose.Schema(
  {
    drawId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    matchCount: { type: Number, enum: [3, 4, 5], required: true, index: true },
  },
  { timestamps: true }
);

WinnerEligibilitySchema.index({ drawId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("WinnerEligibility", WinnerEligibilitySchema);

