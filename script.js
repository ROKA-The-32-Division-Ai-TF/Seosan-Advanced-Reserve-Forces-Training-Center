/* 수정 포인트:
 * 1) 설문 링크는 data/site-config.js에서 수정합니다.
 * 2) 식단, 공지, 법령, Q&A 데이터는 data 폴더의 각 파일에서 수정합니다.
 * 3) 이 파일은 데이터를 화면에 그리는 역할만 담당합니다.
 */

(function () {
  const siteConfig = window.siteConfig || {};
  const mealsData = Array.isArray(window.mealsData) ? window.mealsData : [];
  const noticesData = Array.isArray(window.noticesData) ? window.noticesData : [];
  const regulationsData = Array.isArray(window.regulationsData) ? window.regulationsData : [];
  const qaData = Array.isArray(window.qaData) ? window.qaData : [];

  const surveyLink = document.querySelector("#survey-link");
  const todayLabel = document.querySelector("#today-label");
  const mealSummary = document.querySelector("#meal-summary");
  const mealList = document.querySelector("#meal-list");
  const noticeList = document.querySelector("#notice-list");
  const regulationList = document.querySelector("#regulation-list");
  const qaList = document.querySelector("#qa-list");

  setupMeta(siteConfig);
  setupSurvey(siteConfig.survey || {});
  renderMeals(mealsData);
  renderNotices(noticesData);
  renderAccordion(
    regulationList,
    regulationsData,
    "등록된 법령 안내가 없습니다. data/regulations.js 파일에 항목을 추가해 주세요.",
    { titleKey: "title", bodyKey: "content" }
  );
  renderAccordion(
    qaList,
    qaData,
    "등록된 Q&A가 없습니다. data/qa.js 파일에 질문과 답변을 추가해 주세요.",
    { titleKey: "question", bodyKey: "answer" }
  );

  function setupMeta(config) {
    if (config.pageTitle) {
      document.title = config.pageTitle;
    }

    const heroTitle = document.querySelector(".hero__title");
    const heroSubtitle = document.querySelector(".hero__subtitle");
    const heroEyebrow = document.querySelector(".hero__eyebrow");
    const badgeUnit = document.querySelector(".hero__badge-text strong");

    if (heroTitle && config.pageTitle) {
      heroTitle.textContent = config.pageTitle;
    }

    if (heroSubtitle && config.pageSubtitle) {
      heroSubtitle.textContent = config.pageSubtitle;
    }

    if (heroEyebrow && config.unitName) {
      heroEyebrow.textContent = `${config.unitName} 디지털 안내 허브`;
    }

    if (badgeUnit && config.unitName) {
      badgeUnit.textContent = config.unitName;
    }
  }

  function setupSurvey(surveyConfig) {
    const url = typeof surveyConfig.url === "string" ? surveyConfig.url.trim() : "";
    const label = surveyConfig.buttonLabel || "설문 참여하기";

    if (!surveyLink) {
      return;
    }

    if (url) {
      surveyLink.href = url;
      surveyLink.textContent = label;
      surveyLink.setAttribute("aria-disabled", "false");
    } else {
      surveyLink.href = "#survey";
      surveyLink.textContent = "설문 링크 준비 중";
      surveyLink.setAttribute("aria-disabled", "true");
    }

    surveyLink.addEventListener("click", (event) => {
      if (surveyLink.getAttribute("aria-disabled") === "true") {
        event.preventDefault();
      }
    });
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

    if (todayMeals.length > 0) {
      const mealTypes = todayMeals.map((item) => item.mealType).filter(Boolean).join(", ");
      mealSummary.innerHTML = "";
      mealSummary.appendChild(
        createStatusCard(
          "오늘 등록된 식단",
          mealTypes ? `${mealTypes} 안내가 준비되어 있습니다.` : "식단 안내가 준비되어 있습니다.",
          "아래에서 메뉴와 비고를 확인하세요."
        )
      );
    } else {
      mealSummary.innerHTML = "";
      mealSummary.appendChild(
        createStatusCard(
          "오늘 등록된 식단 없음",
          "오늘 날짜 기준으로 등록된 식단이 없습니다.",
          "data/meals.js 파일에 YYYY-MM-DD 형식으로 식단을 추가해 주세요."
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
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
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
})();
