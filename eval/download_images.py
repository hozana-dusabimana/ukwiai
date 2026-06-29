"""Build an image evaluation set with no API keys (Bing image search via icrawler).

Classes
-------
  basketball     -> should be ALLOWED (true basketball grounds)
  volleyball     -> should be BLOCKED (wrong sport)
  non_court      -> should be BLOCKED (faces, food, docs, rooms, animals, cars)
  other_grounds  -> should be BLOCKED (football pitch, tennis court, track)

Usage: python download_images.py <per_keyword> <root_dir>
"""
import os
import sys
from icrawler.builtin import BingImageCrawler

JOBS = {
    "basketball": [
        "basketball court", "outdoor basketball court",
        "basketball court construction site", "basketball playground court",
    ],
    "volleyball": [
        "volleyball court", "outdoor volleyball court",
        "volleyball court ground", "beach volleyball court",
    ],
    "non_court": [
        "human face portrait", "plate of food meal", "office document paper",
        "living room interior", "dog animal", "parked car street",
    ],
    "other_grounds": [
        "football soccer pitch field", "tennis court outdoor",
        "athletics running track",
    ],
}


def main() -> None:
    per_keyword = int(sys.argv[1]) if len(sys.argv) > 1 else 250
    root = sys.argv[2] if len(sys.argv) > 2 else "data"
    for cls, keywords in JOBS.items():
        out = f"{root}/{cls}"
        os.makedirs(out, exist_ok=True)
        for kw in keywords:
            print(f"\n=== {cls} :: '{kw}' (max {per_keyword}) -> {out} ===", flush=True)
            crawler = BingImageCrawler(
                downloader_threads=4,
                storage={"root_dir": out},
            )
            crawler.crawl(
                keyword=kw,
                max_num=per_keyword,
                file_idx_offset="auto",   # append, don't overwrite across keywords
                min_size=(120, 120),
            )


if __name__ == "__main__":
    main()
