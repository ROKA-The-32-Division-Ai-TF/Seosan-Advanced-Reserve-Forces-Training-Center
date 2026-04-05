(function () {
  const state = {
    notices: [],
    admins: [],
    selectedNoticeId: null,
  };

  const refs = {
    logoutButton: document.querySelector("#logout-button"),
    runSummaryButton: document.querySelector("#run-summary-button"),
    summaryStatus: document.querySelector("#summary-status"),
    summaryGeneratedAt: document.querySelector("#summary-generated-at"),
    summaryTotal: document.querySelector("#summary-total"),
    summaryAnalyzed: document.querySelector("#summary-analyzed"),
    summaryMessage: document.querySelector("#summary-message"),
    summaryBody: document.querySelector("#summary-body"),
    draftInstruction: document.querySelector("#draft-instruction"),
    draftButton: document.querySelector("#draft-button"),
    draftMessage: document.querySelector("#draft-message"),
    noticeForm: document.querySelector("#notice-form"),
    noticeId: document.querySelector("#notice-id"),
    noticeDate: document.querySelector("#notice-date"),
    noticeTitle: document.querySelector("#notice-title"),
    noticeContent: document.querySelector("#notice-content"),
    noticeImportant: document.querySelector("#notice-important"),
    noticePublished: document.querySelector("#notice-published"),
    noticeReset: document.querySelector("#notice-reset"),
    noticeMessage: document.querySelector("#notice-message"),
    noticeList: document.querySelector("#notice-list"),
    adminUserForm: document.querySelector("#admin-user-form"),
    newDisplayName: document.querySelector("#new-display-name"),
    newUsername: document.querySelector("#new-username"),
    newPassword: document.querySelector("#new-password"),
    adminUserMessage: document.querySelector("#admin-user-message"),
    adminUserList: document.querySelector("#admin-user-list"),
  };

  initialize();

  async function initialize() {
    wireEvents();
    refs.noticeDate.value = todayString();
    await refreshDashboard();
  }

  function wireEvents() {
    refs.logoutButton?.addEventListener("click", logout);
    refs.runSummaryButton?.addEventListener("click", runSummary);
    refs.draftButton?.addEventListener("click", draftNotice);
    refs.noticeReset?.addEventListener("click", resetNoticeForm);
    refs.noticeForm?.addEventListener("submit", saveNotice);
    refs.adminUserForm?.addEventListener("submit", createAdminUser);
  }

  async function refreshDashboard() {
    const data = await api("/api/admin/bootstrap");
    state.notices = data.notices || [];
    state.admins = data.admins || [];
    renderSummary(data.summary || {});
    renderNotices();
    renderAdmins();
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
      window.location.href = "/admin/login";
    } catch (error) {
      refs.noticeMessage.textContent = error.message;
    }
  }

  async function runSummary() {
    try {
      refs.summaryMessage.textContent = "요약을 생성하는 중입니다.";
      const data = await api("/api/admin/summary/run", { method: "POST" });
      renderSummary(data.summary || {});
    } catch (error) {
      refs.summaryMessage.textContent = error.message;
    }
  }

  async function draftNotice() {
    const instruction = refs.draftInstruction.value.trim();
    if (!instruction) {
      refs.draftMessage.textContent = "AI 요청 문장을 먼저 입력해 주세요.";
      return;
    }

    try {
      refs.draftMessage.textContent = "EXAONE 초안을 생성하는 중입니다.";
      const data = await api("/api/admin/notices/draft", {
        method: "POST",
        body: JSON.stringify({ instruction }),
      });

      const draft = data.draft || {};
      refs.noticeTitle.value = draft.title || "";
      refs.noticeContent.value = draft.content || "";
      refs.noticeDate.value = draft.date || todayString();
      refs.noticeImportant.checked = Boolean(draft.isImportant);
      refs.noticePublished.checked = true;
      refs.draftMessage.textContent = "공지 초안을 반영했습니다. 검토 후 저장해 주세요.";
    } catch (error) {
      refs.draftMessage.textContent = error.message;
    }
  }

  async function saveNotice(event) {
    event.preventDefault();

    const payload = {
      id: refs.noticeId.value ? Number(refs.noticeId.value) : null,
      date: refs.noticeDate.value,
      title: refs.noticeTitle.value.trim(),
      content: refs.noticeContent.value.trim(),
      isImportant: refs.noticeImportant.checked,
      isPublished: refs.noticePublished.checked,
    };

    try {
      refs.noticeMessage.textContent = "공지사항을 저장하는 중입니다.";
      const data = await api("/api/admin/notices", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      state.notices = data.notices || [];
      renderNotices();
      resetNoticeForm();
      refs.noticeMessage.textContent = mergeMessages(
        data.message || "공지사항이 저장되었습니다.",
        data.publish && data.publish.message ? data.publish.message : ""
      );
    } catch (error) {
      refs.noticeMessage.textContent = error.message;
    }
  }

  async function createAdminUser(event) {
    event.preventDefault();

    const payload = {
      display_name: refs.newDisplayName.value.trim(),
      username: refs.newUsername.value.trim(),
      password: refs.newPassword.value,
    };

    try {
      refs.adminUserMessage.textContent = "관리자 계정을 생성하는 중입니다.";
      const data = await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      state.admins = data.admins || [];
      renderAdmins();
      refs.adminUserForm.reset();
      refs.adminUserMessage.textContent = "관리자 계정을 추가했습니다.";
    } catch (error) {
      refs.adminUserMessage.textContent = error.message;
    }
  }

  function renderSummary(summary) {
    const source = summary.source || {};
    refs.summaryStatus.textContent = summary.status === "ok" ? "정상 생성" : summary.status === "error" ? "오류" : "대기 중";
    refs.summaryGeneratedAt.textContent = formatDateTime(summary.generatedAt) || "아직 생성되지 않음";
    refs.summaryTotal.textContent = formatNumber(source.totalResponses);
    refs.summaryAnalyzed.textContent = formatNumber(source.analyzedResponses);
    refs.summaryMessage.textContent = summary.message || "요약 상태를 확인해 주세요.";
    renderMarkdown(refs.summaryBody, summary.summaryMarkdown || "## 대기 중\n- 설문 요약이 아직 없습니다.");
  }

  function renderNotices() {
    refs.noticeList.innerHTML = "";

    if (state.notices.length === 0) {
      refs.noticeList.innerHTML = "<div class=\"notice-item\">저장된 공지가 없습니다.</div>";
      return;
    }

    state.notices.forEach((notice) => {
      const article = document.createElement("article");
      article.className = "notice-item";
      article.innerHTML = `
        <div class="notice-item__title-row">
          <div>
            <h3>${escapeHtml(notice.title)}</h3>
            <p class="notice-item__meta">${escapeHtml(notice.date)} · ${notice.isImportant ? "중요" : "일반"} · ${notice.isPublished ? "공개 반영" : "비공개 보관"}</p>
          </div>
        </div>
        <div class="notice-item__content">${escapeHtml(notice.content)}</div>
        <div class="notice-item__actions">
          <button class="mini-button" type="button" data-action="edit" data-id="${notice.id}">수정</button>
          <button class="mini-button mini-button--danger" type="button" data-action="delete" data-id="${notice.id}">삭제</button>
        </div>
      `;

      article.querySelector('[data-action="edit"]').addEventListener("click", () => loadNotice(notice));
      article.querySelector('[data-action="delete"]').addEventListener("click", () => deleteNotice(notice.id));
      refs.noticeList.appendChild(article);
    });
  }

  function renderAdmins() {
    refs.adminUserList.innerHTML = "";
    state.admins.forEach((admin) => {
      const item = document.createElement("div");
      item.className = "admin-user-item";
      item.textContent = `${admin.display_name} (${admin.username})`;
      refs.adminUserList.appendChild(item);
    });
  }

  function loadNotice(notice) {
    refs.noticeId.value = notice.id;
    refs.noticeDate.value = notice.date;
    refs.noticeTitle.value = notice.title;
    refs.noticeContent.value = notice.content;
    refs.noticeImportant.checked = Boolean(notice.isImportant);
    refs.noticePublished.checked = Boolean(notice.isPublished);
    refs.noticeMessage.textContent = "기존 공지를 불러왔습니다.";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteNotice(noticeId) {
    if (!window.confirm("이 공지를 삭제하시겠습니까?")) {
      return;
    }

    try {
      const data = await api(`/api/admin/notices/${noticeId}`, { method: "DELETE" });
      state.notices = data.notices || [];
      renderNotices();
      refs.noticeMessage.textContent = mergeMessages("공지사항을 삭제했습니다.", data.publish?.message || "");
    } catch (error) {
      refs.noticeMessage.textContent = error.message;
    }
  }

  function resetNoticeForm() {
    refs.noticeForm.reset();
    refs.noticeId.value = "";
    refs.noticeDate.value = todayString();
    refs.noticePublished.checked = true;
    refs.noticeMessage.textContent = "새 공지 입력 상태로 초기화했습니다.";
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = "/admin/login";
        throw new Error("Unauthorized");
      }
      throw new Error(data.detail || "요청을 처리하지 못했습니다.");
    }
    return data;
  }

  function renderMarkdown(container, markdown) {
    container.innerHTML = "";
    const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
    let section = createSection();
    let list = null;
    let paragraph = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        list = null;
        return;
      }
      if (trimmed.startsWith("## ")) {
        flushParagraph();
        list = null;
        commitSection();
        section = createSection();
        const heading = document.createElement("h3");
        heading.textContent = trimmed.replace(/^##\s+/, "");
        section.appendChild(heading);
        return;
      }
      if (trimmed.startsWith("- ")) {
        flushParagraph();
        if (!list) {
          list = document.createElement("ul");
          section.appendChild(list);
        }
        const item = document.createElement("li");
        item.textContent = trimmed.replace(/^- /, "");
        list.appendChild(item);
        return;
      }
      paragraph.push(trimmed);
    });

    flushParagraph();
    commitSection();

    function flushParagraph() {
      if (paragraph.length === 0) {
        return;
      }
      const node = document.createElement("p");
      node.textContent = paragraph.join(" ");
      section.appendChild(node);
      paragraph = [];
    }

    function commitSection() {
      if (section.childNodes.length > 0) {
        container.appendChild(section);
      }
    }
  }

  function createSection() {
    return document.createElement("section");
  }

  function todayString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDateTime(value) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
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

  function mergeMessages(left, right) {
    return [left, right].filter(Boolean).join(" ");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")
      .replaceAll("\n", "<br />");
  }
})();
