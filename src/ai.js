function createAiClient(config) {
  return {
    async discussBook({ book, message, history = [] }) {
      if (!config.openaiApiKey) {
        return {
          provider: "fallback",
          text: fallbackBookReply(book, message)
        };
      }

      const input = [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "Ты книжный консультант Libres.",
                "Отвечай по-русски, тепло и конкретно.",
                "Не выдумывай факты о книге, если не уверен.",
                "Помогай читателю обсудить смысл, настроение, персонажей и следующий шаг."
              ].join(" ")
            }
          ]
        },
        ...history.slice(-8).map(item => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: [{ type: item.role === "assistant" ? "output_text" : "input_text", text: item.content }]
        })),
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Книга: ${book.title}, автор: ${book.author}. Вопрос читателя: ${message}`
            }
          ]
        }
      ];

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.openaiApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.openaiModel,
          input,
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
    }
  };
}

function extractText(data) {
  if (typeof data.output_text === "string") return data.output_text.trim();
  if (!Array.isArray(data.output)) return "";
  return data.output
    .flatMap(item => Array.isArray(item.content) ? item.content : [])
    .map(part => part.text || "")
    .join("")
    .trim();
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
