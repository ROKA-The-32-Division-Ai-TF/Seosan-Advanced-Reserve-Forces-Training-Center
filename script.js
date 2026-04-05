/* 수정 포인트:
 * 1) 설문 링크, 정신전력평가 링크, 날씨 위치 정보는 data/site-config.js에서 수정합니다.
 * 2) 식단과 공지 데이터는 data 폴더의 각 파일에서 수정합니다.
 * 3) 이 파일은 화면 렌더링과 현재 시간/날씨 표시만 담당합니다.
 */

(function () {
  const siteConfig = window.siteConfig || {};
  const publicSiteState = window.publicSiteState || {};
  const mealsData = Array.isArray(window.mealsData) ? window.mealsData : [];
  const noticesData = Array.isArray(window.noticesData) ? window.noticesData : [];
  const emergencyContactsData = Array.isArray(window.emergencyContactsData) ? window.emergencyContactsData : [];

  const siteAccessGate = document.querySelector("#site-access-gate");
  const siteAccessTitle = document.querySelector("#site-access-title");
  const siteAccessMessage = document.querySelector("#site-access-message");
  const siteAccessSchedule = document.querySelector("#site-access-schedule");
  const currentTime = document.querySelector("#current-time");
  const currentDate = document.querySelector("#current-date");
  const currentWeather = document.querySelector("#current-weather");
  const weatherMeta = document.querySelector("#weather-meta");
  const surveyLink = document.querySelector("#survey-link");
  const mentalLink = document.querySelector("#mental-link");
  const chatbotLink = document.querySelector("#chatbot-link");
  const todayLabel = document.querySelector("#today-label");
  const mealSummary = document.querySelector("#meal-summary");
  const mealList = document.querySelector("#meal-list");
  const noticeList = document.querySelector("#notice-list");
  const contactSummary = document.querySelector("#contact-summary");
  const contactList = document.querySelector("#contact-list");
  const sectionLinks = Array.from(document.querySelectorAll("[data-section-link]"));
  const sectionPanels = Array.from(document.querySelectorAll("[data-section-panel]"));

  setupMeta(siteConfig);
  applySiteAccessControl(publicSiteState);
  setupExternalLink(surveyLink, siteConfig.survey || {}, "설문 링크 준비 중");
  setupExternalLink(mentalLink, siteConfig.mentalEvaluation || {}, "링크 준비 중");
  setupExternalMenuLink(chatbotLink, siteConfig.chatbot || {});
  initializeSectionNavigation();
  startClock();
  fetchWeather(siteConfig.weather || {});
  renderMeals(mealsData);
  renderNotices(noticesData);
  renderEmergencyContacts(emergencyContactsData);

  function setupMeta(config) {
    const siteTitle = config.siteTitle || "서산시 과학화 예비군 훈련장";
    const pageSubtitle = config.pageSubtitle || "";

    document.title = siteTitle;

    const heroTitle = document.querySelector(".hero__title");
    const titleLines = Array.from(document.querySelectorAll(".hero__title-line"));
    const heroSubtitle = document.querySelector(".hero__subtitle");

    if (titleLines.length >= 2) {
      titleLines[0].textContent = "서산시";
      titleLines[1].textContent = "과학화 예비군 훈련장";
    } else if (heroTitle) {
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
    element.addEventListener("click", (event) => {
      event.preventDefault();
    });
  }

  function setupExternalMenuLink(element, config) {
    if (!element) {
      return;
    }

    const url = typeof config.url === "string" ? config.url.trim() : "";

    if (url) {
      element.href = url;
      element.setAttribute("aria-disabled", "false");
      return;
    }

    element.href = "#";
    element.setAttribute("aria-disabled", "true");
    element.addEventListener("click", (event) => {
      event.preventDefault();
    });
  }

  function initializeSectionNavigation() {
    if (sectionLinks.length === 0 || sectionPanels.length === 0) {
      return;
    }

    sectionLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        const targetId = link.dataset.sectionLink;

        if (!targetId) {
          return;
        }

        event.preventDefault();
        activateSection(targetId, true);
      });
    });

    const initialHash = window.location.hash.replace("#", "");
    const initialSection = sectionPanels.some((panel) => panel.id === initialHash) ? initialHash : "survey";
    activateSection(initialSection, false);
  }

  function activateSection(sectionId, updateHash) {
    sectionPanels.forEach((panel) => {
      const isActive = panel.id === sectionId;
      panel.hidden = !isActive;
      panel.classList.toggle("is-active", isActive);
    });

    sectionLinks.forEach((link) => {
      const isActive = link.dataset.sectionLink === sectionId;
      link.classList.toggle("is-active", isActive);
    });

    if (updateHash) {
      window.history.replaceState(null, "", `#${sectionId}`);
    }

    const activePanel = document.getElementById(sectionId);

    if (updateHash && activePanel) {
      activePanel.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
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
    applySiteAccessControl(publicSiteState, now);

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
    }
  }

  function applySiteAccessControl(state, currentDate) {
    if (!siteAccessGate || !siteAccessTitle || !siteAccessMessage || !siteAccessSchedule) {
      return;
    }

    const now = currentDate instanceof Date ? currentDate : new Date();
    const evaluation = evaluateSiteAvailability(state, now);

    siteAccessTitle.textContent = evaluation.title;
    siteAccessMessage.textContent = evaluation.message;
    siteAccessSchedule.textContent = evaluation.schedule;

    if (evaluation.allowed) {
      siteAccessGate.hidden = true;
      document.body.classList.remove("is-site-locked");
      return;
    }

    siteAccessGate.hidden = false;
    document.body.classList.add("is-site-locked");
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

  function renderEmergencyContacts(items) {
    if (!contactSummary || !contactList) {
      return;
    }

    const normalizedItems = items
      .filter((item) => item && typeof item === "object")
      .filter((item) => item.name || item.phone);

    contactSummary.innerHTML = "";
    contactList.innerHTML = "";

    if (normalizedItems.length === 0) {
      contactSummary.appendChild(
        createStatusCard(
          "등록된 연락처 없음",
          "긴급연락처가 아직 등록되지 않았습니다.",
          "필요 시 교관 또는 조교에게 직접 문의해 주세요."
        )
      );
      contactList.appendChild(
        createEmptyState("관리자 페이지에서 비상연락망을 등록하면 이 영역에 표시됩니다.")
      );
      return;
    }

    contactSummary.appendChild(
      createStatusCard(
        "즉시 확인",
        "긴급 상황 시 아래 연락처를 확인하세요.",
        "상황에 맞는 담당자에게 바로 연락하면 됩니다."
      )
    );

    normalizedItems.forEach((item) => {
      const article = document.createElement("article");
      article.className = "stack-item";

      const meta = document.createElement("div");
      meta.className = "stack-item__meta";

      if (item.role) {
        const roleBadge = document.createElement("span");
        roleBadge.className = "stack-item__date";
        roleBadge.textContent = item.role;
        meta.appendChild(roleBadge);
      }

      const title = document.createElement("h3");
      title.className = "stack-item__title";
      title.textContent = item.name || "담당자";

      const details = document.createElement("div");
      details.className = "meal-details";
      details.appendChild(createContactRow("전화", item.phone || "연락처 없음"));

      if (item.note) {
        details.appendChild(createContactRow("비고", item.note));
      }

      article.append(meta, title, details);
      contactList.appendChild(article);
    });
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

  function createContactRow(label, text) {
    const row = document.createElement("div");
    row.className = "contact-card__row";

    const labelNode = document.createElement("p");
    labelNode.className = "contact-card__label";
    labelNode.textContent = label;

    const textNode = document.createElement("p");
    textNode.className = "rich-text";
    textNode.textContent = text;

    row.append(labelNode, textNode);
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

  function evaluateSiteAvailability(state, now) {
    const enabled = state.enabled !== false;
    const useOperatingHours = state.useOperatingHours === true;
    const startTime = normalizeTimeValue(state.startTime || "09:00");
    const endTime = normalizeTimeValue(state.endTime || "15:30");
    const closedMessage = typeof state.closedMessage === "string" && state.closedMessage.trim()
      ? state.closedMessage.trim()
      : "가동 시간이 아니거나 관리자에 의해 일시 중지되었습니다. 교관 또는 조교에게 문의해 주세요.";
    const scheduleText = useOperatingHours
      ? `운영 시간 ${startTime} ~ ${endTime} (Asia/Seoul)`
      : "운영 시간 제한 없음";

    if (!enabled) {
      return {
        allowed: false,
        title: "현재는 접속할 수 없습니다.",
        message: closedMessage,
        schedule: scheduleText,
      };
    }

    if (!useOperatingHours) {
      return {
        allowed: true,
        title: "",
        message: "",
        schedule: scheduleText,
      };
    }

    const seoulNow = new Date(
      now.toLocaleString("en-US", {
        timeZone: state.timezone || "Asia/Seoul",
      })
    );
    const currentTime = `${String(seoulNow.getHours()).padStart(2, "0")}:${String(seoulNow.getMinutes()).padStart(2, "0")}`;
    const withinWindow = startTime <= endTime
      ? currentTime >= startTime && currentTime <= endTime
      : currentTime >= startTime || currentTime <= endTime;

    if (withinWindow) {
      return {
        allowed: true,
        title: "",
        message: "",
        schedule: scheduleText,
      };
    }

    return {
      allowed: false,
      title: "현재는 접속할 수 없습니다.",
      message: closedMessage,
      schedule: scheduleText,
    };
  }

  function normalizeTimeValue(value) {
    const match = String(value).match(/^(\d{2}):(\d{2})$/);
    if (!match) {
      return "00:00";
    }
    return `${match[1]}:${match[2]}`;
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
