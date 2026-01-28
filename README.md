# ⚽ Football Hub Japan

サッカーデータとAI分析プラットフォーム - 選手分析、試合予測、戦術解説を提供

## 🚀 本番環境デプロイ

### Render.com でのデプロイ

1. **Render.comアカウント作成**
   - [Render.com](https://render.com) にアクセス
   - GitHubアカウントでサインアップ

2. **リポジトリ連携**
   - "New +" → "Web Service" を選択
   - GitHubリポジトリを連携
   - ブランチ: `main`

3. **デプロイ設定**
   ```
   Name: football-hub-japan
   Environment: Node
   Build Command: npm install
   Start Command: npm start
   ```

4. **環境変数設定**
   ```bash
   NODE_ENV=production
   PORT=3000
   API_FOOTBALL_KEY=your-api-key
   FOOTBALL_DATA_API_KEY=your-api-key
   GEMINI_API_KEY=your-api-key
   FIREBASE_API_KEY=your-firebase-key
   FIREBASE_PROJECT_ID=your-project-id
   ```

### Docker でのデプロイ

```bash
# イメージビルド
docker build -t football-hub-japan .

# コンテナ実行
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e API_FOOTBALL_KEY=your-key \
  -e FOOTBALL_DATA_API_KEY=your-key \
  -e GEMINI_API_KEY=your-key \
  football-hub-japan
```

### ローカル開発環境

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# 本番環境起動
npm start
```

## 📊 機能一覧

### 🗄️ データベース機能
- 選手データ検索・表示
- チーム情報管理
- リーグ統計
- リアルタイムデータ更新

### 📈 レーダーチャート機能
- 選手比較分析
- 統計データ可視化
- カスタム指標選択
- インタラクティブチャート

### 🤖 AIエージェント機能
- Gemini AI による分析
- 選手比較・予測
- 戦術分析
- ファンタジーリーグアドバイス

## 🔧 技術スタック

- **Backend**: Node.js, Express.js
- **Frontend**: HTML5, CSS3, JavaScript
- **AI**: Google Gemini AI
- **Database**: Firebase Firestore
- **APIs**: API-Football, Football-Data.org
- **Deployment**: Render.com, Docker

## 📝 環境変数

`.env` ファイルを作成して以下を設定：

```bash
# API Keys
API_FOOTBALL_KEY=your-api-football-key
FOOTBALL_DATA_API_KEY=your-football-data-key
GEMINI_API_KEY=your-gemini-key

# Firebase
FIREBASE_API_KEY=your-firebase-key
FIREBASE_PROJECT_ID=your-project-id

# Server
PORT=3000
NODE_ENV=development
```

## 🎯 本番環境確認

デプロイ後、以下のエンドポイントで動作確認：

- **ヘルスチェック**: `/health`
- **データベース**: `/database`
- **レーダーチャート**: `/radar`
- **AIエージェント**: `/ai-agent`

## 🔍 Google AdSense / GA4 検証手順

本番環境でAdSense/GA4タグが正しく配信されているか確認する手順：

### 1. ページソースでの確認
1. ブラウザで `https://football-hub-japan-ubzb.onrender.com/` にアクセス
2. ページ上で右クリック → 「ページのソースを表示」
3. 検索機能（`Cmd+F` / `Ctrl+F`）で以下を検索：
   - `ca-pub-6574544891375303` → **見つかること**
   - `G-Y5KSLP58SP` → **見つかること**
   - `googletagmanager.com` → **見つかること**
   - `adsbygoogle` → **見つかること**

### 2. DevTools Networkタブでの確認
1. F12でDevToolsを開く
2. Networkタブを選択
3. フィルタを「Doc」に設定
4. ページをリロード（`Cmd+R` / `Ctrl+R`）
5. `football-hub-japan-ubzb.onrender.com`（Document）をクリック
6. **Responseタブ**を選択
7. 検索バーで以下を検索：
   - `ca-pub-6574544891375303` → **見つかること**
   - `adsbygoogle` → **見つかること**
   - `googletagmanager.com` → **見つかること**

### 3. Networkタブでスクリプトの読み込み確認
1. Networkタブでフィルタを「JS」に設定
2. ページをリロード
3. `adsbygoogle.js` のリクエストが表示されること
4. ステータスが **200** であること
5. `googletagmanager.com` のリクエストも **200** であること

### 4. ads.txtの確認
1. ブラウザで `https://football-hub-japan-ubzb.onrender.com/ads.txt` にアクセス
2. 以下の内容が表示されること：
   ```
   google.com, pub-6574544891375303, DIRECT, f08c47fec0942fa0
   ```

### ✅ 成功条件
- ページソースに `ca-pub-6574544891375303` が含まれる
- Network Responseタブに `adsbygoogle.js?client=ca-pub-6574544891375303` が含まれる
- `adsbygoogle.js` が200で読み込まれる
- `/ads.txt` が正しく表示される

### ❌ 失敗時の確認事項
1. **デプロイが完了しているか**
   - Render.comダッシュボードで最新デプロイのステータスを確認
   - 「Live」になっていること

2. **キャッシュの問題**
   - ハードリロード: `Cmd+Shift+R` (Mac) / `Ctrl+Shift+F5` (Windows)
   - DevToolsで「Disable cache」にチェックを入れて再読み込み

3. **ルーティングの問題**
   - Render.comのログで `[ROUTE /] Serving index.html from:` が表示されること
   - エラーログがないこと

## 📞 サポート

問題や質問がある場合は、GitHub Issues でお知らせください。

---

**⚽ Football Hub Japan - サッカー分析の未来を創造**# Force redeploy Fri Aug 29 08:29:35 JST 2025
