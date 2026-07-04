const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function createJsonStorage(config) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const dbPath = path.join(config.dataDir, "db.json");
  if (!fs.existsSync(dbPath)) writeDb(dbPath, emptyDb());

  function read() {
    try {
      return JSON.parse(fs.readFileSync(dbPath, "utf8"));
    } catch {
      const db = emptyDb();
      writeDb(dbPath, db);
      return db;
    }
  }

  function write(db) {
    db.updatedAt = new Date().toISOString();
    writeDb(dbPath, db);
  }

  return {
    type: "json",
    async getDb() {
      return read();
    },
    async getOrCreateUser(identity = {}) {
      const db = read();
      const externalId = String(identity.telegramId || identity.userId || "demo");
      let user = db.users.find(item => item.externalId === externalId);
      if (!user) {
        user = {
          id: crypto.randomUUID(),
          externalId,
          telegramId: identity.telegramId || null,
          name: identity.name || "Читатель",
          settings: { readSpeed: "medium", notifications: true, haptic: true },
          subscription: { plan: "free", status: "inactive", expiresAt: null },
          createdAt: new Date().toISOString()
        };
        db.users.push(user);
        db.libraries[user.id] = defaultLibrary();
        db.favorites[user.id] = [2];
        write(db);
      }
      return user;
    },
    async updateUser(userId, patch) {
      const db = read();
      const user = db.users.find(item => item.id === userId);
      if (!user) return null;
      Object.assign(user, patch);
      write(db);
      return user;
    },
    async getUser(userId) {
      return read().users.find(item => item.id === userId) || null;
    },
    async getLibrary(userId) {
      return read().libraries[userId] || [];
    },
    async setLibrary(userId, library) {
      const db = read();
      db.libraries[userId] = library;
      write(db);
      return library;
    },
    async getFavorites(userId) {
      return read().favorites[userId] || [];
    },
    async setFavorites(userId, favorites) {
      const db = read();
      db.favorites[userId] = favorites;
      write(db);
      return favorites;
    },
    async createOrder(order) {
      const db = read();
      const item = {
        id: crypto.randomUUID(),
        status: "pending",
        createdAt: new Date().toISOString(),
        ...order
      };
      db.orders.push(item);
      write(db);
      return item;
    },
    async updateOrder(orderId, patch) {
      const db = read();
      const order = db.orders.find(item => item.id === orderId);
      if (!order) return null;
      Object.assign(order, patch, { updatedAt: new Date().toISOString() });
      write(db);
      return order;
    },
    async findOrder(orderId) {
      return read().orders.find(item => item.id === orderId) || null;
    },
    async appendMessage(message) {
      const db = read();
      db.messages.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...message });
      write(db);
    },
    async getRecommendedBooks(userId, limit = 50) {
      const messages = read().messages
        .filter(item => item.userId === userId && item.type === "consultation_recommendation")
        .slice(-limit);
      return messages.flatMap(item => item.recommendations || item.payload?.recommendations || []);
    },
    async getConsultationHistory(userId, limit = 12) {
      const messages = read().messages
        .filter(item => item.userId === userId && ["consultation_turn", "consultation_recommendation"].includes(item.type))
        .slice(-limit);
      return messages.flatMap(messageToHistory).slice(-limit);
    },
    async appendTelegramEvent(update) {
      const db = read();
      db.telegramEvents ||= [];
      db.telegramEvents.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), update });
      write(db);
    }
  };
}

function messageToHistory(item) {
  const history = [];
  if (item.message) history.push({ role: "user", content: item.message });
  if (item.answer) history.push({ role: "assistant", content: item.answer });
  if (!item.answer && item.recommendations?.length) {
    history.push({
      role: "assistant",
      content: `Рекомендовал: ${item.recommendations.map(book => `${book.title} — ${book.author}`).join("; ")}`
    });
  }
  return history;
}

function defaultLibrary() {
  return [
    { id: 1, progress: 65, shelf: "reading" },
    { id: 4, progress: 0, shelf: "want" }
  ];
}

function emptyDb() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    users: [],
    libraries: {},
    favorites: {},
    orders: [],
    messages: [],
    telegramEvents: []
  };
}

function writeDb(dbPath, db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
}

module.exports = { createJsonStorage, defaultLibrary };
