# Firestoreへの選手データインポート手順

## 現状確認

Firestoreに選手データが存在しない可能性があります。以下の手順でデータをインポートしてください。

## 前提条件

1. **環境変数の設定**
   - `FIREBASE_PROJECT_ID`: FirebaseプロジェクトID
   - `FIREBASE_CLIENT_EMAIL`: Firebaseサービスアカウントのメールアドレス
   - `FIREBASE_PRIVATE_KEY`: Firebaseサービスアカウントの秘密鍵（改行文字を含む）

2. **ローカルに`data/players.json`が存在すること**
   - インポート元のデータファイル

## インポート手順

### 方法1: ローカル環境からインポート（推奨）

```bash
# 環境変数を設定（.envファイルに記載されている場合、自動的に読み込まれます）
export FIREBASE_PROJECT_ID="your-project-id"
export FIREBASE_CLIENT_EMAIL="your-service-account@your-project.iam.gserviceaccount.com"
export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# インポート実行
STORAGE_MODE=firestore node import-players-to-firebase.js
```

### 方法2: Render本番環境からインポート

Renderの環境変数が既に設定されている場合、Renderのシェルから実行できます：

```bash
# Renderのシェルに接続後
cd /opt/render/project/src
STORAGE_MODE=firestore node import-players-to-firebase.js
```

## インポート確認

インポートが完了したら、以下のコマンドで確認できます：

```bash
node jobs/check-firestore-data.js
```

## 注意事項

1. **データサイズ**: `players.json`が大きい場合（98MBなど）、インポートに時間がかかります
2. **レート制限**: Firestoreの無料プランには書き込みレート制限があります。バッチ処理（500件ずつ）で自動的に処理されますが、大量のデータの場合は時間がかかります
3. **重複防止**: `merge: true`オプションを使用しているため、既存のデータは上書きされます

## トラブルシューティング

### エラー: "Firebase Admin SDK credentials not configured"
→ 環境変数が正しく設定されているか確認してください

### エラー: "players.jsonが見つかりません"
→ `data/players.json`ファイルが存在するか確認してください

### エラー: "Quota exceeded"
→ Firestoreの無料プランのクォータに達している可能性があります。しばらく待ってから再試行するか、Firestoreのプランをアップグレードしてください

## インポート後の動作確認

インポートが完了したら、以下のエンドポイントでデータが取得できるか確認してください：

```bash
# ローカル環境の場合
curl http://localhost:3000/api/integrated/players?limit=10

# 本番環境の場合
curl https://your-app.onrender.com/api/integrated/players?limit=10
```
