#!/usr/bin/env python3
"""Generate sitemap index + segmented sitemaps for Football Hub Japan.

- Outputs XML files into ./public/
- Keeps categories segmented: players / teams / matches / articles
- Supports splitting large URL sets into multiple files per category

Usage:
  python3 scripts/generate_sitemaps.py

Notes:
- Base URL is set to the production origin by default.
- Player URLs are generated from football_data.db (players.api_id).
"""

from __future__ import annotations

import datetime as dt
import os
import sqlite3
from pathlib import Path
from typing import Iterable, List

BASE_URL = os.environ.get("SITE_BASE_URL", "https://football-hub-japan-ubzb.onrender.com").rstrip("/")
MAX_URLS_PER_SITEMAP = int(os.environ.get("SITEMAP_MAX_URLS", "45000"))

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "public"
DB_PATH = ROOT / "football_data.db"


def xml_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def chunk(items: List[str], size: int) -> List[List[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def write_urlset(path: Path, urls: List[str], lastmod: str) -> None:
    url_lines = []
    for u in urls:
        url_lines.append(
            "  <url>\n"
            f"    <loc>{xml_escape(u)}</loc>\n"
            f"    <lastmod>{lastmod}</lastmod>\n"
            "  </url>"
        )

    body = "\n".join(url_lines)
    xml = (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n"
        f"{body}\n"
        "</urlset>\n"
    )
    path.write_text(xml, encoding="utf-8")


def write_sitemapindex(path: Path, sitemap_urls: List[str], lastmod: str) -> None:
    sm_lines = []
    for u in sitemap_urls:
        sm_lines.append(
            "  <sitemap>\n"
            f"    <loc>{xml_escape(u)}</loc>\n"
            f"    <lastmod>{lastmod}</lastmod>\n"
            "  </sitemap>"
        )

    body = "\n".join(sm_lines)
    xml = (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        "<sitemapindex xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n"
        f"{body}\n"
        "</sitemapindex>\n"
    )
    path.write_text(xml, encoding="utf-8")


def get_player_urls() -> List[str]:
    if not DB_PATH.exists():
        return []

    con = sqlite3.connect(str(DB_PATH))
    cur = con.cursor()
    # Prefer api_id when present; fall back to local numeric id otherwise.
    cur.execute("SELECT DISTINCT COALESCE(NULLIF(TRIM(api_id), ''), CAST(id AS TEXT)) AS pid FROM players")
    pids = sorted({str(r[0]).strip() for r in cur.fetchall() if r and str(r[0]).strip()})
    con.close()

    # Use query param style for compatibility with static hosting
    return [f"{BASE_URL}/player-detail.html?id={xml_escape(pid)}" for pid in pids]


def get_team_urls() -> List[str]:
    # Team detail URLs are not yet reliably enumerable from DB (teams table may be empty).
    # Keep segmented sitemap present with stable listing pages.
    return [
        f"{BASE_URL}/database-new.html",
        f"{BASE_URL}/ranking.html",
    ]


def get_match_urls() -> List[str]:
    # Match detail enumeration not implemented yet. Keep stable entry points.
    return [
        f"{BASE_URL}/schedule.html",
        f"{BASE_URL}/match-detail.html",
    ]


def get_article_urls() -> List[str]:
    # Static articles currently live as HTML files.
    candidates = [
        "insights.html",
        "insights-001.html",
        "insights-002.html",
        "insights-003.html",
    ]
    return [f"{BASE_URL}/{c}" for c in candidates]


def generate_segment(prefix: str, urls: List[str], lastmod: str) -> List[str]:
    """Write one or more sitemap files for a category.

    Returns list of absolute URLs for each generated sitemap file.
    """
    if not urls:
        # still write an empty urlset so the segment exists
        out = PUBLIC_DIR / f"sitemap_{prefix}.xml"
        write_urlset(out, [], lastmod)
        return [f"{BASE_URL}/sitemap_{prefix}.xml"]

    parts = chunk(urls, MAX_URLS_PER_SITEMAP)
    out_urls: List[str] = []

    if len(parts) == 1:
        out = PUBLIC_DIR / f"sitemap_{prefix}.xml"
        write_urlset(out, parts[0], lastmod)
        out_urls.append(f"{BASE_URL}/sitemap_{prefix}.xml")
    else:
        for idx, part in enumerate(parts, start=1):
            out = PUBLIC_DIR / f"sitemap_{prefix}_{idx}.xml"
            write_urlset(out, part, lastmod)
            out_urls.append(f"{BASE_URL}/sitemap_{prefix}_{idx}.xml")

    return out_urls


def main() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    lastmod = dt.datetime.now(dt.timezone.utc).date().isoformat()

    # Segments
    players = get_player_urls()
    teams = get_team_urls()
    matches = get_match_urls()
    articles = get_article_urls()

    sitemap_urls: List[str] = []
    sitemap_urls += generate_segment("players", players, lastmod)
    sitemap_urls += generate_segment("teams", teams, lastmod)
    sitemap_urls += generate_segment("matches", matches, lastmod)
    sitemap_urls += generate_segment("articles", articles, lastmod)

    # Index
    index_path = PUBLIC_DIR / "sitemap_index.xml"
    write_sitemapindex(index_path, sitemap_urls, lastmod)

    print("Generated:")
    print(f"- {index_path}")
    for u in sitemap_urls:
        print(f"- {u}")


if __name__ == "__main__":
    main()
