from __future__ import annotations

import argparse
import time
import urllib.error
import urllib.request
from pathlib import Path


BASE_URL = "https://data.nber.org/nber_paper_chapter_metadata/tsv"
FILES = ("ref.tsv", "abs.tsv", "prog.tsv", "jel.tsv")


def download(url: str, output: Path, retries: int = 5) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    tmp = output.with_suffix(output.suffix + ".tmp")
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "academic-door-nber/1.0"})
            with urllib.request.urlopen(req, timeout=90) as resp:
                tmp.write_bytes(resp.read())
            tmp.replace(output)
            print(f"downloaded {output.name} ({output.stat().st_size} bytes)")
            return
        except (OSError, urllib.error.URLError, urllib.error.HTTPError) as exc:
            last_error = exc
            print(f"retry {attempt}/{retries} failed for {url}: {exc}")
            time.sleep(min(30, 2**attempt))
    raise RuntimeError(f"failed to download {url}: {last_error}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Download NBER Working Papers TSV metadata.")
    parser.add_argument("--output", type=Path, default=Path("data/nber"))
    parser.add_argument("--retries", type=int, default=5)
    args = parser.parse_args()

    for name in FILES:
        download(f"{BASE_URL}/{name}", args.output / name, args.retries)


if __name__ == "__main__":
    main()
