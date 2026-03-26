const express = require("express");
const { z } = require("zod");

const Charity = require("../models/Charity");
const CharityPreference = require("../models/CharityPreference");
const { requireAuth } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

const router = express.Router();

router.get("/charity-preference", requireAuth, async (req, res) => {
  const pref = await CharityPreference.findOne({ userId: req.user.id }).populate("charityId").lean();
  if (!pref) return res.json({ selected: false, preference: null });

  return res.json({
    selected: true,
    preference: {
      charityId: pref.charityId?._id ?? pref.charityId,
      charity: pref.charityId,
      contributionPercent: pref.contributionPercent,
      independentDonationEnabled: pref.independentDonationEnabled,
    },
  });
});

const preferencePayloadSchema = z.object({
  charityId: z.string().min(1),
  contributionPercent: z.number().int().min(10).max(100),
});

router.put("/charity-preference", requireAuth, async (req, res) => {
  const parsed = preferencePayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { charityId, contributionPercent } = parsed.data;

  const charity = await Charity.findById(charityId).lean();
  if (!charity) return res.status(404).json({ error: "Charity not found" });

  const pref = await CharityPreference.findOneAndUpdate(
    { userId: req.user.id },
    {
      userId: req.user.id,
      charityId,
      contributionPercent,
    },
    { upsert: true, new: true }
  ).lean();

  return res.json({ selected: true, preference: pref });
});

module.exports = router;

