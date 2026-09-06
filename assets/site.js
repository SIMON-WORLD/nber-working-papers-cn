(function () {
  let months = window.NBER_MONTHS || [];
  let papers = window.NBER_PAPERS || [];
  let monthlyPreviewPapers = papers;
  let weeks = window.NBER_WEEKS || [];
  let weeklyPapers = window.NBER_WEEKLY_PAPERS || [];
  let weeklyManifest = null;
  let monthlyManifest = null;
  const weeklyYearCache = new Map();
  const weeklyYearPromises = new Map();
  const monthlyYearCache = new Map();
  const monthlyYearPromises = new Map();
  let monthlyScope = window.NBER_PAPERS && window.NBER_PAPERS.length ? "all" : "preview";
  let weeklyRequestId = 0;
  let monthlyRequestId = 0;
  const archiveList = document.getElementById("archiveList");
  const weeklyList = document.getElementById("weeklyList");
  const paperList = document.getElementById("paperList");
  const resultCount = document.getElementById("resultCount");
  const searchInput = document.getElementById("searchInput");
  const clearSearch = document.getElementById("clearSearch");
  const yearFilter = document.getElementById("yearFilter");
  const activeFilters = document.getElementById("activeFilters");
  const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
  const quickFilterLinks = Array.from(document.querySelectorAll("[data-quick-filter]"));
  const quickSourceLinks = Array.from(document.querySelectorAll("[data-quick-source]"));
  const sourceButtons = Array.from(document.querySelectorAll("[data-source]"));
  const prevPage = document.getElementById("prevPage");
  const nextPage = document.getElementById("nextPage");
  const pageInfo = document.getElementById("pageInfo");
  const pageSize = 30;
  let sourceMode = "monthly";
  let relationFilter = "all";
  let currentPage = 1;
  const buildVersion = document.body.dataset.buildVersion || "";
  const topicSlugs = {
    "环境与健康": "environment-health",
    "宏观与货币财政": "macro-policy",
    "公共财政与税收": "public-finance",
    "教育与劳动": "education-labor",
    "金融与资产定价": "finance-assets",
    "国际贸易": "trade",
    "AI 与数字经济": "ai-digital",
    "理论与方法": "theory-methods",
    "其他主题": "other",
  };

  function topicHref(topic) {
    return `topics/${topicSlugs[topic] || topic}.html`;
  }

  function setupCopyButtons() {
    document.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", async () => {
        const value = button.dataset.copy || "";
        const original = button.textContent;
        try {
          await navigator.clipboard.writeText(value);
          button.textContent = "已复制";
          button.classList.add("copied");
        } catch (error) {
          button.textContent = "复制失败";
        }
        window.setTimeout(() => {
          button.textContent = original;
          button.classList.remove("copied");
        }, 1800);
      });
    });
  }

  setupCopyButtons();

  if (!archiveList || !weeklyList || !paperList || !resultCount || !searchInput || !yearFilter || !prevPage || !nextPage || !pageInfo) {
    return;
  }

  function setLoading() {
    archiveList.textContent = archiveList.dataset.loading || "加载中...";
    weeklyList.textContent = weeklyList.dataset.loading || "加载中...";
    paperList.textContent = paperList.dataset.loading || "加载中...";
    resultCount.textContent = "";
    pageInfo.textContent = "";
    prevPage.disabled = true;
    nextPage.disabled = true;
  }

  function setError() {
    archiveList.innerHTML = "";
    weeklyList.innerHTML = "";
    const isFile = window.location.protocol === "file:";
    const fileHint = isFile
      ? "当前是 file:// 打开方式，浏览器会阻止加载本站的 JSON 数据。"
      : "当前网络或页面路径无法加载本站 JSON 数据。";
    paperList.innerHTML = `<article class="paper-card"><h3>数据加载失败</h3><p class="summary">${fileHint} 请通过本地服务器或 GitHub Pages 访问本站：在项目目录运行 <code>python -m http.server 8765 --bind 127.0.0.1 --directory docs</code>，然后打开 <code>http://127.0.0.1:8765/</code>；公开站点为 <code>https://academic-door.github.io/nber-working-papers-cn/</code>。</p></article>`;
    resultCount.textContent = "加载失败";
    pageInfo.textContent = "";
    prevPage.disabled = true;
    nextPage.disabled = true;
  }

  async function loadJson(path) {
    const versioned = buildVersion ? `${path}${path.includes("?") ? "&" : "?"}v=${encodeURIComponent(buildVersion)}` : path;
    const response = await fetch(versioned, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }
    return response.json();
  }

  async function loadIndexData() {
    if (months.length && papers.length && weeks.length && weeklyManifest && monthlyManifest) return;
    setLoading();
    const [loadedMonths, loadedPapers, loadedWeeks, loadedManifest, loadedMonthlyManifest] = await Promise.all([
      loadJson("data/months.json"),
      loadJson("data/monthly_recent_papers.json"),
      loadJson("data/weeks.json"),
      loadJson("data/weekly_search_manifest.json"),
      loadJson("data/monthly_search_manifest.json"),
    ]);
    months = loadedMonths;
    papers = loadedPapers;
    monthlyPreviewPapers = loadedPapers;
    weeks = loadedWeeks;
    weeklyManifest = loadedManifest;
    monthlyManifest = loadedMonthlyManifest;
  }

  async function ensureMonthlyPapers(year) {
    const selectedYear = String(year || "");
    const targetScope = selectedYear ? `year:${selectedYear}` : "all";
    if (monthlyScope === targetScope) return;
    const requestId = ++monthlyRequestId;
    paperList.innerHTML = `<p class="loading-state">${selectedYear ? `${selectedYear} 年` : "全部年份"}月度索引加载中...</p>`;
    let rows;
    if (selectedYear) {
      if (!monthlyYearPromises.has(selectedYear)) {
        monthlyYearPromises.set(selectedYear, loadJson(`data/search/monthly/${selectedYear}.json`));
      }
      rows = await monthlyYearPromises.get(selectedYear);
      monthlyYearCache.set(selectedYear, rows);
    } else {
      const years = (monthlyManifest?.years || []).map((item) => String(item.year));
      rows = (await Promise.all(years.map(async (itemYear) => {
        if (!monthlyYearPromises.has(itemYear)) {
          monthlyYearPromises.set(itemYear, loadJson(`data/search/monthly/${itemYear}.json`));
        }
        const yearRows = await monthlyYearPromises.get(itemYear);
        monthlyYearCache.set(itemYear, yearRows);
        return yearRows;
      }))).flat();
    }
    if (requestId !== monthlyRequestId) return;
    papers = rows;
    monthlyScope = targetScope;
  }

  async function ensureWeeklyPapers(year) {
    const selectedYear = String(year || weeklyManifest?.latest_year || "");
    if (!selectedYear) {
      weeklyPapers = [];
      return;
    }
    const requestId = ++weeklyRequestId;
    if (!weeklyYearPromises.has(selectedYear)) {
      paperList.innerHTML = `<p class="loading-state">${selectedYear} 年周报索引加载中...</p>`;
      weeklyYearPromises.set(selectedYear, loadJson(`data/search/weekly/${selectedYear}.json`));
    }
    const rows = await weeklyYearPromises.get(selectedYear);
    weeklyYearCache.set(selectedYear, rows);
    if (requestId !== weeklyRequestId) return;
    weeklyPapers = rows || [];
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlight(value, query) {
    const escaped = escapeHtml(value);
    if (!query) return escaped;
    const needle = escapeHtml(query.trim());
    if (!needle) return escaped;
    return escaped.replace(new RegExp(`(${escapeRegExp(needle)})`, "ig"), "<mark>$1</mark>");
  }

  function renderArchive() {
    const groupedMonths = months.reduce((groups, month) => {
      const year = String(month.year);
      if (!groups[year]) groups[year] = [];
      groups[year].push(month);
      return groups;
    }, {});
    const years = Object.keys(groupedMonths).sort((a, b) => Number(b) - Number(a));
    archiveList.innerHTML = years
      .map((year, index) => {
        const yearMonths = groupedMonths[year];
        const count = yearMonths.reduce((sum, month) => sum + Number(month.count || 0), 0);
        const open = index < 2 ? " open" : "";
        const links = yearMonths
          .map((month) => {
            return `<a class="archive-link" href="${month.url}"><span>${month.month} 月</span><small>${month.count} 篇</small></a>`;
          })
          .join("");
        return `<details class="archive-year"${open}><summary><span>${year} 年</span><small>${count} 篇</small></summary><div class="archive-year-list">${links}</div></details>`;
      })
      .join("");
    const groupedWeeks = weeks.reduce((groups, week) => {
      const year = String(week.year || String(week.date).slice(0, 4));
      if (!groups[year]) groups[year] = [];
      groups[year].push(week);
      return groups;
    }, {});
    const weekYears = Object.keys(groupedWeeks).sort((a, b) => Number(b) - Number(a));
    weeklyList.innerHTML = weekYears
      .map((year, index) => {
        const yearWeeks = groupedWeeks[year];
        const count = yearWeeks.reduce((sum, week) => sum + Number(week.count || 0), 0);
        const open = index < 2 ? " open" : "";
        const links = yearWeeks
          .map((week) => {
            return `<a class="archive-link" href="${week.url}"><span>${week.date}</span><small>${week.count} 篇</small></a>`;
          })
          .join("");
        return `<details class="archive-year"${open}><summary><span>${year} 年</span><small>${count} 篇</small></summary><div class="archive-year-list">${links}</div></details>`;
      })
      .join("");
  }

  async function maybeLoadFullMonthlyForCurrentView() {
    if (sourceMode !== "monthly") return;
    const query = searchInput.value.trim();
    const year = yearFilter.value;
    const needsFullMonthly =
      Boolean(query) ||
      relationFilter !== "all" ||
      Boolean(year);
    if (needsFullMonthly) {
      await ensureMonthlyPapers(year);
    } else if (monthlyScope !== "preview") {
      monthlyRequestId += 1;
      papers = monthlyPreviewPapers;
      monthlyScope = "preview";
    }
  }

  async function refreshPapers() {
    await maybeLoadFullMonthlyForCurrentView();
    renderPapers();
  }

  function renderPapers() {
    const query = searchInput.value.trim().toLowerCase();
    const year = yearFilter.value;
    const source = sourceMode === "weekly" ? weeklyPapers : papers;
    const isMonthlyPreview = sourceMode === "monthly" && monthlyScope === "preview";
    // Keep the server-built totals visible during the fast 100-paper preview.
    // Accurate filtered counts replace them as soon as a full monthly search is requested.
    if (!isMonthlyPreview) updateFilterCounts(source, year);
    const filtered = source.filter((paper) => {
      const dateKey = sourceMode === "weekly" ? paper.week_date : paper.month_key;
      if (year && String(dateKey).slice(0, 4) !== year) return false;
      if (relationFilter === "china" && !paper.is_china_related) return false;
      if (relationFilter === "translated" && !paper.has_zh_abstract && !paper.zh_abstract && !paper.zh_abstract_excerpt) return false;
      if (!query) return true;
      const haystack = [
        paper.number,
        paper.title,
        paper.zh_title,
        paper.authors,
        paper.abstract,
        paper.zh_abstract,
        paper.zh_abstract_excerpt,
        paper.is_china_related ? "china 中国相关" : "",
        dateKey,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;

    resultCount.textContent = isMonthlyPreview ? `预览 ${filtered.length} 篇` : `${filtered.length} 篇`;
    updateActiveFilters(query, year);
    pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页`;
    prevPage.disabled = currentPage <= 1;
    nextPage.disabled = currentPage >= totalPages;
    if (!filtered.length) {
      const scopeLabel = sourceMode === "weekly" ? "周报全量" : "月度中文合集";
      paperList.innerHTML = `<article class="paper-card"><h3>没有找到匹配论文</h3><p class="summary">当前范围为${scopeLabel}。可以尝试减少关键词、切换年份，或用作者名、NBER 编号、英文标题关键词重新搜索。</p></article>`;
      return;
    }
    paperList.innerHTML = filtered
      .slice(start, start + pageSize)
      .map((paper) => {
        const dateKey = sourceMode === "weekly" ? paper.week_date : paper.month_key;
        const archiveUrl = paper.detail_url || `paper.html?number=${encodeURIComponent(paper.number)}`;
        const zhTitle = paper.zh_title ? `<p class="paper-zh-title">${highlight(paper.zh_title, query)}</p>` : "";
        const sourceLabel = sourceMode === "weekly" ? "周报" : "月度";
        const summaryText = paper.zh_abstract || paper.zh_abstract_excerpt || "";
        const summary = summaryText
          ? `<p class="summary">${highlight(summaryText, query)} <a class="summary-more" href="${escapeHtml(archiveUrl)}">阅读全文</a></p>`
          : "";
        return `<article class="paper-card">
          <div class="meta">
            <span>${highlight(dateKey, query)}</span>
            <span>${sourceLabel} No. ${escapeHtml(paper.index)}</span>
            <a href="${escapeHtml(paper.url)}" target="_blank" rel="noopener">NBER w${escapeHtml(paper.number)}</a>
          </div>
          <h3><a href="${archiveUrl}">${highlight(paper.title, query)}</a></h3>
          ${zhTitle}
          ${paper.is_china_related ? '<span class="tag">中国相关</span>' : ""}
          ${paper.topic ? `<a class="topic-link" href="${topicHref(paper.topic)}">${escapeHtml(paper.topic)}</a>` : ""}
          <p class="authors">${highlight(paper.authors, query)}</p>
          ${summary}
        </article>`;
      })
      .join("");
  }

  function updateActiveFilters(query, year) {
    if (!activeFilters) return;
    const sourceLabel = sourceMode === "weekly" ? "周报全量" : "月度中文合集";
    const relationLabel = {
      all: "全部论文",
      china: "中国相关",
      translated: "有中文摘要",
    }[relationFilter] || "全部论文";
    const parts = [sourceLabel, year || "全部年份", relationLabel];
    if (sourceMode === "monthly" && monthlyScope === "preview") parts.push("最新月度预览");
    if (query) parts.push(`关键词：${query}`);
    activeFilters.textContent = parts.join(" · ");
  }

  function updateFilterCounts(source, year) {
    const scoped = source.filter((paper) => {
      const dateKey = sourceMode === "weekly" ? paper.week_date : paper.month_key;
      return !year || String(dateKey).slice(0, 4) === year;
    });
    const counts = {
      all: scoped.length,
      china: scoped.filter((paper) => paper.is_china_related).length,
      translated: scoped.filter((paper) => paper.has_zh_abstract || paper.zh_abstract || paper.zh_abstract_excerpt).length,
    };
    filterButtons.forEach((button) => {
      const span = button.querySelector("span");
      if (span && counts[button.dataset.filter] !== undefined) {
        span.textContent = counts[button.dataset.filter];
      }
    });
  }

  async function setFilter(value) {
    relationFilter = value || "all";
    currentPage = 1;
    filterButtons.forEach((item) => item.classList.toggle("active", item.dataset.filter === relationFilter));
    await refreshPapers();
  }

  async function setSourceMode(value) {
    sourceMode = value || "monthly";
    currentPage = 1;
    sourceButtons.forEach((item) => item.classList.toggle("active", item.dataset.source === sourceMode));
    if (sourceMode === "weekly") {
      const latestYear = String(weeklyManifest?.latest_year || "");
      if (!yearFilter.value && latestYear) yearFilter.value = latestYear;
      yearFilter.options[0].textContent = "最新年份（快速）";
      await ensureWeeklyPapers(yearFilter.value);
    } else {
      yearFilter.options[0].textContent = "全部年份";
    }
    await refreshPapers();
  }

  loadIndexData()
    .then(() => {
      renderArchive();
      renderPapers();
      let searchTimer = 0;
      searchInput.addEventListener("input", () => {
        window.clearTimeout(searchTimer);
        currentPage = 1;
        searchTimer = window.setTimeout(() => refreshPapers().catch(setError), 160);
      });
      if (clearSearch) {
        clearSearch.addEventListener("click", () => {
          searchInput.value = "";
          yearFilter.value = "";
          currentPage = 1;
          refreshPapers().catch(setError);
          searchInput.focus();
        });
      }
      yearFilter.addEventListener("change", () => {
        currentPage = 1;
        const task = sourceMode === "weekly"
          ? ensureWeeklyPapers(yearFilter.value || weeklyManifest?.latest_year)
          : Promise.resolve();
        task.then(refreshPapers).catch(setError);
      });
      filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setFilter(button.dataset.filter).catch(setError);
        });
      });
      sourceButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setSourceMode(button.dataset.source).catch(setError);
        });
      });
      quickFilterLinks.forEach((link) => {
        link.addEventListener("click", () => {
          setFilter(link.dataset.quickFilter).catch(setError);
        });
      });
      quickSourceLinks.forEach((link) => {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          setSourceMode(link.dataset.quickSource)
            .then(() => {
              document.getElementById("paperList").scrollIntoView({ behavior: "smooth", block: "start" });
            })
            .catch(setError);
        });
      });
      prevPage.addEventListener("click", () => {
        if (currentPage > 1) {
          currentPage -= 1;
          renderPapers();
          paperList.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      nextPage.addEventListener("click", () => {
        currentPage += 1;
        renderPapers();
        paperList.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    })
    .catch(setError);
})();
