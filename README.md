# NBER Working Papers CN

一个面向中文读者的 NBER Working Papers 目录与摘要站点，由“学术传送门”本地工作流生成。

## 项目定位

- 仓库名里的 `cn` 表示中文整理版，不表示 NBER 官方项目。
- 周度页面按 NBER 官方 TSV 元数据全量生成，未按 Programs 或 JEL 筛选。
- 月度页面来自“学术传送门”公众号 ready 稿，包含中文目录与中文摘要。
- 本项目只发布论文目录、作者、摘要和 NBER 原文链接。
- 论文版权与原始元数据归 NBER 及原作者所有；本站仅用于学术交流、检索和导读。

## 网站设计

本项目参考了 `fyapeng/nber` 的核心思路：用 GitHub Pages 展示每周 NBER Working Papers，并把自动更新脚本放在公开仓库中。本站没有照搬它的 README 列表式页面，而是做成更适合公众号素材库的归档站：

- 首页顶部展示最新一周的全量 NBER 工作论文。
- 左侧提供月度中文归档和最近周报入口。
- 中间提供本地搜索，可按标题、作者、中文摘要和 NBER 编号检索。
- 月度页保留中文摘要，适合公众号选题和发布前检索。
- 周度页保留官方英文摘要，适合追踪最新更新。
- `feed.xml` 和 `feed.json` 用于后续接入 RSS 阅读器或自动化监控。

## 本地构建

在本项目目录运行：

```powershell
python .\scripts\build_site.py
```

生成结果位于 `docs/`，可直接作为 GitHub Pages 发布目录。

默认构建会读取：

- `sources/monthly_ready/*NBER*ready.md`
- 本地默认：`../../workflow/01_sources/journals/nber/*.tsv`
- GitHub Actions 默认：`data/nber/*.tsv`

如果只想沿用旧的筛选版周报 Markdown，可以运行：

```powershell
python .\scripts\build_site.py --weekly-mode markdown
```

## GitHub Pages

推荐设置：

- Repository name: `nber-working-papers-cn`
- Visibility: `Private` first, switch to public after the workflow is stable
- Pages source: `Deploy from a branch`
- Branch: `main`
- Folder: `/docs`

## 自动更新

`.github/workflows/update-site.yml` 会在每周一 14:00 北京时间运行：

1. 下载 NBER TSV 元数据到 `data/nber/`
2. 用 `sources/monthly_ready/` 和 `data/nber/` 生成 `docs/`
3. 自动提交更新

也可以在 GitHub 的 Actions 页面手动点击 `Run workflow`。

注意：如果仓库保持 private，GitHub Pages 的可用性和访问权限取决于 GitHub 账号/组织套餐。最稳的发布方式是：先 private 调试 Actions，成熟后 public，再正式开启 Pages。

## 首次推送

如果使用 GitHub CLI：

```powershell
gh auth login -h github.com
gh repo create nber-working-papers-cn --private --source . --remote origin --push
```

如果仓库已在 GitHub 网页创建：

```powershell
git remote add origin https://github.com/<your-user>/nber-working-papers-cn.git
git branch -M main
git push -u origin main
```
