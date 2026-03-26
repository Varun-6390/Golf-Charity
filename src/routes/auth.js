const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

const User = require("../models/User");
const CharityPreference = require("../models/CharityPreference");
const { env } = require("../config/env");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1).optional(),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password, name } = parsed.data;
  const existing = await User.findOne({ email }).lean();
  if (existing) return res.status(409).json({ error: "Email already in use" });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    email,
    passwordHash,
    role: "subscriber",
    isActive: true,
    profile: { name: name ?? "" },
  });

  return res.status(201).json({ user: { id: user._id, email: user.email, role: user.role } });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password } = parsed.data;
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  if (!user.isActive) return res.status(403).json({ error: "Account is inactive" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { sub: user._id.toString(), role: user.role, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  return res.json({
    token,
    user: { id: user._id, email: user.email, role: user.role, isActive: user.isActive },
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) return res.status(404).json({ error: "User not found" });

  const charityPref = await CharityPreference.findOne({ userId: req.user.id }).lean();

  return res.json({
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      profile: {
        ...user.profile,
        charityPreference: charityPref?.charityId,
        contributionPercentage: charityPref?.contributionPercent,
      },
    },
  });
});

module.exports = router;

