from __future__ import annotations

import argparse
import csv
import html
import json
import re
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from email.utils import format_datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = PROJECT_ROOT.parents[1]
LOCAL_MONTHLY_SOURCE = WORKSPACE_ROOT / "workflow" / "05_ready" / "journal_digest"
PROJECT_MONTHLY_SOURCE = PROJECT_ROOT / "sources" / "monthly_ready"
DEFAULT_SOURCE = PROJECT_MONTHLY_SOURCE if PROJECT_MONTHLY_SOURCE.exists() else LOCAL_MONTHLY_SOURCE
DEFAULT_WEEKLY_SOURCE = WORKSPACE_ROOT / "workflow" / "01_sources" / "journals" / "nber" / "markdown_weekly"
DEFAULT_METADATA_SOURCE = WORKSPACE_ROOT / "workflow" / "01_sources" / "journals" / "nber"
DEFAULT_OUTPUT = PROJECT_ROOT / "docs"
DEFAULT_TRANSLATION_CACHE = PROJECT_ROOT / "data" / "translations" / "nber_weekly_zh.json"

CHINA_TERMS = (
    "china",
    "chinese",
    "hong kong",
    "taiwan",
    "mainland china",
    "renminbi",
    "rmb",
    "beijing",
    "shanghai",
    "shenzhen",
    "guangdong",
    "xinjiang",
    "tibet",
    "uyghur",
)


MONTH_RE = re.compile(r"(?P<date>20\d{6})-前沿文献-NBER工作论文-(?P<year>20\d{2})年(?P<month>\d{1,2})月合集-目录与摘要-ready\.md$")
HEADING_RE = re.compile(r"^####\s+(?P<index>\d+)\.\s+(?P<title>.+?)(?:\s+\{#(?P<number>\d+)\})?\s*$")
FIELD_RE = re.compile(r"^【\*\*(?P<key>Author|Abstract|摘要|NBER)\*\*】[：:]\s*(?P<value>.*)$")
TOC_ITEM_RE = re.compile(r"^\d+\.\s+\*\*(?P<title>.+?)\s+\{#(?P<number>\d+)\}\*\*")
WEEKLY_RE = re.compile(r"【NBER-(?P<date>20\d{2}-\d{2}-\d{2})】\.md$")
WEEKLY_HEADING_RE = re.compile(r"^###\s+(?P<index>\d+)\.\s+(?P<title>.+?)\s+\{#(?P<number>\d+)\}\s*$")


@dataclass
class Paper:
    index: int
    number: str
    title: str
    authors: str
    abstract: str
    zh_abstract: str
    nber: str
    url: str
    month_key: str
    year: int
    month: int
    is_china_related: bool


@dataclass
class MonthIssue:
    key: str
    year: int
    month: int
    date: str
    source_file: str
    title: str
    intro: list[str]
    papers: list[Paper]


@dataclass
class WeeklyPaper:
    index: int
    number: str
    title: str
    authors: str
    abstract: str
    meta: str
    url: str
    week_date: str
    zh_title: str
    zh_abstract: str
    is_china_related: bool


@dataclass
class WeekIssue:
    date: str
    year: int
    source_file: str
    title: str
    intro: list[str]
    papers: list[WeeklyPaper]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")


def read_tsv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def clean_title(raw: str) -> str:
    return re.sub(r"\s+", " ", raw).strip()


def clean(raw: object) -> str:
    if raw is None:
        return ""
    return re.sub(r"\s+", " ", str(raw)).strip()


def parse_date(value: str) -> str:
    value = clean(value)
    for fmt in ("%Y-%m-%d", "%B %d, %Y", "%b %d, %Y", "%B %Y", "%b %Y"):
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return value


def is_valid_date(value: str) -> bool:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def next_monday(date_text: str) -> str:
    dt = datetime.strptime(date_text, "%Y-%m-%d")
    days_until_monday = (7 - dt.weekday()) % 7
    return (dt + timedelta(days=days_until_monday)).strftime("%Y-%m-%d")


