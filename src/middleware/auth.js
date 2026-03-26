const jwt = require("jsonwebtoken");
const { env } = require("../config/env");

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    return next();
  };
}

module.exports = { requireAuth, requireRole };

