# Render環境変数修正手順

## 問題

現在、Render本番環境で`STORAGE_MODE=firestore`に設定されているため、Firestoreからデータを読み込もうとしていますが、Firestoreにデータが存在しないため、データが表示されません。

## 解決方法

**Renderの環境変数を`STORAGE_MODE=file`に変更してください。**

### 手順

1. Renderダッシュボードにログイン
2. 該当のサービス（`football-hub-japan-ubzb`）を選択
3. 「Environment」タブを開く
4. 環境変数`STORAGE_MODE`を探す
5. 値を`firestore`から`file`に変更
6. 「Save Changes」をクリック
7. サービスが自動的に再デプロイされます

### 確認

環境変数を変更して再デプロイ後、以下のログが表示されるはずです：

```
✅ DatabaseManager: ファイルモードで初期化 (STORAGE_MODE=file)
```

そして、以下のエンドポイントでデータが返ってくるはずです：

```bash
# 選手データ（7560名が返ってくるはず）
curl https://football-hub-japan-ubzb.onrender.com/api/integrated/players?limit=10

# チームデータ
curl https://football-hub-japan-ubzb.onrender.com/api/fotmob/teams
```

## 注意事項

- `data/players.json`と`data/teams.json`がGitリポジトリに含まれている必要があります
- これらのファイルは大きい（98MBと127KB）ため、初回デプロイに時間がかかる可能性があります
- デプロイ後、データファイルが正しく配置されているか確認してください