def is_china_related_text(*parts: str) -> bool:
    haystack = " ".join(parts).lower()
    return any(term in haystack for term in CHINA_TERMS)


def load_translation_cache(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    cache: dict[str, dict[str, str]] = {}
    for number, item in raw.items():
        if isinstance(item, dict):
            cache[str(number)] = {
                "zh_title": clean(item.get("zh_title", "")),
                "zh_abstract": clean(item.get("zh_abstract", "")),
            }
    return cache


def collect_ready_files(source: Path) -> list[Path]:
    files_by_month: dict[tuple[int, int], Path] = {}
    for path in sorted(source.glob("20*-前沿文献-NBER工作论文-*目录与摘要-ready.md")):
        match = MONTH_RE.match(path.name)
        if not match:
            continue
        year = int(match.group("year"))
        month = int(match.group("month"))
        files_by_month[(year, month)] = path
    return [files_by_month[key] for key in sorted(files_by_month)]


def collect_weekly_files(source: Path) -> list[Path]:
    files: list[Path] = []
    for path in sorted(source.glob("20??/【NBER-*.md")):
        if WEEKLY_RE.match(path.name):
            files.append(path)
    return files


def parse_month(path: Path) -> MonthIssue:
    text = read_text(path)
    match = MONTH_RE.match(path.name)
    if not match:
        raise ValueError(f"Unsupported file name: {path.name}")

    year = int(match.group("year"))
    month = int(match.group("month"))
    month_key = f"{year}-{month:02d}"
    date = match.group("date")
    lines = text.split("\n")
    title = next((line.lstrip("# ").strip() for line in lines if line.startswith("# ")), f"NBER {month_key}")
    intro = [line.strip("> ").strip() for line in lines if line.startswith("> ")]

    try:
        start = lines.index("## 二、摘要")
    except ValueError as exc:
        raise ValueError(f"No abstract section found: {path}") from exc

    papers: list[Paper] = []
    current: dict[str, str] | None = None

    for line in lines[start + 1 :]:
        heading = HEADING_RE.match(line)
        if heading:
            if current:
                papers.append(make_paper(current, month_key, year, month))
            current = {
                "index": heading.group("index"),
                "number": heading.group("number") or "",
                "title": clean_title(heading.group("title")),
                "authors": "",
                "abstract": "",
                "zh_abstract": "",
                "nber": "",
            }
            continue

        if current is None:
            continue

        field = FIELD_RE.match(line.strip())
        if field:
            key = field.group("key")
            value = field.group("value").strip()
            if key == "Author":
                current["authors"] = value
            elif key == "Abstract":
                current["abstract"] = value
            elif key == "摘要":
                current["zh_abstract"] = value
            elif key == "NBER":
                current["nber"] = value

    if current:
        papers.append(make_paper(current, month_key, year, month))

    if not papers:
        raise ValueError(f"No papers parsed: {path}")

    toc_count = sum(1 for line in lines if TOC_ITEM_RE.match(line))
    if toc_count and toc_count != len(papers):
        raise ValueError(f"TOC count mismatch in {path.name}: toc={toc_count}, abstracts={len(papers)}")

    return MonthIssue(
        key=month_key,
        year=year,
        month=month,
        date=date,
        source_file=path.name,
        title=title,
        intro=intro,
        papers=papers,
    )


def parse_week(path: Path, translation_cache: dict[str, dict[str, str]] | None = None) -> WeekIssue:
    text = read_text(path)
    match = WEEKLY_RE.match(path.name)
    if not match:
        raise ValueError(f"Unsupported weekly file name: {path.name}")

    date = match.group("date")
    year = int(date[:4])
    lines = text.split("\n")
    title = next((line.lstrip("# ").strip() for line in lines if line.startswith("# ")), f"NBER {date}")
    intro = [line.strip("> ").strip() for line in lines if line.startswith("> ")]

    try:
        start = lines.index("## 摘要")
    except ValueError as exc:
        raise ValueError(f"No weekly abstract section found: {path}") from exc

    papers: list[WeeklyPaper] = []
    current: dict[str, object] | None = None
    collecting_abstract = False
    abstract_lines: list[str] = []

    def flush() -> None:
        nonlocal current, abstract_lines, collecting_abstract
        if not current:
            return
        current["abstract"] = " ".join(line.strip() for line in abstract_lines if line.strip())
        papers.append(make_weekly_paper(current, date))
        current = None
        abstract_lines = []
        collecting_abstract = False

    for line in lines[start + 1 :]:
        heading = WEEKLY_HEADING_RE.match(line)
        if heading:
            flush()
            number = heading.group("number")
            zh = (translation_cache or {}).get(number, {})
            current = {
                "index": int(heading.group("index")),
                "number": number,
                "title": clean_title(heading.group("title")),
                "authors": "",
                "meta": "",
                "abstract": "",
                "zh_title": zh.get("zh_title", ""),
                "zh_abstract": zh.get("zh_abstract", ""),
            }
            continue

        if current is None:
            continue

        stripped = line.strip()
        if stripped.startswith("作者："):
            current["authors"] = stripped.removeprefix("作者：").strip()
            continue
        if stripped.startswith("Programs："):
            current["meta"] = stripped
            continue
        if stripped.startswith("**Abstract：**"):
            collecting_abstract = True
            continue
        if stripped.startswith("原文链接："):
            collecting_abstract = False
            continue
        if collecting_abstract:
            abstract_lines.append(stripped)

    flush()

    if not papers:
        raise ValueError(f"No weekly papers parsed: {path}")

    return WeekIssue(
        date=date,
        year=year,
        source_file=str(path.relative_to(path.parents[2])),
        title=title,
        intro=intro,
        papers=papers,
    )


def load_page_abstracts(metadata_source: Path) -> dict[str, str]:
    path = metadata_source / "abstract_cache" / "nber_page_abstracts.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    abstracts: dict[str, str] = {}
    for paper, value in raw.items():
        if isinstance(value, dict):
            text = clean(value.get("abstract", ""))
        else:
            text = clean(value)
        if text:
            abstracts[paper] = text
    return abstracts


def build_full_weekly_from_metadata(metadata_source: Path, translation_cache: dict[str, dict[str, str]] | None = None) -> list[WeekIssue]:
    required = [metadata_source / name for name in ["ref.tsv", "abs.tsv", "prog.tsv", "jel.tsv"]]
    missing = [path.name for path in required if not path.exists()]
    if missing:
        raise SystemExit(f"Missing NBER TSV files for full weekly build: {', '.join(missing)}")

    abstracts = {row["paper"]: clean(row.get("abstract", "")) for row in read_tsv(metadata_source / "abs.tsv")}
    page_abstracts = load_page_abstracts(metadata_source)

    programs: dict[str, set[str]] = defaultdict(set)
    for row in read_tsv(metadata_source / "prog.tsv"):
        program = clean(row.get("program", ""))
        if program:
            programs[row["paper"]].add(program)

    jels: dict[str, set[str]] = defaultdict(set)
    for row in read_tsv(metadata_source / "jel.tsv"):
        jel = clean(row.get("jel", ""))
        if jel:
            jels[row["paper"]].add(jel)

    by_week: dict[str, list[WeeklyPaper]] = defaultdict(list)
    for row in read_tsv(metadata_source / "ref.tsv"):
        paper = clean(row.get("paper", ""))
        date = parse_date(row.get("issue_date", ""))
        if not paper.startswith("w") or not is_valid_date(date):
            continue
        number = paper[1:]
        zh = (translation_cache or {}).get(number, {})
        week_date = next_monday(date)
        title = clean(row.get("title", ""))
        author = clean(row.get("author", ""))
        abstract = abstracts.get(paper, "") or page_abstracts.get(paper, "")
        tags = []
        if programs.get(paper):
            tags.append("Programs：" + ", ".join(sorted(programs[paper])))
        if jels.get(paper):
            tags.append("JEL：" + ", ".join(sorted(jels[paper])))
        by_week[week_date].append(
            WeeklyPaper(
                index=0,
                number=number,
                title=title,
                authors=author,
                abstract=abstract,
                meta="；".join(tags),
                url=f"https://www.nber.org/papers/{paper}",
                week_date=week_date,
                zh_title=zh.get("zh_title", ""),
                zh_abstract=zh.get("zh_abstract", ""),
                is_china_related=is_china_related_text(title, author, abstract),
            )
        )

    weeks: list[WeekIssue] = []
    for week_date in sorted(by_week):
        papers = sorted(by_week[week_date], key=lambda item: int(item.number), reverse=True)
        for index, paper in enumerate(papers, 1):
            paper.index = index
        weeks.append(
            WeekIssue(
                date=week_date,
                year=int(week_date[:4]),
                source_file="NBER TSV metadata",
                title=f"【前沿文献】NBER工作论文 {week_date} 目录与摘要",
                intro=[
                    f"来源：NBER Working Papers；周报日期：{week_date}。",
                    "本页面由 NBER 官方 TSV 元数据按 issue_date 汇总为周度归档；未按 Programs 或 JEL 筛选。",
                ],
                papers=papers,
            )
        )
    return weeks


def make_weekly_paper(raw: dict[str, object], date: str) -> WeeklyPaper:
    number = str(raw["number"])
    return WeeklyPaper(
        index=int(raw["index"]),
        number=number,
        title=str(raw["title"]),
        authors=str(raw.get("authors", "")),
        abstract=str(raw.get("abstract", "")),
        meta=str(raw.get("meta", "")),
        url=f"https://www.nber.org/papers/w{number}",
        week_date=date,
        zh_title=str(raw.get("zh_title", "")),
        zh_abstract=str(raw.get("zh_abstract", "")),
        is_china_related=is_china_related_text(str(raw.get("title", "")), str(raw.get("authors", "")), str(raw.get("abstract", ""))),
    )


def format_month_intro(issue: MonthIssue) -> str:
    lines: list[str] = []
    expected_china_count = None
    china_indices: list[int] = []
    for line in issue.intro:
        fixed = line
        count_match = re.search(r"与中国研究相关的有\s*(\d+)\s*篇", line)
        if count_match:
            expected_china_count = int(count_match.group(1))
            paren_match = re.search(r"（([^）]+)）", line)
            if paren_match:
                china_indices = [int(value) for value in re.findall(r"\d+", paren_match.group(1))]
        if line.startswith("其中，中国相关研究包括：") and expected_china_count is not None:
            listed = line.count("#")
            if listed and listed < expected_china_count:
                paper_by_index = {paper.index: paper for paper in issue.papers}
                full_items = []
                for index in china_indices:
                    paper = paper_by_index.get(index)
                    if paper:
                        full_items.append(f"#{paper.number}（第 {paper.index} 篇，{paper.title}）")
                if len(full_items) == expected_china_count:
                    fixed = "其中，中国相关研究包括：" + "；".join(full_items) + "。"
        lines.append(f"<p>{html.escape(fixed)}</p>")
    return "".join(lines)


def make_paper(raw: dict[str, str], month_key: str, year: int, month: int) -> Paper:
    url_match = re.search(r"https://www\.nber\.org/papers/w\d+", raw.get("nber", ""))
    number_match = re.search(r"w(\d+)|No\.\s*(\d+)", raw.get("nber", ""))
    number = raw.get("number") or (number_match.group(1) or number_match.group(2) if number_match else "")
    url = url_match.group(0) if url_match else f"https://www.nber.org/papers/w{number}"
    return Paper(
        index=int(raw["index"]),
        number=number,
        title=raw["title"],
        authors=raw.get("authors", ""),
        abstract=raw.get("abstract", ""),
        zh_abstract=raw.get("zh_abstract", ""),
        nber=raw.get("nber", ""),
        url=url,
        month_key=month_key,
        year=year,
        month=month,
        is_china_related=is_china_related_text(raw.get("title", ""), raw.get("authors", ""), raw.get("abstract", ""), raw.get("zh_abstract", "")),
    )


def render_index(months: list[MonthIssue], weeks: list[WeekIssue], built_at: str) -> str:
    latest = months[-1]
    total_papers = sum(len(issue.papers) for issue in months)
    latest_week = weeks[-1] if weeks else None
    total_weekly_papers = sum(len(issue.papers) for issue in weeks)
    china_papers = sum(1 for issue in months for paper in issue.papers if paper.is_china_related)
    years = sorted({issue.year for issue in months}, reverse=True)
    months_json = json.dumps(
        [
            {
                "key": issue.key,
                "year": issue.year,
                "month": issue.month,
                "date": issue.date,
                "title": issue.title,
                "count": len(issue.papers),
                "url": f"archive/{issue.key}.html",
            }
            for issue in reversed(months)
        ],
        ensure_ascii=False,
    )
    papers_json = json.dumps(
        [
            {
                "number": paper.number,
                "title": paper.title,
                "authors": paper.authors,
                "zh_abstract": paper.zh_abstract,
                "url": paper.url,
                "month_key": paper.month_key,
                "index": paper.index,
                "is_china_related": paper.is_china_related,
            }
            for issue in reversed(months)
            for paper in issue.papers
        ],
        ensure_ascii=False,
    )
    weeks_json = json.dumps(
        [
            {
                "date": issue.date,
                "year": issue.year,
                "count": len(issue.papers),
                "url": f"weekly/{issue.date}.html",
            }
            for issue in reversed(weeks[-80:])
        ],
        ensure_ascii=False,
    )
    latest_week_html = ""
    if latest_week:
        latest_week_html = f"""
    <section class="latest-week">
      <div class="panel-head">
        <h2>最新一周：{html.escape(latest_week.date)}</h2>
        <a href="weekly/{latest_week.date}.html">查看全部 {len(latest_week.papers)} 篇</a>
      </div>
      <div class="weekly-grid">
        {''.join(render_week_card(paper, latest_week.date) for paper in latest_week.papers[:12])}
      </div>
    </section>
"""
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>学术传送门 NBER 工作论文</title>
  <meta name="description" content="面向中文读者的 NBER Working Papers 目录与摘要归档。">
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <header class="site-header">
    <div>
      <p class="eyebrow">Academic Door</p>
      <h1>学术传送门 NBER 工作论文</h1>
      <div class="intro-row">
        <p class="lead">每周整理 NBER Working Papers 官方全量元数据，月度中文内容由 DeepSeek 辅助翻译。欢迎关注微信公众号：学术传送门。</p>
        <img class="wechat-qr" src="assets/images/academic-door-qr.jpg" alt="学术传送门微信公众号二维码">
      </div>
    </div>
    <div class="stats" aria-label="站点统计">
      <span><strong>{len(months)}</strong> 个月</span>
      <span><strong>{total_papers}</strong> 篇论文</span>
      <span><strong>{latest_week.date if latest_week else latest.key}</strong> 最新</span>
    </div>
  </header>

  <main>
    <section class="quick-sections" aria-label="内容入口">
      <a class="quick-card" href="{f'weekly/{latest_week.date}.html' if latest_week else '#'}">
        <span>最新周报</span>
        <strong>{html.escape(latest_week.date) if latest_week else "暂无"}</strong>
        <small>{len(latest_week.papers) if latest_week else 0} 篇全量论文</small>
      </a>
      <a class="quick-card" href="#archiveList">
        <span>月度合集</span>
        <strong>{len(months)} 个月</strong>
        <small>{total_papers} 篇中文摘要</small>
      </a>
      <a class="quick-card" href="#paperList" data-quick-filter="china">
        <span>中国相关</span>
        <strong>{china_papers} 篇</strong>
        <small>点击查看筛选结果</small>
      </a>
    </section>

    {latest_week_html}

    <section class="toolbar" aria-label="检索工具">
      <input id="searchInput" type="search" placeholder="搜索标题、作者、摘要或 NBER 编号" autocomplete="off">
      <select id="yearFilter" aria-label="按年份筛选">
        <option value="">全部年份</option>
        {''.join(f'<option value="{year}">{year}</option>' for year in years)}
      </select>
      <div class="segmented" role="group" aria-label="相关性筛选">
        <button type="button" class="active" data-filter="all">全部论文 <span>{total_papers}</span></button>
        <button type="button" data-filter="china">中国相关 <span>{china_papers}</span></button>
      </div>
    </section>

    <section class="layout">
      <aside class="archive-panel">
        <h2>月度归档</h2>
        <div id="archiveList" class="archive-list"></div>
        <h2 class="side-heading">最近周报</h2>
        <div id="weeklyList" class="archive-list"></div>
      </aside>
      <section class="results-panel">
        <div class="panel-head">
          <h2>论文检索</h2>
          <span id="resultCount"></span>
        </div>
        <div id="paperList" class="paper-list"></div>
        <div class="pagination" aria-label="分页">
          <button type="button" id="prevPage">上一页</button>
          <span id="pageInfo"></span>
          <button type="button" id="nextPage">下一页</button>
        </div>
      </section>
    </section>
  </main>

  <footer>
    <p>订阅：<a href="feed.xml">RSS Feed</a> / <a href="feed.json">JSON Feed</a></p>
    <p>本站为 Academic Door / 学术传送门维护的非官方 NBER 工作论文中文整理项目；原文请以 <a href="https://www.nber.org/papers" target="_blank" rel="noopener">NBER 官网</a> 为准。</p>
    <p>Generated at {html.escape(built_at)}.</p>
  </footer>

  <script>
    window.NBER_MONTHS = {months_json};
    window.NBER_PAPERS = {papers_json};
    window.NBER_WEEKS = {weeks_json};
  </script>
  <script src="assets/site.js"></script>
</body>
</html>
"""


def render_week_card(paper: WeeklyPaper, date: str) -> str:
    badge = '<span class="tag">中国相关</span>' if paper.is_china_related else ""
    zh_title = f'\n  <p class="zh-title">{html.escape(paper.zh_title)}</p>' if paper.zh_title else ""
    return f"""<article class="week-card">
  <div class="meta"><span>No. {paper.index}</span><a href="{html.escape(paper.url)}" target="_blank" rel="noopener">w{paper.number}</a>{badge}</div>
  <h3><a href="weekly/{date}.html#w{paper.number}">{html.escape(paper.title)}</a></h3>{zh_title}
  <p>{html.escape(paper.authors)}</p>
</article>"""


def render_week_article(paper: WeeklyPaper) -> str:
    badge = '<span class="tag">中国相关</span>' if paper.is_china_related else ""
    zh_title = f'\n  <p class="zh-detail-title">{html.escape(paper.zh_title)}</p>' if paper.zh_title else ""
    if paper.zh_abstract:
        zh_abstract = f"<h3>中文摘要</h3><p>{html.escape(paper.zh_abstract)}</p>"
    else:
        zh_abstract = '<p class="translation-missing">中文翻译待补充。设置 DEEPSEEK_API_KEY 后，自动更新会只翻译缺失项。</p>'
    return f"""<article class="paper-detail" id="w{paper.number}">
  <div class="paper-meta"><span>No. {paper.index}</span><a href="{html.escape(paper.url)}" target="_blank" rel="noopener">NBER w{paper.number}</a>{badge}</div>
  <h2>{html.escape(paper.title)}</h2>{zh_title}
  <p class="authors">{html.escape(paper.authors)}</p>
  <p class="meta-line">{html.escape(paper.meta)}</p>
  {zh_abstract}
  <h3>Abstract</h3>
  <p>{html.escape(paper.abstract)}</p>
</article>"""


def render_month(issue: MonthIssue) -> str:
    rows = "\n".join(
        f"""<article class="paper-detail" id="w{paper.number}">
  <div class="paper-meta"><span>No. {paper.index}</span><a href="{html.escape(paper.url)}" target="_blank" rel="noopener">NBER w{paper.number}</a></div>
  <h2>{html.escape(paper.title)}</h2>
  <p class="authors">{html.escape(paper.authors)}</p>
  <h3>中文摘要</h3>
  <p>{html.escape(paper.zh_abstract)}</p>
  <h3>Abstract</h3>
  <p>{html.escape(paper.abstract)}</p>
</article>"""
        for paper in issue.papers
    )
    intro = format_month_intro(issue)
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(issue.title)}</title>
  <link rel="stylesheet" href="../assets/style.css">
</head>
<body>
  <header class="site-header compact">
    <div>
      <p class="eyebrow"><a href="../index.html">学术传送门 NBER 工作论文</a></p>
      <h1>{html.escape(issue.title)}</h1>
      <p class="lead">{issue.year} 年 {issue.month} 月，共 {len(issue.papers)} 篇。</p>
    </div>
  </header>
  <main class="month-page">
    <section class="month-summary">{intro}</section>
    {rows}
  </main>
  <footer>
    <p>Maintained by Academic Door / 学术传送门。Hosted on GitHub Pages。</p>
  </footer>
</body>
</html>
"""


def render_week(issue: WeekIssue) -> str:
    rows = "\n".join(render_week_article(paper) for paper in issue.papers)
    intro = "".join(f"<p>{html.escape(line)}</p>" for line in issue.intro)
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(issue.title)}</title>
  <link rel="stylesheet" href="../assets/style.css">
