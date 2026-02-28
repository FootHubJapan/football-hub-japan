# Render環境変数設定ガイド

## 問題

現在、Render本番環境で`STORAGE_MODE=firestore`に設定されているため、`DatabaseManager`がFirestoreからデータを読み込もうとしていますが、Firestoreにデータが存在しないため、データが表示されません。

## 解決方法

Renderの環境変数を`STORAGE_MODE=file`に変更してください。

### 手順

1. Renderダッシュボードにログイン
2. 該当のサービス（`football-hub-japan-ubzb`）を選択
3. 「Environment」タブを開く
4. 環境変数`STORAGE_MODE`を探す
5. 値を`firestore`から`file`に変更
6. 「Save Changes」をクリック
7. サービスが自動的に再デプロイされます

### 環境変数の確認

以下の環境変数が設定されていることを確認してください：

- `STORAGE_MODE=file` （重要：これを`file`に設定）
- `API_FOOTBALL_KEY=...`
- `FOOTBALL_DATA_API_KEY=...`
- `GEMINI_API_KEY=...`

### Firestore関連の環境変数（オプション）

Firestoreを使わない場合は、以下の環境変数は設定不要です：
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

ただし、将来的にFirestoreを使う場合は設定しておいても問題ありません。

## 動作確認

環境変数を変更して再デプロイ後、以下のエンドポイントでデータが返ってくるか確認してください：

```bash
# 選手データ（7560名が返ってくるはず）
curl https://football-hub-japan-ubzb.onrender.com/api/integrated/players?limit=10

# チームデータ
curl https://football-hub-japan-ubzb.onrender.com/api/fotmob/teams
```

## 注意事項

- `STORAGE_MODE=file`の場合、`data/players.json`と`data/teams.json`がGitリポジトリに含まれている必要があります
- 現在、これらのファイルは`.gitignore`で除外されている可能性があります
- データファイルをGitに含める場合は、`.gitignore`から`data/*.json`を除外してください
