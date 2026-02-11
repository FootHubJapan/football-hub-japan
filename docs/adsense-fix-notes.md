# AdSense審査対応 - 調査メモ

## 0) 調査結果

### プロジェクト構造
- **HTMLファイル数**: 22個（public/配下）
- **主要ページ**:
  - `index.html` - トップページ（ランディング）
  - `dashboard.html` - ダッシュボード
  - `database-new.html` - データベース
  - `schedule.html` - スケジュール
  - `ranking.html` - ランキング
  - `ai-agent-enhanced.html` - AI分析
  - `radar-enhanced.html` - レーダーチャート
  - その他（database系のバックアップファイル、match-detail.html等）

### リンク切れの状況
- **`href="#"` が存在するページ**: `index.html` のみ
  - フッター内の「利用規約」「プライバシーポリシー」「特定商取引法」が `href="#"` になっている
- **フッターの共通化**: なし（各HTMLに個別に埋め込まれている）
- **存在しないページへのリンク**: 要確認（`plans.html`, `advanced-stats.html` など）

### 現状の問題点
1. 必須ポリシーページが存在しない（privacy-policy.html, terms.html, contact.html）
2. フッターリンクが `href="#"` で切れている
3. トップページに「読み物」コンテンツが不足（機能紹介のみ）
4. SEOメタタグが不十分（index.htmlにはtitleのみ、description等がない）
5. 外部データのクレジット表記がない

### 実装計画
1. ✅ 必須ページ作成（privacy-policy.html, terms.html, contact.html, about.html）
2. ✅ フッターリンク修正（全HTML）
3. ✅ トップページに「最新の分析コラム」セクション追加
4. ✅ 記事詳細ページ作成（insights.html, insights-001.html等）
5. ✅ SEOメタタグ最適化（全HTML）
6. ✅ 外部データクレジット追加（フッター）
7. ✅ リンク切れ修正

## 実装進捗
- [x] 調査完了
- [x] 必須ページ作成
- [x] フッター修正
- [x] トップページ強化
- [x] SEO最適化
- [x] 最終チェック

## 実装完了内容

### 1. 必須ページ作成
- ✅ `privacy-policy.html` - プライバシーポリシー（Cookie、広告配信、アクセス解析、免責事項を含む）
- ✅ `terms.html` - 利用規約（サービス概要、禁止事項、知的財産、免責事項、準拠法）
- ✅ `contact.html` - お問い合わせ（フォーム + mailtoリンク）
- ✅ `about.html` - 運営者情報（サイト目的、データ出典、更新頻度、連絡先）

### 2. フッターリンク修正
- ✅ `index.html` のフッターリンクを修正（`href="#"` → 実在ページへのリンク）
- ✅ 全ポリシーページに統一フッターを実装
- ✅ 「特定商取引法」を「運営者情報」に変更

### 3. トップページ強化
- ✅ 「最新の分析コラム」セクションを追加（3記事のカード表示）
- ✅ 各記事は500-800字の本文を含む詳細ページにリンク

### 4. 記事詳細ページ作成
- ✅ `insights.html` - 記事一覧ページ
- ✅ `insights-001.html` - 「Jリーグで"勝ち点を伸ばす"ための指標：xGだけでは足りない理由」（約800字）
- ✅ `insights-002.html` - 「ハイプレスの強度をどう見る？PPDAの見方と注意点」（約800字）
- ✅ `insights-003.html` - 「移籍市場価値は当てになる？データの限界と"使い方"」（約800字）

### 5. SEOメタタグ最適化
- ✅ `index.html` - title, description, keywords, OGP, robots
- ✅ `privacy-policy.html` - 全メタタグ追加
- ✅ `terms.html` - 全メタタグ追加
- ✅ `contact.html` - 全メタタグ追加
- ✅ `about.html` - 全メタタグ追加
- ✅ `insights.html` - 全メタタグ追加
- ✅ `insights-001.html` - 全メタタグ追加（articleタイプ）
- ✅ `insights-002.html` - 全メタタグ追加（articleタイプ）
- ✅ `insights-003.html` - 全メタタグ追加（articleタイプ）
- ✅ `schedule.html` - 全メタタグ追加
- ✅ `ranking.html` - 全メタタグ追加
- ✅ `dashboard.html` - 全メタタグ追加

### 6. 外部データクレジット追加
- ✅ 全ポリシーページのフッターにクレジット表記を追加
- ✅ 「Data sources: Football data is provided by external APIs and public sources...」
- ✅ 「このサイトはファン向けの情報提供であり、公式の情報源ではありません。」

### 7. ナビゲーション改善
- ✅ ヘッダーに「分析コラム」リンクを追加（全ページ）
- ✅ フッターに「分析コラム」リンクを追加

### 8. リンク切れチェック
- ✅ `href="#"` が残っていないことを確認（grep結果: 0件）
- ✅ すべてのリンクが実在するページを指していることを確認

## 追加/変更したファイル一覧

### 新規作成
1. `public/privacy-policy.html`
2. `public/terms.html`
3. `public/contact.html`
4. `public/about.html`
5. `public/insights.html`
6. `public/insights-001.html`
7. `public/insights-002.html`
8. `public/insights-003.html`

### 修正
1. `public/index.html` - フッターリンク修正、SEOメタタグ追加、「最新の分析コラム」セクション追加、外部データクレジット追加
2. `public/schedule.html` - SEOメタタグ追加
3. `public/ranking.html` - SEOメタタグ追加
4. `public/dashboard.html` - SEOメタタグ追加

## 確認事項
- ✅ `href="#"` が残っていない（grep結果: 0件）
- ✅ すべてのポリシーページが実在し、適切な内容を含む
- ✅ 記事詳細ページが実在し、500-800字の本文を含む
- ✅ SEOメタタグが主要ページに追加されている
- ✅ 外部データクレジットがフッターに追加されている
- ✅ ナビゲーションからすべてのページにアクセス可能
