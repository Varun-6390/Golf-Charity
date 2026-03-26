const express = require("express");
const { z } = require("zod");

const Charity = require("../models/Charity");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const charityPayloadSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().default(""),
  images: z.array(z.string().url()).optional().default([]),
  featured: z.boolean().optional().default(false),
  events: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        date: z.coerce.date(),
        url: z.string().url().optional().default(""),
      })
    )
    .optional()
    .default([]),
});

router.post("/charities", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = charityPayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const created = await Charity.create(parsed.data);
  return res.status(201).json({ charity: created });
});

router.put("/charities/:charityId", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = charityPayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await Charity.findByIdAndUpdate(req.params.charityId, parsed.data, { new: true }).lean();
  if (!updated) return res.status(404).json({ error: "Charity not found" });
  return res.json({ charity: updated });
});

router.delete("/charities/:charityId", requireAuth, requireRole("admin"), async (req, res) => {
  const deleted = await Charity.findByIdAndDelete(req.params.charityId).lean();
  if (!deleted) return res.status(404).json({ error: "Charity not found" });
  return res.json({ deletedId: req.params.charityId });
});

module.exports = router;

