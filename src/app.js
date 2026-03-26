const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const healthRouter = require("./routes/health");
const authRouter = require("./routes/auth");
const uploadsRouter = require("./routes/uploads");
const scoresRouter = require("./routes/scores");
const adminDrawsRouter = require("./routes/adminDraws");
const winnersRouter = require("./routes/winners");
const adminWinnersRouter = require("./routes/adminWinners");
const adminSubscriptionsRouter = require("./routes/adminSubscriptions");
const drawsRouter = require("./routes/draws");
const charitiesRouter = require("./routes/charities");
const meCharityPreferenceRouter = require("./routes/meCharityPreference");
const adminCharitiesRouter = require("./routes/adminCharities");
const adminUsersRouter = require("./routes/adminUsers");
const billingRouter = require("./routes/billing");
const subscriptionRouter = require("./routes/subscription");

const app = express();

// Stripe webhooks require the raw body for signature verification.
app.use(
  "/api/billing/stripe-webhook",
  express.raw({ type: "application/json", limit: "2mb" })
);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/me", scoresRouter);
app.use("/api/me", meCharityPreferenceRouter);
app.use("/api/draws", drawsRouter);
app.use("/api/admin/draws", adminDrawsRouter);
app.use("/api/winners", winnersRouter);
app.use("/api/admin", adminWinnersRouter);
app.use("/api/admin/subscriptions", adminSubscriptionsRouter);
app.use("/api/admin", adminCharitiesRouter);
app.use("/api/admin", adminUsersRouter);
app.use("/api/charities", charitiesRouter);
app.use("/api/billing", billingRouter);
app.use("/api/me", subscriptionRouter);

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = { app };