</head>
<body>
  <header class="site-header compact">
    <div>
      <p class="eyebrow"><a href="../index.html">学术传送门 NBER 工作论文</a></p>
      <h1>{html.escape(issue.title)}</h1>
      <p class="lead">{issue.date}，共 {len(issue.papers)} 篇。</p>
    </div>
  </header>
  <main class="month-page">
    <section class="month-summary">{intro}</section>
    {rows}
  </main>
  <footer>
    <p>Maintained by Academic Door / 学术传送门。Hosted on GitHub Pages。</p>
  </footer>
</body>
</html>
"""


def write_json(output: Path, months: list[MonthIssue], built_at: str) -> None:
    data = {
        "built_at": built_at,
        "months": [
            {
                **{k: v for k, v in asdict(issue).items() if k != "papers"},
                "count": len(issue.papers),
            }
            for issue in months
        ],
        "papers": [asdict(paper) for issue in months for paper in issue.papers],
    }
    (output / "data" / "nber_papers.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def write_feeds(output: Path, weeks: list[WeekIssue], built_at: str) -> None:
    latest = list(reversed(weeks[-20:]))
    rss_items = []
    json_items = []
    for issue in latest:
        title = f"NBER Working Papers {issue.date} ({len(issue.papers)} papers)"
        url = f"https://example.com/weekly/{issue.date}.html"
        description = f"NBER Working Papers weekly archive for {issue.date}, {len(issue.papers)} papers."
        rss_items.append(
            f"""    <item>
      <title>{html.escape(title)}</title>
      <link>{html.escape(url)}</link>
      <guid>{html.escape(url)}</guid>
      <description>{html.escape(description)}</description>
    </item>"""
        )
        json_items.append(
            {
                "id": url,
                "url": f"weekly/{issue.date}.html",
                "title": title,
                "summary": description,
                "content_text": "\n".join(f"w{p.number} {p.title}" for p in issue.papers[:30]),
            }
        )

    rss = f"""<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>学术传送门 NBER 工作论文</title>
    <link>https://example.com/</link>
    <description>面向中文读者的 NBER Working Papers 非官方归档。</description>
    <lastBuildDate>{format_datetime(datetime.now().astimezone())}</lastBuildDate>
{chr(10).join(rss_items)}
  </channel>
