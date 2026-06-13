from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

from build_site import DEFAULT_METADATA_SOURCE, DEFAULT_TRANSLATION_CACHE, build_full_weekly_from_metadata, clean, load_translation_cache


MODEL = os.environ.get("DEEPSEEK_MODEL") or os.environ.get("LLM_MODEL") or "deepseek-chat"
BASE_URL = (os.environ.get("DEEPSEEK_BASE_URL") or os.environ.get("LLM_BASE_URL") or "https://api.deepseek.com").rstrip("/")
API_URL = BASE_URL if BASE_URL.endswith("/chat/completions") else f"{BASE_URL}/chat/completions"


def api_key() -> str | None:
    return os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("DeepSeek_API_KEY") or os.environ.get("LLM_API_KEY")


def parse_json_array(text: str) -> list[dict]:
    start = text.find("[")
    end = text.rfind("]")
    if start < 0 or end < start:
        raise ValueError("No JSON array in model response")
    return json.loads(text[start : end + 1])


def normalize_item(item: dict) -> dict[str, str]:
    number = clean(item.get("number", ""))
    zh_title = clean(item.get("zh_title") or item.get("title_zh") or item.get("title") or "")
    zh_abstract = clean(item.get("zh_abstract") or item.get("abstract_zh") or item.get("abstract") or "")
    if not number or not zh_title or not zh_abstract:
        raise KeyError(f"Bad translation item keys: {sorted(item.keys())}")
    return {"number": number, "zh_title": zh_title, "zh_abstract": zh_abstract}


def call_deepseek(batch: list[dict], retries: int = 3) -> list[dict[str, str]]:
    key = api_key()
    if not key:
        raise RuntimeError("Missing DEEPSEEK_API_KEY")

    messages = [
        {
            "role": "system",
            "content": (
                "You are an economics working-paper digest editor. Translate each NBER paper title and abstract into Chinese. "
                "Keep technical terms precise and suitable for Chinese academic readers. "
                "Return only a valid JSON array. Each object must contain exactly: number, zh_title, zh_abstract."
            ),
        },
        {"role": "user", "content": json.dumps(batch, ensure_ascii=False)},
    ]
    payload = json.dumps({"model": MODEL, "messages": messages, "temperature": 0.1}, ensure_ascii=False).encode("utf-8")
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    url = API_URL
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=150) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"]
            return [normalize_item(item) for item in parse_json_array(content)]
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code in {301, 302, 303, 307, 308}:
                location = exc.headers.get("Location")
                if location:
                    url = urllib.parse.urljoin(url, location)
                    time.sleep(2 * attempt)
                    continue
            time.sleep(2 * attempt)
        except (urllib.error.URLError, TimeoutError, KeyError, json.JSONDecodeError, ValueError) as exc:
            last_error = exc
            time.sleep(2 * attempt)
    raise RuntimeError(f"DeepSeek request failed: {last_error}")


def translate_missing(papers: list, cache: dict[str, dict[str, str]], limit: int | None, cache_path: Path) -> int:
    missing = [
        paper
        for paper in papers
        if not cache.get(paper.number, {}).get("zh_title") or not cache.get(paper.number, {}).get("zh_abstract")
    ]
    if limit:
        missing = missing[:limit]
    if not missing:
        return 0

    if not api_key():
        print(f"DEEPSEEK_API_KEY is not set; skipped {len(missing)} missing translations.")
        return 0

    translated = 0
    batch_size = 6
    for start in range(0, len(missing), batch_size):
        batch_papers = missing[start : start + batch_size]
        payload = [
            {
                "number": paper.number,
                "title": paper.title,
                "abstract": paper.abstract or "No abstract available.",
            }
            for paper in batch_papers
        ]
        items = call_deepseek(payload)
        for item in items:
            cache[item["number"]] = {"zh_title": item["zh_title"], "zh_abstract": item["zh_abstract"]}
            translated += 1
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"translated {translated}/{len(missing)}")
    return translated


def main() -> None:
    parser = argparse.ArgumentParser(description="Translate the latest NBER weekly issue with DeepSeek.")
    parser.add_argument("--metadata-source", type=Path, default=DEFAULT_METADATA_SOURCE)
    parser.add_argument("--cache", type=Path, default=DEFAULT_TRANSLATION_CACHE)
    parser.add_argument("--week", help="Specific week date, e.g. 2026-06-15. Defaults to the latest week.")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    cache = load_translation_cache(args.cache)
    weeks = build_full_weekly_from_metadata(args.metadata_source.resolve(), cache)
    issue = next((week for week in weeks if week.date == args.week), weeks[-1])
    translated = translate_missing(issue.papers, cache, args.limit, args.cache)
    args.cache.parent.mkdir(parents=True, exist_ok=True)
    args.cache.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"week={issue.date} papers={len(issue.papers)} translated={translated} cache={args.cache}")


if __name__ == "__main__":
    main()
