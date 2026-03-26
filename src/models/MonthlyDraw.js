const mongoose = require("mongoose");

const MonthlyDrawSchema = new mongoose.Schema(
  {
    monthKey: { type: String, required: true, unique: true, index: true }, // YYYY-MM

    logicType: { type: String, enum: ["random", "algorithmic"], default: "random" },
    status: { type: String, enum: ["simulation", "published"], default: "simulation", index: true },

    // Canonical 5 distinct stableford numbers (1..45).
    drawNumbers: {
      type: [Number],
      default: [],
      validate: (v) => Array.isArray(v) && v.length === 5,
    },

    // Prize pool: 30% of paid subscription fee (monthly-equivalent for yearly).
    subscriptionPoolCents: { type: Number, default: 0 }, // sum(monthly-equivalent subscription price)
    prizePoolCents: { type: Number, default: 0 },

    rolloverInCents: { type: Number, default: 0 }, // jackpot carry into this month (tier 5)

    // tier3/4 are based on prizePoolCents fractions; tier5 includes rolloverInCents.
    tierTotalsCents: {
      tier3: { type: Number, default: 0 },
      tier4: { type: Number, default: 0 },
      tier5: { type: Number, default: 0 },
    },

    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MonthlyDraw", MonthlyDrawSchema);

