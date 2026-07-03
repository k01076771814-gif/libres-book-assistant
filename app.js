// ==========================================================================
// APPLICATION STATE
// ==========================================================================
const state = {
  library: [
    {
      id: 1, // 1984
      progress: 65,
      shelf: "reading" // reading, want, finished
    },
    {
      id: 4, // Little Women
      progress: 0,
      shelf: "want"
    }
  ],
  favorites: [2], // Prefill Harry Potter
  quizAnswers: {
    mood: null,
    time: 8,
    tags: []
  },
  quizChatStep: null, // null, 1 (mood), 2 (favorites/tags), 3 (volume)
  selectedBook: null,
  aiChatContext: null, // Track currently discussed book
  settings: {
    readSpeed: "medium", // slow, medium, fast
    notifications: true,
    haptic: true
  },
  
  // Commercial features
  isPremium: false,
  pickCount: 0 // Number of matches executed in session
};

let activeShelf = "reading";

// ==========================================================================
// DOM ELEMENTS
// ==========================================================================
const DOM = {
  tgHistory: document.getElementById("tgHistory"),
  tgMessageInput: document.getElementById("tgMessageInput"),
  tgSendBtn: document.getElementById("tgSendBtn"),
  tgReplyKeyboard: document.getElementById("tgReplyKeyboard"),
  tgSuggestionBar: document.getElementById("tgSuggestionBar"),
  
  tgMiniAppView: document.getElementById("tgMiniAppView"),
  maCloseBtn: document.getElementById("maCloseBtn"),
  maReloadBtn: document.getElementById("maReloadBtn"),
  maTitle: document.getElementById("maTitle"),
  maContent: document.getElementById("maContent"),
  
  // Mini App Screens
  maScreenResult: document.getElementById("maScreenResult"),
  maScreenMyBooks: document.getElementById("maScreenMyBooks"),
  maScreenFavorites: document.getElementById("maScreenFavorites"),
  maScreenSettings: document.getElementById("maScreenSettings"),
  maScreenPremium: document.getElementById("maScreenPremium"),
  
  // Premium Headers / Settings
  maPremiumBadge: document.getElementById("maPremiumBadge"),
  maGetPremiumBtn: document.getElementById("maGetPremiumBtn"),
  btnSubscribePremium: document.getElementById("btnSubscribePremium"),
  settingsPremiumBtn: document.getElementById("settingsPremiumBtn"),
  settingsPremiumStatusDesc: document.getElementById("settingsPremiumStatusDesc"),
  chatPremiumIndicator: document.getElementById("chatPremiumIndicator"),
  
  // Shared Result screen elements in Mini App
  bookBlurBg: document.getElementById("bookBlurBg"),
  bookCoverEmoji: document.getElementById("bookCoverEmoji"),
  bookCover3D: document.getElementById("bookCover3D"),
  bookTitle: document.getElementById("bookTitle"),
  bookAuthor: document.getElementById("bookAuthor"),
  bookRating: document.getElementById("bookRating"),
  bookGenre: document.getElementById("bookGenre"),
  bookPages: document.getElementById("bookPages"),
  bookReadTime: document.getElementById("bookReadTime"),
  bookWhyFits: document.getElementById("bookWhyFits"),
  bookAnnotation: document.getElementById("bookAnnotation"),
  bookBenefits: document.getElementById("bookBenefits"),
  bookReviewsList: document.getElementById("bookReviewsList"),
  bookPaperLink: document.getElementById("bookPaperLink"),
  bookEbookLink: document.getElementById("bookEbookLink"),
  bookAudioLink: document.getElementById("bookAudioLink"),
  
  btnAddToFav: document.getElementById("btnAddToFav"),
  btnAddToLibrary: document.getElementById("btnAddToLibrary"),
  
  // Library & Favorites elements
  shelfContentList: document.getElementById("shelfContentList"),
  favGridList: document.getElementById("favGridList"),
  
  // Settings
  settingsReadSpeed: document.getElementById("settingsReadSpeed"),
  settingsNotifications: document.getElementById("settingsNotifications"),
  settingsHaptic: document.getElementById("settingsHaptic"),
  settingsResetBtn: document.getElementById("settingsResetBtn")
};

// ==========================================================================
// BACKEND API CLIENT
// ==========================================================================
const apiClient = {
  userId: getClientUserId(),

  async request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error || "api_error");
      error.status = response.status;
      throw error;
    }
    return payload;
  },

  profile() {
    return this.request(`/api/profile?userId=${encodeURIComponent(this.userId)}`);
  },

  settings(settings) {
    return this.request("/api/settings", {
      method: "POST",
      body: JSON.stringify({ userId: this.userId, settings })
    });
  },

  recommendations(answers) {
    return this.request("/api/recommendations", {
      method: "POST",
      body: JSON.stringify({ userId: this.userId, answers })
    });
  },

  favorite(bookId, favorite) {
    return this.request("/api/favorites", {
      method: "POST",
      body: JSON.stringify({ userId: this.userId, bookId, favorite })
    });
  },

  library(bookId, patch = {}) {
    return this.request("/api/library", {
      method: "POST",
      body: JSON.stringify({ userId: this.userId, bookId, ...patch })
    });
  },

  checkout(plan) {
    return this.request("/api/subscription/checkout", {
      method: "POST",
      body: JSON.stringify({ userId: this.userId, plan })
    });
  },

  chat(bookId, message, history = []) {
    return this.request("/api/chat", {
      method: "POST",
      body: JSON.stringify({ userId: this.userId, bookId, message, history })
    });
  }
};

window.LibresApp = {
  state,
  apiClient,
  version: "1.0.0"
};

function getClientUserId() {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (tgUser?.id) return `tg:${tgUser.id}`;

  const stored = localStorage.getItem("libresUserId");
  if (stored) return stored;

  const created = `web:${crypto.randomUUID()}`;
  localStorage.setItem("libresUserId", created);
  return created;
}

async function hydrateProfile() {
  try {
    const profile = await apiClient.profile();
    applyProfile(profile);
  } catch (error) {
    console.warn("Backend profile unavailable, using local state", error.message);
  }
}

function applyProfile(profile) {
  if (!profile?.user) return;

  state.library = Array.isArray(profile.library) ? profile.library : state.library;
  state.favorites = Array.isArray(profile.favorites) ? profile.favorites : state.favorites;
  state.settings = { ...state.settings, ...(profile.user.settings || {}) };
  state.isPremium = profile.user.subscription?.status === "active";
  updatePremiumUi();
}

function updatePremiumUi() {
  DOM.maGetPremiumBtn.style.display = state.isPremium ? "none" : "block";
  DOM.maPremiumBadge.style.display = state.isPremium ? "block" : "none";
  DOM.chatPremiumIndicator.style.display = state.isPremium ? "block" : "none";
  if (DOM.settingsPremiumStatusDesc && DOM.settingsPremiumBtn) {
    DOM.settingsPremiumStatusDesc.innerText = state.isPremium
      ? "⭐ Подписка активна"
      : "Получить неограниченный доступ";
    DOM.settingsPremiumBtn.style.display = state.isPremium ? "none" : "block";
  }
}

