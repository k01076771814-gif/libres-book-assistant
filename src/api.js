const { json, noContent, readJson } = require("./http");
const { loadBooks, findBook, purchaseLinksFor } = require("./books");
const { recommendBooks } = require("./recommender");
const { createAiClient } = require("./ai");
const { createPayments } = require("./payments");
const { createTelegram } = require("./telegram");

function createApi({ config, storage }) {
  const ai = createAiClient(config);
  const payments = createPayments({ config, storage });
  const telegram = createTelegram({ config, storage, payments });

  async function handle(req, res, url) {
    setCors(req, res, config);
    if (req.method === "OPTIONS") {
      noContent(res);
      return;
    }

    try {
      if (req.method === "GET" && url.pathname === "/api/health") {
        json(res, 200, {
          ok: true,
          service: "libres",
          time: new Date().toISOString(),
          aiConfigured: Boolean(config.openaiApiKey),
          telegramConfigured: Boolean(config.telegramBotToken)
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/config") {
        json(res, 200, publicConfig(config));
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/books") {
        const books = loadBooks().map(book => ({ ...book, purchaseLinks: purchaseLinksFor(book, config) }));
        json(res, 200, { ok: true, books });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/profile") {
        const user = await userFromQuery(storage, url);
        json(res, 200, await profilePayload(storage, user));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/settings") {
        const body = await readJson(req);
        const user = await userFromBody(storage, body);
        const nextSettings = {
          ...user.settings,
          ...pick(body.settings || {}, ["readSpeed", "notifications", "haptic"])
        };
        const updated = await storage.updateUser(user.id, { settings: nextSettings });
        json(res, 200, await profilePayload(storage, updated));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/recommendations") {
        const body = await readJson(req);
        const user = await userFromBody(storage, body);
        const isPremium = user.subscription?.status === "active";
        const books = recommendBooks(body.answers || body, user.settings).map((book, index) => ({
          ...book,
          locked: !isPremium && index > 0,
          purchaseLinks: purchaseLinksFor(book, config)
        }));
        await storage.appendMessage({ userId: user.id, type: "recommendations", answers: body.answers || body });
        json(res, 200, { ok: true, books, isPremium });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/library") {
        const body = await readJson(req);
        const user = await userFromBody(storage, body);
        const library = await storage.getLibrary(user.id);
        const bookId = Number(body.bookId);
        let item = library.find(entry => entry.id === bookId);
        if (!item) {
          item = { id: bookId, progress: Number(body.progress || 0), shelf: body.shelf || "want" };
          library.push(item);
        } else {
          Object.assign(item, pick(body, ["progress", "shelf"]));
          if (Number(item.progress) >= 100) {
            item.progress = 100;
            item.shelf = "finished";
          }
        }
        await storage.setLibrary(user.id, library);
        json(res, 200, await profilePayload(storage, user));
        return;
      }

      if (req.method === "DELETE" && url.pathname === "/api/library") {
        const body = await readJson(req);
        const user = await userFromBody(storage, body);
        const next = (await storage.getLibrary(user.id)).filter(item => item.id !== Number(body.bookId));
        await storage.setLibrary(user.id, next);
        json(res, 200, await profilePayload(storage, user));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/favorites") {
        const body = await readJson(req);
        const user = await userFromBody(storage, body);
        const bookId = Number(body.bookId);
        const favorites = new Set(await storage.getFavorites(user.id));
        if (body.favorite === false) favorites.delete(bookId);
        else favorites.add(bookId);
        await storage.setFavorites(user.id, Array.from(favorites));
        json(res, 200, await profilePayload(storage, user));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/chat") {
        const body = await readJson(req);
        const user = await userFromBody(storage, body);
        const book = findBook(body.bookId);
        if (!book) {
          json(res, 404, { ok: false, error: "book_not_found" });
          return;
        }
        if (user.subscription?.status !== "active") {
          json(res, 402, { ok: false, error: "premium_required" });
          return;
        }
        const answer = await ai.discussBook({ book, message: body.message, history: body.history || [] });
        await storage.appendMessage({ userId: user.id, type: "ai_chat", bookId: book.id, message: body.message, answer: answer.text });
        json(res, 200, { ok: true, answer: answer.text, provider: answer.provider });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/subscription/checkout") {
        const body = await readJson(req);
        const user = await userFromBody(storage, body);
        const checkout = await payments.createPremiumCheckout({ user, plan: body.plan || "monthly" });
        const updated = await storage.getUser(user.id) || user;
        json(res, 200, { ok: true, checkout, profile: await profilePayload(storage, updated) });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/purchase-links") {
        const book = findBook(url.searchParams.get("bookId"));
        if (!book) {
          json(res, 404, { ok: false, error: "book_not_found" });
          return;
        }
        json(res, 200, { ok: true, links: purchaseLinksFor(book, config) });
        return;
      }

      if (req.method === "POST" && url.pathname === "/webhooks/telegram") {
        const body = await readJson(req);
        const result = await telegram.handleWebhook(req, body);
        json(res, result.statusCode || 200, result);
        return;
      }

      json(res, 404, { ok: false, error: "not_found" });
    } catch (error) {
      const status = error.statusCode || 500;
      console.error(error);
      json(res, status, { ok: false, error: status === 500 ? "internal_error" : error.message });
    }
  }

  return { handle };
}

function setCors(req, res, config) {
  const origin = req.headers.origin || "";
  const allowed = !config.appOrigin || origin === config.appOrigin || /https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
  if (allowed) res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Telegram-Bot-Api-Secret-Token");
}

function publicConfig(config) {
  return {
    ok: true,
    appName: "Libres",
    premium: {
      monthly: config.premiumMonthlyPriceKopeks,
      yearly: config.premiumYearlyPriceKopeks,
      mockPayments: config.allowMockPayments && !config.telegramPaymentProviderToken
    }
  };
}

function userFromQuery(storage, url) {
  return storage.getOrCreateUser({
    telegramId: url.searchParams.get("telegramId") || undefined,
    userId: url.searchParams.get("userId") || undefined,
    name: url.searchParams.get("name") || undefined
  });
}

function userFromBody(storage, body) {
  return storage.getOrCreateUser({
    telegramId: body.telegramId || body.user?.telegramId,
    userId: body.userId || body.user?.id,
    name: body.name || body.user?.name
  });
}

async function profilePayload(storage, user) {
  return {
    ok: true,
    user,
    library: await storage.getLibrary(user.id),
    favorites: await storage.getFavorites(user.id)
  };
}

function pick(source, fields) {
  const result = {};
  for (const field of fields) {
    if (source[field] !== undefined) result[field] = source[field];
  }
  return result;
}

module.exports = { createApi };
