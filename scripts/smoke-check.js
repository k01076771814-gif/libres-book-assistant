const { spawn } = require("node:child_process");

const port = 4300 + Math.floor(Math.random() * 1000);
const server = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: "./data",
    ALLOW_MOCK_PAYMENTS: "true"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
server.stdout.on("data", chunk => {
  output += chunk.toString();
});
server.stderr.on("data", chunk => {
  output += chunk.toString();
});

main().catch(error => {
  console.error(error);
  console.error(output);
  process.exitCode = 1;
}).finally(() => {
  server.kill();
});

async function main() {
  await waitForServer();
  const base = `http://127.0.0.1:${port}`;

  const health = await getJson(`${base}/api/health`);
  assert(health.ok, "health must be ok");

  const profile = await getJson(`${base}/api/profile?userId=smoke`);
  assert(profile.ok, "profile must be ok");
  assert(Array.isArray(profile.library), "profile library must exist");

  const books = await getJson(`${base}/api/books`);
  assert(books.books.length >= 3, "books must load");

  const recommendations = await postJson(`${base}/api/recommendations`, {
    userId: "smoke",
    answers: { mood: "comfort", time: 8, tags: ["magic"] }
  });
  assert(recommendations.books.length === 3, "recommendations must return 3 books");

  const favorite = await postJson(`${base}/api/favorites`, {
    userId: "smoke",
    bookId: recommendations.books[0].id,
    favorite: true
  });
  assert(favorite.favorites.includes(recommendations.books[0].id), "favorite must persist");

  const checkout = await postJson(`${base}/api/subscription/checkout`, {
    userId: "smoke",
    plan: "monthly"
  });
  assert(checkout.checkout.status === "paid", "mock checkout must activate premium");
  assert(checkout.profile.user.subscription.status === "active", "premium must be active");

  const chat = await postJson(`${base}/api/chat`, {
    userId: "smoke",
    bookId: recommendations.books[0].id,
    message: "В чем смысл книги?"
  });
  assert(chat.answer, "chat must answer with OpenAI or fallback");

  console.log("Smoke check passed");
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    if (output.includes("Libres server listening")) return;
    await sleep(100);
  }
  throw new Error("Server did not start");
}

async function getJson(url) {
  const response = await fetch(url);
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
