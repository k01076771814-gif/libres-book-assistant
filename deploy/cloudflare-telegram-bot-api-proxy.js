const TELEGRAM_API_ORIGIN = "https://api.telegram.org";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