function syncProfileFromResponse(payload) {
  if (payload?.profile) applyProfile(payload.profile);
  else applyProfile(payload);
}

// ==========================================================================
// SOUNDS & HAPTICS (SIMULATED VIA WEB AUDIO)
// ==========================================================================
function triggerHaptic(type = "light") {
  if (!state.settings.haptic) return;
  
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === "light") {
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } else if (type === "success") {
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      osc.frequency.setValueAtTime(800, ctx.currentTime + 0.06);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.025, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === "error") {
      osc.frequency.setValueAtTime(120, ctx.currentTime);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch (e) {
    // Audio Context blocked
  }
}

// ==========================================================================
// TELEGRAM BOT CHAT ENGINE
// ==========================================================================

function addBotMessage(text, delay = 0, callback = null, inlineButton = null) {
  setTimeout(() => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msg = document.createElement("div");
    msg.className = "msg-bubble bot";
    
    let htmlContent = text;
    
    if (inlineButton) {
      htmlContent += `<button class="msg-btn-inline" id="${inlineButton.id}">${inlineButton.emoji} ${inlineButton.text}</button>`;
    }
    
    msg.innerHTML = `${htmlContent}<span class="msg-time">${timeStr}</span>`;
    DOM.tgHistory.appendChild(msg);
    scrollToBottom(DOM.tgHistory);
    
    if (inlineButton) {
      const btn = msg.querySelector(`#${inlineButton.id}`);
      if (btn) {
        btn.addEventListener("click", () => {
          triggerHaptic();
          inlineButton.action();
        });
      }
    }
    
    if (callback) callback();
  }, delay);
}

function removeLastTyping() {
  const bubbles = DOM.tgHistory.getElementsByClassName("bot");
  if (bubbles.length > 0) {
    const lastBotBubble = bubbles[bubbles.length - 1];
    if (lastBotBubble.innerHTML.includes("Печатает...") || lastBotBubble.innerHTML.includes("Сверяюсь со списком...") || lastBotBubble.innerHTML.includes("Ищу книгу...") || lastBotBubble.innerHTML.includes("Думаю...")) {
      lastBotBubble.remove();
    }
  }
}

function addUserMessage(text) {
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msg = document.createElement("div");
  msg.className = "msg-bubble user";
  msg.innerHTML = `${text}<span class="msg-time">${timeStr}</span>`;
  DOM.tgHistory.appendChild(msg);
  scrollToBottom(DOM.tgHistory);
  triggerHaptic("light");
}

function scrollToBottom(el) {
  el.scrollTop = el.scrollHeight;
}

// Bot Startup Welcomes
function initTelegramStart() {
  DOM.tgHistory.innerHTML = "";
  addBotMessage("👋 Привет! Рад тебя видеть.", 200);
  addBotMessage("📚 Я твой персональный <b>Книжный консультант</b>.<br><br>Давай просто пообщаемся, как в настоящем книжном магазине, и я подберу книгу, которая действительно тебе понравится.", 700);
  addBotMessage("Нажмите кнопку ниже или просто напишите мне приветствие, чтобы начать диалог! 👇", 1400, null, {
    id: "inlinePickBtn",
    text: "Начать диалог",
    emoji: "🔍",
    action: () => startConversationalQuiz()
  });
}

// Handle text inputs
function handleUserText(text) {
  addUserMessage(text);
  
  const cleanText = text.trim().toLowerCase();
  
  // 1. Discussion Mode
  if (state.aiChatContext) {
    simulateAiReply(cleanText);
    return;
  }
  
  // 2. Quiz / Matching Dialogue Mode
  if (state.quizChatStep !== null) {
    advanceConversationalQuiz(text);
    return;
  }
  
  // 3. Main keyboard command handlers
  if (cleanText.includes("подобрать") || cleanText.includes("start") || cleanText.includes("начать")) {
    startConversationalQuiz();
  } else if (cleanText.includes("мои книги") || cleanText.includes("полка")) {
    openMiniApp("mybooks");
  } else if (cleanText.includes("избранное")) {
    openMiniApp("favorites");
  } else if (cleanText.includes("обсудить")) {
    triggerDiscussSetup();
  } else if (cleanText.includes("настройки")) {
    openMiniApp("settings");
  } else {
    addBotMessage("Я симулирую работу книжного консультанта. Нажмите <b>«🔍 Подобрать книгу»</b> в меню внизу, чтобы запустить диалог подбора, или напишите <b>«Обсудить»</b>, чтобы поговорить о прочитанном.", 600);
  }
}

// ==========================================================================
// HUMAN-LIKE CONVERSATIONAL MATCHING DIALOGUE
// ==========================================================================

function startConversationalQuiz() {
  // Commercial Paywall check: Limit free users to 2 matches per session
  if (!state.isPremium && state.pickCount >= 2) {
    triggerPaywall("Вы достигли лимита бесплатных подборов на сегодня. Оформите Premium подписку, чтобы получить неограниченные консультации и безлимитный доступ к поиску книг.");
    return;
  }

  state.quizChatStep = 1;
  state.quizAnswers = { mood: null, time: 8, tags: [] };
  
  addBotMessage("Привет! 🕵️‍♂️ С радостью помогу тебе выбрать отличную книгу.<br><br>Расскажи, как прошел твой день? Удалось ли отдохнуть, или сегодня был сумасшедший темп?", 300);
}

