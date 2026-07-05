const { findBook, loadBooks, purchaseLinksFor } = require("./books");

function createTelegram({ config, storage, payments, ai }) {
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

      if (update.callback_query) {
        await handleCallbackQuery({ config, storage, query: update.callback_query });
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

      const alreadyRecommended = typeof storage.getRecommendedBooks === "function"
        ? await storage.getRecommendedBooks(user.id)
        : [];
      const history = typeof storage.getConsultationHistory === "function"
        ? await storage.getConsultationHistory(user.id)
        : [];
      const consultation = ai
        ? await ai.consultBooks({
          message: text,
          history,
          alreadyRecommended,
          candidateBooks: loadBooks()
        })
        : null;

      if (consultation?.status === "need_more_questions") {
        await storage.appendMessage({
          userId: user.id,
          type: "consultation_turn",
          message: text,
          answer: consultation.message
        });
        await sendMessage(config, message.chat.id, consultation.message);
        return { ok: true };
      }

      const books = normalizeTelegramRecommendations(consultation?.recommendations || [], config);
      const isPremium = user.subscription?.status === "active";
      const reply = books.map((book, index) => {
        if (index > 0 && !isPremium) {
          const prefix = index === 1 ? "🥈" : "🥉";
          return `${prefix} Книга скрыта. Откройте в Mini App или подключите Premium ⭐`;
        }
        const prefix = ["🥇", "🥈", "🥉"][index];
        return [
          `${prefix} ${book.title} — ${book.author}`,
          `${book.genre}, ${book.pages} стр.`,
          book.whyFits
        ].join("\n");
      }).join("\n\n");
      await storage.appendMessage({
        userId: user.id,
        type: "consultation_recommendation",
        message: text,
        recommendations: books,
        answer: reply
      });
      await sendRecommendations(config, message.chat.id, books, isPremium);
      return { ok: true };
    }
  };
}

async function handleCallbackQuery({ config, storage, query }) {
  const data = String(query.data || "");
  const chatId = query.message?.chat?.id;
  const telegramId = query.from?.id;

  if (!data.startsWith("lib:add:") || !telegramId) {
    await answerCallbackQuery(config, query.id, "Команда не распознана");
    return;
  }

  const bookId = Number(data.slice("lib:add:".length));
  if (!Number.isFinite(bookId)) {
    await answerCallbackQuery(config, query.id, "Не получилось определить книгу");
    return;
  }

  const user = await storage.getOrCreateUser({
    telegramId,
    name: [query.from?.first_name, query.from?.last_name].filter(Boolean).join(" ") || "Читатель"
  });
  const library = await storage.getLibrary(user.id);
  let item = library.find(entry => Number(entry.id) === bookId);
  if (!item) {
    const recommendedBook = await findRecommendedBook(storage, user.id, bookId);
    const catalogBook = findBook(bookId);
    item = {
      id: bookId,
      progress: 0,
      shelf: "want",
      ...(recommendedBook && !catalogBook ? { book: compactBook(recommendedBook) } : {})
    };
    library.push(item);
  } else {
    item.shelf = item.shelf || "want";
  }
  await storage.setLibrary(user.id, library);

  await answerCallbackQuery(config, query.id, "Добавил в «Мои книги»");
  if (chatId) {
    await sendMessage(config, chatId, "Готово, добавил в «Мои книги» 📚", {
      reply_markup: {
        inline_keyboard: [[miniAppButton(config)]]
      }
    });
  }
}

async function findRecommendedBook(storage, userId, bookId) {
  if (typeof storage.getRecommendedBooks !== "function") return null;
  const books = await storage.getRecommendedBooks(userId, 20);
  return books.find(book => Number(book.id) === bookId) || null;
}

function compactBook(book) {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    genre: book.genre,
    pages: book.pages,
    whyFits: book.whyFits,
    annotation: book.annotation,
    coverGradient: book.coverGradient,
    coverEmoji: book.coverEmoji
  };
}

