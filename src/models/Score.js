const mongoose = require("mongoose");

const ScoreSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    scoreDate: { type: Date, required: true, index: true },
    stableford: {
      type: Number,
      required: true,
      min: 1,
      max: 45,
      validate: {
        validator: Number.isInteger,
        message: "stableford must be an integer",
      },
    },
  },
  { timestamps: true }
);

ScoreSchema.index({ userId: 1, scoreDate: -1, createdAt: -1 });

module.exports = mongoose.model("Score", ScoreSchema);