function advanceConversationalQuiz(userText) {
  const text = userText.toLowerCase();
  
  // Dynamic Background NLP: Extract keywords to shape parameters
  // Step 1: Extract Mood/Vibe from day description
  if (state.quizChatStep === 1) {
    if (text.includes("устал") || text.includes("тяжел") || text.includes("сложн") || text.includes("плох") || text.includes("сумасшедш") || text.includes("бешен") || text.includes("работа") || text.includes("ад")) {
      state.quizAnswers.mood = "comfort"; // user needs relaxation/comfort
    } else if (text.includes("скуч") || text.includes("обычн") || text.includes("нормальн") || text.includes("ничего") || text.includes("средн")) {
      state.quizAnswers.mood = "adventure"; // user needs action/dynamics to shake things up
    } else {
      state.quizAnswers.mood = "challenge"; // default to intellectual/standard
    }
  }
  
  // Extract general tags from any step
  if (text.includes("гарри") || text.includes("поттер") || text.includes("волшеб") || text.includes("маги") || text.includes("сказ")) {
    state.quizAnswers.tags.push("harrypotter");
    state.quizAnswers.tags.push("magic");
  }
  if (text.includes("космос") || text.includes("звезд") || text.includes("будущ") || text.includes("фантаст") || text.includes("сайфай")) {
    state.quizAnswers.tags.push("scifi");
  }
  if (text.includes("детектив") || text.includes("убийств") || text.includes("расслед") || text.includes("сыщик") || text.includes("крист")) {
    state.quizAnswers.tags.push("detective");
  }
  if (text.includes("антиутоп") || text.includes("контрол") || text.includes("государст") || text.includes("власт") || text.includes("оруэлл")) {
    state.quizAnswers.tags.push("dystopia");
  }
  if (text.includes("классик") || text.includes("роман") || text.includes("проз") || text.includes("семейн")) {
    state.quizAnswers.tags.push("classic");
  }
  if (text.includes("психолог") || text.includes("душа") || text.includes("разум") || text.includes("чувств") || text.includes("киз") || text.includes("драм")) {
    state.quizAnswers.tags.push("psychology");
  }

  // Visual feedback: consultant is thinking
  addBotMessage("✍ ...", 200);
  
  setTimeout(() => {
    removeLastTyping();
    
    if (state.quizChatStep === 1) {
      state.quizChatStep = 2;
      
      let response = "";
      // Empathetic transitions
      if (state.quizAnswers.mood === "comfort") {
        response = "Ох, судя по всему, денек выдался тот еще. Тяжелый день — идеальный повод укутаться в книгу, которая согреет. 🕯️<br><br>А что тебе хочется почувствовать после книги? Хочешь отвлечься от реальности в сказочном мире, или предпочтешь спокойное, размеренное жизненное чтение?";
      } else if (state.quizAnswers.mood === "adventure") {
        response = "Понятно, обычная рутина. Отличный повод взбодриться! 🤠<br><br>Чего хочется почувствовать после книги? Жаждешь адреналина, закрученных интриг и тайн, или, может, хочешь отправиться в космическое путешествие?";
      } else {
        response = "Ясно, день прошел продуктивно. 🧠<br><br>А какое послевкусие хочется получить от книги? Настроен поразмышлять над этическими вопросами, погрузиться в сложную психологию человека или хочешь классический ретро-детектив?";
      }
      
      addBotMessage(response, 100);
      
    } else if (state.quizChatStep === 2) {
      state.quizChatStep = 3;
      
      // Secondary NLP extracts based on user favorite choices
      if (text.includes("отвлечься") || text.includes("сказ") || text.includes("маги") || text.includes("фэнтези")) {
        state.quizAnswers.tags.push("magic");
        state.quizAnswers.mood = "comfort";
      } else if (text.includes("адреналин") || text.includes("интриг") || text.includes("тайны") || text.includes("детектив")) {
        state.quizAnswers.tags.push("detective");
        state.quizAnswers.mood = "challenge";
      } else if (text.includes("космос") || text.includes("путешеств") || text.includes("фантаст")) {
        state.quizAnswers.tags.push("scifi");
        state.quizAnswers.mood = "adventure";
      } else if (text.includes("психолог") || text.includes("драм") || text.includes("подумать")) {
        state.quizAnswers.tags.push("psychology");
        state.quizAnswers.mood = "dark";
      }
      
      addBotMessage("Записал, отличные ориентиры. ✍️<br><br>И последний вопрос: какое у тебя сегодня отношение к объему? Хочешь легкое, быстрое чтение, чтобы проглотить за один вечер, или готов погрузиться в плотный, тяжелый роман?", 100);
      
    } else if (state.quizChatStep === 3) {
      state.quizChatStep = null; // Exit dialogue questionnaire
      state.pickCount++; // Increment user match count
      
      // Extract volume preference
      if (text.includes("легк") || text.includes("быстр") || text.includes("вечер") || text.includes("небольш") || text.includes("маленьк")) {
        state.quizAnswers.time = 3;
      } else if (text.includes("плотн") || text.includes("тяжел") || text.includes("больш") || text.includes("толст") || text.includes("длин")) {
        state.quizAnswers.time = 15;
      }
      
      // Commercial Feature: Emotive delay and anticipation
      addBotMessage("Секунду... Кажется, я нашел книги, которые идеально подойдут тебе именно сегодня. 🧐📚", 100);
      
      addBotMessage("✍ <i>Сверяюсь со списком книг...</i>", 900);
      
      setTimeout(async () => {
        removeLastTyping();
        
        // Execute Ranked matching
        let matchedBooks = matchThreeBooks(state.quizAnswers);
        try {
          const payload = await apiClient.recommendations(state.quizAnswers);
          if (Array.isArray(payload.books) && payload.books.length >= 3) {
            matchedBooks = payload.books;
          }
        } catch (error) {
          console.warn("Backend recommendations unavailable, using local matcher", error.message);
        }
        
        // Send empathic logic overview
        let explanationText = "";
        if (state.quizAnswers.mood === "comfort") {
          explanationText = `💡 <b>Я выбрал эти книги, потому что</b> сегодня у тебя был тяжелый день и ты хочешь отдохнуть. Я отфильтровал истории с уютной атмосферой и комфортным временем чтения, исключив депрессивную драму.`;
        } else if (state.quizAnswers.mood === "adventure") {
          explanationText = `💡 <b>Я выбрал эти книги, потому что</b> тебе хочется динамики и встряски. Я подобрал произведения с высоким темпом сюжета, интригами и научно-фантастическим масштабом.`;
        } else if (state.quizAnswers.mood === "challenge") {
          explanationText = `💡 <b>Я выбрал эти книги, потому что</b> ты ищешь интеллектуальный вызов. Эти романы содержат сложные логические задачи, этические конфликты и глубокий подтекст.`;
        } else {
          explanationText = `💡 <b>Я выбрал эти книги, потому что</b> они лучше всего подходят под ваши пожелания эмоционального чтения и комфортного объема страниц.`;
        }
        
        addBotMessage(explanationText, 100);
        
        // Render 3 Ranked Book Cards!
        addBotThreeBookCards(matchedBooks, 800);
      }, 2300);
    }
  }, 1000);
}

// Match & Rank 3 books
function matchThreeBooks(answers) {
  // Clone booksData to sort
  let books = [...window.booksData];
  
  // Calculate score for each book
  books.forEach(book => {
    let score = 0;
    
    // Mood matching
    if (book.moods.includes(answers.mood)) score += 5;
    
    // Tag matching
    const tagMatches = book.benefits.filter(b => answers.tags.some(t => b.toLowerCase().includes(t)));
    score += tagMatches.length * 3;
    
    // Page/Time matching
    let speedWpm = 250;
    if (state.settings.readSpeed === "slow") speedWpm = 180;
    if (state.settings.readSpeed === "fast") speedWpm = 340;
    const userPageBudget = (answers.time * 60 * speedWpm) / 250;
    
    const pageDiff = Math.abs(book.pages - userPageBudget);
    if (pageDiff < 100) score += 4;
    else if (pageDiff < 250) score += 2;
    
    book.matchScore = score;
  });
  
  // Sort descending by match score
  books.sort((a, b) => b.matchScore - a.matchScore);
  
  // Return top 3
  return books.slice(0, 3);
}

