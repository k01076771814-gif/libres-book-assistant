function createAiClient(config) {
  return {
    async discussBook({ book, message, history = [] }) {
      if (!config.openaiApiKey) {
        return {
          provider: "fallback",
          text: fallbackBookReply(book, message)
        };
      }

      const messages = [
        {
          role: "system",
          content: "Ты книжный консультант Libres. Отвечай по-русски, тепло и конкретно. Не выдумывай факты о книге, если не уверен. Помогай читателю обсудить смысл, настроение, персонажей и следующий шаг."
        },
        ...history.slice(-8).map(item => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.content
        })),
        {
          role: "user",
          content: `Книга: ${book.title}, автор: ${book.author}. Вопрос читателя: ${message}`
        }
      ];

      const response = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.openaiApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.openaiModel || "gpt-4o-mini",
          messages,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const body = await response.text();
        console.error("OpenAI error:", response.status, body);
        return {
          provider: "fallback",
          text: fallbackBookReply(book, message)
        };
      }

      const data = await response.json();
      return {
        provider: "openai",
        text: extractText(data) || fallbackBookReply(book, message)
      };
    },

    async consultBooks({ message, history = [], alreadyRecommended = [], candidateBooks = [] }) {
      if (!config.openaiApiKey) {
        return fallbackConsultation({ message, history, alreadyRecommended, candidateBooks });
      }

      const knownBooks = candidateBooks.slice(0, 40).map(book => ({
        title: book.title,
        author: book.author,
        genre: book.genre,
        pages: book.pages,
        moods: book.moods
      }));
      const messages = [
        {
          role: "system",
          content: [
            "Ты живой книжный консультант Libres.",
            "Веди короткий теплый диалог по-русски: если вкуса читателя еще недостаточно, задай 1-2 уточняющих вопроса и не рекомендуй книгу преждевременно.",
            "Когда информации достаточно, выдай 1 основную рекомендацию и до 2 альтернатив.",
            "Не повторяй книги из alreadyRecommended.",
            "Не выдумывай несуществующие книги. Если выбираешь книгу вне knownBooks, бери только реально известные книги.",
            "Отвечай только валидным JSON без markdown.",
            "Формат: {\"status\":\"need_more_questions\",\"message\":\"...\"} или {\"status\":\"ready_to_recommend\",\"message\":\"...\",\"recommendations\":[{\"title\":\"...\",\"author\":\"...\",\"genre\":\"...\",\"pages\":320,\"reason\":\"...\",\"annotation\":\"...\",\"moods\":[\"comfort\"],\"tags\":[\"...\"]}]}."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            alreadyRecommended,
            knownBooks,
            dialogue: [
              ...history.slice(-10),
              { role: "user", content: message }
            ]
          })
        }
      ];

      const response = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.openaiApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.openaiModel || "gpt-4o-mini",
          messages,
          temperature: 0.65
        })
      });

      if (!response.ok) {
        const body = await response.text();
        console.error("OpenAI consultation error:", response.status, body);
        return fallbackConsultation({ message, history, alreadyRecommended, candidateBooks });
      }

      const data = await response.json();
      return parseConsultation(extractText(data)) || fallbackConsultation({ message, history, alreadyRecommended, candidateBooks });
    }
  };
}

function extractText(data) {
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function parseConsultation(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!["need_more_questions", "ready_to_recommend"].includes(parsed.status)) return null;
    if (!parsed.message) return null;
    return parsed;
  } catch {
    return null;
  }
}

function fallbackConsultation({ message, history = [], alreadyRecommended = [], candidateBooks = [] }) {
  const userTurns = history.filter(item => item.role === "user").length + 1;
  if (userTurns < 2) {
    return {
      status: "need_more_questions",
      message: "Понял. Давай чуть точнее поймаем настроение: тебе сейчас ближе уютное чтение, напряженная интрига, психологическая глубина или большое приключение? И хочется коротко на вечер или можно роман поплотнее?"
    };
  }

  const seen = new Set(alreadyRecommended.map(item => normalizeKey(item.title, item.author)));
  const dialogueText = [
    ...history.map(item => item.content),
    message
  ].join(" ").toLowerCase();
  const available = candidateBooks
    .filter(book => !seen.has(normalizeKey(book.title, book.author)))
    .map(book => ({ ...book, fallbackScore: fallbackBookScore(book, dialogueText) }))
    .sort((a, b) => b.fallbackScore - a.fallbackScore || (b.rating || 0) - (a.rating || 0));
  const recommendations = available.slice(0, 3).map(book => ({
    title: book.title,
    author: book.author,
    genre: book.genre,
    pages: book.pages,
    reason: book.whyFits,
    annotation: book.annotation,
    moods: book.moods || [],
    tags: []
  }));

  return {
    status: "ready_to_recommend",
    message: "Кажется, я уже понял направление. Я выбрал варианты, которые лучше всего совпадают с твоим настроением и не повторяют то, что уже советовал раньше.",
    recommendations
  };
}

function normalizeKey(title, author) {
  return `${String(title || "").trim().toLowerCase()}|${String(author || "").trim().toLowerCase()}`;
}

function fallbackBookScore(book, text) {
  const haystack = [
    book.title,
    book.author,
    book.genre,
    book.annotation,
    book.whyFits,
    ...(book.benefits || []),
    ...(book.moods || [])
  ].join(" ").toLowerCase();
  let score = 0;

  if (/мрач|темн|тяжел|антиутоп|без хоррор|не хоррор/.test(text)) {
    if (/антиутоп|мрач|тоталитар|власть|темн|dark|challenge/.test(haystack)) score += 8;
    if (/маг|уют|волшеб|comfort/.test(haystack)) score -= 5;
  }
  if (/психолог|персонаж|атмосфер|душ|разум|чувств|драм/.test(text)) {
    if (/психолог|драм|разум|чувств|выбор|внутрен|персонаж|drama/.test(haystack)) score += 7;
  }
  if (/детектив|тайн|интриг|расслед/.test(text)) {
    if (/детектив|тайн|убий|расслед|интриг/.test(haystack)) score += 7;
  }
  if (/фантаст|космос|будущ|масштаб/.test(text)) {
    if (/фантаст|космос|будущ|планет|науч/.test(haystack)) score += 7;
  }
  if (/уют|легк|отдох|тепл/.test(text)) {
    if (/уют|тепл|семейн|comfort|волшеб/.test(haystack)) score += 7;
  }
  if (/коротк|вечер|быстр/.test(text) && Number(book.pages) <= 360) score += 3;
  if (/длин|плотн|неспеш|толст/.test(text) && Number(book.pages) >= 400) score += 2;

  return score;
}

function fallbackBookReply(book, message) {
  const lower = String(message || "").toLowerCase();
  if (/почему|зачем|смысл/.test(lower)) {
    return `В «${book.title}» сильнее всего работает вопрос выбора: что герой готов сохранить в себе, когда обстоятельства давят. Я бы читал эту книгу не только ради сюжета, а ради внутреннего спора, который она запускает.`;
  }
  if (/похож|следующ|посовет/.test(lower)) {
    return `Если тебе откликнулась «${book.title}», следующую книгу лучше выбирать по тому же эмоциональному следу: ${book.genre.toLowerCase()}, сильная атмосфера и ясный конфликт. Хочешь, я подберу 3 варианта после пары вопросов?`;
  }
  return `«${book.title}» ${book.author} хорошо обсуждать через настроение и главный конфликт. Что тебе ближе: поговорить о героях, смысле финала или о том, почему книга могла попасть именно в твой запрос?`;
}

module.exports = { createAiClient };
