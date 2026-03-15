#!/usr/bin/env python3
"""Generate a post-match review *draft* article (HTML) from match JSON.

Goal: create a reusable, low-maintenance pipeline for Discover / SEO content supply.

- Input: match JSON file (minimum fields: homeTeam, awayTeam, homeScore, awayScore, date, league)
- Output: HTML draft saved under ./public/drafts/

Usage:
  python3 scripts/generate_match_review_draft.py --input scripts/sample_match.json

Optional:
  SITE_BASE_URL=https://football-hub-japan-ubzb.onrender.com \
    python3 scripts/generate_match_review_draft.py --input <path>
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional

BASE_URL = os.environ.get("SITE_BASE_URL", "https://football-hub-japan-ubzb.onrender.com").rstrip("/")

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "public"
DRAFTS_DIR = PUBLIC_DIR / "drafts"


def _safe_slug(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-z0-9\-]+", "", s)
    s = re.sub(r"\-+", "-", s).strip("-")
    return s or "draft"


def _to_iso_date(s: Optional[str]) -> str:
    if not s:
        return dt.datetime.now(dt.timezone.utc).date().isoformat()

    # Try ISO / RFC3339
    try:
        d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
        return d.date().isoformat()
    except Exception:
        pass

    # Try "YYYY年M月D日" (optionally with time)
    m = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", s)
    if m:
        y, mo, da = m.group(1), m.group(2).zfill(2), m.group(3).zfill(2)
        return f"{y}-{mo}-{da}"

    return dt.datetime.now(dt.timezone.utc).date().isoformat()


def _text(s: Any, default: str = "") -> str:
    if s is None:
        return default
    return str(s)


def generate(match: Dict[str, Any]) -> Path:
    home = _text(match.get("homeTeam"), "ホームチーム")
    away = _text(match.get("awayTeam"), "アウェイチーム")
    league = _text(match.get("league"), "大会未定")
    venue = _text(match.get("venue"), "会場未定")
    referee = _text(match.get("referee"), "審判未定")

    hs = match.get("homeScore")
    as_ = match.get("awayScore")
    score = f"{hs}-{as_}" if hs is not None and as_ is not None else "-"

    date_raw = _text(match.get("date"), "")
    date_iso = _to_iso_date(date_raw)

    # Draft headline designed for search intent
    headline = f"{home} vs {away} レビュー｜{league}｜結果・スタッツまとめ（下書き）"
    description = (
        f"{home} vs {away}（{league}）の試合後レビュー下書き。"
        f"スコア{score}、主要スタッツ、論点3つを事実ベースで整理します。"
    )

    # Basic stats (optional)
    top_stats = match.get("topStats") or {}
    # allow both dict and list
    stats_lines = []
    if isinstance(top_stats, dict) and top_stats:
        for k, v in list(top_stats.items())[:8]:
            stats_lines.append(f"<li><strong>{k}</strong>: {v}</li>")

    if not stats_lines:
        stats_lines = [
            "<li><strong>スタッツ</strong>: データ取得元により不足する場合があります（下書き）</li>"
        ]

    # 논点3つ: placeholders for human
    talking_points = [
        "どの局面（保持/非保持/トランジション）で主導権があったか",
        "決定機の質（xGなど）がスコアと整合しているか",
        "交代/戦術変更が試合の流れに与えた影響",
    ]

    # Internal links (stable pages)
    links = [
        ("試合詳細", f"{BASE_URL}/match-detail.html"),
        ("ランキング", f"{BASE_URL}/ranking.html"),
        ("データベース", f"{BASE_URL}/database-new.html"),
        ("分析コラム一覧", f"{BASE_URL}/insights.html"),
    ]

    json_ld = {
        "@context": "https://schema.org",
        "@type": "Article",
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": f"{BASE_URL}/drafts/"  # draft location; will be changed on publish
        },
        "headline": headline,
        "description": description,
        "author": {
            "@type": "Organization",
            "name": "Football Hub Japan",
            "url": f"{BASE_URL}/",
        },
        "publisher": {
            "@type": "Organization",
            "name": "Football Hub Japan",
            "url": f"{BASE_URL}/",
        },
        "datePublished": date_iso,
    }

    html = f"""<!doctype html>