// Render 3 book cards in the chat (with blurring locks for Free users)
function addBotThreeBookCards(books, delay = 300) {
  setTimeout(() => {
    // Card 1: Best Match (🥇) - Always visible
    addSingleChatBookBubble(books[0], "🥇 Лучшее совпадение", false, 0);
    
    // Card 2: Alternative (🥈) - Blurred for Free
    addSingleChatBookBubble(books[1], "🥈 Отличная альтернатива", !state.isPremium, 500);
    
    // Card 3: Experiment (🥉) - Blurred for Free
    addSingleChatBookBubble(books[2], "🥉 Для разнообразия", !state.isPremium, 1000);
    
  }, delay);
}

function addSingleChatBookBubble(book, rankTitle, isLocked, delay) {
  setTimeout(() => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Create wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "chat-locked-wrapper" + (isLocked ? " locked" : "");
    wrapper.setAttribute("data-book-id", book.id);
    
    // Read speed calculation
    let speedWpm = 250;
    if (state.settings.readSpeed === "slow") speedWpm = 180;
    if (state.settings.readSpeed === "fast") speedWpm = 340;
    const calculatedHours = Math.round((book.pages * 250) / (speedWpm * 60));
    
    // Build Card Content
    const cardHtml = `
      <div class="msg-bubble bot book-card blurred-card">
        <div class="chat-book-header">
          <div class="chat-book-cover" style="background: ${book.coverGradient}">
            <span>${book.coverEmoji}</span>
          </div>
          <div class="chat-book-meta">
            <span style="font-size: 0.7rem; font-weight: 700; color: #f39c12; text-transform: uppercase;">${rankTitle}</span>
            <span class="chat-book-title">${book.title}</span>
            <span class="chat-book-author">${book.author}</span>
          </div>
        </div>
        
        <div class="chat-book-stats">
          <span class="chat-stat-badge rating">⭐ ${book.rating}</span>
          <span class="chat-stat-badge">📄 ${book.pages} стр.</span>
          <span class="chat-stat-badge">⏱️ ~${calculatedHours} ч.</span>
        </div>
        
        <div class="chat-book-why" style="background: rgba(255,255,255,0.02); border-color: rgba(255,255,255,0.1);">
          <b>💡 Причина выбора:</b> ${book.whyFits}
        </div>
        
        <div class="chat-book-desc">
          ${book.annotation}
        </div>
        
        <!-- Partnership links -->
        <div class="chat-book-links">
          <a class="chat-book-link-item" onclick="triggerHaptic(); alert('Переход на сайт Читай-Город по партнерской ссылке (Бумажная книга)')">📖 Бумажная</a>
          <a class="chat-book-link-item" onclick="triggerHaptic(); alert('Переход на Литрес по партнерской ссылке (Электронная книга)')">📱 Электронная</a>
          <a class="chat-book-link-item" onclick="triggerHaptic(); alert('Переход на Букмейт по партнерской ссылке (Аудиокнига)')">🎧 Аудио</a>
        </div>
        
        <span class="msg-time">${timeStr}</span>
      </div>
    `;
    
    wrapper.innerHTML = cardHtml;
    
    // Create Paywall Overlay if locked
    if (isLocked) {
      const overlay = document.createElement("div");
      overlay.className = "chat-locked-overlay";
      overlay.innerHTML = `
        <span class="lock-icon">🔒</span>
        <span class="lock-text">Альтернативные рекомендации доступны подписчикам Premium</span>
        <button class="lock-btn" onclick="openPremiumScreen()">Разблокировать ⭐</button>
      `;
      wrapper.appendChild(overlay);
    }
    
    DOM.tgHistory.appendChild(wrapper);
    
    // Create Inline Actions Keyboard underneath Card (always attached, but disabled if card is blurred/locked)
    if (!isLocked) {
      addAttachedActionsKeyboard(book, wrapper);
    }
    
    scrollToBottom(DOM.tgHistory);
  }, delay);
}

function addAttachedActionsKeyboard(book, parentElement) {
  const kbd = document.createElement("div");
  kbd.className = "tg-inline-kbd";
  kbd.style.maxWidth = "100%";
  
  const isFav = state.favorites.includes(book.id);
  const inLib = state.library.some(item => item.id === book.id);
  
  const row = document.createElement("div");
  row.className = "tg-inline-kbd-row";
  
  const favBtn = document.createElement("button");
  favBtn.className = "tg-inline-btn" + (isFav ? " active" : "");
  favBtn.innerHTML = isFav ? "❤️ В Избранном" : "🤍 В Избранное";
  favBtn.addEventListener("click", () => {
    triggerHaptic();
    const idx = state.favorites.indexOf(book.id);
    let nextFavorite = true;
    if (idx > -1) {
      state.favorites.splice(idx, 1);
      favBtn.classList.remove("active");
      favBtn.innerHTML = "🤍 В Избранное";
      nextFavorite = false;
    } else {
      state.favorites.push(book.id);
      favBtn.classList.add("active");
      favBtn.innerHTML = "❤️ В Избранном";
    }
    apiClient.favorite(book.id, nextFavorite).then(syncProfileFromResponse).catch(error => {
      console.warn("Favorite sync failed", error.message);
    });
  });
  
  const libBtn = document.createElement("button");
  libBtn.className = "tg-inline-btn" + (inLib ? " active" : "");
  libBtn.innerHTML = inLib ? "📚 На полке" : "➕ На полку";
  libBtn.addEventListener("click", () => {
    triggerHaptic();
    const libItem = state.library.find(item => item.id === book.id);
    if (!libItem) {
      state.library.push({ id: book.id, progress: 0, shelf: "want" });
      libBtn.classList.add("active");
      libBtn.innerHTML = "📚 На полке";
      addBotMessage(`📚 Книга <b>«${book.title}»</b> добавлена в вашу библиотеку на полку «Хочу прочесть»!`);
      apiClient.library(book.id, { progress: 0, shelf: "want" }).then(syncProfileFromResponse).catch(error => {
        console.warn("Library sync failed", error.message);
      });
    }
  });
  
  row.appendChild(favBtn);
  row.appendChild(libBtn);
  kbd.appendChild(row);
  parentElement.appendChild(kbd);
}

// Global hook to open Premium Screen from locks
window.openPremiumScreen = function() {
  triggerHaptic();
  openMiniApp("premium");
};

// ==========================================================================
// COMMERCIAL PAYWALL ENGINE
// ==========================================================================

