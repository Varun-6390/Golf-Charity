const express = require("express");
const { z } = require("zod");

const { requireAuth, requireRole } = require("../middleware/auth");
const User = require("../models/User");
const Subscription = require("../models/Subscription");
const Score = require("../models/Score");
const MonthlyDraw = require("../models/MonthlyDraw");
const WinnerEligibility = require("../models/WinnerEligibility");
const JackpotCarry = require("../models/JackpotCarry");
const { sendEmail } = require("../services/email");

const router = express.Router();

function parseMonthKey(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const [y, m] = monthKey.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  const d = new Date(Date.UTC(y, m - 1, 1));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toMonthKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function randomDistinctNumbers(min, max, count) {
  const nums = [];
  for (let i = min; i <= max; i++) nums.push(i);
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }
  return nums.slice(0, count);
}

function weightedSampleWithoutReplacement(items, weights, count) {
  const remainingItems = items.slice();
  const remainingWeights = weights.slice();
  const picked = [];

  for (let k = 0; k < count; k++) {
    const total = remainingWeights.reduce((a, b) => a + b, 0);
    if (total <= 0) {
      // Fallback: uniform if weights are broken.
      const idx = Math.floor(Math.random() * remainingItems.length);
      picked.push(remainingItems[idx]);
      remainingItems.splice(idx, 1);
      remainingWeights.splice(idx, 1);
      continue;
    }

    const r = Math.random() * total;
    let acc = 0;
    let chosenIndex = -1;
    for (let i = 0; i < remainingWeights.length; i++) {
      acc += remainingWeights[i];
      if (r <= acc) {
        chosenIndex = i;
        break;
      }
    }

    // Safety fallback.
    if (chosenIndex < 0) chosenIndex = remainingWeights.length - 1;

    picked.push(remainingItems[chosenIndex]);
    remainingItems.splice(chosenIndex, 1);
    remainingWeights.splice(chosenIndex, 1);
  }

  return picked;
}

async function generateAlgorithmicDrawNumbers() {
  const activeSubs = await Subscription.find({ status: "active" }).select({ userId: 1 }).lean();
  const userIds = activeSubs.map((s) => s.userId);
  if (userIds.length === 0) return randomDistinctNumbers(1, 45, 5);

  // Because score system keeps "latest 5 only", each user has <= 5 Score docs.
  const scores = await Score.find({ userId: { $in: userIds } }).select({ stableford: 1 }).lean();

  const freq = new Map(); // stableford -> occurrences across all users' last-5
  for (const s of scores) {
    freq.set(s.stableford, (freq.get(s.stableford) ?? 0) + 1);
  }

  const numbers = [];
  const weights = [];
  let maxFreq = 0;
  for (let n = 1; n <= 45; n++) {
    maxFreq = Math.max(maxFreq, freq.get(n) ?? 0);
  }

  for (let n = 1; n <= 45; n++) {
    numbers.push(n);
    const f = freq.get(n) ?? 0;
    // Simple weighting (least frequent bias):
    // w(n) = maxFreq - freq(n) + 1
    weights.push(maxFreq - f + 1);
  }

  const picked = weightedSampleWithoutReplacement(numbers, weights, 5);
  return picked.sort((a, b) => a - b);
}

async function getMatchCounts(drawNumbers) {
  const activeSubs = await Subscription.find({ status: "active" }).select({ userId: 1 }).lean();
  const userIds = activeSubs.map((s) => s.userId);
  
  if (userIds.length === 0) return { eligibilities: [], counts: { tier3: 0, tier4: 0, tier5: 0 } };

  const scores = await Score.find({ userId: { $in: userIds } }).sort({ scoreDate: -1, createdAt: -1 }).lean();
  const scoresByUser = new Map();
  for (const sc of scores) {
    const key = String(sc.userId);
    const arr = scoresByUser.get(key) ?? [];
    if (arr.length < 5) {
      arr.push(sc.stableford);
      scoresByUser.set(key, arr);
    }
  }

  const eligibilities = [];
  let tier3 = 0, tier4 = 0, tier5 = 0;

  for (const uid of userIds) {
    const userScores = scoresByUser.get(String(uid)) ?? [];
    if (userScores.length < 5) continue;

    const matchCount = drawNumbers.filter(n => userScores.includes(n)).length;
    
    if (matchCount >= 3) {
      eligibilities.push({ userId: uid, matchCount });
      if (matchCount === 3) tier3++;
      if (matchCount === 4) tier4++;
      if (matchCount === 5) tier5++;
    }
  }

  return { eligibilities, counts: { tier3, tier4, tier5 } };
}

