# Football Hub Japan ⚽️

日本最大級のサッカー分析プラットフォーム - AIを活用した最先端の選手統計、試合予想、ランキングシステム

## 🚀 デプロイ状況

✅ **GitHubリポジトリ**: https://github.com/FootHubJapan/football-hub-japan  
✅ **サーバー構造**: 完成  
✅ **データベース設計**: 完成  
✅ **API設計**: 完成  
⚠️ **環境変数設定**: 必要  
⚠️ **データベース構築**: 必要  

## 🔧 必要な設定手順

### 1. 環境変数の設定
```bash
# .env.example を .env にコピー
cp .env.example .env

# .env ファイルを編集して以下のAPIキーを設定:
```

### 2. 必要なAPIキー一覧

#### 🔴 必須 - サービス動作に必要
- **API_FOOTBALL_KEY**: [API-Football](https://www.api-football.com/) で取得
- **GEMINI_API_KEY**: [Google AI Studio](https://makersuite.google.com/app/apikey) で取得
- **FIREBASE_PROJECT_ID**: [Firebase Console](https://console.firebase.google.com/) で設定

#### 🟡 推奨 - フル機能利用
- **STRIPE_SECRET_KEY**: [Stripe Dashboard](https://dashboard.stripe.com/apikeys) で取得
- **FOOTBALL_DATA_ORG_KEY**: [Football-Data.org](https://www.football-data.org/client/register) で取得

#### 🟢 オプション - 追加機能
- **SENDGRID_API_KEY**: メール通知用

### 3. データベースセットアップ

#### PostgreSQL（推奨）
```bash
# PostgreSQL インストール
# macOS
brew install postgresql

# Ubuntu
sudo apt-get install postgresql

# データベース作成
createdb football_hub_japan
```

#### または Render.com PostgreSQL（簡単）
1. [Render.com](https://render.com) でPostgreSQLサービス作成
2. 接続情報を .env に設定

### 4. デプロイ方法

#### Render.com（推奨 - 無料枠あり）
1. [Render.com](https://render.com) でアカウント作成
2. GitHubリポジトリを接続
3. Web Service として設定:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Environment Variables で .env の内容を設定

#### Heroku
```bash
# Heroku CLI インストール後
heroku create football-hub-japan
heroku addons:create heroku-postgresql:mini
heroku addons:create heroku-redis:mini
git push heroku main
```

#### Docker
```bash
docker build -t football-hub-japan .
docker run -p 3000:3000 football-hub-japan
```

## 📊 機能一覧

### 🆓 無償機能
- ✅ 選手検索（基本）
- ✅ TOP10ランキング
- ✅ AI分析（5回/日）
- ✅ 基本試合予想
- ✅ 日本人選手フィルター

### 💎 プレミアム機能（¥780/月）
- ✅ 無制限AI分析
- ✅ 全選手データアクセス
- ✅ 詳細スコア予想
- ✅ xG・xA統計
- ✅ 広告なし

### 🏆 プロ機能（¥1,280/月）
- ✅ カスタムレポート
- ✅ 市場価値予測
- ✅ 過去データアクセス
- ✅ プロコミュニティ

## 🛠 技術スタック

- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL + Redis
- **AI**: Google Gemini 2.5 Flash
- **Auth**: Firebase Authentication
- **Payment**: Stripe
- **Deploy**: Render.com / Heroku

## 📱 API エンドポイント

```bash
# 選手検索
GET /api/players/search?q=三笘薫

# ランキング
GET /api/players/rankings/forward

# AI分析
POST /api/ai/analyze

# ライブマッチ
GET /api/matches/live

# ヘルスチェック
GET /health
```

## 🚀 開発開始手順

```bash
# 1. リポジトリクローン
git clone https://github.com/FootHubJapan/football-hub-japan.git
cd football-hub-japan

# 2. 依存関係インストール
npm install

# 3. 環境変数設定
cp .env.example .env
# .env を編集してAPIキーを設定

# 4. 開発サーバー起動
npm run dev

# 5. ブラウザでアクセス
open http://localhost:3000
```

## ⚡️ 即座にテスト可能

現在のサーバーはモックデータで動作するため、APIキー設定前でもテスト可能です：

```bash
npm start
# http://localhost:3000 でデモ画面表示
```

## 🔄 次回の開発優先順位

1. **環境変数設定** → 実データ取得
2. **データベース接続** → 永続化
3. **フロントエンド強化** → React/Vue.js
4. **リアルタイム更新** → WebSocket
5. **モバイル対応** → PWA

## 📞 サポート

質問がございましたら、GitHubのIssuesでお知らせください。

---

**🎯 現在の状況**: サーバー構造完成、APIキー設定で本格稼働開始可能