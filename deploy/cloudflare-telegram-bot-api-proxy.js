const TELEGRAM_API_ORIGIN = "https://api.telegram.org";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/webhook/telegram") {
      if (!env.BACKEND_WEBHOOK_URL) {
        return json({ ok: false, error: "backend_webhook_url_not_configured" }, 500);
      }

      ctx.waitUntil(forwardWebhook(request, env.BACKEND_WEBHOOK_URL));
      return json({ ok: true });
    }

    const match = url.pathname.match(/^\/bot([^/]+)\/([A-Za-z0-9_]+)$/);

    if (!match) {
      return json({ ok: false, error: "not_found" }, 404);
    }

    const token = match[1];
    if (env.ALLOWED_BOT_TOKEN && token !== env.ALLOWED_BOT_TOKEN) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const targetUrl = `${TELEGRAM_API_ORIGIN}${url.pathname}${url.search}`;
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("cf-connecting-ip");
    headers.delete("cf-ipcountry");
    headers.delete("cf-ray");
    headers.delete("x-forwarded-for");
    headers.delete("x-forwarded-proto");

    try {
      return await fetch(targetUrl, {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "follow"
      });
    } catch (error) {
      return json({ ok: false, error: "telegram_proxy_failed", message: error.message }, 502);
    }
  }
};

async function forwardWebhook(request, backendWebhookUrl) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("cf-ray");
  headers.delete("x-forwarded-for");
  headers.delete("x-forwarded-proto");

  const response = await fetch(backendWebhookUrl, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "follow"
  });

  if (!response.ok) {
    console.error("Backend webhook failed:", response.status, await response.text());
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