const simulateSchema = z.object({
  logicType: z.enum(["random", "algorithmic"]).default("random"),
});

router.post("/:monthKey/simulate", requireAuth, requireRole("admin"), async (req, res) => {
  const monthDate = parseMonthKey(req.params.monthKey);
  if (!monthDate) return res.status(400).json({ error: "Invalid monthKey. Expected YYYY-MM." });

  const parsed = simulateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  console.log(`[SIMULATE] Month: ${req.params.monthKey}, Mode: ${logicType}`);
  
  const drawNumbers =
    logicType === "algorithmic" ? await generateAlgorithmicDrawNumbers() : randomDistinctNumbers(1, 45, 5);

  console.log(`[SIMULATE] Result numbers:`, drawNumbers);

  // Calculate estimated prize pool for simulation feedback
  const activeSubs = await Subscription.find({ status: "active" }).lean();
  const subscriptionPoolCents = activeSubs.reduce((sum, s) => sum + (s.priceCentsMonthlyEquivalent ?? 0), 0);
  const prizePoolCents = Math.round(subscriptionPoolCents * 0.30);
  
  const rolloverCarry = await JackpotCarry.findOne({ toMonthKey: req.params.monthKey }).lean();
  const rolloverInCents = rolloverCarry?.amountCents ?? 0;

  const tier3 = Math.floor(prizePoolCents * 0.25);
  const tier4 = Math.floor(prizePoolCents * 0.35);
  const tier5Base = prizePoolCents - tier3 - tier4;
  const tier5Total = tier5Base + rolloverInCents;

  const doc = await MonthlyDraw.findOneAndUpdate(
    { monthKey: req.params.monthKey },
    {
      logicType,
      status: "simulation",
      drawNumbers,
      subscriptionPoolCents,
      prizePoolCents,
      rolloverInCents,
      tierTotalsCents: {
        tier3,
        tier4,
        tier5: tier5Total,
      },
      publishedAt: null,
      publishedBy: null,
    },
    { upsert: true, new: true }
  );

  const { counts } = await getMatchCounts(drawNumbers);

  return res.json({ 
    monthKey: doc.monthKey, 
    drawNumbers: doc.drawNumbers, 
    logicType: doc.logicType, 
    status: doc.status, 
    id: doc._id,
    prizePoolCents: doc.prizePoolCents,
    tierTotalsCents: doc.tierTotalsCents,
    eligibilityCounts: counts
  });
});

router.get("/:monthKey", requireAuth, requireRole("admin"), async (req, res) => {
  const monthDate = parseMonthKey(req.params.monthKey);
  if (!monthDate) return res.status(400).json({ error: "Invalid monthKey. Expected YYYY-MM." });

  const draw = await MonthlyDraw.findOne({ monthKey: req.params.monthKey }).lean();
  if (!draw) return res.status(404).json({ error: "Draw not found" });

  const { counts } = await getMatchCounts(draw.drawNumbers);

  return res.json({
    monthKey: draw.monthKey,
    drawNumbers: draw.drawNumbers,
    logicType: draw.logicType,
    status: draw.status,
    id: draw._id,
    prizePoolCents: draw.prizePoolCents,
    tierTotalsCents: draw.tierTotalsCents,
    eligibilityCounts: counts,
    publishedAt: draw.publishedAt
  });
});

const publishSchema = z.object({});