function triggerPaywall(reasonText) {
  triggerHaptic("error");
  
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msg = document.createElement("div");
  msg.className = "msg-bubble bot";
  msg.style.borderColor = "var(--primary)";
  msg.style.borderWidth = "1px";
  msg.style.borderStyle = "solid";
  msg.style.background = "linear-gradient(135deg, rgba(139, 92, 246, 0.05), rgba(243, 156, 18, 0.05))";
  
  msg.innerHTML = `
    ⭐ <b>Libres Premium</b><br><br>
    ${reasonText}
    <span class="msg-time">${timeStr}</span>
  `;
  DOM.tgHistory.appendChild(msg);
  
  // Attach Buy Button inline
  const kbd = document.createElement("div");
  kbd.className = "tg-inline-kbd";
  
  const row = document.createElement("div");
  row.className = "tg-inline-kbd-row";
  
  const subscribeBtn = document.createElement("button");
  subscribeBtn.className = "tg-inline-btn";
  subscribeBtn.style.background = "linear-gradient(135deg, var(--primary) 0%, #f39c12 100%)";
  subscribeBtn.style.color = "#000";
  subscribeBtn.style.fontWeight = "700";
  subscribeBtn.innerHTML = "Подключить Premium ⭐";
  subscribeBtn.addEventListener("click", () => {
    triggerHaptic();
    openMiniApp("premium");
  });
  
  row.appendChild(subscribeBtn);
  kbd.appendChild(row);
  DOM.tgHistory.appendChild(kbd);
  scrollToBottom(DOM.tgHistory);
}

// Activate Premium Subscription
async function activatePremium() {
  try {
    const activeTariff = document.querySelector(".tariff-card.active")?.getAttribute("data-tariff") || "monthly";
    const payload = await apiClient.checkout(activeTariff);
    syncProfileFromResponse(payload);
    const paymentUrl = payload.checkout?.paymentUrl;
    if (paymentUrl) {
      window.open(paymentUrl, "_blank", "noopener,noreferrer");
      addBotMessage("💳 Открыл страницу оплаты. После успешной оплаты Premium активируется автоматически.", 400);
      return;
    }
  } catch (error) {
    console.warn("Checkout unavailable, activating local Premium fallback", error.message);
    state.isPremium = true;
  }
  state.isPremium = true;
  triggerHaptic("success");
  
  // Update Mini App UI
  updatePremiumUi();
  
  // Close Mini App
  closeMiniApp();
  
  // Celebratory Bot message
  addBotMessage("🎉 <b>Подписка Libres Premium успешно оформлена!</b><br><br>Спасибо за доверие! Теперь вам доступны:<br>⭐ Безлимитные подборы книг чатом<br>⭐ Просмотр 3-х альтернативных рекомендаций<br>⭐ Доступ к AI-Литературному клубу и детальному обсуждению книг<br>⭐ Персональные планы чтения", 400);
  
  // REAL-TIME UNBLUR IN CHAT HISTORY:
  // Find all blurred locks and unblur them instantly!
  const lockedWrappers = Array.from(DOM.tgHistory.querySelectorAll(".chat-locked-wrapper.locked"));
  lockedWrappers.forEach(wrapper => {
    // Remove locked class (removes CSS blur filter)
    wrapper.classList.remove("locked");
    
    // Remove locked overlay completely
    const overlay = wrapper.querySelector(".chat-locked-overlay");
    if (overlay) overlay.remove();
    
    // Append the action buttons under the newly unblurred cards
    const bookId = parseInt(wrapper.getAttribute("data-book-id"));
    const book = window.booksData.find(b => b.id === bookId);
    if (book) {
      addAttachedActionsKeyboard(book, wrapper);
    }
  });
  
  scrollToBottom(DOM.tgHistory);
}

// Bind Purchase Action
DOM.btnSubscribePremium.addEventListener("click", () => {
  activatePremium();
});

DOM.settingsPremiumBtn.addEventListener("click", () => {
  triggerHaptic();
  openMiniApp("premium");
});

DOM.maGetPremiumBtn.addEventListener("click", () => {
  triggerHaptic();
  openMiniApp("premium");
});

// Premium Plan Tariff selectors click toggling
document.querySelectorAll(".tariff-card").forEach(card => {
  card.addEventListener("click", () => {
    triggerHaptic();
    document.querySelectorAll(".tariff-card").forEach(c => c.classList.remove("active"));
    card.classList.add("active");
  });
});

// ==========================================================================
// AI BOOK CLUB DISCUSSION ENGINE (PREMIUM ONLY)
// ==========================================================================

function triggerDiscussSetup() {
  // Commercial Paywall check: restrict AI book discussions to Premium
  if (!state.isPremium) {
    triggerPaywall("AI-Обсуждение книг доступно только по подписке <b>Libres Premium</b>. Общайтесь с персональным критиком по любой главе, находите скрытые смыслы и задавайте сложные вопросы.");
    return;
  }

  const readBooks = state.library.map(libItem => window.booksData.find(b => b.id === libItem.id));
  
  if (readBooks.length === 0) {
    addBotMessage("❌ Похоже, в вашей библиотеке еще нет книг для обсуждения. Пройдите подбор и добавьте книгу в «Мои книги»!", 500);
    return;
  }
  
  addBotMessage("💬 Добро пожаловать в <b>AI-Книжный Клуб</b>!<br><br>Выберите прочитанную книгу из библиотеки, которую вы хотите обсудить в чате:", 600);
  
  DOM.tgSuggestionBar.innerHTML = "";
  readBooks.forEach(book => {
    const btn = document.createElement("button");
    btn.className = "tg-suggest-btn";
    btn.innerText = `📖 ${book.title}`;
    btn.addEventListener("click", () => {
      triggerHaptic();
      startAiBookDiscussion(book);
    });
    DOM.tgSuggestionBar.appendChild(btn);
  });
}

function startAiBookDiscussion(book) {
  state.aiChatContext = book;
  addUserMessage(`Обсудить "${book.title}"`);
  DOM.tgSuggestionBar.innerHTML = ""; 
  document.getElementById("tgHeaderBackBtn").style.display = "flex";
  
  addBotMessage(`🧠 Отличный выбор! Я переключился в режим литературного критика по книге <b>«${book.title}»</b>.<br><br>Я знаю каждую главу этой книги. Спросите меня о чем угодно. Например:<br>— <i>«В чем смысл финала?»</i><br>— <i>«Кто главный антагонист?»</i><br>— <i>«Какова главная идея автора?»</i>`, 500);
  
  const tips = ["В чем смысл финала?", "Главная идея автора", "Закончить обсуждение 🏠"];
  tips.forEach(tip => {
    const btn = document.createElement("button");
    btn.className = "tg-suggest-btn";
    btn.innerText = tip;
    btn.addEventListener("click", () => {
      triggerHaptic();
      DOM.tgMessageInput.value = tip;
      DOM.tgSendBtn.click();
    });
    DOM.tgSuggestionBar.appendChild(btn);
  });
}

