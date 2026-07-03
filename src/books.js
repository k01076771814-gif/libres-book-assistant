const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let cachedBooks = null;

function loadBooks() {
  if (cachedBooks) return cachedBooks;

  const filePath = path.join(process.cwd(), "booksData.js");
  const code = fs.readFileSync(filePath, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "booksData.js" });

  cachedBooks = Array.isArray(sandbox.window.booksData) ? sandbox.window.booksData : [];
  return cachedBooks.map(book => ({ ...book }));
}

function findBook(bookId) {
  return loadBooks().find(book => book.id === Number(bookId)) || null;
}

function purchaseLinksFor(book, config) {
  const query = encodeURIComponent(`${book.title} ${book.author}`);
  return {
    paper: {
      label: "Бумажная",
      url: `https://www.chitai-gorod.ru/search?phrase=${query}`
    },
    ebook: {
      label: "Электронная",
      url: `https://www.litres.ru/search/?q=${query}`
    },
    audio: {
      label: "Аудио",
      url: `https://www.litres.ru/search/?q=${query}%20%D0%B0%D1%83%D0%B4%D0%B8%D0%BE`
    },
    source: config.publicBaseUrl
  };
}

module.exports = { loadBooks, findBook, purchaseLinksFor };
