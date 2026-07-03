const fs = require("node:fs");
const path = require("node:path");

loadEnvFile(path.join(process.cwd(), ".env"));

const config = {
  port: numberEnv("PORT", 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${numberEnv("PORT", 3000)}`,
  appOrigin: process.env.APP_ORIGIN || "",
  dataDir: path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data")),
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl: boolEnv("DATABASE_SSL", false),
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
  telegramPaymentProviderToken: process.env.TELEGRAM_PAYMENT_PROVIDER_TOKEN || "",
  allowMockPayments: boolEnv("ALLOW_MOCK_PAYMENTS", true),
  premiumMonthlyPriceKopeks: numberEnv("PREMIUM_MONTHLY_PRICE_KOPEKS", 19900),
  premiumYearlyPriceKopeks: numberEnv("PREMIUM_YEARLY_PRICE_KOPEKS", 150000)
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function boolEnv(name, fallback) {
  if (process.env[name] === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(process.env[name]).toLowerCase());
}

module.exports = { config };
