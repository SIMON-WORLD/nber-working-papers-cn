(function () {
  const mode = document.body.dataset.topicMode || "overview";
  const topicSlug = document.body.dataset.topicSlug || "";
  const basePath = document.body.dataset.basePath || "";
  const overview = document.getElementById("topicOverview");
  const results = document.getElementById("topicResults");
  const paperList = document.getElementById("topicPaperList");
  const yearSelect = document.getElementById("topicYear");
  const countNode = document.getElementById("topicCount");
  const prevButton = document.getElementById("topicPrev");
  const nextButton = document.getElementById("topicNext");
  const pageInfo = document.getElementById("topicPageInfo");
  const pageSize = 30;
  let topics = [];
  let activeTopic = null;
  let currentRows = [];
  let currentPage = 1;
  const buildVersion = document.body.dataset.buildVersion || "";

  function topicHref(slug) {
    return topicSlug ? `${encodeURIComponent(slug)}.html` : `${basePath}topics/${encodeURIComponent(slug)}.html`;
  }

  function internalHref(path) {
    return `${basePath}${String(path || "")}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function loadJson(path) {
    const versioned = buildVersion ? `${path}${path.includes("?") ? "&" : "?"}v=${encodeURIComponent(buildVersion)}` : path;
    const response = await fetch(versioned, { cache: "force-cache" });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  }

  function card(topic) {
    const latest = topic.latest[0];
    return `<a class="topic-directory-card" href="${topicHref(topic.slug)}">
      <span>${escapeHtml(topic.label)}</span>
      <strong>${topic.count} 篇</strong>
      <p>${escapeHtml(topic.description)}</p>
      <small>${latest ? `最新：${escapeHtml(latest.zh_title || latest.title)}` : "暂无论文"}</small>
    </a>`;
  }

  function paperCard(paper) {
    return `<article class="paper-card">
      <div class="meta"><span>${escapeHtml(paper.week_date)}</span><a href="${escapeHtml(paper.url)}" target="_blank" rel="noopener">NBER w${escapeHtml(paper.number)}</a></div>
      <h3><a href="${escapeHtml(internalHref(paper.detail_url || `paper.html?number=${encodeURIComponent(paper.number)}`))}">${escapeHtml(paper.title)}</a></h3>
      ${paper.zh_title ? `<p class="paper-zh-title">${escapeHtml(paper.zh_title)}</p>` : ""}
      ${paper.is_china_related ? `<a class="tag" href="${topicHref("china")}">中国相关</a>` : ""}
      <p class="authors">${escapeHtml(paper.authors)}</p>
      ${paper.zh_abstract ? `<p class="summary">${escapeHtml(paper.zh_abstract)}</p>` : ""}
    </article>`;
  }

  function renderRows() {
    const totalPages = Math.max(1, Math.ceil(currentRows.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    countNode.textContent = `${currentRows.length} 篇`;
    pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页`;
    prevButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
    paperList.innerHTML = currentRows.length
      ? currentRows.slice(start, start + pageSize).map(paperCard).join("")
      : '<div class="empty-state"><h2>该年份暂无论文</h2><p>请选择其他年份。</p></div>';
  }

  async function loadTopicYear(year) {
    paperList.innerHTML = '<p class="loading-state">专题论文加载中...</p>';
    const rows = await loadJson(`${basePath}data/search/weekly/${year}.json`);
    currentRows = rows.filter((paper) => activeTopic.slug === "china" ? paper.is_china_related : paper.topic === activeTopic.label);
    currentPage = 1;
    renderRows();
  }

  function openTopic(topic) {
    activeTopic = topic;
    document.title = `${topic.label}｜NBER 研究专题｜学术传送门`;
    document.getElementById("topicHeading").textContent = topic.label;
    document.getElementById("topicLead").textContent = topic.description;
    overview.hidden = true;
    results.hidden = false;
    const years = Object.keys(topic.years).sort((a, b) => Number(b) - Number(a));
    yearSelect.innerHTML = years.map((year) => `<option value="${year}">${year} 年（${topic.years[year]} 篇）</option>`).join("");
    if (years.length) loadTopicYear(years[0]).catch(showError);
  }

  function showError() {
    overview.innerHTML = '<div class="empty-state"><h2>专题数据加载失败</h2><p>请稍后刷新页面。</p></div>';
    paperList.innerHTML = overview.innerHTML;
  }

  loadJson(`${basePath}data/topics.json`)
    .then((data) => {
      topics = data;
      if (mode === "overview") {
        overview.innerHTML = `<div class="topic-directory-grid">${topics.map(card).join("")}</div>`;
        return;
      }
      const value = topicSlug || new URLSearchParams(window.location.search).get("topic") || "";
      const topic = topics.find((item) => item.slug === value || item.label === value);
      if (!topic) throw new Error("Topic not found");
      openTopic(topic);
    })
    .catch(showError);

  yearSelect?.addEventListener("change", () => loadTopicYear(yearSelect.value).catch(showError));
  prevButton?.addEventListener("click", () => { currentPage -= 1; renderRows(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  nextButton?.addEventListener("click", () => { currentPage += 1; renderRows(); window.scrollTo({ top: 0, behavior: "smooth" }); });
})();
