# Discover #1 — 試合後レビュー自動下書きパイプライン

## 目的
- 試合終了後に、検索/Discover向けの記事下書きを素早く作る
- 人間は最終レビューと公開判断のみ

## 生成物
- 出力先: `public/drafts/`
- ファイル例: `public/drafts/review-<matchId>-<home>-<away>-<date>.html`
- 注意: 下書きは `noindex,nofollow` を付与（公開前提ではないため）

## 使い方
1) 入力JSONを用意（例）
- `scripts/sample_match.json`

2) 下書きHTMLを生成
```bash
python3 scripts/generate_match_review_draft.py --input scripts/sample_match.json
```

3) ローカルで表示確認
```bash
cd public
python3 -m http.server 5182
# http://127.0.0.1:5182/drafts/<generated>.html
```

## 入力JSONの最低要件
- `homeTeam` (string)
- `awayTeam` (string)
- `homeScore` (number)
- `awayScore` (number)
- `date` (string; ISO or "YYYY年M月D日" など)
- `league` (string)

任意:
- `matchId` / `fixtureId` / `id`
- `venue`
- `referee`
- `topStats` (object) — 主要スタッツのキー/値

## 不足情報（現状）
- 既存の試合データ取得（`/api/match/:id/details` 等）から、記事本文に必要な「論点の根拠」や「主要スタッツの網羅」を自動で埋めるには情報が不足する可能性あり。
  - 現状は `topStats` を入力として渡す想定。
  - 次フェーズで `match-detail.html` が表示に使うAPIレスポンス形式に合わせて、抽出・整形ルールを拡張する余地あり。
