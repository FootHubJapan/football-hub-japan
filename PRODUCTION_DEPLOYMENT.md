# 🚀 Football Hub Japan - 本番環境デプロイ完全ガイド

## 📋 実装済み機能

### 🗄️ データベース機能
- ✅ 日本語・英語対応の選手検索
- ✅ リアルタイム統計データ
- ✅ チーム・リーグ情報管理
- ✅ API-Football + Football-Data.org 統合
- ✅ 詳細選手プロフィール表示

### 📈 レーダーチャート機能
- ✅ 6項目のカスタム比較
- ✅ Chart.js によるインタラクティブチャート
- ✅ 統計データの可視化
- ✅ 選手比較レポート生成
- ✅ 日本語選手名の自動変換

### 🤖 AIエージェント機能
- ✅ Google Gemini 1.5 Flash 統合
- ✅ 選手比較・予測分析
- ✅ 戦術分析
- ✅ ファンタジーリーグアドバイス
- ✅ リアルタイムチャットボット

## 🎯 デプロイ方法

### 方法1: Render.com (推奨)

#### 1. Render.comアカウント作成
```bash
# Render.com にアクセス
https://render.com
```

#### 2. リポジトリ連携
1. "New +" → "Web Service" を選択
2. GitHubリポジトリを連携
3. ブランチ: `main`

#### 3. デプロイ設定
```
Name: football-hub-japan
Environment: Node
Build Command: npm install
Start Command: npm start
```

#### 4. 環境変数設定
```bash
# 必須API Keys
API_FOOTBALL_KEY=53cfd1d0230dfe92a2d99f81ca0fab88
GEMINI_API_KEY=AIzaSyCD1q757C9d3wNLPf0TLOi8MnFCu1jkXjA
FOOTBALL_DATA_API_KEY=c578337e9eb343d8af3411ab3a2a71a9

# Firebase設定
FIREBASE_PROJECT_ID=football-hub-japan
FIREBASE_API_KEY=AIzaSyBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
FIREBASE_AUTH_DOMAIN=football-hub-japan.firebaseapp.com
FIREBASE_STORAGE_BUCKET=football-hub-japan.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789012
FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890

# 本番環境設定
NODE_ENV=production
PORT=3000
JWT_SECRET=football_hub_japan_super_secret_key_2024

# レート制限設定
FOOTBALL_DATA_RATE_LIMIT=10
API_FOOTBALL_RATE_LIMIT=30
```

### 方法2: Docker

#### 1. 環境変数ファイル作成
```bash
cp env.example .env
# .env ファイルを編集してAPIキーを設定
```

#### 2. Docker Compose でデプロイ
```bash
# サービス起動
docker-compose up -d

# ログ確認
docker-compose logs -f football-hub-japan
```

#### 3. 単一コンテナデプロイ
```bash
# イメージビルド
docker build -t football-hub-japan .

# コンテナ実行
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e API_FOOTBALL_KEY=your-key \
  -e FOOTBALL_DATA_API_KEY=your-key \
  -e GEMINI_API_KEY=your-key \
  -e FIREBASE_PROJECT_ID=your-project-id \
  football-hub-japan
```

### 方法3: ローカル本番環境

#### 1. 依存関係インストール
```bash
npm ci --only=production
```

#### 2. 環境変数設定
```bash
export NODE_ENV=production
export API_FOOTBALL_KEY=your-key
export FOOTBALL_DATA_API_KEY=your-key
export GEMINI_API_KEY=your-key
export FIREBASE_PROJECT_ID=your-project-id
```

#### 3. アプリケーション起動
```bash
npm start
```

## 🧪 動作確認

### 1. ヘルスチェック
```bash
curl https://your-app-url.onrender.com/health
```

### 2. 機能確認
```bash
# データベース機能
curl "https://your-app-url.onrender.com/database"

# レーダーチャート機能
curl "https://your-app-url.onrender.com/radar"

# AIエージェント機能
curl "https://your-app-url.onrender.com/ai-agent"

# API動作確認
curl "https://your-app-url.onrender.com/api/search/players?query=久保建英"
```

### 3. 自動テスト実行
```bash
# 本番環境テスト
npm test

# ローカル環境テスト
npm run test:local
```

## 📊 パフォーマンス最適化

### 1. キャッシュ戦略
- **API レスポンス**: 30分間キャッシュ
- **静的ファイル**: 1年間キャッシュ
- **データベース**: 15分間キャッシュ

### 2. レート制限
- **API-Football**: 30 requests/minute
- **Football-Data.org**: 10 requests/minute
- **自動リトライ**: 指数バックオフ

### 3. 並列処理
- **複数API**: 同時データ取得
- **非同期処理**: Promise.all による最適化
- **エラーハンドリング**: 包括的なフォールバック

## 🔧 トラブルシューティング

### よくある問題

#### 1. ビルドエラー
```bash
# 依存関係確認
npm audit
npm ci --only=production
```

#### 2. 環境変数エラー
```bash
# 環境変数確認
echo $NODE_ENV
echo $API_FOOTBALL_KEY
```

#### 3. API接続エラー
```bash
# APIキー確認
curl -H "x-rapidapi-key: YOUR_KEY" \
     -H "x-rapidapi-host: v3.football.api-sports.io" \
     "https://v3.football.api-sports.io/status"
```

#### 4. メモリ不足
```bash
# メモリ使用量確認
docker stats
# または
ps aux | grep node
```

### ログ確認

#### Render.com
- ダッシュボードの "Logs" タブでリアルタイムログ確認

#### Docker
```bash
# ログ確認
docker-compose logs -f football-hub-japan

# 特定のログ
docker-compose logs --tail=100 football-hub-japan
```

#### ローカル
```bash
# アプリケーションログ
tail -f logs/app.log

# エラーログ
tail -f logs/error.log
```

## 🔄 継続的デプロイ

### GitHub Actions (オプション)
```yaml
name: Deploy to Production
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Render
        run: |
          # デプロイスクリプト
```

### 手動デプロイ
```bash
# コード更新後
git push origin main

# Render.com で自動デプロイ
# または
docker-compose up -d --build
```

## 📈 監視とメトリクス

### ヘルスチェック
- **エンドポイント**: `/health`
- **間隔**: 30秒
- **タイムアウト**: 10秒

### パフォーマンス指標
- **応答時間**: < 2秒
- **可用性**: > 99.9%
- **エラー率**: < 1%

### アラート設定
- **ダウンタイム**: 即座に通知
- **高負荷**: CPU > 80% で通知
- **エラー率**: > 5% で通知

## 💰 コスト最適化

### Render.com
- **無料プラン**: 月750時間
- **有料プラン**: $7/月〜

### API使用量
- **API-Football**: 100 requests/day (無料)
- **Football-Data.org**: 10 requests/minute (無料)

### 最適化戦略
1. **キャッシュ活用**: API呼び出し削減
2. **レート制限**: 適切な制御
3. **CDN利用**: 静的ファイル配信

## 🎉 デプロイ完了

### 確認事項
- [ ] ヘルスチェック成功
- [ ] 全機能動作確認
- [ ] API接続確認
- [ ] セキュリティ設定確認
- [ ] パフォーマンス確認

### 次のステップ
1. **ドメイン設定**: カスタムドメインの設定
2. **SSL証明書**: HTTPS対応
3. **監視設定**: アラート設定
4. **バックアップ**: データバックアップ設定

---

**🚀 Football Hub Japan の本番環境デプロイが完了しました！**

世界中からアクセス可能なサッカー分析プラットフォームが稼働しています。 