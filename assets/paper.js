(function () {
  const root = document.getElementById("paperDetail");
  const relatedPanel = document.getElementById("relatedPanel");
  const relatedPapers = document.getElementById("relatedPapers");
  const topicLink = document.getElementById("topicLink");
  const number = (new URLSearchParams(window.location.search).get("number") || "").replace(/^w/i, "");
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

  function shardFor(value) {
    return String(Math.floor(Number(value) / 100)).padStart(4, "0");
  }

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("copy failed");
  }

  function paperCard(paper) {
    return `<article class="paper-card compact-card">
      <div class="meta"><span>${escapeHtml(paper.week_date)}</span><span>w${escapeHtml(paper.number)}</span></div>
      <h3><a href="${paper.zh_abstract ? `papers/w${encodeURIComponent(paper.number)}.html` : `paper.html?number=${encodeURIComponent(paper.number)}`}">${escapeHtml(paper.title)}</a></h3>
      ${paper.zh_title ? `<p class="paper-zh-title">${escapeHtml(paper.zh_title)}</p>` : ""}
      <p class="authors">${escapeHtml(paper.authors)}</p>
    </article>`;
  }

  async function loadRelated(paper) {
    if (!paper.week_date || !paper.topic) return;
    const year = paper.week_date.slice(0, 4);
    const rows = await loadJson(`data/search/weekly/${year}.json`);
    const related = rows
      .filter((item) => item.number !== paper.number && item.topic === paper.topic)
      .slice(0, 6);
    if (!related.length) return;
    relatedPapers.innerHTML = related.map(paperCard).join("");
    topicLink.href = topicHref(paper.topic);
    topicLink.textContent = `浏览“${paper.topic}”专题`;
    relatedPanel.hidden = false;
  }

  function render(paper) {
    const title = paper.title || `NBER Working Paper w${paper.number}`;
    const pageTitle = `${title}｜NBER w${paper.number}｜学术传送门`;
    document.title = pageTitle;
    document.querySelector('meta[name="description"]').content = paper.zh_abstract || paper.abstract || title;
    document.querySelector('meta[property="og:title"]').content = pageTitle;
    document.querySelector('meta[property="og:description"]').content = paper.zh_abstract || paper.abstract || title;
    const hasStaticPage = Boolean(String(paper.zh_abstract || "").trim());
    const canonical = hasStaticPage
      ? `https://academic-door.github.io/nber-working-papers-cn/papers/w${paper.number}.html`
      : `https://academic-door.github.io/nber-working-papers-cn/paper.html?number=${paper.number}`;
    document.getElementById("canonicalLink").href = canonical;

    const topic = paper.topic || "其他主题";
    const regions = (paper.regions || []).map((item) => item.label).filter(Boolean).join("、");
    root.innerHTML = `<div class="paper-detail-topline">
        <span>NBER Working Paper w${escapeHtml(paper.number)}</span>
        ${paper.week_date ? `<a href="weekly/${escapeHtml(paper.week_date)}.html#w${escapeHtml(paper.number)}">所在周报</a>` : ""}
        ${paper.month_key ? `<a href="archive/${escapeHtml(paper.month_key)}.html#w${escapeHtml(paper.number)}">所在月度合集</a>` : ""}
      </div>
      <h2>${escapeHtml(title)}</h2>
      ${paper.zh_title ? `<p class="standalone-zh-title">${escapeHtml(paper.zh_title)}</p>` : ""}
      <p class="authors">${escapeHtml(paper.authors)}</p>
      <div class="paper-taxonomy">
        <a href="${topicHref(topic)}">${escapeHtml(topic)}</a>
        ${paper.is_china_related ? '<a class="tag" href="topics/china.html">中国相关</a>' : ""}
        ${regions ? `<span>${escapeHtml(regions)}</span>` : ""}
      </div>
      <div class="abstract-pair">
        <section class="abstract-block"><h3>Abstract</h3><p>${escapeHtml(paper.abstract || "NBER 页面暂未提供摘要。")}</p></section>
        <section class="abstract-block zh-block"><h3>中文摘要</h3><p>${escapeHtml(paper.zh_abstract || "中文摘要尚未覆盖。")}</p></section>
      </div>
      <div class="paper-actions">
        <a class="primary-action" href="${escapeHtml(paper.url)}" target="_blank" rel="noopener">在 NBER 阅读原文</a>
        <button type="button" id="sharePaper">分享链接</button>
        <button type="button" id="copyCitation">复制题录</button>
      </div>`;
    root.insertAdjacentHTML("beforeend", '<p class="action-feedback" id="actionFeedback" aria-live="polite"></p>');

    const feedback = document.getElementById("actionFeedback");
    function notify(message, isError = false) {
      feedback.textContent = message;
      feedback.classList.toggle("is-error", isError);
    }

    const shareButton = document.getElementById("sharePaper");
    shareButton.addEventListener("click", async () => {
      try {
        await copyText(canonical);
        shareButton.textContent = "已复制";
        notify("学术传送门论文链接已复制。");
        window.setTimeout(() => { shareButton.textContent = "分享链接"; }, 1800);
      } catch (_) {
        notify("未能自动复制，请复制浏览器地址栏链接。", true);
      }
    });
    const copyButton = document.getElementById("copyCitation");
    copyButton.addEventListener("click", async () => {
      try {
        await copyText(`${paper.authors}. ${title}. NBER Working Paper ${paper.number}. ${paper.url}`);
        notify("题录已复制，可直接粘贴到文献笔记或参考文献中。");
      } catch (_) {
        notify("未能自动复制题录。", true);
      }
    });
  }

  if (!/^\d+$/.test(number)) {
    root.innerHTML = '<div class="empty-state"><h2>缺少论文编号</h2><p>请从首页检索或周报目录进入论文详情。</p><a href="index.html">返回主页</a></div>';
    return;
  }

  loadJson(`data/papers/${shardFor(number)}.json`)
    .then((items) => {
      const paper = items[number];
      if (!paper) throw new Error("Paper not found");
      if (String(paper.zh_abstract || "").trim()) {
        window.location.replace(`papers/w${encodeURIComponent(paper.number)}.html`);
        return;
      }
      render(paper);
      return loadRelated(paper);
    })
    .catch(() => {
      root.innerHTML = `<div class="empty-state"><h2>没有找到 w${escapeHtml(number)}</h2><p>该编号可能尚未进入本站数据。</p><a href="index.html">返回论文检索</a></div>`;
    });
})();
