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

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderArchive() {
    archiveList.innerHTML = months
      .map((month) => {
        return `<a class="archive-link" href="${month.url}"><span>${month.year} 年 ${month.month} 月</span><small>${month.count} 篇</small></a>`;
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
      if (!query) return true;
      const haystack = [
        paper.number,
        paper.title,
        paper.authors,
        paper.zh_abstract,
        paper.month_key,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    resultCount.textContent = `${filtered.length} 篇`;
    paperList.innerHTML = filtered
      .slice(0, 300)
      .map((paper) => {
        const archiveUrl = `archive/${paper.month_key}.html#w${paper.number}`;
        return `<article class="paper-card">
          <div class="meta">
            <span>${escapeHtml(paper.month_key)}</span>
            <span>No. ${escapeHtml(paper.index)}</span>
            <a href="${escapeHtml(paper.url)}" target="_blank" rel="noopener">NBER w${escapeHtml(paper.number)}</a>
          </div>
          <h3><a href="${archiveUrl}">${escapeHtml(paper.title)}</a></h3>
          <p class="authors">${escapeHtml(paper.authors)}</p>
          <p class="summary">${escapeHtml(paper.zh_abstract)}</p>
        </article>`;
      })
      .join("");
  }

  renderArchive();
  renderPapers();
  searchInput.addEventListener("input", renderPapers);
  yearFilter.addEventListener("change", renderPapers);
})();
