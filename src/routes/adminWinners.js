const express = require("express");
const { z } = require("zod");

const { requireAuth, requireRole } = require("../middleware/auth");
const MonthlyDraw = require("../models/MonthlyDraw");
const WinnerSubmission = require("../models/WinnerSubmission");
const Payout = require("../models/Payout");
const WinnerEligibility = require("../models/WinnerEligibility");
const User = require("../models/User");
const { sendEmail } = require("../services/email");

const router = express.Router();

async function resolveDrawId(idOrMonthKey) {
  if (!idOrMonthKey) return null;
  if (/^\d{4}-\d{2}$/.test(idOrMonthKey)) {
    const draw = await MonthlyDraw.findOne({ monthKey: idOrMonthKey }).lean();
    return draw?._id || null;
  }
  return idOrMonthKey;
}

router.get("/winners", requireAuth, requireRole("admin"), async (req, res) => {
  const { drawId: rawDrawId, status } = req.query ?? {};
  const filter = {};
  if (rawDrawId) {
    const resolvedId = await resolveDrawId(rawDrawId);
    if (resolvedId) filter.drawId = resolvedId;
  }
  if (status) filter.adminDecision = status;

  const submissions = await WinnerSubmission.find(filter)
    .populate({ path: "userId", select: "email role" })
    .lean();

  const submissionsWithPayouts = await Promise.all(submissions.map(async (sub) => {
    const payout = await Payout.findOne({ winnerSubmissionId: sub._id }).lean();
    return {
      ...sub,
      submissionStatus: sub.adminDecision,
      proofImageUrl: sub.proof?.url,
      payoutStatus: payout?.status || null,
      payoutRef: payout?._id || undefined,
    };
  }));

  return res.json({ submissions: submissionsWithPayouts });
});

const decisionSchema = z.object({
  adminDecision: z.enum(["approved", "rejected"]),
});

router.patch("/winners/:submissionId", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { adminDecision } = parsed.data;

  const existing = await WinnerSubmission.findById(req.params.submissionId)
    .populate({ path: "userId", select: "email role" })
    .lean();
  if (!existing) return res.status(404).json({ error: "Submission not found" });

  const shouldNotify = existing.adminDecision === "pending" && adminDecision === "approved";

  const updated = await WinnerSubmission.findOneAndUpdate(
    { _id: req.params.submissionId },
    {
      adminDecision,
      adminDecisionAt: new Date(),
      adminDecisionBy: req.user.id,
    },
    { new: true }
  )
    .lean();

  if (!updated) return res.status(404).json({ error: "Submission not found" });

  if (shouldNotify && existing.userId?.email) {
    try {
      await sendEmail({
        to: existing.userId.email,
        subject: "You are a monthly draw winner!",
        text: `Congratulations!\n\nYour winner submission for match tier ${existing.matchCount}-number was approved.\n\nPayout status: pending (admin will mark paid after processing).`,
      });
    } catch (_e) {
      // ignore
    }
  }

  return res.json({ submission: updated });
});

function splitCentsEvenly(totalCents, count) {
  if (count <= 0) return { perWinner: [], total: totalCents };
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  const amounts = new Array(count).fill(base);
  for (let i = 0; i < remainder; i++) amounts[i] += 1;
  return { perWinner: amounts, total: totalCents };
}

router.post("/payouts/:drawId", requireAuth, requireRole("admin"), async (req, res) => {
  const { drawId: rawDrawId } = req.params;
  const drawId = await resolveDrawId(rawDrawId);

  const draw = await MonthlyDraw.findById(drawId).lean();
  if (!draw) return res.status(404).json({ error: "Draw not found" });
  if (draw.status !== "published") return res.status(400).json({ error: "Draw must be published" });

  // Avoid double payout runs.
  const existing = await Payout.findOne({ drawId }).lean();
  if (existing) return res.status(409).json({ error: "Payouts already created for this draw" });

  const approved = await WinnerSubmission.find({
    drawId,
    adminDecision: "approved",
    matchCount: { $in: [3, 4, 5] },
  })
    .sort({ createdAt: 1 })
    .lean();

  const byTier = { 3: [], 4: [], 5: [] };
  for (const s of approved) byTier[s.matchCount].push(s);

  const tiers = [
    { matchCount: 3, totalCents: draw.tierTotalsCents?.tier3 ?? 0 },
    { matchCount: 4, totalCents: draw.tierTotalsCents?.tier4 ?? 0 },
    { matchCount: 5, totalCents: draw.tierTotalsCents?.tier5 ?? 0 },
  ];

  const created = [];
  for (const t of tiers) {
    const winners = byTier[t.matchCount] ?? [];
    if (winners.length === 0) continue;

    const { perWinner } = splitCentsEvenly(t.totalCents, winners.length);
    for (let i = 0; i < winners.length; i++) {
      const payout = await Payout.create({
        drawId,
        winnerSubmissionId: winners[i]._id,
        amountCents: perWinner[i],
        status: "pending",
      });
      created.push(payout);
    }
  }

  return res.json({ payoutsCreated: created.length, payouts: created.map((p) => ({ id: p._id, amountCents: p.amountCents, status: p.status })) });
});

router.get("/payouts", requireAuth, requireRole("admin"), async (req, res) => {
  const { drawId: rawDrawId } = req.query ?? {};
  if (!rawDrawId) return res.status(400).json({ error: "Missing drawId" });

  const drawId = await resolveDrawId(rawDrawId);
  const payouts = await Payout.find({ drawId }).sort({ createdAt: -1 }).lean();
  return res.json({ payouts });
});

router.post("/payouts/:payoutId/mark-paid", requireAuth, requireRole("admin"), async (req, res) => {
  const updated = await Payout.findOneAndUpdate(
    { _id: req.params.payoutId },
    {
      status: "paid",
      paidAt: new Date(),
      paidBy: req.user.id,
    },
    { new: true }
  ).lean();

  if (!updated) return res.status(404).json({ error: "Payout not found" });

  // Notify winner of paid payout (best-effort).
  try {
    const submission = await WinnerSubmission.findById(updated.winnerSubmissionId).lean();
    if (submission?.userId) {
      const user = await User.findById(submission.userId).select({ email: 1 }).lean();
      if (user?.email) {
        await sendEmail({
          to: user.email,
          subject: "Your payout has been paid",
          text: `Hi!\n\nYour payout is now marked as paid.\nAmount: ${(updated.amountCents / 100).toFixed(2)}\n\nThanks for supporting the charity!`,
        });
      }
    }
  } catch (_e) {
    // ignore
  }

  return res.json({ payout: updated });
});

module.exports = router;

