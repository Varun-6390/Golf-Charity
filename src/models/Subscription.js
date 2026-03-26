const mongoose = require("mongoose");

const SubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    plan: { type: String, enum: ["monthly", "yearly"], required: true },

    stripeCustomerId: { type: String, default: undefined },
    // Important for dev/test flows:
    // Do not default to an empty string, otherwise a sparse unique index can still collide.
    stripeSubscriptionId: { type: String, default: undefined, unique: true, sparse: true },

    status: {
      type: String,
      enum: ["active", "past_due", "canceled", "incomplete"],
      default: "incomplete",
      index: true,
    },

    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    renewalDate: { type: Date, default: null },

    // Stored as monthly-equivalent for easier draw calculations later.
    priceCentsMonthlyEquivalent: { type: Number, default: 0 },
  },
  { timestamps: true }
);

SubscriptionSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model("Subscription", SubscriptionSchema);

