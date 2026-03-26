const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(5000),

  MONGODB_URI: z.string().min(1),

  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default("7d"),

  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  CLOUDINARY_UPLOAD_PRESET: z.string().min(1),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_MONTHLY_ID: z.string().optional(),
  STRIPE_PRICE_YEARLY_ID: z.string().optional(),
  STRIPE_SUCCESS_URL: z.string().optional(),
  STRIPE_CANCEL_URL: z.string().optional(),

  // Email notifications (SMTP)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().optional(),

  ADMIN_SEED_EMAILS: z.string().optional(),
  ADMIN_SEED_PASSWORD: z.string().optional(),
});

const env = envSchema.parse(process.env);

module.exports = { env };

