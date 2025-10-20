# 手動データ収集ガイド

## 本番環境でデータ収集を実行する方法

デプロイ完了後、以下の手順で全選手データを収集できます。

---

## 1. デプロイ状況の確認

### Renderダッシュボード
https://dashboard.render.com/

デプロイログで以下を確認:
- ✅ Build successful
- ✅ Deploy successful
- 🚀 Server is running

---

## 2. データベース状態の確認

```bash
curl https://football-hub-japan-ubzb.onrender.com/api/database/comprehensive-status
```

**期待される応答:**
```json
{
  "status": "active",
  "totalPlayers": 46,  // ← これが1000以上になっているか確認
  "totalTeams": 19,
  "totalLeagues": 7,
  "lastUpdate": "2025-10-19T23:00:00.000Z"
}
```

---

## 3. 包括的データ収集を手動実行

### オプションA: 包括的収集（APIService使用）

```bash
curl -X POST https://football-hub-japan-ubzb.onrender.com/api/execute-comprehensive-collection
```

**実行内容:**
- APIServiceを使用して全リーグのデータを取得
- 自動的にデータベースに保存
- 所要時間: 約30-60分

**期待される応答:**
```json
{
  "success": true,
  "message": "包括的収集が完了しました（全選手データ取得）",
  "playersCollected": 1500,
  "timestamp": "2025-10-19T23:30:00.000Z"
}
```

### オプションB: 直接API収集（推奨）

```bash
curl -X POST https://football-hub-japan-ubzb.onrender.com/api/execute-direct-api-collection
```

**実行内容:**
- API-Footballから直接全選手データを取得
- より確実で高速
- 所要時間: 約20-40分

**期待される応答:**
```json
{
  "success": true,
  "message": "直接API収集が完了しました（全選手データ取得）",
  "playersCollected": 2000,
  "timestamp": "2025-10-19T23:30:00.000Z"
}
```

---

## 4. 収集進捗の監視

### リアルタイム進捗確認

Renderのログで以下のメッセージを確認:

```
🚀 直接APIから全選手データを取得開始...
🏆 Premier League からデータを取得中...
   📊 20チームを発見
   🏟️ Arsenal の選手を取得中...
      📊 25名の選手を発見
   📈 累計: 50名の選手を保存
   📈 累計: 100名の選手を保存
   ...
🎯 直接API収集完了: 1500名の選手を取得
```

### データ数の確認

```bash
# 現在のデータ数を確認
curl -s "https://football-hub-japan-ubzb.onrender.com/api/ranking/players?limit=1" | jq '.total'

# 結果例: 1500
```

---

## 5. データ表示の確認

### ランキングページ
https://football-hub-japan-ubzb.onrender.com/ranking.html

**確認項目:**
- [ ] 選手数が1000名以上表示される
- [ ] 選手写真が正しく表示される
- [ ] リーグ・ポジションでフィルタリングできる
- [ ] 統計でソートできる

### データベースページ
https://football-hub-japan-ubzb.onrender.com/database-enhanced.html

**確認項目:**
- [ ] 初期表示で100名の選手が表示される
- [ ] スクロールで追加の選手が読み込まれる
- [ ] 検索機能が正常に動作する
- [ ] エラーが発生しない

---

## 6. トラブルシューティング

### 問題: データ収集が開始されない

**原因:** API制限に達している可能性  
**対処法:**
1. 数時間待ってから再実行
2. API-Footballの無料プランは1日100リクエスト制限あり
3. Renderのログでエラーメッセージを確認

### 問題: 選手データが少ない（< 100名）

**原因:** データ収集が完了していない  
**対処法:**
```bash
# 手動で直接API収集を実行
curl -X POST https://football-hub-japan-ubzb.onrender.com/api/execute-direct-api-collection

# 進捗を監視
watch -n 5 'curl -s https://football-hub-japan-ubzb.onrender.com/api/database/comprehensive-status | jq ".totalPlayers"'
```

### 問題: フォールバックデータのみ表示

**原因:** データベースが空  
**対処法:**
```bash
# 1. データベース状態を確認
curl https://football-hub-japan-ubzb.onrender.com/api/database/comprehensive-status

# 2. データが0名の場合、データ収集を実行
curl -X POST https://football-hub-japan-ubzb.onrender.com/api/execute-direct-api-collection

# 3. 完了まで待機（20-40分）

# 4. 再度確認
curl https://football-hub-japan-ubzb.onrender.com/api/database/comprehensive-status
```

---

## 7. API制限を考慮したベストプラクティス

### 推奨スケジュール

1. **初回デプロイ後**: 直接API収集を1回実行
2. **以降**: 自動更新システムに任せる（30分ごと）
3. **データ更新**: 必要に応じて手動実行

### API使用量の見積もり

**直接API収集:**
- チーム一覧取得: 8リクエスト（8リーグ）
- 選手データ取得: 160リクエスト（160チーム）
- **合計**: 約168リクエスト

**注意:** 無料プランは1日100リクエストまで

---

## 8. 完了確認チェックリスト

### データベース
- [ ] 選手数: 1000名以上
- [ ] チーム数: 160チーム以上
- [ ] リーグ数: 8リーグ
- [ ] 最終更新: 最近の日時

### フロントエンド
- [ ] ランキングページで1000名以上表示
- [ ] データベースページで検索が動作
- [ ] 選手写真が表示される
- [ ] エラーが発生しない

### ログ
- [ ] `compId is not defined` エラーなし
- [ ] `undefined.length` エラーなし
- [ ] データ収集の成功ログあり

---

## 9. 次回のデータ更新

### 自動更新（推奨）
- 30分ごとに自動実行
- データ不足時は包括的収集を実行
- 十分なデータがある場合は増分更新

### 手動更新
必要に応じて以下を実行:

```bash
# 包括的更新
curl -X POST https://football-hub-japan-ubzb.onrender.com/api/manual-update \
  -H "Content-Type: application/json" \
  -d '{"type": "comprehensive"}'

# 効率的更新
curl -X POST https://football-hub-japan-ubzb.onrender.com/api/manual-update \
  -H "Content-Type: application/json" \
  -d '{"type": "efficient"}'
```

---

## サポート

問題が発生した場合:
1. Renderのログを確認
2. `/api/database/comprehensive-status` でデータベース状態を確認
3. 必要に応じて手動でデータ収集を実行
4. GitHubのissueを作成