function simulateAiReply(text) {
  addBotMessage("✍️ <i>Печатает...</i>", 300);
  
  setTimeout(async () => {
    removeLastTyping();
    
    const book = state.aiChatContext;
    let reply = "";
    
    if (text.includes("закончить") || text.includes("выход") || text.includes("хватит") || text.includes("назад")) {
      state.aiChatContext = null;
      DOM.tgSuggestionBar.innerHTML = "";
      document.getElementById("tgHeaderBackBtn").style.display = "none";
      addBotMessage("🏠 Мы закончили обсуждение. Я вернулся в режим подбора книг. Чем могу помочь?", 100);
      return;
    }

    try {
      const payload = await apiClient.chat(book.id, text);
      if (payload.answer) {
        addBotMessage(payload.answer, 100);
        return;
      }
    } catch (error) {
      console.warn("AI backend unavailable, using local discussion fallback", error.message);
    }
    
    if (book.id === 1) {
      if (text.includes("финал") || text.includes("концов")) {
        reply = "Финал <b>«1984»</b> невероятно трагичен и глубок. Уинстон Смит полностью ломается в Комнате 101 под страхом пытки крысами. Он не просто сдается физически, он совершает духовное предательство Джулии. Финальная фраза <i>«Он любил Старшего Брата»</i> символизирует окончательную победу системы над индивидуальностью.";
      } else if (text.includes("идея") || text.includes("смысл")) {
        reply = "Главный смысл романа — это предупреждение о том, как легко общество может потерять свободу и способность мыслить критически. Оруэлл показывает опасные инструменты власти: <i>двоемыслие</i> (вера в две противоположные вещи одновременно), <i>новояз</i> (сокращение языка для сужения мысли) и стирание исторической памяти.";
      } else if (text.includes("брат") || text.includes("персонаж")) {
        reply = "Старший Брат (Большой Брат) — это не конкретный человек, а собирательный образ бессмертной Партии. В книге намекается, что его, возможно, физически не существует, но его лицо на плакатах работает как психологический якорь контроля и обожания для граждан.";
      } else {
        reply = `Интересный вопрос о романе «1984». Оруэлл создал потрясающий слепок тоталитарного строя. В этом эпизоде особенно заметно, как персонажи лишаются личного пространства и права на искренность. Что вы думаете об отношениях Уинстона и Джулии?`;
      }
    } else if (book.id === 4) {
      if (text.includes("финал") || text.includes("концов")) {
        reply = "В конце романа <b>«Маленькие женщины»</b> все сестры Марч находят свой собственный путь. Джо не выходит замуж за Лори (что расстроило многих читателей), а основывает школу для мальчиков и выходит за профессора Баэра. Драматичным ударом становится смерть кроткой Бет от последствий скарлатины, что сближает всю семью.";
      } else if (text.includes("идея") || text.includes("смысл")) {
        reply = "Основная идея Луизы Мэй Олкотт — показать взросление и обретение женщиной независимости в Америке XIX века. Каждая из сестер борется со своими внутренними недостатками (гнев Джо, тщеславие Мег, эгоизм Ами, робость Бет), доказывая, что женская судьба может быть многогранной.";
      } else {
        reply = "История сестер Марч пропитана глубоким психологизмом и теплом. Расскажите, кто из четырех героинь (Мег, Джо, Бет или Ами) откликается вам сильнее всего?";
      }
    } else {
      reply = `Книга <b>«${book.title}»</b> автора ${book.author} — выдающееся произведение в жанре ${book.genre}. В ней отлично прописан конфликт и мотивация персонажей. Что именно вас больше всего зацепило при чтении этого романа?`;
    }
    
    addBotMessage(reply, 100);
  }, 1000);
}

// Bind Reply Keyboard Buttons to simulator actions
document.querySelectorAll(".tg-kb-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    triggerHaptic();
    const action = btn.getAttribute("data-action");
    
    // Simulate user writing command in chat
    const btnText = btn.innerText;
    addUserMessage(btnText);
    
    setTimeout(() => {
      if (action === "pick") {
        startConversationalQuiz();
      } else if (action === "discuss") {
        triggerDiscussSetup();
      } else {
        openMiniApp(action);
      }
    }, 450);
  });
});

// Message send clicks
DOM.tgSendBtn.addEventListener("click", () => {
  const text = DOM.tgMessageInput.value;
  if (!text.trim()) return;
  DOM.tgMessageInput.value = "";
  handleUserText(text);
});

DOM.tgMessageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    DOM.tgSendBtn.click();
  }
});

// ==========================================================================
// TELEGRAM MINI APP CONTROLLER (READING CABINET)
// ==========================================================================

function openMiniApp(section) {
  DOM.tgMiniAppView.classList.add("open");
  
  // Hide all screens
  document.querySelectorAll(".ma-screen").forEach(scr => scr.classList.remove("active"));
  
  if (section === "mybooks") {
    DOM.maTitle.innerText = "Моя полка";
    DOM.maScreenMyBooks.classList.add("active");
    renderLibrary();
  } else if (section === "favorites") {
    DOM.maTitle.innerText = "Избранные";
    DOM.maScreenFavorites.classList.add("active");
    renderFavorites();
  } else if (section === "settings") {
    DOM.maTitle.innerText = "Настройки";
    DOM.maScreenSettings.classList.add("active");
    loadSettingsScreen();
  } else if (section === "premium") {
    DOM.maTitle.innerText = "Premium Подписка";
    DOM.maScreenPremium.classList.add("active");
  }
}

function closeMiniApp() {
  DOM.tgMiniAppView.classList.remove("open");
  triggerHaptic("light");
}

DOM.maCloseBtn.addEventListener("click", closeMiniApp);

if (DOM.maReloadBtn) {
  DOM.maReloadBtn.addEventListener("click", () => {
    triggerHaptic();
    DOM.maContent.style.opacity = 0;
    setTimeout(() => {
      DOM.maContent.style.opacity = 1;
    }, 300);
  });
}

// ==========================================================================
// SHARED BOOK CARD DETAILS SCREEN INSIDE MINI APP
// ==========================================================================

