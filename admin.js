/* 수정 포인트:
 * 1) 이 페이지는 data/survey-summary.json 파일을 읽어 관리자용 설문 요약을 보여줍니다.
 * 2) 자동 생성 로직은 tools/generate_survey_summary.py와 .github/workflows/daily-survey-summary.yml에서 관리합니다.
 */

(function () {
  const refs = {
    title: document.querySelector("#summary-title"),
    status: document.querySelector("#summary-status"),
    generatedAt: document.querySelector("#generated-at"),
    totalResponses: document.querySelector("#total-responses"),
    analyzedResponses: document.querySelector("#analyzed-responses"),
    latestResponse: document.querySelector("#latest-response"),
    message: document.querySelector("#summary-message"),
    body: document.querySelector("#summary-body"),
    includedColumns: document.querySelector("#included-columns"),
    excludedColumns: document.querySelector("#excluded-columns"),
  };

  loadSummary();

  async function loadSummary() {
    try {
      const response = await fetch(`data/survey-summary.json?v=${Date.now()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Summary request failed: ${response.status}`);
      }

      const data = await response.json();
      renderSummary(data);
    } catch (error) {
      renderSummary({
        status: "error",
        title: "서산시 과학화 예비군 훈련장 설문 요약",
        generatedAt: null,
        message: "설문 요약 파일을 불러오지 못했습니다.",
        source: {
          totalResponses: 0,
          analyzedResponses: 0,
          latestResponseAt: "",
          includedColumns: [],
          excludedColumns: [],
        },
        summaryMarkdown: "## 확인 필요\n- `data/survey-summary.json` 파일이 아직 생성되지 않았거나 경로가 맞지 않습니다.",
      });
      console.error(error);
    }
  }

  function renderSummary(data) {
    const source = data.source || {};
    setText(refs.title, data.title || "서산시 과학화 예비군 훈련장 설문 요약");
    setStatus(data.status || "pending");
    setText(refs.generatedAt, formatDateTime(data.generatedAt) || "아직 생성되지 않음");
    setText(refs.totalResponses, formatNumber(source.totalResponses));
    setText(refs.analyzedResponses, formatNumber(source.analyzedResponses));
    setText(refs.latestResponse, source.latestResponseAt || "확인 전");
    setText(refs.message, data.message || "요약 상태를 확인해 주세요.");

    renderMarkdown(refs.body, data.summaryMarkdown || "## 대기 중\n- 자동 요약 결과가 아직 없습니다.");
    renderChips(refs.includedColumns, source.includedColumns || [], "아직 설정된 질문이 없습니다.");
    renderChips(refs.excludedColumns, source.excludedColumns || [], "제외된 항목이 없습니다.");
  }

  function setStatus(status) {
    if (!refs.status) {
      return;
    }

    refs.status.className = "summary-status";

    if (status === "ok") {
      refs.status.classList.add("summary-status--ok");
      refs.status.textContent = "정상 생성";
      return;
    }

    if (status === "error") {
      refs.status.classList.add("summary-status--error");
      refs.status.textContent = "오류";
      return;
    }

    refs.status.classList.add("summary-status--pending");
    refs.status.textContent = "대기 중";
  }

  function renderMarkdown(container, markdown) {
    if (!container) {
      return;
    }

    container.innerHTML = "";

    const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
    let currentBlock = createBlock();
    let currentList = null;
    let paragraphLines = [];

    lines.forEach((line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        flushParagraph();
        flushList();
        return;
      }

      if (trimmed.startsWith("## ")) {
        flushParagraph();
        flushList();
        commitBlock();
        currentBlock = createBlock();
        const heading = document.createElement("h3");
        heading.textContent = trimmed.replace(/^##\s+/, "");
        currentBlock.appendChild(heading);
        return;
      }

      if (trimmed.startsWith("- ")) {
        flushParagraph();
        if (!currentList) {
          currentList = document.createElement("ul");
          currentBlock.appendChild(currentList);
        }
        const item = document.createElement("li");
        item.textContent = trimmed.replace(/^- /, "");
        currentList.appendChild(item);
        return;
      }

      paragraphLines.push(trimmed);
    });

    flushParagraph();
    flushList();
    commitBlock();

    function flushParagraph() {
      if (paragraphLines.length === 0) {
        return;
      }

      const paragraph = document.createElement("p");
      paragraph.textContent = paragraphLines.join(" ");
      currentBlock.appendChild(paragraph);
      paragraphLines = [];
    }

    function flushList() {
      currentList = null;
    }

    function commitBlock() {
      if (currentBlock.childNodes.length > 0) {
        container.appendChild(currentBlock);
      }
    }
  }

  function createBlock() {
    const block = document.createElement("section");
    block.className = "summary-body__block";
    return block;
  }

  function renderChips(container, items, fallbackText) {
    if (!container) {
      return;
    }

    container.innerHTML = "";

    const values = Array.isArray(items) ? items.filter(Boolean) : [];

    if (values.length === 0) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = fallbackText;
      container.appendChild(chip);
      return;
    }

    values.forEach((item) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = item;
      container.appendChild(chip);
    });
  }

  function setText(element, value) {
    if (element) {
      element.textContent = value;
    }
  }

  function formatDateTime(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    }).format(date);
  }

  function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("ko-KR") : "0";
  }
})();
