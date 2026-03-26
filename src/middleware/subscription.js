const Subscription = require("../models/Subscription");

async function requireActiveSubscription(req, res, next) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const sub = await Subscription.findOne({ userId, status: "active" }).lean();
  if (!sub) return res.status(403).json({ error: "Active subscription required" });
  return next();
}

module.exports = { requireActiveSubscription };

