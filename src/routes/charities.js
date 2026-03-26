const express = require("express");
const { z } = require("zod");

const Charity = require("../models/Charity");

const router = express.Router();

const listQuerySchema = z.object({
  q: z.string().trim().optional().default(""),
  featured: z
    .enum(["true", "false"])
    .optional()
    .default("false"),
});

router.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse({
    q: req.query.q,
    featured: req.query.featured,
  });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { q, featured } = parsed.data;
  const filter = {};
  if (featured === "true") filter.featured = true;

  if (q) {
    // Use text search if enabled; fallback to regex if text index missing.
    filter.$text = { $search: q };
  }

  const charities = await Charity.find(filter)
    .sort(featured === "true" ? { featured: -1, createdAt: -1 } : { createdAt: -1 })
    .limit(50)
    .lean();

  return res.json({ charities });
});

router.get("/:charityId", async (req, res) => {
  const charityId = req.params.charityId;
  const charity = await Charity.findById(charityId).lean();
  if (!charity) return res.status(404).json({ error: "Charity not found" });
  return res.json({ charity });
});

module.exports = router;

