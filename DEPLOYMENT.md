# Football Hub Japan - Render.com デプロイ手順

## 🚀 本番環境デプロイ（Render.com）

### ステップ1: Render.comアカウント作成
1. [Render.com](https://render.com) にアクセス
2. "Get Started for Free" をクリック
3. GitHubアカウントでサインアップ

### ステップ2: GitHubリポジトリ連携
1. Render.com ダッシュボードで "New +" をクリック
2. "Web Service" を選択
3. "Connect a repository" でGitHubを選択
4. リポジトリを検索: `FootHubJapan/football-hub-japan`
5. ブランチ選択: `cursor/football-hub-japan-platform-design-9920`

### ステップ3: デプロイ設定
```
Name: football-hub-japan
Environment: Node
Region: Oregon (US West)
Branch: cursor/football-hub-japan-platform-design-9920
Build Command: npm install
Start Command: npm start
```

### ステップ4: 環境変数設定
Render.com ダッシュボードの "Environment" タブで以下を設定：

```bash
# 必須API Keys
API_FOOTBALL_KEY=53cfd1d0230dfe92a2d99f81ca0fab88
GEMINI_API_KEY=AIzaSyCD1q757C9d3wNLPf0TLOi8MnFCu1jkXjA
FOOTBALL_DATA_ORG_KEY=c578337e9eb343d8af3411ab3a2a71a9

# Firebase設定
FIREBASE_PROJECT_ID=football-hub-japan
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@football-hub-japan.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDhhngBiz0A9IzT\n94R5C89D2HIER4Z+4Xt7p9aTEwrwNs/pub1Xtf21GJuIlc1YEyEIOWUE/SbOmOU0\nkmsmDPjIYN8K2Vtpm7y5d9+yDAzmvbay3UonWhiCUa2g3uayGSAxXw33OwoPsKxF\ngSq7182dXr0r3dZ+wfTw3q5M94RVdvvKAxkWsB7djP7Tsg/C1Ow00OCHy0VqplCe\nUB1JxybJlEk3CkIjzUqEC1pr7REiPLy734VNFH4aytZ+TLjawoik11wldseZR1dw\n/LogKa0q2y0HgflF3DTp+ZyAuouVjeZuSzZ+pjo3QkZmXzsHRab6LNNNSunJnwMC\nCK6h7rlfAgMBAAECggEABGzlEfKvgcNKuCYVPWLT8Frg8eCNbRPznluOxFgNUOVi\ncw2n/36cud7/vlBiNSY68bRenRhymH87kCqHW7nJb/Umq0nUl1/s9h66Dv5ZinWS\njjP1boxACt6bb5qwIDKKBS3+Uimgaupmlv6P3hu/9ySSxbeWq+oWaluURAJfYGXp\n36VduJj2Ys2CbwJBFQm04l+qjlIrAqxYumcgoqPdPNuv58KTZrqLbvgjRihGnAGc\nH7+kSvLcj2iYoVWk3zpcOEYSF67yCKB9vzzVRHSMb9rHzNpT+uRlIMtlFDuFRMVv\ne5lPlruZJk231BQduYROFI6VvqbcAlu6S+Y3/k+xcQKBgQD4Dj0LwRtCa79GG1HO\nPNqmSSGDNruAOV8DIe8qBFsBeegUNXV/UyXH+TIR+Gkbu7JguOW1usPH7bcGzK1n\nWAW0GXXqjxcfX+c4XRiVEk7wg1ZpOWJ76zi4Db9A7x29e4silDi3yDyGLWrKahS4\nP09V0UlylQQ6iu+qfVHgPhjZdQKBgQDov4IY4y5YT5W8mS9Ec4GncorzBHnOlIq0\n2fgI0RFlRFdAqX9twL1gAGIxTPxwxA7pehB/B+7eVXTyvk7asXjb+5i2HYhSteMI\ncCSKuErVQiZ500XxXb/ATmNkAPh5o5/6MLUYYiueKR8fQsWSx47h6Kf+7k1SPL8k\nCfyAQBDZAwKBgQCifSE7++kRX2dSUz8JLA/GcY1EWKwGWI6GjMoP6f57PxHpewNW\nvm63SeOkpeakRhWZCkVe/9KTuoH0MEs+sQg7a5o0ZjstUDM0Vrdtnyqank4Sa4a5\nyeHDny2zKW9/2dfQdOuaZ85Nzp5vrYGZF8+uVYQZTMgSWUSZl7H0hHjeqQKBgG1z\nWZeghfPLgSvOkZbMBqWazNLZQPqvicbgVa63ukl36NwkmSMgpy2VIJf0jyXsXOLY\nnxdNwLvXTga1Ddnz6VTxrO+/VZMnq5sVOWnunmpJEFTr0JFft8OUWVL2zeJN2vZJ\nn2/XApH+3n7R5J1QsNV1lkLhB4VrwasN8yrQddvHAoGAFy59EWwZaoCAsAMLZ8mt\nV/cWFfjNEEN0MvKFAT5EPXuFbCNIi07CwXpR55Z/DC6709FAkKVkv0rA0f5e8X0X\ntKjdNQ03UKL8Pk8hdCbBcVJW/XU5w9o5urrNaSGmRXrmJK5B7jEgs4qqt6jt2Z/O\nCZwHiktn7IZL6WzPg5wRSvU=\n-----END PRIVATE KEY-----\n

# 追加設定
NODE_ENV=production
PORT=10000
JWT_SECRET=football_hub_japan_super_secret_key_2024

# DeepL (オプション)
DEEPL_API_KEY=5a41ceaa-4baf-4d0c-bac2-d6f545de0db5:fx
```

### ステップ5: デプロイ実行
1. "Create Web Service" をクリック
2. 自動ビルド・デプロイが開始されます
3. 完了後、URLが生成されます（例: `https://football-hub-japan.onrender.com`）

## 🎯 デプロイ後の確認

### ヘルスチェック
```bash
curl https://your-app-url.onrender.com/health
```

### API動作確認
```bash
curl "https://your-app-url.onrender.com/api/test/all"
```

## 💡 トラブルシューティング

### よくある問題
1. **ビルドエラー**: `package.json`の依存関係を確認
2. **環境変数エラー**: Render.comの環境変数設定を再確認
3. **API接続エラー**: APIキーの形式を確認

### ログ確認
- Render.com ダッシュボードの "Logs" タブでリアルタイムログを確認

## 🔄 継続的デプロイ
- GitHubにプッシュすると自動的にRender.comでデプロイされます
- ブランチ保護やプルリクエストワークフローも設定可能

## 💰 料金
- **無料プラン**: 月750時間まで（個人プロジェクトに最適）
- **有料プラン**: $7/月〜（本格運用時）

---

**🚀 デプロイ完了後、世界中からアクセス可能なFootball Hub Japanが完成します！**