<html lang=\"ja\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
  <meta name=\"robots\" content=\"noindex,nofollow\" />
  <meta name=\"description\" content=\"{_escape_attr(description)}\" />
  <title>{_escape_text(headline)} - Football Hub Japan</title>

  <script type=\"application/ld+json\">{json.dumps(json_ld, ensure_ascii=False)}</script>

  <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\" />
  <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin />
  <link href=\"https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700&display=swap\" rel=\"stylesheet\" />
  <style>
    :root {{
      --bg: #0d1117;
      --fg: #f0f6fc;
      --card: #161b22;
      --muted: #8b949e;
      --border: #30363d;
      --primary: #22c55e;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin:0; font-family:'Noto Sans JP', system-ui, -apple-system, sans-serif; background:var(--bg); color:var(--fg); line-height:1.7; }}
    .wrap {{ max-width: 920px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }}
    .badge {{ display:inline-block; padding: 0.25rem 0.6rem; border-radius: 999px; border:1px solid rgba(34,197,94,0.35); color: var(--primary); background: rgba(34,197,94,0.08); font-weight:700; font-size: 0.8rem; }}
    h1 {{ font-size: 2rem; margin: 0.75rem 0 0.5rem; letter-spacing:-0.02em; }}
    .meta {{ color: var(--muted); font-size: 0.95rem; margin-bottom: 1.5rem; }}
    .card {{ background: var(--card); border:1px solid var(--border); border-radius: 16px; padding: 1.25rem; margin: 1rem 0; }}
    .grid {{ display:grid; grid-template-columns: 1fr; gap: 1rem; }}
    ul {{ margin: 0.5rem 0 0; }}
    a {{ color: var(--primary); text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
    .links {{ display:flex; flex-wrap:wrap; gap:0.5rem; margin-top: 0.5rem; }}
    .pill {{ display:inline-flex; align-items:center; padding:0.4rem 0.65rem; border-radius: 999px; border:1px solid var(--border); color: var(--muted); background: rgba(33,38,45,0.6); }}
    .pill:hover {{ color: var(--fg); border-color: rgba(34,197,94,0.35); }}
  </style>
</head>
<body>
  <main class=\"wrap\">
    <span class=\"badge\">下書き（自動生成）</span>
    <h1>{_escape_text(headline)}</h1>
    <div class=\"meta\">対戦: { _escape_text(home) } vs { _escape_text(away) } / 大会: { _escape_text(league) } / 日付: { _escape_text(date_iso) } / 会場: { _escape_text(venue) } / スコア: { _escape_text(score) }</div>

    <section class=\"card\">
      <h2>リード文（下書き）</h2>
      <p>{_escape_text(description)}</p>
      <p class=\"meta\">※ 数値と事実中心の下書きです。断定は避け、最終公開前に人間が加筆・確認してください。</p>
    </section>

    <section class=\"card\">
      <h2>主要スタッツ（下書き）</h2>
      <ul>
        {''.join(stats_lines)}
      </ul>
    </section>

    <section class=\"card\">
      <h2>試合の論点（下書き・3つ）</h2>
      <ol>
        {''.join([f'<li>{_escape_text(t)}</li>' for t in talking_points])}
      </ol>
    </section>

    <section class=\"card\">
      <h2>関連リンク</h2>
      <div class=\"links\">
        {''.join([f'<a class="pill" href="{_escape_attr(u)}">{_escape_text(t)}</a>' for t,u in links])}
      </div>
    </section>
  </main>
</body>
</html>
"""

    DRAFTS_DIR.mkdir(parents=True, exist_ok=True)

    match_id = _text(match.get("matchId") or match.get("fixtureId") or match.get("id"), "")
    name_slug = _safe_slug(f"{home}-{away}-{date_iso}")
    file_name = f"review-{match_id + '-' if match_id else ''}{name_slug}.html"

    out_path = DRAFTS_DIR / file_name
    out_path.write_text(html, encoding="utf-8")
    return out_path


def _escape_text(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _escape_attr(s: str) -> str:
    return _escape_text(s).replace('"', "&quot;")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="Path to match JSON")
    args = ap.parse_args()

    in_path = (ROOT / args.input).resolve() if not Path(args.input).is_absolute() else Path(args.input)
    data = json.loads(in_path.read_text(encoding="utf-8"))

    # Accept either {match: {...}} or plain {...}
    match = data.get("match") if isinstance(data, dict) and "match" in data else data
    if not isinstance(match, dict):
        raise SystemExit("Invalid input JSON")

    out = generate(match)
    print(str(out))


if __name__ == "__main__":
    main()
