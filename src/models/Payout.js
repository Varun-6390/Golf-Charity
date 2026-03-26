const mongoose = require("mongoose");

const PayoutSchema = new mongoose.Schema(
  {
    drawId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    winnerSubmissionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
    },

    amountCents: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["pending", "paid"], default: "pending", index: true },
    paidAt: { type: Date, default: null },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payout", PayoutSchema);

