(function () {
  let months = window.NBER_MONTHS || [];
  let papers = window.NBER_PAPERS || [];
  let weeks = window.NBER_WEEKS || [];
  let weeklyPapers = window.NBER_WEEKLY_PAPERS || [];
  const archiveList = document.getElementById("archiveList");
  const weeklyList = document.getElementById("weeklyList");
  const paperList = document.getElementById("paperList");
  const resultCount = document.getElementById("resultCount");
  const searchInput = document.getElementById("searchInput");
  const yearFilter = document.getElementById("yearFilter");
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
    paperList.innerHTML = `<article class="paper-card"><h3>数据加载失败</h3><p class="summary">${fileHint} 请通过本地服务器或 GitHub Pages 访问本站：在项目目录运行 <code>python -m http.server 8765 --bind 127.0.0.1 --directory docs</code>，然后打开 <code>http://127.0.0.1:8765/</code>；公开站点为 <code>https://simon-world.github.io/nber-working-papers-cn/</code>。</p></article>`;
    resultCount.textContent = "加载失败";
    pageInfo.textContent = "";
    prevPage.disabled = true;
    nextPage.disabled = true;
  }

  async function loadJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }
    return response.json();
  }

  async function loadIndexData() {
    if (months.length && papers.length && weeks.length) return;
    setLoading();
    const [loadedMonths, loadedPapers, loadedWeeks] = await Promise.all([
      loadJson("data/months.json"),
      loadJson("data/monthly_papers.json"),
      loadJson("data/weeks.json"),
    ]);
    months = loadedMonths;
    papers = loadedPapers;
    weeks = loadedWeeks;
  }

  async function ensureWeeklyPapers() {
    if (weeklyPapers.length) return;
    paperList.textContent = "周报全量索引加载中...";
    weeklyPapers = await loadJson("data/weekly_papers.json");
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

  function renderPapers() {
    const query = searchInput.value.trim().toLowerCase();
    const year = yearFilter.value;
    const source = sourceMode === "weekly" ? weeklyPapers : papers;
    updateFilterCounts(source, year);
    const filtered = source.filter((paper) => {
      const dateKey = sourceMode === "weekly" ? paper.week_date : paper.month_key;
      if (year && String(dateKey).slice(0, 4) !== year) return false;
      if (relationFilter === "china" && !paper.is_china_related) return false;
      if (relationFilter === "translated" && !paper.zh_title && !paper.zh_abstract) return false;
      if (!query) return true;
      const haystack = [
        paper.number,
        paper.title,
        paper.zh_title,
        paper.authors,
        paper.abstract,
        paper.zh_abstract,
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

    resultCount.textContent = `${filtered.length} 篇`;
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
        const archiveUrl = sourceMode === "weekly" ? `weekly/${paper.week_date}.html#w${paper.number}` : `archive/${paper.month_key}.html#w${paper.number}`;
        const zhTitle = paper.zh_title ? `<p class="paper-zh-title">${highlight(paper.zh_title, query)}</p>` : "";
        const sourceLabel = sourceMode === "weekly" ? "周报" : "月度";
        const summary = paper.zh_abstract ? `<p class="summary">${highlight(paper.zh_abstract, query)}</p>` : "";
        return `<article class="paper-card">
          <div class="meta">
            <span>${highlight(dateKey, query)}</span>
            <span>${sourceLabel} No. ${escapeHtml(paper.index)}</span>
            <a href="${escapeHtml(paper.url)}" target="_blank" rel="noopener">NBER w${escapeHtml(paper.number)}</a>
          </div>
          <h3><a href="${archiveUrl}">${highlight(paper.title, query)}</a></h3>
          ${zhTitle}
          ${paper.is_china_related ? '<span class="tag">中国相关</span>' : ""}
          <p class="authors">${highlight(paper.authors, query)}</p>
          ${summary}
        </article>`;
      })
      .join("");
  }

  function updateFilterCounts(source, year) {
    const scoped = source.filter((paper) => {
      const dateKey = sourceMode === "weekly" ? paper.week_date : paper.month_key;
      return !year || String(dateKey).slice(0, 4) === year;
    });
    const counts = {
      all: scoped.length,
      china: scoped.filter((paper) => paper.is_china_related).length,
      translated: scoped.filter((paper) => paper.zh_title || paper.zh_abstract).length,
    };
    filterButtons.forEach((button) => {
      const span = button.querySelector("span");
      if (span && counts[button.dataset.filter] !== undefined) {
        span.textContent = counts[button.dataset.filter];
      }
    });
  }

  function setFilter(value) {
    relationFilter = value || "all";
    currentPage = 1;
    filterButtons.forEach((item) => item.classList.toggle("active", item.dataset.filter === relationFilter));
    renderPapers();
  }

  async function setSourceMode(value) {
    sourceMode = value || "monthly";
    currentPage = 1;
    sourceButtons.forEach((item) => item.classList.toggle("active", item.dataset.source === sourceMode));
    if (sourceMode === "weekly") {
      await ensureWeeklyPapers();
    }
    renderPapers();
  }

  loadIndexData()
    .then(() => {
      renderArchive();
      renderPapers();
      searchInput.addEventListener("input", () => {
        currentPage = 1;
        renderPapers();
      });
      yearFilter.addEventListener("change", () => {
        currentPage = 1;
        renderPapers();
      });
      filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setFilter(button.dataset.filter);
        });
      });
      sourceButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setSourceMode(button.dataset.source).catch(setError);
        });
      });
      quickFilterLinks.forEach((link) => {
        link.addEventListener("click", () => {
          setFilter(link.dataset.quickFilter);
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
