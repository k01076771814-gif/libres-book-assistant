const crypto = require("node:crypto");
const { Pool } = require("pg");
const { defaultLibrary } = require("./json");

function createPostgresStorage(config) {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : false
  });

  return {
    type: "postgres",
    pool,
    async getDb() {
      const [users, orders] = await Promise.all([
        pool.query("SELECT * FROM users ORDER BY created_at DESC LIMIT 100"),
        pool.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100")
      ]);
      return {
        users: users.rows.map(mapUser),
        orders: orders.rows.map(mapOrder)
      };
    },
    async getOrCreateUser(identity = {}) {
      const externalId = String(identity.telegramId || identity.userId || "demo");
      const existing = await pool.query("SELECT * FROM users WHERE external_id = $1", [externalId]);
      if (existing.rows[0]) return mapUser(existing.rows[0]);

      const id = crypto.randomUUID();
      const telegramId = identity.telegramId ? Number(identity.telegramId) : null;
      const name = identity.name || "Читатель";
      const settings = { readSpeed: "medium", notifications: true, haptic: true };
      const subscription = { plan: "free", status: "inactive", expiresAt: null };

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const created = await client.query(
          `INSERT INTO users (id, external_id, telegram_id, name, settings, subscription)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
           RETURNING *`,
          [id, externalId, telegramId, name, JSON.stringify(settings), JSON.stringify(subscription)]
        );
        for (const item of defaultLibrary()) {
          await client.query(
            `INSERT INTO library_items (user_id, book_id, progress, shelf)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, book_id) DO NOTHING`,
            [id, item.id, item.progress, item.shelf]
          );
        }
        await client.query(
          `INSERT INTO favorites (user_id, book_id)
           VALUES ($1, 2)
           ON CONFLICT (user_id, book_id) DO NOTHING`,
          [id]
        );
        await client.query("COMMIT");
        return mapUser(created.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") {
          const retry = await pool.query("SELECT * FROM users WHERE external_id = $1", [externalId]);
          if (retry.rows[0]) return mapUser(retry.rows[0]);
        }
        throw error;
      } finally {
        client.release();
      }
    },
    async updateUser(userId, patch) {
      const sets = [];
      const values = [];
      let index = 1;
      if (patch.settings !== undefined) {
        sets.push(`settings = $${index++}::jsonb`);
        values.push(JSON.stringify(patch.settings));
      }
      if (patch.subscription !== undefined) {
        sets.push(`subscription = $${index++}::jsonb`);
        values.push(JSON.stringify(patch.subscription));
      }
      if (patch.name !== undefined) {
        sets.push(`name = $${index++}`);
        values.push(patch.name);
      }
      if (sets.length === 0) return this.getUser(userId);
      sets.push("updated_at = now()");
      values.push(userId);
      const result = await pool.query(
        `UPDATE users SET ${sets.join(", ")} WHERE id = $${index} RETURNING *`,
        values
      );
      return result.rows[0] ? mapUser(result.rows[0]) : null;
    },
    async getUser(userId) {
      const result = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
      return result.rows[0] ? mapUser(result.rows[0]) : null;
    },
    async getLibrary(userId) {
      const result = await pool.query(
        `SELECT book_id, progress, shelf
         FROM library_items
         WHERE user_id = $1
         ORDER BY created_at ASC`,
        [userId]
      );
      return result.rows.map(row => ({ id: row.book_id, progress: row.progress, shelf: row.shelf }));
    },
    async setLibrary(userId, library) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM library_items WHERE user_id = $1", [userId]);
        for (const item of library) {
          await client.query(
            `INSERT INTO library_items (user_id, book_id, progress, shelf)
             VALUES ($1, $2, $3, $4)`,
            [userId, item.id, item.progress || 0, item.shelf || "want"]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return library;
    },
    async getFavorites(userId) {
      const result = await pool.query(
        "SELECT book_id FROM favorites WHERE user_id = $1 ORDER BY created_at ASC",
        [userId]
      );
      return result.rows.map(row => row.book_id);
    },
    async setFavorites(userId, favorites) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM favorites WHERE user_id = $1", [userId]);
        for (const bookId of favorites) {
          await client.query(
            `INSERT INTO favorites (user_id, book_id)
             VALUES ($1, $2)
             ON CONFLICT (user_id, book_id) DO NOTHING`,
            [userId, bookId]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return favorites;
    },
    async createOrder(order) {
      const id = crypto.randomUUID();
      const result = await pool.query(
        `INSERT INTO orders (id, user_id, plan, amount, currency, provider, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          id,
          order.userId,
          order.plan,
          order.amount,
          order.currency || "RUB",
          order.provider || "mock",
          order.status || "pending"
        ]
      );
      return mapOrder(result.rows[0]);
    },
    async updateOrder(orderId, patch) {
      const sets = [];
      const values = [];
      let index = 1;
      for (const [key, column] of Object.entries({
        status: "status",
        provider: "provider",
        paidAt: "paid_at"
      })) {
        if (patch[key] !== undefined) {
          sets.push(`${column} = $${index++}`);
          values.push(patch[key]);
        }
      }
      if (sets.length === 0) return this.findOrder(orderId);
      sets.push("updated_at = now()");
      values.push(orderId);
      const result = await pool.query(
        `UPDATE orders SET ${sets.join(", ")} WHERE id = $${index} RETURNING *`,
        values
      );
      return result.rows[0] ? mapOrder(result.rows[0]) : null;
    },
    async findOrder(orderId) {
      const result = await pool.query("SELECT * FROM orders WHERE id = $1", [orderId]);
      return result.rows[0] ? mapOrder(result.rows[0]) : null;
    },
    async appendMessage(message) {
      await pool.query(
        `INSERT INTO messages (id, user_id, type, book_id, payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          crypto.randomUUID(),
          message.userId || null,
          message.type,
          message.bookId || null,
          JSON.stringify(message)
        ]
      );
    },
    async getRecommendedBooks(userId, limit = 50) {
      const result = await pool.query(
        `SELECT payload
         FROM messages
         WHERE user_id = $1 AND type = 'consultation_recommendation'
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit]
      );
      return result.rows.flatMap(row => row.payload?.recommendations || []);
    },
    async getConsultationHistory(userId, limit = 12) {
      const result = await pool.query(
        `SELECT payload
         FROM messages
         WHERE user_id = $1 AND type IN ('consultation_turn', 'consultation_recommendation')
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit]
      );
      return result.rows
        .reverse()
        .flatMap(row => messageToHistory(row.payload || {}))
        .slice(-limit);
    },
    async appendTelegramEvent(update) {
      await pool.query(
        `INSERT INTO telegram_events (update_id, payload)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (update_id) DO NOTHING`,
        [update.update_id || null, JSON.stringify(update)]
      );
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

function mapUser(row) {
  return {
    id: row.id,
    externalId: row.external_id,
    telegramId: row.telegram_id,
    name: row.name,
    settings: row.settings,
    subscription: normalizeSubscription(row.subscription),
    createdAt: row.created_at?.toISOString?.() || row.created_at
  };
}

function mapOrder(row) {
  return {
    id: row.id,
    userId: row.user_id,
    plan: row.plan,
    amount: row.amount,
    currency: row.currency,
    provider: row.provider,
    status: row.status,
    paidAt: row.paid_at?.toISOString?.() || row.paid_at,
    createdAt: row.created_at?.toISOString?.() || row.created_at
  };
}

function normalizeSubscription(subscription) {
  if (!subscription) return { plan: "free", status: "inactive", expiresAt: null };
  return {
    plan: subscription.plan || "free",
    status: subscription.status || "inactive",
    expiresAt: subscription.expiresAt || subscription.expires_at || null
  };
}

module.exports = { createPostgresStorage };