router.post("/:monthKey/publish", requireAuth, requireRole("admin"), async (req, res) => {
  const monthDate = parseMonthKey(req.params.monthKey);
  if (!monthDate) return res.status(400).json({ error: "Invalid monthKey. Expected YYYY-MM." });

  const parsed = publishSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const drawDoc = await MonthlyDraw.findOne({ monthKey: req.params.monthKey }).lean();
  const drawNumbers = drawDoc?.drawNumbers;

  if (!drawNumbers || drawNumbers.length !== 5) {
    return res.status(400).json({ error: "No simulated drawNumbers found; run /simulate first." });
  }

  const activeSubs = await Subscription.find({ status: "active" }).lean();
  const userIds = activeSubs.map((s) => s.userId);
  const subscriptionPoolCents = activeSubs.reduce((sum, s) => sum + (s.priceCentsMonthlyEquivalent ?? 0), 0);

  const rolloverCarry = await JackpotCarry.findOne({ toMonthKey: req.params.monthKey }).lean();
  const rolloverInCents = rolloverCarry?.amountCents ?? 0;

  // Prize pool: 30% of paid subscription fee (monthly-equivalent).
  const prizePoolCents = Math.round(subscriptionPoolCents * 0.30);

  // Tier fractions (40/35/25) with cents-safe rounding.
  const tier3 = Math.floor(prizePoolCents * 0.25);
  const tier4 = Math.floor(prizePoolCents * 0.35);
  const tier5Base = prizePoolCents - tier3 - tier4;
  const tier5Total = tier5Base + rolloverInCents;

  const { eligibilities, counts } = await getMatchCounts(drawNumbers);
  const { tier3: count3, tier4: count4, tier5: count5 } = counts;

  // Persist draw doc with computed totals.
  const updatedDraw = await MonthlyDraw.findOneAndUpdate(
    { monthKey: req.params.monthKey },
    {
      drawNumbers: drawNumbers.slice().sort((a, b) => a - b),
      status: "published",
      subscriptionPoolCents,
      prizePoolCents,
      rolloverInCents,
      tierTotalsCents: {
        tier3,
        tier4,
        tier5: tier5Total,
      },
      publishedAt: new Date(),
      publishedBy: req.user.id,
    },
    { upsert: true, new: true }
  );

  // Consume rollover-in so it cannot be applied multiple times if publish is re-run.
  if (rolloverCarry?._id) {
    await JackpotCarry.deleteOne({ _id: rolloverCarry._id });
  }

  // Remove existing eligibilities for safety, then insert snapshot.
  await WinnerEligibility.deleteMany({ drawId: updatedDraw._id });

  const eligibilityDocs = eligibilities.map((e) => ({ ...e, drawId: updatedDraw._id }));
  if (eligibilityDocs.length) {
    await WinnerEligibility.insertMany(eligibilityDocs);
  }

  // Notify active subscribers draw published.
  try {
    const subscribers = await User.find({ _id: { $in: userIds } }).select({ email: 1 }).lean();
    const drawText = `Month: ${req.params.monthKey}\nDraw numbers: ${drawNumbers.join(", ")}\n\nTier totals:\n5-match: ${(tier5Total / 100).toFixed(2)}\n4-match: ${(tier4 / 100).toFixed(2)}\n3-match: ${(tier3 / 100).toFixed(2)}\n\nEligible subscribers can upload proof in the app.`;

    await Promise.allSettled(
      subscribers.map((u) =>
        sendEmail({
          to: u.email,
          subject: "Monthly draw is live",
          text: drawText,
        })
      )
    );
  } catch (_e) {
    // Ignore email failures for prototype.
  }

  // Jackpot rollover: if no eligible 5-match winners, roll tier5Total into next month.
  const eligibleFive = count5 > 0;
  let jackpotRolloverCreated = false;
  if (!eligibleFive) {
    const nextMonthKey = toMonthKey(new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 1)));
    await JackpotCarry.findOneAndUpdate(
      { toMonthKey: nextMonthKey },
      { $inc: { amountCents: tier5Total } },
      { upsert: true, new: true }
    );
    jackpotRolloverCreated = true;
  }

  return res.json({
    monthKey: updatedDraw.monthKey,
    id: updatedDraw._id,
    drawNumbers: updatedDraw.drawNumbers,
    prizePoolCents: updatedDraw.prizePoolCents,
    tierTotalsCents: updatedDraw.tierTotalsCents,
    eligibilityCounts: { tier3: count3, tier4: count4, tier5: count5 },
    jackpotRolloverCreated,
  });
});

module.exports = router;

