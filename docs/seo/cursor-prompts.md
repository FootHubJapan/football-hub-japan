# Cursor 用プロンプト集（100万PV・SEOページ量産向け）

使い方：各ブロックを **Cursor のチャット / Composer** にそのまま貼り、`<...>` を置き換える。

---

## 共通：プロジェクト前提を毎回渡す

```
あなたは Football Hub Japan（Node/Express、public/*.html、index.js API）のコードベースで作業している。
目的：検索流入と回遊を増やすため、SSRまたは静的HTMLで「SEOに強いページ」を追加する。
制約：
- 既存のデザイン（ダークテーマ・Noto Sans JP）に合わせる
- 主要キーワードは title の先頭付近、h1 は1ページ1つ
- 構造化データは JSON-LD（application/ld+json）
- 内部リンクを本文または「関連」セクションに最低3件入れる
- パフォーマンス：不要な外部スクリプトを増やさない
```

---

## 1) 選手スタッツSEOページ（例: /player/:slug または /p/:id-:name）

```
以下の仕様で新規ページ（またはテンプレート）を作成して。

【URL想定】 /player/{slug}-stats または /p/{apiSportsPlayerId}-{slug}
【title】 {選手名}のスタッツ・所属・プロフィール｜Football Hub Japan
【meta description】 120〜155文字。{リーグ名}{シーズン}の出場・得点・アシスト等。データはAPI由来で遅延・誤差があり得る旨を1文。
【h1】 {選手名}のスタッツ（{シーズン}）
【セクション】 概要 / 今シーズンの数字（表） / 所属チーム・リーグ / 関連リンク
【JSON-LD】 Person（name, url, sameAs は任意）＋ WebPage。可能なら SportsTeam を mentions
【内部リンク】 同チームの他選手（2件）、同リーグランキング、試合分析への導線
【ファイル】 public/player-seo-template.html をベースにしてよい。データはプレースホルダ {{PLAYER_NAME}} 等。
```

---

## 2) 試合プレビュー・レビューSEO（例: /match/:fixtureId またはスラッグ）

```
試合1件のSEOページを追加して。

【URL想定】 /match/{homeSlug}-vs-{awaySlug}-{yyyy-mm-dd} または /m/{fixtureId}
【title】 {ホーム} vs {アウェイ} 試合データ・スタッツ｜{日付}｜Football Hub Japan
【meta description】 対戦カード・キックオフ・直近の傾向を2文以内。データは速報性の限界に言及。
【h1】 {ホーム} vs {アウェイ}（{大会名}）
【JSON-LD】 SportsEvent（homeTeam, awayTeam, startDate, location 可能なら）
【内部リンク】 両チームのチームページ、注目選手2名、大会対戦表（/competitions）、同日程の他試合
【CWV】 LCP 用にヒーロー画像は遅延読み込み、クリティカルCSSは最小限
```

---

## 3) リーグ・ランキングハブ（例: /ranking/:league/:metric）

```
リーグ別ランキングのハブページを1つ実装して。

【title】 {リーグ名} {指標名} ランキング（{シーズン}）｜Football Hub Japan
【h1】 {リーグ名} — {指標名} ランキング
【表】 上位20〜50件、列は順位・選手・チーム・数値・更新日
【JSON-LD】 ItemList または Dataset（name, description）
【内部リンク】 各選手SEOページ、試合分析、コラム（insights）、データベース
【canonical】 ページネーションがある場合は self または rel=next/prev をコメントで指示
```

---

## 4) 大会対戦表（CL/EL）ランディング補強

```
/competitions 周りのSEOを強化する。

【title】 UEFA CL/EL/UECL 対戦表・トーナメント｜シーズン選択｜Football Hub Japan
【追加】 冒頭に「シーズンは開始年（例:2025=2025-26）」の説明を短く。構造化データ FAQPage は任意。
【内部リンク】 ランキング、試合分析、主要チームの選手ページへのテキストリンク
```

---

## 5) コラム（insights）とデータページのクロスリンク

```
既存の insights-00x.html のフッター付近に、「データで見る」ブロックを追加する案を出して。
- ランキングへのリンク（指標名をアンカーテキストに）
- 該当リーグの試合スケジュール
- 選手名が出てくる場合は /database 検索クエリ付きリンク
実装は最小のHTML差分で。
```

---

## 6) コードレビュー用（SEO観点）

```
次のファイルを SEO の観点でレビューして。指摘は優先度付きで。
- title / description の一意性と文字数
- h1 の重複
- canonical と noindex の要否
- JSON-LD の妥当性
- 内部リンクの不足
- Core Web Vitals への影響（重いスクリプト、画像）
対象ファイル: <PATH>
```

---

## 7) 自動生成パイプライン（GitHub Actions 用の指示）

```
GitHub Actions の workflow を1本提案して。
トリガー：毎日 06:00 JST と手動 dispatch
手順：
1. Node で data/players.json または API から上位N件を取得
2. scripts/generate-seo-skeleton.js で public/seo-generated/ にHTMLを出力
3. 変更があればコミット（または artifact のみ）
4. 本番デプロイは Render のデプロイフックに任せるか、静的ファイルのみ rsync の案をコメント
secrets: API_FOOTBALL_KEY は GitHub Secrets に保存
```

---

## 8) SNS短文案（X）自動下書き

```
試合1件について、X向け投稿を3パターン（文字数280以内、日本語）。
必須：試合カード、サイトURL（BASE_URL）、ハッシュタグは大会名のみ1つまで。
禁止：断定的な勝敗予測、賭博誘導。
入力： home, away, date, competition, url
```

---

## 使い分けのコツ

- **新規テンプレ** → セクション 1〜3  
- **既存ページの改善** → 6  
- **運用自動化** → 7  
- **マーケ下書き** → 8  
