# Football Hub Japan - 本番環境デプロイガイド

## 🚀 本番環境デプロイ

### 実装済み機能

#### 🗄️ データベース機能
- **選手データ検索・表示**: 日本語・英語対応の選手検索
- **チーム情報管理**: 主要リーグのチーム情報
- **リーグ統計**: リアルタイム統計データ
- **API統合**: API-Football + Football-Data.org

#### 📈 レーダーチャート機能
- **選手比較分析**: 6項目のカスタム比較
- **統計データ可視化**: Chart.js によるインタラクティブチャート
- **リアルタイム更新**: 最新データの自動更新
- **日本語対応**: 日本語選手名の自動変換

#### 🤖 AIエージェント機能
- **Gemini AI 統合**: Google Gemini 1.5 Flash による分析
- **選手比較・予測**: 詳細な選手分析と予測
- **戦術分析**: チーム戦術の専門分析
- **ファンタジーリーグ**: 実践的なアドバイス

### Render.com でのデプロイ

#### ステップ1: Render.comアカウント作成
1. [Render.com](https://render.com) にアクセス
2. "Get Started for Free" をクリック
3. GitHubアカウントでサインアップ

#### ステップ2: GitHubリポジトリ連携
1. Render.com ダッシュボードで "New +" をクリック
2. "Web Service" を選択
3. "Connect a repository" でGitHubを選択
4. リポジトリを検索: `FootHubJapan/football-hub-japan`
5. ブランチ選択: `main`

#### ステップ3: デプロイ設定
```
Name: football-hub-japan
Environment: Node
Region: Oregon (US West)
Branch: main
Build Command: npm install
Start Command: npm start
```

#### ステップ4: 環境変数設定
Render.com ダッシュボードの "Environment" タブで以下を設定：

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

#### ステップ5: デプロイ実行
1. "Create Web Service" をクリック
2. 自動ビルド・デプロイが開始されます
3. 完了後、URLが生成されます（例: `https://football-hub-japan.onrender.com`）

### Docker でのデプロイ

#### 単一コンテナデプロイ
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

#### Docker Compose でのデプロイ
```bash
# 環境変数ファイルを作成
cp env.example .env
# .env ファイルを編集してAPIキーを設定

# サービス起動
docker-compose up -d

# ログ確認
docker-compose logs -f football-hub-japan
```

### 本番環境確認

#### ヘルスチェック
```bash
curl https://your-app-url.onrender.com/health
```

#### 機能確認
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

### トラブルシューティング

#### よくある問題
1. **ビルドエラー**: `package.json`の依存関係を確認
2. **環境変数エラー**: Render.comの環境変数設定を再確認
3. **API接続エラー**: APIキーの形式を確認
4. **メモリ不足**: Render.comの無料プランは512MB制限

#### ログ確認
- Render.com ダッシュボードの "Logs" タブでリアルタイムログを確認
- Docker環境: `docker-compose logs -f`

#### パフォーマンス最適化
1. **キャッシュ活用**: 30分間のキャッシュでAPI呼び出しを削減
2. **レート制限**: 各APIの制限に応じた自動制御
3. **並列処理**: 複数APIからの同時データ取得

### 継続的デプロイ
- GitHubにプッシュすると自動的にRender.comでデプロイされます
- ブランチ保護やプルリクエストワークフローも設定可能

### 料金
- **無料プラン**: 月750時間まで（個人プロジェクトに最適）
- **有料プラン**: $7/月〜（本格運用時）

---

**🚀 デプロイ完了後、世界中からアクセス可能なFootball Hub Japanが完成します！**

### 機能詳細

#### データベース機能
- 日本語・英語対応の選手検索
- リアルタイム統計データ
- チーム・リーグ情報
- 詳細選手プロフィール

#### レーダーチャート機能
- 6項目のカスタム比較
- インタラクティブチャート
- 統計データの可視化
- 選手比較レポート

#### AIエージェント機能
- Gemini AI による専門分析
- 選手比較・予測
- 戦術分析
- ファンタジーリーグアドバイス