const nodemailer = require("nodemailer");
const { env } = require("../config/env");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM_EMAIL) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // common convention
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  return transporter;
}

async function sendEmail({ to, subject, text, html }) {
  // No-op fallback (so dev/prototype works without SMTP configured).
  const t = getTransporter();
  if (!t) {
    // eslint-disable-next-line no-console
    console.log("[email:no-smtp]", { to, subject, text: (text ?? "").slice(0, 200) });
    return { sent: false, reason: "SMTP not configured" };
  }

  if (!to) throw new Error("Missing email 'to'");
  if (!subject) throw new Error("Missing email 'subject'");

  await t.sendMail({
    from: env.SMTP_FROM_EMAIL,
    to,
    subject,
    text,
    html,
  });

  return { sent: true };
}

module.exports = { sendEmail };

