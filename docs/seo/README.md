# Football Hub Japan — 100万PV向け SEO・自動化パッケージ

このフォルダには次の3点がまとまっています。

| ドキュメント | 内容 |
|-------------|------|
| [cursor-prompts.md](./cursor-prompts.md) | Cursor で使う **プロンプト集**（ページ種別・レビュー・内部リンク） |
| [automation-spec.md](./automation-spec.md) | **設計図**：URL規則・メタ・構造化データ・サイトマップ・更新トリガー |
| ルートの `scripts/generate-seo-skeleton.js` | **最小スクリプト**：HTML骨格＋manifest 生成（`npm run seo:generate`） |

## 前提（戦略の要約）

- **100万PV/月** ≒ 約 **3.3万PV/日** → 単一機能ではなく **入口の数 × 回遊 × 継続**。
- FHJ の勝ち筋：**データ × SEOページ量 × 自動更新（cron/Actions）× 内部リンク**。

## すぐやる順番（推奨）

1. `automation-spec.md` の **URL規則と禁止事項** を読む  
2. `cursor-prompts.md` を Cursor に貼り、**1ページ種** からテンプレ実装  
3. `npm run seo:generate` でサンプルHTMLを確認 → 本番は DB/API 連携に差し替え  
4. `sitemap.xml` 生成を cron または GitHub Actions に載せる（仕様は automation-spec 参照）

### npm

```bash
npm run seo:generate
# 別シード:
node scripts/generate-seo-skeleton.js --seed path/to/seed.json
```

GitHub Actions のサンプル: [github-actions-sample.yml](./github-actions-sample.yml)

## メンテ

- 生成物の大量コミットは避け、`public/seo-generated/` は `.gitignore` 推奨（サンプルだけコミット可）。
