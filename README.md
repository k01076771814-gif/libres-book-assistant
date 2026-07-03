# Libres Book Assistant

Telegram Mini App + bot backend for book recommendations, premium access, purchase links, and AI book discussion.

## What Is Included

- Static frontend: `index.html`, `styles.css`, `app.js`, `booksData.js`
- Node backend without external dependencies
- PostgreSQL storage via `DATABASE_URL`
- Local JSON fallback in `data/db.json` when `DATABASE_URL` is not set
- API routes under `/api/*`
- Telegram webhook under `/webhooks/telegram`
- OpenAI adapter via `OPENAI_API_KEY`
- Telegram payment invoice adapter via `TELEGRAM_PAYMENT_PROVIDER_TOKEN`
- Mock payments for development

## Local Start

```bash
npm start
```

Open:

```text
http://127.0.0.1:3000/
```

Health check:

```text
http://127.0.0.1:3000/api/health
```

## Environment

Copy `.env.example` to `.env` and fill real values:

```bash
cp .env.example .env
```

Required for production:

- `PUBLIC_BASE_URL` - deployed HTTPS domain
- `DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - AI discussion
- `TELEGRAM_BOT_TOKEN` - Telegram bot API
- `TELEGRAM_WEBHOOK_SECRET` - random secret for webhook validation
- `TELEGRAM_PAYMENT_PROVIDER_TOKEN` - Telegram payment provider token
- `ALLOW_MOCK_PAYMENTS=false`

Optional:

- `DATABASE_SSL=true` - use this for managed Postgres providers that require SSL

## Telegram Webhook

After deploy, set webhook:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=$PUBLIC_BASE_URL/webhooks/telegram" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

## API Overview

- `GET /api/health`
- `GET /api/config`
- `GET /api/books`
- `GET /api/profile?userId=...`
- `POST /api/settings`
- `POST /api/recommendations`
- `POST /api/library`
- `DELETE /api/library`
- `POST /api/favorites`
- `POST /api/chat`
- `POST /api/subscription/checkout`
- `GET /api/purchase-links?bookId=1`
- `POST /webhooks/telegram`

## Database

Production storage should be PostgreSQL.

Set:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
DATABASE_SSL=true
```

Then run migrations:

```bash
npm run db:migrate
```

If `DATABASE_URL` is not set, the app uses local JSON storage in `data/db.json`.
That mode is for development only.

### Amvera

For Amvera deployment:

1. Create or connect a PostgreSQL database.
2. Add `DATABASE_URL` to environment variables.
3. Add `DATABASE_SSL=true` if the provider requires SSL.
4. Run `npm run db:migrate` once after creating the database.
5. Deploy the app with `npm start`.

## Smoke Check

```bash
npm run check
```

The script starts the server, checks key API routes, writes test data, and verifies mock premium activation.
