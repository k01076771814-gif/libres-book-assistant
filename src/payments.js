function createPayments({ config, storage }) {
  return {
    async createPremiumCheckout({ user, plan }) {
      const normalizedPlan = plan === "yearly" ? "yearly" : "monthly";
      const amount = normalizedPlan === "yearly"
        ? config.premiumYearlyPriceKopeks
        : config.premiumMonthlyPriceKopeks;

      const order = await storage.createOrder({
        userId: user.id,
        plan: normalizedPlan,
        amount,
        currency: "RUB",
        provider: config.telegramPaymentProviderToken ? "telegram" : "mock"
      });

      if (!config.telegramBotToken || !config.telegramPaymentProviderToken) {
        if (config.allowMockPayments) {
          await activateUserPremium({ storage, user, plan: normalizedPlan });
          await storage.updateOrder(order.id, { status: "paid", paidAt: new Date().toISOString(), provider: "mock" });
          return {
            orderId: order.id,
            status: "paid",
            provider: "mock",
            message: "Mock payment activated. Add Telegram payment tokens for production."
          };
        }

        return {
          orderId: order.id,
          status: "pending",
          provider: "not_configured",
          message: "Payment provider token is not configured."
        };
      }

      const invoice = await createTelegramInvoiceLink({ config, order, plan: normalizedPlan, amount });
      return {
        orderId: order.id,
        status: "pending",
        provider: "telegram",
        paymentUrl: invoice.result
      };
    },

    async activatePremium(user, plan = "monthly") {
      return activateUserPremium({ storage, user, plan });
    }
  };
}

async function createTelegramInvoiceLink({ config, order, plan, amount }) {
  const title = plan === "yearly" ? "Libres Premium на 12 месяцев" : "Libres Premium на 1 месяц";
  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/createInvoiceLink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      description: "Безлимитные подборы, альтернативные рекомендации и AI-обсуждение книг.",
      payload: order.id,
      provider_token: config.telegramPaymentProviderToken,
      currency: "RUB",
      prices: [{ label: title, amount }]
    })
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.description || "Telegram invoice failed");
  }
  return data;
}

async function activateUserPremium({ storage, user, plan }) {
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + (plan === "yearly" ? 12 : 1));
  return storage.updateUser(user.id, {
    subscription: {
      plan,
      status: "active",
      expiresAt: expiresAt.toISOString()
    }
  });
}

module.exports = { createPayments };