function showBookDetailsInMiniApp(book) {
  document.querySelectorAll(".ma-screen").forEach(scr => scr.classList.remove("active"));
  DOM.maScreenResult.classList.add("active");
  DOM.maTitle.innerText = book.title;
  
  // Inject book cover data
  DOM.bookBlurBg.style.backgroundImage = book.coverGradient;
  DOM.bookCover3D.style.background = book.coverGradient;
  DOM.bookCoverEmoji.innerText = book.coverEmoji;
  
  // Text details
  DOM.bookTitle.innerText = book.title;
  DOM.bookAuthor.innerText = book.author;
  DOM.bookRating.innerText = book.rating;
  DOM.bookGenre.innerText = book.genre;
  DOM.bookPages.innerText = book.pages;
  
  let speedWpm = 250;
  if (state.settings.readSpeed === "slow") speedWpm = 180;
  if (state.settings.readSpeed === "fast") speedWpm = 340;
  const calculatedHours = Math.round((book.pages * 250) / (speedWpm * 60));
  DOM.bookReadTime.innerText = `~${calculatedHours} ч.`;
  
  DOM.bookWhyFits.innerText = book.whyFits;
  DOM.bookAnnotation.innerText = book.annotation;
  
  DOM.bookBenefits.innerHTML = "";
  book.benefits.forEach(benefit => {
    const li = document.createElement("li");
    li.innerText = benefit;
    DOM.bookBenefits.appendChild(li);
  });
  
  DOM.bookReviewsList.innerHTML = "";
  book.reviews.forEach(rev => {
    const item = document.createElement("div");
    item.className = "review-item";
    item.innerHTML = `
      <div class="review-header">
        <span class="review-user">👤 ${rev.user}</span>
        <span class="review-rating">${"★".repeat(Math.round(rev.rating))}</span>
      </div>
      <p class="review-text">"${rev.text}"</p>
    `;
    DOM.bookReviewsList.appendChild(item);
  });
  
  updateResultActionButtonsState(book);
  updatePurchaseLinks(book);
}

function updatePurchaseLinks(book) {
  const query = encodeURIComponent(`${book.title} ${book.author}`);
  DOM.bookPaperLink.href = `https://www.chitai-gorod.ru/search?phrase=${query}`;
  DOM.bookEbookLink.href = `https://www.litres.ru/search/?q=${query}`;
  DOM.bookAudioLink.href = `https://www.litres.ru/search/?q=${query}%20%D0%B0%D1%83%D0%B4%D0%B8%D0%BE`;
}

function updateResultActionButtonsState(book) {
  const isFav = state.favorites.includes(book.id);
  if (isFav) {
    DOM.btnAddToFav.classList.add("active");
    DOM.btnAddToFav.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="#EF4444" stroke="#EF4444" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  } else {
    DOM.btnAddToFav.classList.remove("active");
    DOM.btnAddToFav.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  }
  
  const libItem = state.library.find(item => item.id === book.id);
  if (libItem) {
    DOM.btnAddToLibrary.classList.remove("ma-btn-primary");
    DOM.btnAddToLibrary.classList.add("ma-btn-secondary");
    
    if (libItem.shelf === "reading") {
      DOM.btnAddToLibrary.innerText = "В процессе чтения 📖";
    } else if (libItem.shelf === "finished") {
      DOM.btnAddToLibrary.innerText = "Книга прочитана! 🎉";
    } else {
      DOM.btnAddToLibrary.innerText = "На полке «Хочу прочесть» 📚";
    }
  } else {
    DOM.btnAddToLibrary.classList.add("ma-btn-primary");
    DOM.btnAddToLibrary.classList.remove("ma-btn-secondary");
    DOM.btnAddToLibrary.innerText = "Добавить в Мои книги 📚";
  }
}

DOM.btnAddToFav.addEventListener("click", () => {
  const book = state.selectedBook;
  if (!book) return;
  triggerHaptic();
  
  const index = state.favorites.indexOf(book.id);
  let nextFavorite = true;
  if (index > -1) {
    state.favorites.splice(index, 1);
    nextFavorite = false;
  } else {
    state.favorites.push(book.id);
  }
  updateResultActionButtonsState(book);
  apiClient.favorite(book.id, nextFavorite).then(syncProfileFromResponse).catch(error => {
    console.warn("Favorite sync failed", error.message);
  });
});

DOM.btnAddToLibrary.addEventListener("click", () => {
  const book = state.selectedBook;
  if (!book) return;
  triggerHaptic();
  
  const libItem = state.library.find(item => item.id === book.id);
  if (!libItem) {
    state.library.push({ id: book.id, progress: 0, shelf: "want" });
    addBotMessage(`📚 Книга <b>«${book.title}»</b> добавлена в библиотеку на полку «Хочу прочесть»!`);
    apiClient.library(book.id, { progress: 0, shelf: "want" }).then(syncProfileFromResponse).catch(error => {
      console.warn("Library sync failed", error.message);
    });
  }
  updateResultActionButtonsState(book);
});

// Book Detail Tabs toggling in Mini App
document.querySelectorAll(".tab-nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    triggerHaptic();
    document.querySelectorAll(".tab-nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    
    const tabName = btn.getAttribute("data-tab");
    document.getElementById("tabPaneAbout").classList.remove("active");
    document.getElementById("tabPaneReviews").classList.remove("active");
    
    if (tabName === "about") {
      document.getElementById("tabPaneAbout").classList.add("active");
    } else {
      document.getElementById("tabPaneReviews").classList.add("active");
    }
  });
});

// ==========================================================================
// MY BOOKS LIBRARY CONTROLLER
// ==========================================================================

document.querySelectorAll(".shelf-tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    triggerHaptic();
    document.querySelectorAll(".shelf-tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeShelf = btn.getAttribute("data-shelf");
    renderLibrary();
  });
});

function renderLibrary() {
  DOM.shelfContentList.innerHTML = "";
  
  const shelfItems = state.library.filter(item => item.shelf === activeShelf);
  
  if (shelfItems.length === 0) {
    DOM.shelfContentList.innerHTML = `<div class="empty-shelf-text">Здесь пока пусто. Воспользуйтесь подбором в чате!</div>`;
    return;
  }
  
  shelfItems.forEach(item => {
    const book = window.booksData.find(b => b.id === item.id);
    if (!book) return;
    
    const div = document.createElement("div");
    div.className = "shelf-book-item";
    
    let progressHtml = "";
    let actionBtnHtml = "";
    
    if (item.shelf === "reading") {
      progressHtml = `
        <div class="shelf-progress-container">
          <div class="progress-track-bg">
            <div class="progress-fill-bar" style="width: ${item.progress}%"></div>
          </div>
          <span class="progress-pct">${item.progress}%</span>
        </div>
      `;
      actionBtnHtml = `
        <button class="shelf-action-btn" onclick="updateBookProgress(${book.id}, ${item.progress + 15})">+15%</button>
        <button class="shelf-action-btn" onclick="finishBook(${book.id})">Прочитано ✅</button>
      `;
    } else if (item.shelf === "want") {
      actionBtnHtml = `
        <button class="shelf-action-btn ma-btn-primary" style="background:var(--primary); color:white; border:none;" onclick="startReadingBook(${book.id})">Начать чтение 📖</button>
      `;
    } else if (item.shelf === "finished") {
      progressHtml = `<span style="font-size: 0.72rem; color: var(--secondary)">★ Прочитано</span>`;
      actionBtnHtml = `
        <button class="shelf-action-btn" onclick="openBookDiscussFromLib(${book.id})">Обсудить в чате 💬</button>
      `;
    }
    
    div.innerHTML = `
      <div class="shelf-book-cover" style="background: ${book.coverGradient}">
        <span>${book.coverEmoji}</span>
      </div>
      <div class="shelf-book-info">
        <h4>${book.title}</h4>
        <p>${book.author}</p>
        ${progressHtml}
      </div>
      <div class="shelf-book-actions">
        ${actionBtnHtml}
      </div>
    `;
    
    div.querySelector(".shelf-book-info").addEventListener("click", () => {
      triggerHaptic();
      state.selectedBook = book;
      showBookDetailsInMiniApp(book);
    });
    
    DOM.shelfContentList.appendChild(div);
  });
}