async function sendRecommendations(config, chatId, books, isPremium) {
  await sendMessage(config, chatId, "Подобрал варианты. Первую книгу можно сразу добавить в «Мои книги», а ссылки вынес ниже кнопками.", {
    reply_markup: {
      inline_keyboard: [[miniAppButton(config)]]
    }
  });

  for (const [index, book] of books.entries()) {
    const locked = index > 0 && !isPremium;
    if (locked) {
      const prefix = index === 1 ? "🥈" : "🥉";
      await sendMessage(config, chatId, `${prefix} Книга скрыта. Откройте в Mini App или подключите Premium ⭐`, {
        reply_markup: {
          inline_keyboard: [[miniAppButton(config)]]
        }
      });
      continue;
    }

    await sendMessage(config, chatId, recommendationText(book, index), {
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: recommendationKeyboard(config, book)
      }
    });
  }
}

function recommendationText(book, index) {
  const prefix = ["🥇", "🥈", "🥉"][index] || "📚";
  return [
    `${prefix} ${book.title} — ${book.author}`,
    `${book.genre}, ${book.pages} стр.`,
    "",
    book.whyFits
  ].join("\n");
}

function recommendationKeyboard(config, book) {
  return [
    [{ text: "📚 Добавить в Мои книги", callback_data: `lib:add:${book.id}` }],
    [
      { text: "📖 Бумажная", url: book.purchaseLinks.paper.url },
      { text: "📱 Электронная", url: book.purchaseLinks.ebook.url }
    ],
    [
      { text: "🎧 Аудио", url: book.purchaseLinks.audio.url },
      miniAppButton(config)
    ]
  ];
}

function miniAppButton(config) {
  return {
    text: "🚀 Mini App",
    web_app: { url: config.publicBaseUrl }
  };
}

function normalizeTelegramRecommendations(recommendations, config) {
  const books = loadBooks();
  const normalized = recommendations.slice(0, 3).map((recommendation, index) => {
    const existing = books.find(book => sameBook(book, recommendation));
    const book = existing || {
      id: generatedBookId(recommendation.title, recommendation.author),
      title: recommendation.title || "Книга без названия",
      author: recommendation.author || "Автор не указан",
      rating: 4.7,
      pages: Number(recommendation.pages) || 320,
      genre: recommendation.genre || "Художественная литература",
      whyFits: recommendation.reason || "Подходит под ваш запрос из диалога.",
      annotation: recommendation.annotation || "",
      moods: recommendation.moods || [],
      rank: index + 1
    };
    return { ...book, purchaseLinks: purchaseLinksFor(book, config) };
  });
  return normalized.length > 0 ? normalized : books.slice(0, 3).map(book => ({ ...book, purchaseLinks: purchaseLinksFor(book, config) }));
}

function sameBook(book, candidate) {
  return normalizeText(book.title) === normalizeText(candidate.title)
    && normalizeText(book.author) === normalizeText(candidate.author);
}

function generatedBookId(title = "", author = "") {
  let hash = 0;
  for (const char of `${title}|${author}`) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return 900000 + Math.abs(hash % 99999);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/ё/g, "е");
}

async function sendMessage(config, chatId, text, extra = {}) {
  if (!config.telegramBotToken) {
    console.log("Telegram mock message:", chatId, text, extra);
    return;
  }
  await telegramRequest(config, "sendMessage", {
    chat_id: chatId,
    text,
    ...extra
  });
}

async function telegramRequest(config, method, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const baseUrl = (config.telegramApiBaseUrl || "https://api.telegram.org").replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}/bot${config.telegramBotToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await response.text();
    if (!response.ok) {
      console.error("Telegram API error:", method, response.status, body);
      throw new Error(`Telegram ${method} failed with ${response.status}`);
    }
    return body ? JSON.parse(body) : { ok: true };
  } catch (error) {
    console.error("Telegram API request failed:", method, error.message);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function answerPreCheckout(config, preCheckoutQueryId, ok) {
  if (!config.telegramBotToken) return;
  await telegramRequest(config, "answerPreCheckoutQuery", {
    pre_checkout_query_id: preCheckoutQueryId,
    ok
  });
}

async function answerCallbackQuery(config, callbackQueryId, text) {
  if (!config.telegramBotToken) return;
  await telegramRequest(config, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false
  });
}

module.exports = { createTelegram };
