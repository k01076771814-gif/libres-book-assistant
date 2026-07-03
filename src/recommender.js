const { loadBooks } = require("./books");

function recommendBooks(answers = {}, settings = {}) {
  const books = loadBooks().map(book => ({ ...book }));
  const mood = answers.mood || inferMood(answers.text || "");
  const tags = Array.isArray(answers.tags) ? answers.tags : inferTags(answers.text || "");
  const hours = Number(answers.time || answers.hours || 8);
  const readSpeed = settings.readSpeed || "medium";

  const speedWpm = readSpeed === "slow" ? 180 : readSpeed === "fast" ? 340 : 250;
  const userPageBudget = (hours * 60 * speedWpm) / 250;

  for (const book of books) {
    let score = 0;
    if (book.moods.includes(mood)) score += 5;
    if (book.genre && tags.some(tag => book.genre.toLowerCase().includes(tag))) score += 2;
    if (book.title && tags.some(tag => book.title.toLowerCase().includes(tag))) score += 3;
    if (book.author && tags.some(tag => book.author.toLowerCase().includes(tag))) score += 2;
    if (book.benefits) {
      const benefitText = book.benefits.join(" ").toLowerCase();
      score += tags.filter(tag => benefitText.includes(tag)).length * 2;
    }

    const pageDiff = Math.abs(book.pages - userPageBudget);
    if (pageDiff < 100) score += 4;
    else if (pageDiff < 250) score += 2;

    book.matchScore = score;
  }

  return books
    .sort((a, b) => b.matchScore - a.matchScore || b.rating - a.rating)
    .slice(0, 3)
    .map((book, index) => ({
      ...book,
      rank: index + 1,
      locked: index > 0
    }));
}

function inferMood(text) {
  const normalized = text.toLowerCase();
  if (/устал|тяжел|плох|работ|стресс|уют|отдох/.test(normalized)) return "comfort";
  if (/скуч|приключ|динами|космос|тайн/.test(normalized)) return "adventure";
  if (/дум|слож|вызов|психолог|антиутоп/.test(normalized)) return "challenge";
  return "comfort";
}

function inferTags(text) {
  const normalized = text.toLowerCase();
  const tags = [];
  if (/маг|волшеб|гарри|поттер|сказ/.test(normalized)) tags.push("magic", "гарри", "поттер");
  if (/космос|будущ|фантаст|дюн/.test(normalized)) tags.push("scifi", "фантаст");
  if (/детектив|убий|тайн|расслед/.test(normalized)) tags.push("detective", "детектив");
  if (/классик|семейн|роман/.test(normalized)) tags.push("classic", "класс");
  if (/психолог|драм|чувств/.test(normalized)) tags.push("drama", "психолог");
  return tags;
}

module.exports = { recommendBooks };
