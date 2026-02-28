# Renderデプロイメント修正ガイド

## 問題の原因

1. Render本番環境で`STORAGE_MODE=firestore`に設定されている
2. Firestoreにデータが存在しない
3. `.gitignore`で`data/`が除外されているため、`data/players.json`と`data/teams.json`がGitに含まれていない

## 解決方法（2つの選択肢）

### 方法1: Firestoreにデータをインポート（推奨）

**メリット:**
- 大きなファイルをGitに含める必要がない
- データが永続化される
- 将来的にスケーラブル

**手順:**

1. **ローカル環境でFirestoreにデータをインポート**
   ```bash
   # 環境変数を設定（.envファイルに記載されている場合、自動的に読み込まれます）
   export FIREBASE_PROJECT_ID="your-project-id"
   export FIREBASE_CLIENT_EMAIL="your-service-account@..."
   export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   
   # インポート実行
   STORAGE_MODE=firestore node import-players-to-firebase.js
   ```

2. **Renderの環境変数を確認**
   - `STORAGE_MODE=firestore`（既に設定済み）
   - `FIREBASE_PROJECT_ID=...`
   - `FIREBASE_CLIENT_EMAIL=...`
   - `FIREBASE_PRIVATE_KEY=...`

3. **インポート確認**
   ```bash
   node jobs/check-firestore-data.js
   ```

4. **再デプロイ**
   - Renderが自動的に再デプロイされます
   - または、手動で「Manual Deploy」を実行

### 方法2: データファイルをGitに含める（非推奨）

**デメリット:**
- `data/players.json`が98MBと非常に大きい
- Gitリポジトリが肥大化する
- デプロイ時間が長くなる

**手順:**

1. **`.gitignore`から`data/`を除外**
   ```bash
   # .gitignoreを編集して、以下の行をコメントアウトまたは削除
   # data/
   # data/backups/
   ```

2. **データファイルをGitに追加**
   ```bash
   git add data/players.json data/teams.json
   git commit -m "Add data files for Render deployment"
   git push
   ```

3. **Renderの環境変数を変更**
   - `STORAGE_MODE=file`に変更

4. **再デプロイ**
   - Renderが自動的に再デプロイされます

## 推奨される解決方法

**方法1（Firestoreにインポート）を推奨します。**

理由：
- データファイルが大きすぎてGitに含めるのは非効率
- Firestoreは永続化され、スケーラブル
- 既にFirestoreの設定は完了している

## 次のステップ

1. ローカル環境で`import-players-to-firebase.js`を実行してFirestoreにデータをインポート
2. `jobs/check-firestore-data.js`でインポートを確認
3. Renderで再デプロイ（自動的に実行される）
4. ブラウザで`database-new.html`を確認してデータが表示されるか確認
