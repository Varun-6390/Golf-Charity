const mongoose = require("mongoose");

const ProofSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["cloudinary"], default: "cloudinary" },
    url: { type: String, default: "" },
    publicId: { type: String, default: "" },
    originalName: { type: String, default: "" },
  },
  { _id: false }
);

const WinnerSubmissionSchema = new mongoose.Schema(
  {
    drawId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    matchCount: { type: Number, enum: [3, 4, 5], required: true, index: true },

    proof: ProofSchema,

    adminDecision: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    adminDecisionAt: { type: Date, default: null },
    adminDecisionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

WinnerSubmissionSchema.index({ drawId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("WinnerSubmission", WinnerSubmissionSchema);

