const express = require("express");
const { requireAuth } = require("../middleware/auth");
const Subscription = require("../models/Subscription");

const router = express.Router();

router.get("/subscription", requireAuth, async (req, res) => {
  const active = await Subscription.findOne({ userId: req.user.id, status: "active" }).lean();
  if (active) {
    return res.json({
      status: "active",
      plan: active.plan,
      renewalDate: active.renewalDate ?? active.currentPeriodEnd,
      currentPeriodEnd: active.currentPeriodEnd,
    });
  }

  const latest = await Subscription.findOne({ userId: req.user.id }).sort({ currentPeriodEnd: -1, updatedAt: -1 }).lean();
  return res.json({
    status: "inactive",
    plan: latest?.plan ?? null,
    renewalDate: latest?.renewalDate ?? latest?.currentPeriodEnd ?? null,
    currentPeriodEnd: latest?.currentPeriodEnd ?? null,
  });
});

module.exports = router;

