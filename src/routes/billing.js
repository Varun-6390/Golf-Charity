const express = require("express");
const { z } = require("zod");
const Stripe = require("stripe");

const { env } = require("../config/env");
const { requireAuth } = require("../middleware/auth");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const { sendEmail } = require("../services/email");

const router = express.Router();

function requireStripeConfig() {
  if (!env.STRIPE_SECRET_KEY) return "Missing STRIPE_SECRET_KEY";
  if (!env.STRIPE_PRICE_MONTHLY_ID || !env.STRIPE_PRICE_YEARLY_ID) return "Missing STRIPE_PRICE_MONTHLY_ID / STRIPE_PRICE_YEARLY_ID";
  if (!env.STRIPE_WEBHOOK_SECRET) return "Missing STRIPE_WEBHOOK_SECRET";
  return null;
}

const createSessionSchema = z.object({
  plan: z.enum(["monthly", "yearly"]),
});

router.post("/create-checkout-session", requireAuth, async (req, res) => {
  const configError = requireStripeConfig();
  if (configError) return res.status(400).json({ error: configError });

  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { plan } = parsed.data;
  const userId = req.user.id;

  const priceId = plan === "monthly" ? env.STRIPE_PRICE_MONTHLY_ID : env.STRIPE_PRICE_YEARLY_ID;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  const successUrl = env.STRIPE_SUCCESS_URL ?? "http://golf-charity-frontend-bice.vercel.app/subscription-success?session_id={CHECKOUT_SESSION_ID}";
  const cancelUrl = env.STRIPE_CANCEL_URL ?? "http://golf-charity-frontend-bice.vercel.app/subscribe";

  // Create a new subscription checkout session. Webhook will activate it in MongoDB.
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    customer_email: req.user.email,
    client_reference_id: String(userId),
    subscription_data: {
      metadata: {
        userId: String(userId),
      },
    },
    payment_method_types: ["card"],
  });

  return res.json({ sessionId: session.id, url: session.url });
});

router.get("/verify-session", requireAuth, async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session || !session.subscription) {
      return res.status(400).json({ error: "Invalid session or no subscription attached" });
    }

    const stripeSub = await stripe.subscriptions.retrieve(session.subscription, { expand: ["items.data.price"] });

    const items = stripeSub.items?.data ?? [];
    const price = items[0]?.price;
    const unitAmount = price?.unit_amount ?? 0;
    const interval = price?.recurring?.interval ?? "month";

    const priceCentsMonthlyEquivalent =
      interval === "year" ? Math.round((unitAmount ?? 0) / 12) : Math.round(unitAmount ?? 0);

    let status = "incomplete";
    if (stripeSub.status === "active") status = "active";
    if (stripeSub.status === "past_due") status = "past_due";
    if (stripeSub.status === "canceled") status = "canceled";
    if (stripeSub.status === "incomplete") status = "incomplete";

    const start = stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : null;
    const end = stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : null;
    const renewalDate = end;

    await Subscription.findOneAndUpdate(
      { userId: req.user.id },
      {
        userId: req.user.id,
        plan: interval === "year" ? "yearly" : "monthly",
        stripeCustomerId: stripeSub.customer ? String(stripeSub.customer) : undefined,
        stripeSubscriptionId: stripeSub.id,
        status,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        renewalDate,
        priceCentsMonthlyEquivalent,
      },
      { upsert: true, new: true }
    );

    return res.json({ success: true, status });
  } catch (err) {
    console.error("Session verification failed:", err);
    return res.status(500).json({ error: "Failed to verify session" });
  }
});

router.post("/stripe-webhook", async (req, res) => {
  const configError = requireStripeConfig();
  if (configError) return res.status(500).json({ error: configError });

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const signature = req.headers["stripe-signature"];
  if (!signature) return res.status(400).json({ error: "Missing stripe-signature header" });

  let event;
  try {
    const bodyString = req.body?.toString("utf8");
    event = stripe.webhooks.constructEvent(bodyString, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: "Invalid Stripe webhook signature" });
  }

  // Helper to upsert our subscription.
  async function upsertFromStripeSubscription(stripeSub) {
    const userIdFromMeta =
      stripeSub?.metadata?.userId ??
      stripeSub?.customer_details?.metadata?.userId ??
      stripeSub?.metadata?.client_reference_id ??
      stripeSub?.metadata?.clientReferenceId;

    if (!userIdFromMeta) return;

    const items = stripeSub.items?.data ?? [];
    const price = items[0]?.price;
    const unitAmount = price?.unit_amount ?? 0;
    const interval = price?.recurring?.interval ?? "month";

    const priceCentsMonthlyEquivalent =
      interval === "year" ? Math.round((unitAmount ?? 0) / 12) : Math.round(unitAmount ?? 0);

    let status = "incomplete";
    if (stripeSub.status === "active") status = "active";
    if (stripeSub.status === "past_due") status = "past_due";
    if (stripeSub.status === "canceled") status = "canceled";
    if (stripeSub.status === "incomplete") status = "incomplete";

    const start = stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : null;
    const end = stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : null;
    const renewalDate = end;

    await Subscription.findOneAndUpdate(
      { userId: userIdFromMeta, stripeSubscriptionId: stripeSub.id },
      {
        userId: userIdFromMeta,
        plan: interval === "year" ? "yearly" : "monthly",
        stripeCustomerId: stripeSub.customer ? String(stripeSub.customer) : undefined,
        stripeSubscriptionId: stripeSub.id,
        status,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        renewalDate,
        priceCentsMonthlyEquivalent,
      },
      { upsert: true, new: true }
    );

    return {
      userId: userIdFromMeta,
      status,
      plan: interval === "year" ? "yearly" : "monthly",
      renewalDate: end,
    };
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session?.metadata?.userId;
        if (!userId) break;

        // In subscription mode, session.subscription holds the Stripe subscription id.
        const stripeSubId = session?.subscription;
        if (!stripeSubId) break;

        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId, { expand: ["items.data.price"] });

        // Ensure metadata is on the subscription; if missing, don't block activation.
        // For checkout completion, activation status can still be "incomplete" depending on payment flow.
        await upsertFromStripeSubscription({ ...stripeSub, metadata: { ...(stripeSub.metadata ?? {}), userId } });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const stripeSub = event.data.object;
        const upserted = await upsertFromStripeSubscription(stripeSub);

        if (upserted?.userId) {
          try {
            const user = await User.findById(upserted.userId).select({ email: 1 }).lean();
            if (user?.email) {
              const renewalLine = upserted.renewalDate
                ? `Renewal date: ${new Date(upserted.renewalDate).toDateString()}`
                : "";
              const subject =
                upserted.status === "active"
                  ? "Your subscription is active"
                  : upserted.status === "past_due"
                  ? "Action needed: subscription payment overdue"
                  : upserted.status === "canceled"
                  ? "Your subscription has been canceled"
                  : "Subscription status update";

              const text = `Hi!\n\nYour subscription status is now: ${upserted.status}\nPlan: ${upserted.plan}\n${renewalLine}\n\nThanks for supporting the charity.`;

              // Best-effort: only send on meaningful status changes.
              await sendEmail({ to: user.email, subject, text });
            }
          } catch (_e) {
            // ignore email failures
          }
        }
        break;
      }

      default:
        break;
    }
  } catch (_e) {
    // Don't fail the webhook on internal processing errors (we can inspect logs later).
  }

  res.json({ received: true });
});

module.exports = router;