</rss>
"""
    feed_json = {
        "version": "https://jsonfeed.org/version/1.1",
        "title": "学术传送门 NBER 工作论文",
        "home_page_url": "https://example.com/",
        "feed_url": "https://example.com/feed.json",
        "description": "面向中文读者的 NBER Working Papers 非官方归档。",
        "items": json_items,
        "generated_at": built_at,
    }
    (output / "feed.xml").write_text(rss, encoding="utf-8")
    (output / "feed.json").write_text(json.dumps(feed_json, ensure_ascii=False, indent=2), encoding="utf-8")


def write_weekly_json(output: Path, weeks: list[WeekIssue], built_at: str) -> None:
    weekly_dir = output / "data" / "weekly"
    weekly_dir.mkdir(parents=True, exist_ok=True)
    for old_file in weekly_dir.glob("*.json"):
        old_file.unlink()

    years = sorted({issue.year for issue in weeks})
    for year in years:
        year_issues = [issue for issue in weeks if issue.year == year]
        year_data = {
            "built_at": built_at,
            "year": year,
            "weeks": [
                {
                    **{k: v for k, v in asdict(issue).items() if k != "papers"},
                    "count": len(issue.papers),
                }
                for issue in year_issues
            ],
            "papers": [asdict(paper) for issue in year_issues for paper in issue.papers],
        }
        (weekly_dir / f"{year}.json").write_text(
            json.dumps(year_data, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    data = {
        "built_at": built_at,
        "latest": weeks[-1].date if weeks else "",
        "weeks": [
            {
                **{k: v for k, v in asdict(issue).items() if k != "papers"},
                "count": len(issue.papers),
                "data_file": f"weekly/{issue.year}.json",
            }
            for issue in weeks
        ],
        "total_papers": sum(len(issue.papers) for issue in weeks),
        "split_by": "year",
    }
    (output / "data" / "nber_weekly.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the NBER Working Papers CN static site.")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--weekly-source", type=Path, default=DEFAULT_WEEKLY_SOURCE)
    parser.add_argument("--metadata-source", type=Path, default=DEFAULT_METADATA_SOURCE)
    parser.add_argument("--translation-cache", type=Path, default=DEFAULT_TRANSLATION_CACHE)
    parser.add_argument("--weekly-mode", choices=["full-tsv", "markdown"], default="full-tsv")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    source = args.source.resolve()
    output = args.output.resolve()
    files = collect_ready_files(source)
    if not files:
        raise SystemExit(f"No NBER ready files found in {source}")

    months = [parse_month(path) for path in files]
    translation_cache = load_translation_cache(args.translation_cache.resolve())
    if args.weekly_mode == "full-tsv":
        weeks = build_full_weekly_from_metadata(args.metadata_source.resolve(), translation_cache)
    else:
        week_files = collect_weekly_files(args.weekly_source.resolve())
        weeks = [parse_week(path, translation_cache) for path in week_files]
    built_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    (output / "assets").mkdir(parents=True, exist_ok=True)
    (output / "data").mkdir(parents=True, exist_ok=True)
    (output / "archive").mkdir(parents=True, exist_ok=True)
    (output / "weekly").mkdir(parents=True, exist_ok=True)

    (output / "index.html").write_text(render_index(months, weeks, built_at), encoding="utf-8")
    write_json(output, months, built_at)
    write_weekly_json(output, weeks, built_at)
    write_feeds(output, weeks, built_at)
    for issue in months:
        (output / "archive" / f"{issue.key}.html").write_text(render_month(issue), encoding="utf-8")
    for issue in weeks:
        (output / "weekly" / f"{issue.date}.html").write_text(render_week(issue), encoding="utf-8")

    total = sum(len(issue.papers) for issue in months)
    weekly_total = sum(len(issue.papers) for issue in weeks)
    print(f"Built {len(months)} monthly pages ({total} papers) and {len(weeks)} weekly pages ({weekly_total} papers) into {output}")


if __name__ == "__main__":
    main()
