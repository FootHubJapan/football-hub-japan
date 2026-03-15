#!/usr/bin/env python3
"""Extract review-draft input JSON from match-detail API response-like JSON.

This script is a *connector* between existing match detail data structures and
`generate_match_review_draft.py`.

Input examples supported:
- {"success": true, "data": {...}}
- {"data": {...}}
- {...}  (already a match object)

Usage:
  python3 scripts/extract_review_input_from_match_details.py \
    --input scripts/sample_match_details_response.json \
    --output scripts/review_input.json
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, Optional


def _get(d: Dict[str, Any], *keys: str) -> Any:
    cur: Any = d
    for k in keys:
        if not isinstance(cur, dict) or k not in cur:
            return None
        cur = cur[k]
    return cur


def _text(v: Any, default: str = "") -> str:
    if v is None:
        return default
    return str(v)


def _extract_score(match: Dict[str, Any]) -> tuple[Optional[int], Optional[int]]:
    hs = match.get("homeScore")
    as_ = match.get("awayScore")

    # Sometimes score lives under fixture/score in other APIs
    if hs is None:
        hs = _get(match, "score", "home") or _get(match, "goals", "home")
    if as_ is None:
        as_ = _get(match, "score", "away") or _get(match, "goals", "away")

    try:
        hs_i = int(hs) if hs is not None else None
    except Exception:
        hs_i = None
    try:
        as_i = int(as_) if as_ is not None else None
    except Exception:
        as_i = None
    return hs_i, as_i


def _best_stat(stats: Dict[str, Any], *candidates: str) -> Any:
    for k in candidates:
        if k in stats and stats[k] is not None:
            return stats[k]
    return None


def _format_pair(v: Any) -> str:
    """Format either {home,away} dict, [home,away], or string."""
    if isinstance(v, dict):
        h = v.get("home")
        a = v.get("away")
        if h is not None or a is not None:
            return f"{h} - {a}".strip()
    if isinstance(v, (list, tuple)) and len(v) >= 2:
        return f"{v[0]} - {v[1]}"
    return _text(v)


def extract(match_like: Dict[str, Any]) -> Dict[str, Any]:
    match = match_like
    if "data" in match_like and isinstance(match_like.get("data"), dict):
        match = match_like["data"]

    out: Dict[str, Any] = {}

    out["matchId"] = _text(match.get("matchId") or match.get("fixtureId") or match.get("id"), "")
    out["league"] = _text(match.get("league") or match.get("competition") or match.get("leagueName"), "")
    out["homeTeam"] = _text(match.get("homeTeam") or _get(match, "teams", "home", "name"), "")
    out["awayTeam"] = _text(match.get("awayTeam") or _get(match, "teams", "away", "name"), "")
    out["date"] = _text(match.get("date") or match.get("kickoff") or match.get("kickoffUtc") or _get(match, "fixture", "date"), "")
    out["venue"] = _text(match.get("venue") or _get(match, "fixture", "venue", "name"), "")
    out["referee"] = _text(match.get("referee") or _get(match, "fixture", "referee"), "")

    hs, as_ = _extract_score(match)
    out["homeScore"] = hs
    out["awayScore"] = as_

    # Top stats extraction: prefer match.stats when present
    top_stats: Dict[str, Any] = {}
    stats = match.get("stats")
    if isinstance(stats, dict):
        poss = _best_stat(stats, "possession", "possessionPercent", "possession_percentage")
        shots = _best_stat(stats, "shots", "shotsTotal", "shots_total")
        sot = _best_stat(stats, "shotsOnTarget", "shots_on_target")
        xg = _best_stat(stats, "xg", "expectedGoals", "expected_goals")

        if poss is not None:
            top_stats["ポゼッション"] = _format_pair(poss)
        if shots is not None:
            top_stats["シュート"] = _format_pair(shots)
        if sot is not None:
            top_stats["枠内シュート"] = _format_pair(sot)
        if xg is not None:
            top_stats["xG"] = _format_pair(xg)

    # keep if any
    if top_stats:
        out["topStats"] = top_stats

    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()

    in_path = Path(args.input)
    data = json.loads(in_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit("input must be a JSON object")

    out = extract(data)
    Path(args.output).write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    main()
