(function () {
  const root = document.querySelector("[data-week-insights]");
  if (!root) return;

  const data = JSON.parse(root.dataset.weekInsights || "{}");
  const articles = Array.from(document.querySelectorAll(".paper-detail[data-topic]"));
  const activeLabel = root.querySelector("[data-active-filter]");
  const selectedRegion = root.querySelector("[data-selected-region]");
  const mapPanel = root.querySelector("[data-region-map]");
  const regionById = new Map((data.regions || []).map((item) => [String(item.id), item]));
  let mapLoaded = false;

  function focusPaper(target) {
    if (!target) return;
    articles.forEach((article) => { article.hidden = false; });
    root.querySelectorAll(".is-selected, .is-muted, .legend-active").forEach((node) => node.classList.remove("is-selected", "is-muted", "legend-active"));
    if (activeLabel) activeLabel.textContent = "当前显示：全部论文";
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.classList.remove("anchor-target");
    window.requestAnimationFrame(() => target.classList.add("anchor-target"));
    window.setTimeout(() => target.classList.remove("anchor-target"), 1400);
  }

  document.querySelectorAll("a.toc-link[href^='#w']").forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = document.getElementById(link.getAttribute("href").slice(1));
      if (!target) return;
      event.preventDefault();
      history.replaceState(null, "", link.getAttribute("href"));
      focusPaper(target);
    });
  });

  function setFilter(type, value, label) {
    articles.forEach((article) => {
      const visible = type === "topic"
        ? article.dataset.topic === value
        : (article.dataset.regionIds || "").split(",").includes(value);
      article.hidden = !visible;
    });
    if (activeLabel) activeLabel.textContent = `当前显示：${label}`;
    root.querySelectorAll("[data-topic], .country-shape").forEach((node) => node.classList.remove("is-selected"));
    if (type === "topic") root.querySelectorAll(`[data-topic="${CSS.escape(value)}"]`).forEach((node) => node.classList.add("is-selected"));
    if (type === "region") root.querySelectorAll(`.country-shape[data-country-id="${CSS.escape(value)}"]`).forEach((node) => node.classList.add("is-selected"));
  }

  root.querySelectorAll("[data-topic]").forEach((button) => {
    button.addEventListener("click", () => setFilter("topic", button.dataset.topic, `主题：${button.dataset.topic}`));
  });
  root.querySelector("[data-clear-filter]")?.addEventListener("click", () => {
    articles.forEach((article) => { article.hidden = false; });
    root.querySelectorAll(".is-selected, .is-muted, .legend-active").forEach((node) => node.classList.remove("is-selected", "is-muted", "legend-active"));
    if (activeLabel) activeLabel.textContent = "当前显示：全部论文";
    if (selectedRegion) selectedRegion.textContent = "点击地图查看国家/地区论文。";
  });

  function countBin(count) { return count >= 3 ? "3" : count ? String(count) : ""; }
  function renderSelectedRegion(region) {
    if (!selectedRegion) return;
    if (!region) { selectedRegion.textContent = "点击地图查看国家/地区论文。"; return; }
    const links = region.papers.map((paper) => `<a href="#w${paper.number}" data-paper-anchor="w${paper.number}">${paper.index}. ${paper.zh_title || paper.title}</a>`).join("");
    selectedRegion.innerHTML = `<strong>${region.label}：${region.count} 篇</strong><div>${links}</div>`;
    selectedRegion.querySelectorAll("[data-paper-anchor]").forEach((link) => link.addEventListener("click", (event) => {
      const target = document.getElementById(link.dataset.paperAnchor);
      if (!target) return;
      event.preventDefault();
      history.replaceState(null, "", `#${link.dataset.paperAnchor}`);
      focusPaper(target);
    }));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function renderMap() {
    if (mapLoaded) return;
    await loadScript("../assets/vendor/d3.min.js");
    await loadScript("../assets/vendor/topojson-client.min.js");
    const svg = d3.select(root.querySelector(".world-map"));
    const tooltip = root.querySelector(".map-tooltip");
    if (svg.empty()) return;
    const topo = await d3.json("../assets/geo/countries-110m.json");
    const countries = topojson.feature(topo, topo.objects.countries).features;
    const projection = d3.geoNaturalEarth1().fitSize([940, 430], { type: "FeatureCollection", features: countries });
    const path = d3.geoPath(projection);
    const colors = { 0: "#f1f3f5", 1: "#cfe8f3", 2: "#73add2", 3: "#2b6c9e" };
    svg.append("g").selectAll("path").data(countries).join("path")
      .attr("class", (d) => `country-shape bin-${countBin(regionById.get(String(d.id))?.count || 0)}`)
      .attr("data-country-id", (d) => String(d.id)).attr("data-bin", (d) => countBin(regionById.get(String(d.id))?.count || 0))
      .attr("d", path).attr("fill", (d) => colors[countBin(regionById.get(String(d.id))?.count || 0)] || "#f7f8fa")
      .on("mouseenter", function (event, d) {
        const id = String(d.id); const region = regionById.get(id); d3.select(this).classed("is-hovered", true);
        if (tooltip) { tooltip.hidden = false; tooltip.style.left = `${event.offsetX + 16}px`; tooltip.style.top = `${event.offsetY + 12}px`; tooltip.innerHTML = `<strong>${region?.label || d.properties?.name || "No data"}</strong><span>${region ? `${region.count} 篇论文` : "0 篇论文"}</span>`; }
      }).on("mouseleave", function () { d3.select(this).classed("is-hovered", false); if (tooltip) tooltip.hidden = true; })
      .on("click", function (event, d) { const region = regionById.get(String(d.id)); if (!region) return; setFilter("region", String(d.id), `区域：${region.label}`); renderSelectedRegion(region); });
    root.querySelectorAll(".map-legend [data-bin]").forEach((button) => {
      button.addEventListener("mouseenter", () => root.querySelectorAll(".country-shape").forEach((shape) => shape.classList.toggle("is-muted", shape.dataset.bin !== button.dataset.bin)));
      button.addEventListener("mouseleave", () => root.querySelectorAll(".country-shape").forEach((shape) => shape.classList.remove("is-muted")));
    });
    mapLoaded = true;
  }

  if (mapPanel) {
    renderMap().catch(() => { const shell = root.querySelector(".world-map-shell"); if (shell) shell.insertAdjacentHTML("beforeend", '<p class="map-error">地图加载失败，请稍后刷新页面。</p>'); });
  }
})();
