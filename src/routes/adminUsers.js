const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const User = require("../models/User");
const Subscription = require("../models/Subscription");

const router = express.Router();

router.get("/users", requireAuth, requireRole("admin"), async (req, res) => {
  const users = await User.find({}).lean();
  
  // Use map to determine subscription status. For a real large-scale app, we could aggregate.
  const usersWithSubs = await Promise.all(users.map(async (u) => {
    const activeSub = await Subscription.findOne({ userId: u._id, status: "active" }).lean();
    return {
      _id: u._id,
      email: u.email,
      role: u.role,
      profile: u.profile,
      subscriptionStatus: activeSub ? "active" : "inactive"
    };
  }));

  res.json({ users: usersWithSubs });
});

module.exports = router;
