CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  telegram_id BIGINT,
  name TEXT NOT NULL DEFAULT 'Читатель',
  settings JSONB NOT NULL DEFAULT '{"readSpeed":"medium","notifications":true,"haptic":true}'::jsonb,
  subscription JSONB NOT NULL DEFAULT '{"plan":"free","status":"inactive","expiresAt":null}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_telegram_id_idx ON users (telegram_id);

CREATE TABLE IF NOT EXISTS library_items (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  shelf TEXT NOT NULL CHECK (shelf IN ('reading', 'want', 'finished')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS library_items_user_shelf_idx ON library_items (user_id, shelf);

CREATE TABLE IF NOT EXISTS favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly')),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  provider TEXT NOT NULL DEFAULT 'mock',
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_user_status_idx ON orders (user_id, status);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  book_id INTEGER,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_user_created_idx ON messages (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS telegram_events (
  id BIGSERIAL PRIMARY KEY,
  update_id BIGINT UNIQUE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
