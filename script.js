/* 수정 포인트:
 * 1) 설문, 정신전력평가, 챗 API 설정은 data/site-config.js에서 수정합니다.
 * 2) 식단, 공지, 법령 데이터는 data 폴더의 각 파일에서 수정합니다.
 * 3) 이 파일은 화면 렌더링과 현재 시간/날씨/챗 연결만 담당합니다.
 */

(function () {
  const siteConfig = window.siteConfig || {};
  const mealsData = Array.isArray(window.mealsData) ? window.mealsData : [];
  const noticesData = Array.isArray(window.noticesData) ? window.noticesData : [];
  const regulationsData = Array.isArray(window.regulationsData) ? window.regulationsData : [];

  const CHAT_STORAGE_KEY = "seosan_reservist_chat_threads";
  let chatThreads = [];
  let activeThreadId = null;

  const currentTime = document.querySelector("#current-time");
  const currentDate = document.querySelector("#current-date");
  const currentWeather = document.querySelector("#current-weather");
  const weatherMeta = document.querySelector("#weather-meta");
  const surveyLink = document.querySelector("#survey-link");
  const mentalLink = document.querySelector("#mental-link");
  const todayLabel = document.querySelector("#today-label");
  const mealSummary = document.querySelector("#meal-summary");
  const mealList = document.querySelector("#meal-list");
  const noticeList = document.querySelector("#notice-list");
  const regulationList = document.querySelector("#regulation-list");
  const chatStatusBadge = document.querySelector("#chat-status-badge");
  const chatThreadList = document.querySelector("#chat-thread-list");
  const chatMessages = document.querySelector("#chat-messages");
  const chatForm = document.querySelector("#chat-form");
  const chatInput = document.querySelector("#chat-input");
  const chatSubmit = document.querySelector("#chat-submit");
  const chatStatusText = document.querySelector("#chat-status-text");
  const chatNewThreadButton = document.querySelector("#chat-new-thread");

  const chatConfig = siteConfig.chat || {};

  setupMeta(siteConfig);
  setupExternalLink(surveyLink, siteConfig.survey || {}, "설문 링크 준비 중");
  setupExternalLink(mentalLink, siteConfig.mentalEvaluation || {}, "링크 준비 중");
  startClock();
  fetchWeather(siteConfig.weather || {});
  renderMeals(mealsData);
  renderNotices(noticesData);
  renderAccordion(
    regulationList,
    regulationsData,
    "등록된 법령 안내가 없습니다. data/regulations.js 파일에 항목을 추가해 주세요.",
    { titleKey: "title", bodyKey: "content" }
  );
  initializeChat();

  function setupMeta(config) {
    const siteTitle = config.siteTitle || "서산시 과학화 예비군 훈련장";
    const pageSubtitle = config.pageSubtitle || "훈련 참가자가 필요한 정보를 빠르게 확인할 수 있는 안내 허브";

    document.title = siteTitle;

    const heroTitle = document.querySelector(".hero__title");
    const heroSubtitle = document.querySelector(".hero__subtitle");

    if (heroTitle) {
      heroTitle.textContent = siteTitle;
    }

    if (heroSubtitle) {
      heroSubtitle.textContent = pageSubtitle;
    }
  }

  function setupExternalLink(element, config, pendingText) {
    if (!element) {
      return;
    }

    const url = typeof config.url === "string" ? config.url.trim() : "";
    const label = config.buttonLabel || element.textContent.trim();

    if (url) {
      element.href = url;
      element.textContent = label;
      element.setAttribute("aria-disabled", "false");
      return;
    }

    element.href = "#";
    element.textContent = pendingText;
    element.setAttribute("aria-disabled", "true");
    element.addEventListener("click", preventDisabledClick);
  }

  function preventDisabledClick(event) {
    const target = event.currentTarget;
    if (target && target.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
    }
  }

  function startClock() {
    if (!currentTime || !currentDate) {
      return;
    }

    updateClock();
    window.setInterval(updateClock, 1000);
  }

  function updateClock() {
    const now = new Date();

    currentTime.textContent = new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    }).format(now);

    currentDate.textContent = new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
      timeZone: "Asia/Seoul",
    }).format(now);
  }

  async function fetchWeather(weatherConfig) {
    if (!currentWeather || !weatherMeta) {
      return;
    }

    const latitude = Number(weatherConfig.latitude);
    const longitude = Number(weatherConfig.longitude);
    const cityName = weatherConfig.cityName || "서산시";

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      currentWeather.textContent = "위치 정보 없음";
      weatherMeta.textContent = "data/site-config.js에서 위도와 경도를 확인해 주세요.";
      return;
    }

    try {
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: "temperature_2m,weather_code,wind_speed_10m",
        timezone: weatherConfig.timezone || "Asia/Seoul",
      });

      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Weather request failed: ${response.status}`);
      }

      const data = await response.json();
      const current = data.current || {};
      const weatherText = getWeatherText(current.weather_code);
      const temperature = typeof current.temperature_2m === "number"
        ? `${Math.round(current.temperature_2m)}°C`
        : "기온 정보 없음";
      const windSpeed = typeof current.wind_speed_10m === "number"
        ? `풍속 ${Math.round(current.wind_speed_10m)}km/h`
        : "풍속 정보 없음";

      currentWeather.textContent = `${cityName} ${temperature}`;
      weatherMeta.textContent = `${weatherText} · ${windSpeed}`;
    } catch (error) {
      currentWeather.textContent = `${cityName} 날씨 정보 없음`;
      weatherMeta.textContent = "실시간 기상 정보를 불러오지 못했습니다.";
      console.error(error);
    }
  }

  function renderMeals(items) {
    if (!todayLabel || !mealSummary || !mealList) {
      return;
    }

    const today = getTodayDateString();
    todayLabel.textContent = formatDateLabel(today);

    const normalizedItems = items
      .filter((item) => item && typeof item === "object")
      .sort((a, b) => compareDatesDesc(a.date, b.date));

    const todayMeals = normalizedItems.filter((item) => item.date === today);
    mealSummary.innerHTML = "";

    if (todayMeals.length > 0) {
      const mealTypes = todayMeals.map((item) => item.mealType).filter(Boolean).join(" · ");
      mealSummary.appendChild(
        createStatusCard(
          "오늘 등록된 식단",
          mealTypes || "오늘 식단이 등록되어 있습니다.",
          "아래 항목에서 메뉴와 비고를 확인하세요."
        )
      );
    } else {
      mealSummary.appendChild(
        createStatusCard(
          "오늘 등록된 식단 없음",
          "오늘 날짜 기준 식단이 없습니다.",
          "data/meals.js 파일에 식단을 추가해 주세요."
        )
      );
    }

    if (normalizedItems.length === 0) {
      mealList.innerHTML = "";
      mealList.appendChild(
        createEmptyState(
          "식단 데이터가 비어 있습니다. data/meals.js 파일에 날짜, 구분, 메뉴, 비고를 추가하면 이 영역에 표시됩니다."
        )
      );
      return;
    }

    mealList.innerHTML = "";
    normalizedItems.forEach((item) => {
      const article = document.createElement("article");
      article.className = "stack-item";

      const meta = document.createElement("div");
      meta.className = "stack-item__meta";

      const dateBadge = document.createElement("span");
      dateBadge.className = "stack-item__date";
      dateBadge.textContent = formatDateLabel(item.date);
      meta.appendChild(dateBadge);

      if (item.date === today) {
        const todayBadge = document.createElement("span");
        todayBadge.className = "stack-item__badge";
        todayBadge.textContent = "오늘";
        meta.appendChild(todayBadge);
      }

      const title = document.createElement("h3");
      title.className = "stack-item__title";
      title.textContent = item.mealType || "식단 안내";

      const details = document.createElement("div");
      details.className = "meal-details";

      details.appendChild(createMealRow("메뉴", createMealMenu(item.menu)));
      details.appendChild(createMealRow("비고", createSimpleText(item.note || "비고 없음")));

      article.append(meta, title, details);
      mealList.appendChild(article);
    });
  }

  function renderNotices(items) {
    if (!noticeList) {
      return;
    }

    const normalizedItems = items
      .filter((item) => item && typeof item === "object")
      .sort((a, b) => compareDatesDesc(a.date, b.date));

    if (normalizedItems.length === 0) {
      noticeList.innerHTML = "";
      noticeList.appendChild(
        createEmptyState(
          "공지사항이 없습니다. data/notices.js 파일에 날짜와 제목, 내용을 추가하면 최신 글이 자동으로 위에 표시됩니다."
        )
      );
      return;
    }

    noticeList.innerHTML = "";
    normalizedItems.forEach((item) => {
      const article = document.createElement("article");
      article.className = "stack-item";

      const meta = document.createElement("div");
      meta.className = "stack-item__meta";

      const dateBadge = document.createElement("span");
      dateBadge.className = "stack-item__date";
      dateBadge.textContent = formatDateLabel(item.date);
      meta.appendChild(dateBadge);

      if (item.isImportant) {
        const badge = document.createElement("span");
        badge.className = "stack-item__badge";
        badge.textContent = "중요";
        meta.appendChild(badge);
      }

      const title = document.createElement("h3");
      title.className = "stack-item__title";
      title.textContent = item.title || "제목 없음";

      const body = createRichText(item.content || "");
      body.classList.add("stack-item__body");

      article.append(meta, title, body);
      noticeList.appendChild(article);
    });
  }

  function renderAccordion(container, items, emptyMessage, keys) {
    if (!container) {
      return;
    }

    const normalizedItems = items.filter((item) => item && typeof item === "object");

    if (normalizedItems.length === 0) {
      container.innerHTML = "";
      container.appendChild(createEmptyState(emptyMessage));
      return;
    }

    container.innerHTML = "";
    normalizedItems.forEach((item) => {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = item[keys.titleKey] || "제목 없음";

      const content = document.createElement("div");
      content.className = "accordion-content";
      content.appendChild(createRichText(item[keys.bodyKey] || ""));

      if (item.linkUrl) {
        const link = document.createElement("a");
        link.className = "inline-link";
        link.href = item.linkUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = item.linkLabel || "관련 링크 열기";
        content.appendChild(link);
      }

      details.append(summary, content);
      container.appendChild(details);
    });
  }

  function initializeChat() {
    if (!chatMessages || !chatThreadList || !chatStatusText || !chatStatusBadge || !chatInput || !chatSubmit || !chatForm) {
      return;
    }

    loadChatThreads();
    ensureChatThread();
    renderChatThreads();
    renderActiveChat();

    if (chatNewThreadButton) {
      chatNewThreadButton.addEventListener("click", handleNewThread);
    }

    chatForm.addEventListener("submit", handleChatSubmit);
    syncChatAvailability();
  }

  function loadChatThreads() {
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];

      if (Array.isArray(parsed)) {
        chatThreads = parsed.filter(isValidThread);
      }
    } catch (error) {
      chatThreads = [];
      console.error(error);
    }
  }

  function saveChatThreads() {
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatThreads));
  }

  function ensureChatThread() {
    if (chatThreads.length === 0) {
      const initialThread = createThread();
      initialThread.messages.push({
        role: "system",
        content:
          "예비군 훈련 관련 질문을 입력하면 서버 API 연결 후 답변을 받을 수 있습니다. 근거가 부족한 경우에는 관련 규정 확인이 필요하며, 필요 시 교관 또는 조교에게 문의하십시오.",
      });
      chatThreads = [initialThread];
    }

    if (!activeThreadId || !chatThreads.some((thread) => thread.id === activeThreadId)) {
      activeThreadId = chatThreads[0].id;
    }
  }

  function createThread() {
    const now = new Date();
    return {
      id: `thread-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      title: "새 대화",
      updatedAt: now.toISOString(),
      messages: [],
    };
  }

  function isValidThread(thread) {
    return thread
      && typeof thread.id === "string"
      && typeof thread.title === "string"
      && typeof thread.updatedAt === "string"
      && Array.isArray(thread.messages);
  }

  function handleNewThread() {
    const thread = createThread();
    thread.messages.push({
      role: "system",
      content:
        "새 대화를 시작했습니다. 예비군 훈련, 복무, 연기, 불참, 복장, 행정 처리 등과 관련된 질문만 입력해 주세요.",
    });

    chatThreads.unshift(thread);
    activeThreadId = thread.id;
    saveChatThreads();
    renderChatThreads();
    renderActiveChat();
  }

  function renderChatThreads() {
    chatThreadList.innerHTML = "";

    const orderedThreads = [...chatThreads].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

    orderedThreads.forEach((thread) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `chat-thread${thread.id === activeThreadId ? " is-active" : ""}`;
      button.addEventListener("click", () => {
        activeThreadId = thread.id;
        renderChatThreads();
        renderActiveChat();
      });

      const title = document.createElement("span");
      title.className = "chat-thread__title";
      title.textContent = thread.title;

      const meta = document.createElement("span");
      meta.className = "chat-thread__meta";
      meta.textContent = formatRelativeTime(thread.updatedAt);

      button.append(title, meta);
      chatThreadList.appendChild(button);
    });
  }

  function renderActiveChat() {
    const thread = getActiveThread();

    if (!thread) {
      return;
    }

    chatMessages.innerHTML = "";

    if (thread.messages.length === 0) {
      chatMessages.appendChild(
        createChatMessage("system", "질문을 입력하면 이곳에 대화가 표시됩니다.")
      );
    } else {
      thread.messages.forEach((message) => {
        chatMessages.appendChild(createChatMessage(message.role, message.content));
      });
    }

    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function syncChatAvailability() {
    const enabled = Boolean(chatConfig.enabled) && typeof chatConfig.endpoint === "string" && chatConfig.endpoint.trim();

    chatInput.disabled = !enabled;
    chatSubmit.disabled = !enabled;

    if (enabled) {
      chatStatusBadge.textContent = "연결 가능";
      chatStatusText.textContent = "예비군 관련 질문을 입력하세요. 근거가 불분명하면 교관 또는 조교 문의 안내가 제공됩니다.";
      chatInput.placeholder = chatConfig.placeholder || "예: 예비군 훈련 연기 신청은 어떻게 하나요?";
      return;
    }

    chatStatusBadge.textContent = "연결 준비 중";
    chatStatusText.textContent = "data/site-config.js에 chat.endpoint를 입력하면 챗을 사용할 수 있습니다.";
    chatInput.placeholder = "챗 API 주소를 설정하면 질문을 입력할 수 있습니다.";
  }

  async function handleChatSubmit(event) {
    event.preventDefault();

    if (!chatConfig.enabled || !chatConfig.endpoint || !chatInput.value.trim()) {
      return;
    }

    const thread = getActiveThread();

    if (!thread) {
      return;
    }

    const userMessage = chatInput.value.trim();
    chatInput.value = "";

    thread.messages.push({
      role: "user",
      content: userMessage,
    });
    thread.updatedAt = new Date().toISOString();

    if (thread.title === "새 대화") {
      thread.title = userMessage.slice(0, 22);
    }

    const loadingMessage = {
      role: "system",
      content: "답변을 불러오는 중입니다.",
    };
    thread.messages.push(loadingMessage);

    saveChatThreads();
    renderChatThreads();
    renderActiveChat();

    try {
      const answer = await requestChatAnswer(thread);
      replaceLastSystemMessage(thread, answer);
    } catch (error) {
      replaceLastSystemMessage(
        thread,
        "관련 규정 확인이 필요합니다. 필요 시 교관 또는 조교에게 문의하십시오."
      );
      console.error(error);
    }

    thread.updatedAt = new Date().toISOString();
    saveChatThreads();
    renderChatThreads();
    renderActiveChat();
  }

  async function requestChatAnswer(thread) {
    const systemPrompt = chatConfig.systemPrompt || "";
    const conversationMessages = thread.messages.filter(
      (message) => message.role === "user" || message.role === "assistant"
    );
    const messages = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...conversationMessages]
      : conversationMessages;

    const payload = {
      model: chatConfig.model || "exaone",
      stream: false,
      messages,
    };

    const response = await fetch(chatConfig.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.status}`);
    }

    const data = await response.json();

    if (data && data.message && typeof data.message.content === "string") {
      return data.message.content.trim();
    }

    if (typeof data.response === "string") {
      return data.response.trim();
    }

    if (typeof data.answer === "string") {
      return data.answer.trim();
    }

    return "관련 규정 확인이 필요합니다. 필요 시 교관 또는 조교에게 문의하십시오.";
  }

  function replaceLastSystemMessage(thread, content) {
    let index = -1;

    for (let i = thread.messages.length - 1; i >= 0; i -= 1) {
      if (thread.messages[i].role === "system") {
        index = i;
        break;
      }
    }

    if (index >= 0) {
      thread.messages[index] = {
        role: "assistant",
        content,
      };
      return;
    }

    thread.messages.push({
      role: "assistant",
      content,
    });
  }

  function getActiveThread() {
    return chatThreads.find((thread) => thread.id === activeThreadId) || null;
  }

  function createChatMessage(role, content) {
    const article = document.createElement("article");
    article.className = `chat-message chat-message--${role}`;

    const label = document.createElement("span");
    label.className = "chat-message__role";
    label.textContent = getRoleLabel(role);

    const body = createRichText(content);

    article.append(label, body);
    return article;
  }

  function getRoleLabel(role) {
    if (role === "user") {
      return "질문";
    }

    if (role === "assistant") {
      return "답변";
    }

    return "안내";
  }

  function formatRelativeTime(isoString) {
    const date = new Date(isoString);

    if (Number.isNaN(date.getTime())) {
      return "방금 전";
    }

    return new Intl.DateTimeFormat("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function createMealRow(label, valueNode) {
    const row = document.createElement("div");
    row.className = "meal-details__row";

    const labelNode = document.createElement("p");
    labelNode.className = "meal-details__label";
    labelNode.textContent = label;

    row.append(labelNode, valueNode);
    return row;
  }

  function createMealMenu(menuItems) {
    if (!Array.isArray(menuItems) || menuItems.length === 0) {
      return createSimpleText("등록된 메뉴가 없습니다.");
    }

    const list = document.createElement("ul");
    list.className = "meal-menu";

    menuItems.forEach((item) => {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      list.appendChild(listItem);
    });

    return list;
  }

  function createSimpleText(text) {
    const paragraph = document.createElement("p");
    paragraph.className = "rich-text";
    paragraph.textContent = text;
    return paragraph;
  }

  function createRichText(text) {
    const wrapper = document.createElement("div");
    wrapper.className = "rich-text";

    const lines = String(text)
      .split(/\n{2,}/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      const paragraph = document.createElement("p");
      paragraph.textContent = "내용이 없습니다.";
      wrapper.appendChild(paragraph);
      return wrapper;
    }

    lines.forEach((line) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      wrapper.appendChild(paragraph);
    });

    return wrapper;
  }

  function createStatusCard(label, title, body) {
    const wrapper = document.createElement("div");

    const labelNode = document.createElement("p");
    labelNode.className = "status-card__label";
    labelNode.textContent = label;

    const titleNode = document.createElement("h3");
    titleNode.className = "status-card__title";
    titleNode.textContent = title;

    const bodyNode = document.createElement("p");
    bodyNode.className = "status-card__body";
    bodyNode.textContent = body;

    wrapper.append(labelNode, titleNode, bodyNode);
    return wrapper;
  }

  function createEmptyState(message) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = message;
    return empty;
  }

  function getTodayDateString() {
    const now = new Date();
    const date = new Date(
      now.toLocaleString("en-US", {
        timeZone: "Asia/Seoul",
      })
    );
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function compareDatesDesc(a, b) {
    const timeA = parseDateInput(a);
    const timeB = parseDateInput(b);

    if (!timeA && !timeB) {
      return 0;
    }

    if (!timeA) {
      return 1;
    }

    if (!timeB) {
      return -1;
    }

    return timeB.getTime() - timeA.getTime();
  }

  function formatDateLabel(dateString) {
    if (!dateString) {
      return "날짜 미정";
    }

    const date = parseDateInput(dateString);

    if (!date) {
      return dateString;
    }

    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    }).format(date);
  }

  function parseDateInput(dateString) {
    if (typeof dateString !== "string") {
      return null;
    }

    const match = dateString.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      return null;
    }

    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  function getWeatherText(code) {
    const map = {
      0: "맑음",
      1: "대체로 맑음",
      2: "구름 조금",
      3: "흐림",
      45: "안개",
      48: "서리 안개",
      51: "이슬비",
      53: "약한 비",
      55: "비",
      56: "어는 이슬비",
      57: "강한 어는 이슬비",
      61: "약한 비",
      63: "비",
      65: "강한 비",
      66: "어는 비",
      67: "강한 어는 비",
      71: "약한 눈",
      73: "눈",
      75: "강한 눈",
      77: "진눈깨비",
      80: "소나기",
      81: "강한 소나기",
      82: "매우 강한 소나기",
      85: "약한 눈 소나기",
      86: "강한 눈 소나기",
      95: "뇌우",
      96: "약한 우박 동반 뇌우",
      99: "강한 우박 동반 뇌우",
    };

    return map[code] || "날씨 정보";
  }
})();
