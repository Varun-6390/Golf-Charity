require("dotenv").config();

const { env } = require("./config/env");
const { connectToMongo } = require("./db/connect");
const { app } = require("./app");
const bcrypt = require("bcrypt");
const User = require("./models/User");

const PORT = process.env.PORT || 5000;

async function seedAdminsIfNeeded() {
  if (!env.ADMIN_SEED_EMAILS || !env.ADMIN_SEED_PASSWORD) return;

  const emails = env.ADMIN_SEED_EMAILS
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) return;

  const passwordHash = await bcrypt.hash(env.ADMIN_SEED_PASSWORD, 12);

  for (const email of emails) {
    const existing = await User.findOne({ email });
    if (existing) continue;

    await User.create({
      email,
      passwordHash,
      role: "admin",
      isActive: true,
      profile: { name: "Admin" },
    });
  }
}

async function main() {
  console.log("Starting server...");

  await connectToMongo();
  console.log("MongoDB connected ✅");

  await seedAdminsIfNeeded();
  console.log("Seeding done ✅");

  app.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
