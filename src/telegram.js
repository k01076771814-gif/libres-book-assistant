const { recommendBooks } = require("./recommender");

function createTelegram({ config, storage, payments }) {
  return {
    async handleWebhook(req, update) {
      if (config.telegramWebhookSecret) {
        const received = req.headers["x-telegram-bot-api-secret-token"];
        if (received !== config.telegramWebhookSecret) {
          return { ok: false, statusCode: 403, error: "bad_secret" };
        }
      }

      await storage.appendTelegramEvent(update);

      if (update.pre_checkout_query) {
        await answerPreCheckout(config, update.pre_checkout_query.id, true);
        return { ok: true };
      }

      if (update.message?.successful_payment) {
        const payload = update.message.successful_payment.invoice_payload;
        const order = await storage.findOrder(payload);
        if (order) {
          const user = await storage.getUser(order.userId);
          if (user) await payments.activatePremium(user, order.plan);
          await storage.updateOrder(order.id, { status: "paid", paidAt: new Date().toISOString() });
        }
        return { ok: true };
      }

      const message = update.message;
      if (!message?.chat?.id) return { ok: true };

      const text = message.text || "";
      const user = await storage.getOrCreateUser({
        telegramId: message.from?.id,
        name: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") || "Читатель"
      });

      if (/^\/start/.test(text)) {
        await sendMessage(config, message.chat.id, "Привет! Я книжный помощник Libres. Напиши, какое настроение и что хочется почитать, а я подберу варианты.");
        return { ok: true };
      }

      const books = recommendBooks({ text }, user.settings);
      const reply = books.map((book, index) => {
        const prefix = ["🥇", "🥈", "🥉"][index];
        return `${prefix} ${book.title} — ${book.author}\n${book.genre}, ${book.pages} стр.\n${book.whyFits}`;
      }).join("\n\n");
      await sendMessage(config, message.chat.id, reply);
      return { ok: true };
    }
  };
}

async function sendMessage(config, chatId, text) {
  if (!config.telegramBotToken) {
    console.log("Telegram mock message:", chatId, text);
    return;
  }
  await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

async function answerPreCheckout(config, preCheckoutQueryId, ok) {
  if (!config.telegramBotToken) return;
  await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/answerPreCheckoutQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pre_checkout_query_id: preCheckoutQueryId, ok })
  });
}

module.exports = { createTelegram };
