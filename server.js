const { createServer } = require("node:http");
const { URL } = require("node:url");

const { config } = require("./src/config");
const { createStorage } = require("./src/storage");
const { createApi } = require("./src/api");
const { serveStatic } = require("./src/static");

const storage = createStorage(config);
const api = createApi({ config, storage });

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/webhooks/")) {
      await api.handle(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    }
    res.end(JSON.stringify({ ok: false, error: "internal_error" }));
  }
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Libres server listening on http://127.0.0.1:${config.port}`);
});
