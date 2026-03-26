const mongoose = require("mongoose");

const CharityPreferenceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
    charityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: "Charity" },
    contributionPercent: { type: Number, required: true, min: 10, max: 100 },
    independentDonationEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CharityPreference", CharityPreferenceSchema);

