const mongoose = require("mongoose");

const CharitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: "" },

    // Keep as URLs for simplicity; can be extended later for admin media management.
    images: { type: [String], default: [] },
    events: {
      type: [
        {
          title: { type: String, default: "" },
          date: { type: Date, default: null },
          url: { type: String, default: "" },
        },
      ],
      default: [],
    },

    featured: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Basic text search on name/description.
CharitySchema.index({ name: "text", description: "text" });

module.exports = mongoose.model("Charity", CharitySchema);