function updateBookProgress(bookId, newProgress) {
  triggerHaptic();
  const libItem = state.library.find(item => item.id === bookId);
  if (libItem) {
    if (newProgress >= 100) {
      finishBook(bookId);
    } else {
      libItem.progress = newProgress;
      apiClient.library(bookId, { progress: newProgress, shelf: libItem.shelf }).then(syncProfileFromResponse).catch(error => {
        console.warn("Library sync failed", error.message);
      });
      renderLibrary();
    }
  }
}
window.updateBookProgress = updateBookProgress;

function finishBook(bookId) {
  triggerHaptic("success");
  const libItem = state.library.find(item => item.id === bookId);
  if (libItem) {
    libItem.shelf = "finished";
    libItem.progress = 100;
    
    const book = window.booksData.find(b => b.id === bookId);
    
    // Commercial Feature: celebrate reading end, but suggest Premium Reading Goal settings
    addBotMessage(`🎉 <b>Поздравляю с прочтением книги «${book.title}»!</b> Вы отлично справляетесь.`);
    
    if (!state.isPremium) {
      addBotMessage("💡 Хотите поставить личную цель чтения на месяц и получить рекомендации по следующей книге на основе этой истории? Подключите <b>Libres Premium</b> ⭐", 1200);
    } else {
      addBotMessage("🧠 Я проанализировал прочтение. На основе твоего читательского профиля я обновлю рекомендации для следующего сеанса подбора!", 1200);
    }
    
    renderLibrary();
    apiClient.library(bookId, { progress: 100, shelf: "finished" }).then(syncProfileFromResponse).catch(error => {
      console.warn("Library sync failed", error.message);
    });
  }
}
window.finishBook = finishBook;

function startReadingBook(bookId) {
  triggerHaptic();
  const libItem = state.library.find(item => item.id === bookId);
  if (libItem) {
    libItem.shelf = "reading";
    libItem.progress = 10;
    apiClient.library(bookId, { progress: 10, shelf: "reading" }).then(syncProfileFromResponse).catch(error => {
      console.warn("Library sync failed", error.message);
    });
    renderLibrary();
  }
}
window.startReadingBook = startReadingBook;

function openBookDiscussFromLib(bookId) {
  closeMiniApp();
  const book = window.booksData.find(b => b.id === bookId);
  startAiBookDiscussion(book);
}
window.openBookDiscussFromLib = openBookDiscussFromLib;

// ==========================================================================
// FAVORITES GRID CONTROLLER
// ==========================================================================

function renderFavorites() {
  DOM.favGridList.innerHTML = "";
  
  if (state.favorites.length === 0) {
    DOM.favGridList.innerHTML = `<div style="grid-column: span 2" class="empty-shelf-text">У вас пока нет избранных книг.</div>`;
    return;
  }
  
  state.favorites.forEach(bookId => {
    const book = window.booksData.find(b => b.id === bookId);
    if (!book) return;
    
    const card = document.createElement("div");
    card.className = "fav-book-card";
    card.innerHTML = `
      <div class="fav-book-cover" style="background: ${book.coverGradient}">
        <span>${book.coverEmoji}</span>
      </div>
      <h4>${book.title}</h4>
      <p>${book.author}</p>
    `;
    
    card.addEventListener("click", () => {
      triggerHaptic();
      state.selectedBook = book;
      showBookDetailsInMiniApp(book);
    });
    
    DOM.favGridList.appendChild(card);
  });
}

// ==========================================================================
// SETTINGS SCREEN CONTROLLER
// ==========================================================================

function loadSettingsScreen() {
  DOM.settingsReadSpeed.value = state.settings.readSpeed;
  DOM.settingsNotifications.checked = state.settings.notifications;
  DOM.settingsHaptic.checked = state.settings.haptic;
  
  // Premium Block display check
  if (state.isPremium) {
    DOM.settingsPremiumStatusDesc.innerText = "⭐ Подписка активна (Годовой тариф)";
    DOM.settingsPremiumBtn.style.display = "none";
  } else {
    DOM.settingsPremiumStatusDesc.innerText = "Получить неограниченный доступ";
    DOM.settingsPremiumBtn.style.display = "block";
  }
}

DOM.settingsReadSpeed.addEventListener("change", (e) => {
  triggerHaptic();
  state.settings.readSpeed = e.target.value;
  apiClient.settings(state.settings).then(syncProfileFromResponse).catch(error => {
    console.warn("Settings sync failed", error.message);
  });
});

DOM.settingsNotifications.addEventListener("change", (e) => {
  state.settings.notifications = e.target.checked;
  triggerHaptic();
  apiClient.settings(state.settings).then(syncProfileFromResponse).catch(error => {
    console.warn("Settings sync failed", error.message);
  });
});

DOM.settingsHaptic.addEventListener("change", (e) => {
  state.settings.haptic = e.target.checked;
  triggerHaptic();
  apiClient.settings(state.settings).then(syncProfileFromResponse).catch(error => {
    console.warn("Settings sync failed", error.message);
  });
});

DOM.settingsResetBtn.addEventListener("click", () => {
  triggerHaptic("error");
  if (confirm("Вы действительно хотите сбросить весь прогресс чтения, очистить библиотеку и сбросить подписку?")) {
    state.library = [];
    state.favorites = [];
    state.aiChatContext = null;
    state.quizChatStep = null;
    state.isPremium = false;
    state.pickCount = 0;
    state.settings = {
      readSpeed: "medium",
      notifications: true,
      haptic: true
    };
    
    // Hide Premium Indicators
    DOM.maGetPremiumBtn.style.display = "block";
    DOM.maPremiumBadge.style.display = "none";
    DOM.chatPremiumIndicator.style.display = "none";
    
    closeMiniApp();
    initTelegramStart();
  }
});

// ==========================================================================
// INITIAL SETUP
// ==========================================================================
window.addEventListener("DOMContentLoaded", () => {
  hydrateProfile();
  initTelegramStart();
  
  // Wire up header back button click
  document.getElementById("tgHeaderBackBtn").addEventListener("click", () => {
    triggerHaptic();
    if (state.aiChatContext) {
      state.aiChatContext = null;
      DOM.tgSuggestionBar.innerHTML = "";
      document.getElementById("tgHeaderBackBtn").style.display = "none";
      addBotMessage("🏠 Мы закончили обсуждение. Я вернулся в режим подбора книг. Чем могу помочь?", 100);
    }
  });
});
