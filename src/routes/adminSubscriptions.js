const express = require("express");
const { z } = require("zod");

const { requireAuth, requireRole } = require("../middleware/auth");
const User = require("../models/User");
const Subscription = require("../models/Subscription");
const { sendEmail } = require("../services/email");

const router = express.Router();

const activateSchema = z.object({
  email: z.string().email(),
  plan: z.enum(["monthly", "yearly"]),
  // For draw calculations: store monthly-equivalent in cents.
  priceCentsMonthlyEquivalent: z.number().int().min(0),
  currentPeriodEndDays: z.number().int().min(1).max(365).default(30),
});

router.post("/activate", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, plan, priceCentsMonthlyEquivalent, currentPeriodEndDays } = parsed.data;

  const user = await User.findOne({ email: email.toLowerCase() }).lean();
  if (!user) return res.status(404).json({ error: "User not found" });

  const now = new Date();
  const end = new Date(now.getTime() + currentPeriodEndDays * 24 * 60 * 60 * 1000);

  const sub = await Subscription.findOneAndUpdate(
    { userId: user._id, status: { $in: ["active", "past_due", "canceled", "incomplete"] } },
    {
      userId: user._id,
      plan,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: end,
      renewalDate: end,
      priceCentsMonthlyEquivalent,
    },
    { upsert: true, new: true }
  );

  // Notify user (dev helper).
  try {
    const userEmail = user.email;
    await sendEmail({
      to: userEmail,
      subject: "Your subscription is active",
      text: `Hi!\n\nYour ${plan} subscription is now active.\nRenewal date: ${end.toDateString()}\n\nThanks for supporting the charity.`,
    });
  } catch (_e) {
    // Ignore email failures for now.
  }

  return res.json({
    subscription: sub,
  });
});

module.exports = router;

