const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs");
const { z } = require("zod");

const { requireAuth } = require("../middleware/auth");
const WinnerEligibility = require("../models/WinnerEligibility");
const WinnerSubmission = require("../models/WinnerSubmission");
const Payout = require("../models/Payout");
const MonthlyDraw = require("../models/MonthlyDraw");

const router = express.Router();

const submitSchema = z.object({
  drawId: z.string().min(1),
  matchCount: z.union([
    z.enum(["3", "4", "5"]).transform((s) => Number(s)),
    z.number().int().refine((n) => [3, 4, 5].includes(n), { message: "matchCount must be 3, 4, or 5" }),
  ]),
  proof: z.object({
    provider: z.literal("cloudinary").optional().default("cloudinary"),
    url: z.string().url(),
    publicId: z.string().optional().default(""),
    originalName: z.string().optional().default(""),
  }),
});

router.post("/submit", requireAuth, async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { drawId, matchCount, proof } = parsed.data;
  
  let actualDrawId = drawId;
  // If drawId is a monthKey (YYYY-MM), resolve it to the ObjectId
  if (/^\d{4}-\d{2}$/.test(drawId)) {
    const draw = await MonthlyDraw.findOne({ monthKey: drawId }).lean();
    if (!draw) return res.status(404).json({ error: "Draw not found for this month" });
    actualDrawId = draw._id;
  }

  // Verify eligibility snapshot exists.
  const eligibility = await WinnerEligibility.findOne({
    drawId: actualDrawId,
    userId: req.user.id,
    matchCount,
  }).lean();
  if (!eligibility) return res.status(403).json({ error: "Not eligible for this draw/tier" });

  const existing = await WinnerSubmission.findOne({ drawId: actualDrawId, userId: req.user.id }).lean();
  if (existing) return res.status(409).json({ error: "Submission already exists" });

  const submission = await WinnerSubmission.create({
    drawId: actualDrawId,
    userId: req.user.id,
    matchCount,
    proof: {
      provider: proof.provider,
      url: proof.url,
      publicId: proof.publicId ?? "",
      originalName: proof.originalName ?? "",
    },
    adminDecision: "pending",
  });

  return res.status(201).json({
    id: submission._id,
    adminDecision: submission.adminDecision,
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const { drawId } = req.query ?? {};
  if (!drawId) return res.status(400).json({ error: "Missing drawId" });

  let actualDrawId = drawId;
  // If drawId is a monthKey (YYYY-MM), resolve it to the ObjectId
  if (/^\d{4}-\d{2}$/.test(drawId)) {
    const draw = await MonthlyDraw.findOne({ monthKey: drawId }).lean();
    if (!draw) {
      return res.json({
        eligible: false,
        matchCount: null,
        submission: null,
        payout: null,
      });
    }
    actualDrawId = draw._id;
  }

  const msg = `[${new Date().toISOString()}] User: ${req.user.id}, Draw Query: ${drawId}, Resolved: ${actualDrawId}\n`;
  fs.appendFileSync('eligibility_debug.txt', msg);

  const eligibility = await WinnerEligibility.findOne({
    drawId: new mongoose.Types.ObjectId(actualDrawId),
    userId: new mongoose.Types.ObjectId(req.user.id),
  }).lean();

  const resMsg = `[${new Date().toISOString()}] Result: ${eligibility ? 'Match ' + eligibility.matchCount : 'Not found'}\n`;
  fs.appendFileSync('eligibility_debug.txt', resMsg);

  if (!eligibility) {
    return res.json({
      eligible: false,
      matchCount: null,
      submission: null,
      payout: null,
    });
  }

  const submission = await WinnerSubmission.findOne({
    drawId: actualDrawId,
    userId: req.user.id,
    matchCount: eligibility.matchCount,
  }).lean();

  let payout = null;
  if (submission) {
    const p = await Payout.findOne({ winnerSubmissionId: submission._id }).lean();
    if (p) payout = p;
  }

  return res.json({
    eligible: true,
    matchCount: eligibility.matchCount,
    submission: submission
      ? {
          id: submission._id,
          adminDecision: submission.adminDecision,
          proof: submission.proof,
        }
      : null,
    payout: payout
      ? {
          id: payout._id,
          amountCents: payout.amountCents,
          status: payout.status,
          paidAt: payout.paidAt,
        }
      : null,
  });
});

module.exports = router;

