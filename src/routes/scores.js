const express = require("express");
const { z } = require("zod");

const Score = require("../models/Score");
const { requireAuth } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

const router = express.Router();

const scorePayloadSchema = z.object({
  scoreDate: z
    .coerce.date()
    .refine((d) => !Number.isNaN(d.getTime()), { message: "Invalid scoreDate" }),
  stableford: z.number().int().min(1).max(45),
});

function keepLatest5ByDate(userId) {
  return (async () => {
    const newest = await Score.find({ userId })
      .sort({ scoreDate: -1, createdAt: -1 })
      .limit(5)
      .select({ _id: 1 });

    const keepIds = newest.map((d) => d._id);
    await Score.deleteMany({ userId, _id: { $nin: keepIds } });
  })();
}

router.get("/scores", requireAuth, requireActiveSubscription, async (req, res) => {
  const scores = await Score.find({ userId: req.user.id })
    .sort({ scoreDate: -1, createdAt: -1 })
    .lean();

  return res.json({
    scores: scores.map((s) => ({
      id: s._id,
      scoreDate: s.scoreDate,
      stableford: s.stableford,
    })),
  });
});

router.post("/scores", requireAuth, requireActiveSubscription, async (req, res) => {
  const parsed = scorePayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { scoreDate, stableford } = parsed.data;
  if (Number.isNaN(scoreDate.getTime())) return res.status(400).json({ error: "Invalid scoreDate" });

  const doc = await Score.create({
    userId: req.user.id,
    scoreDate,
    stableford,
  });

  await keepLatest5ByDate(req.user.id);

  return res.status(201).json({
    id: doc._id,
    scoreDate: doc.scoreDate,
    stableford: doc.stableford,
  });
});

router.delete("/scores/:scoreId", requireAuth, requireActiveSubscription, async (req, res) => {
  const { scoreId } = req.params;
  
  const deleted = await Score.findOneAndDelete({ userId: req.user.id, _id: scoreId });
  if (!deleted) return res.status(404).json({ error: "Score not found" });

  await keepLatest5ByDate(req.user.id);

  return res.json({ success: true });
});

router.put("/scores/:scoreId", requireAuth, requireActiveSubscription, async (req, res) => {
  const { scoreId } = req.params;
  if (!scoreId) return res.status(400).json({ error: "Missing scoreId" });

  const updateSchema = z
    .object({
      scoreDate: z.coerce.date().refine((d) => !Number.isNaN(d.getTime()), { message: "Invalid scoreDate" }).optional(),
      stableford: z.number().int().min(1).max(45).optional(),
    })
    .refine((v) => v.scoreDate !== undefined || v.stableford !== undefined, {
      message: "Provide at least one of scoreDate or stableford",
    });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const set = {};
  if (parsed.data.scoreDate !== undefined) set.scoreDate = parsed.data.scoreDate;
  if (parsed.data.stableford !== undefined) set.stableford = parsed.data.stableford;

  const updated = await Score.findOneAndUpdate(
    { userId: req.user.id, _id: scoreId },
    { $set: set },
    { new: true }
  );

  if (!updated) return res.status(404).json({ error: "Score not found" });

  await keepLatest5ByDate(req.user.id);

  return res.json({
    id: updated._id,
    scoreDate: updated.scoreDate,
    stableford: updated.stableford,
  });
});

module.exports = router;

