(function () {
  const months = window.NBER_MONTHS || [];
  const papers = window.NBER_PAPERS || [];
  const weeks = window.NBER_WEEKS || [];
  const archiveList = document.getElementById("archiveList");
  const weeklyList = document.getElementById("weeklyList");
  const paperList = document.getElementById("paperList");
  const resultCount = document.getElementById("resultCount");
  const searchInput = document.getElementById("searchInput");
  const yearFilter = document.getElementById("yearFilter");
  const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
  const quickFilterLinks = Array.from(document.querySelectorAll("[data-quick-filter]"));
  const prevPage = document.getElementById("prevPage");
  const nextPage = document.getElementById("nextPage");
  const pageInfo = document.getElementById("pageInfo");
  const pageSize = 30;
  let relationFilter = "all";
  let currentPage = 1;

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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
    weeklyList.innerHTML = weeks
      .map((week) => {
        return `<a class="archive-link" href="${week.url}"><span>${week.date}</span><small>${week.count} 篇</small></a>`;
      })
      .join("");
  }

  function renderPapers() {
    const query = searchInput.value.trim().toLowerCase();
    const year = yearFilter.value;
    const filtered = papers.filter((paper) => {
      if (year && String(paper.month_key).slice(0, 4) !== year) return false;
      if (relationFilter === "china" && !paper.is_china_related) return false;
      if (!query) return true;
      const haystack = [
        paper.number,
        paper.title,
        paper.authors,
        paper.zh_abstract,
        paper.is_china_related ? "china 中国相关" : "",
        paper.month_key,
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
    paperList.innerHTML = filtered
      .slice(start, start + pageSize)
      .map((paper) => {
        const archiveUrl = `archive/${paper.month_key}.html#w${paper.number}`;
        return `<article class="paper-card">
          <div class="meta">
            <span>${escapeHtml(paper.month_key)}</span>
            <span>No. ${escapeHtml(paper.index)}</span>
            <a href="${escapeHtml(paper.url)}" target="_blank" rel="noopener">NBER w${escapeHtml(paper.number)}</a>
          </div>
          <h3><a href="${archiveUrl}">${escapeHtml(paper.title)}</a></h3>
          ${paper.is_china_related ? '<span class="tag">中国相关</span>' : ""}
          <p class="authors">${escapeHtml(paper.authors)}</p>
          <p class="summary">${escapeHtml(paper.zh_abstract)}</p>
        </article>`;
      })
      .join("");
  }

  function setFilter(value) {
    relationFilter = value || "all";
    currentPage = 1;
    filterButtons.forEach((item) => item.classList.toggle("active", item.dataset.filter === relationFilter));
    renderPapers();
  }

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
  quickFilterLinks.forEach((link) => {
    link.addEventListener("click", () => {
      setFilter(link.dataset.quickFilter);
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
})();
