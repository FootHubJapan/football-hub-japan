# Firestore永続化実装サマリー

## 実装日
2025年1月26日

## 目的
API-Footballのデータ更新を自動化し、Render本番環境で消えないようにFirestoreに永続化する。

## 実装内容

### A. Git管理から data/ を除外 ✅

**変更ファイル**:
- `.gitignore` - `data/` と `data/backups/` を追加

**実行コマンド**:
```bash
git rm -r --cached data/
```

**効果**: 98MB等の巨大JSONファイルがGitリポジトリから除外され、リポジトリサイズが削減されます。

---

### B. Firestore接続のヘルスチェックジョブ ✅

**新規ファイル**:
- `jobs/test-firestore.js` - Firestore接続テスト用スクリプト

**機能**:
- `metadata/healthcheck` ドキュメントを作成
- 環境情報（Render/ローカル）を記録
- 読み取りテストも実行

**使用方法**:
```bash
node jobs/test-firestore.js
```

---

### C. Firebase Admin初期化を共通化 ✅

**新規ファイル**:
- `firebaseAdmin.js` - Firebase Admin SDK共通初期化モジュール

**機能**:
- 環境変数から認証情報を取得
- `FIREBASE_PRIVATE_KEY` の改行文字処理（`replace(/\\n/g, '\n')`）
- サービスアカウントキーファイルにも対応
- シングルトンパターンで重複初期化を防止

**使用方法**:
```javascript
const { getFirestore } = require('./firebaseAdmin');
const db = getFirestore();
```

---

### D. DatabaseManagerを STORAGE_MODE で分岐 ✅

**変更ファイル**:
- `databaseManager.js`

**主な変更点**:

1. **constructor**:
   - `STORAGE_MODE` 環境変数でモードを判定（デフォルト: `file`）
   - Firestoreモードの場合は `firebaseAdmin.js` を使用して初期化

2. **saveComprehensivePlayers**:
   - `saveComprehensivePlayersToFile()` - 既存のファイル保存ロジック
   - `saveComprehensivePlayersToFirestore()` - 新規追加
     - `players/{playerId}` ドキュメントに分割保存
     - バッチ書き込み（500件ずつ）
     - `set(merge: true)` で上書き更新

3. **loadComprehensivePlayers**:
   - `loadComprehensivePlayersFromFile()` - 既存のファイル読み込みロジック
   - `loadComprehensivePlayersFromFirestore()` - 新規追加
     - ページング読み込み（1000件ずつ）
     - 全件一括読み込みを避ける設計

**重要**: 98MBの巨大JSONを1ドキュメントに保存しません。各選手を `players/{playerId}` に分割保存します。

---

### E. update-finished-matches.js の保存先をFirestore対応 ✅

**変更ファイル**:
- `update-finished-matches.js`

**主な変更点**:

1. **終了ステータスの拡張**:
   - `FT`（Full Time）のみ → `FT`, `AET`, `PEN` に対応
   - 延長戦・PK戦の取りこぼしを防止

2. **リトライロジック**:
   - `retryWithBackoff()` 関数を追加
   - 429（レート制限）・5xxエラーに対して指数バックオフでリトライ
   - 最大3回リトライ

3. **処理済みfixture管理**:
   - `checkProcessedFixture()` - 処理済みかチェック（idempotent）
   - `markProcessedFixture()` - 処理状態をマーク
   - `sync_processed_fixtures/{fixtureId}` コレクションを使用

4. **エラーハンドリング**:
   - 失敗しても次回Cronで回復可能な設計
   - エラー時は `status: 'error'` でマークし、再処理可能に

---

### F. 処理済みfixtureの永続化（idempotent） ✅

**実装内容**:

**コレクション**: `sync_processed_fixtures/{fixtureId}`

**フィールド**:
- `status`: `'processing' | 'done' | 'error'`
- `updatedAt`: タイムスタンプ
- `finishedAt`: 完了時のタイムスタンプ
- `retryCount`: リトライ回数
- `lastError`: エラーメッセージ（エラー時のみ）

**動作**:
1. 処理開始時に `status: 'processing'` でマーク
2. 処理完了時に `status: 'done'` でマーク
3. エラー時は `status: 'error'` でマーク（次回再処理可能）
4. `processing` 状態が2時間以上経過している場合は `stale` として再処理

**効果**: Cronで繰り返し実行しても無駄撃ちしません（idempotent）。

---

### G. Render Cron設定のためのドキュメント作成 ✅

**新規ファイル**:
- `RENDER_CRON_SETUP.md` - Render Cron設定ガイド

**内容**:
1. 必要な環境変数一覧
2. Firebase認証情報の取得方法
3. Render Cron Jobs設定手順
4. Firestoreデータ構造
5. トラブルシューティング
6. ローカル開発手順

---

## 新規作成ファイル一覧

1. `firebaseAdmin.js` - Firebase Admin SDK共通初期化
2. `jobs/test-firestore.js` - Firestore接続テスト
3. `jobs/schedule-match-updates.js` - Render Cron用エントリーポイント
4. `RENDER_CRON_SETUP.md` - Render Cron設定ガイド
5. `docs/firestore-migration-summary.md` - このファイル

## 変更ファイル一覧

1. `.gitignore` - `data/` と `data/backups/` を追加
2. `databaseManager.js` - STORAGE_MODEで分岐、Firestore対応追加
3. `update-finished-matches.js` - Firestore対応、処理済みfixture管理、リトライロジック追加

## 環境変数

### ローカル開発（fileモード）
```bash
STORAGE_MODE=file
API_FOOTBALL_KEY=your-key
```

### 本番環境（firestoreモード）
```bash
STORAGE_MODE=firestore
API_FOOTBALL_KEY=your-key
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Render Cron設定

### Cron Job 1（メイン更新）
- **スケジュール**: `*/5 * * * *` (5分ごと)
- **コマンド**: `node jobs/schedule-match-updates.js`

### Cron Job 2（再同期）
- **スケジュール**: `30 4 * * *` (毎日4:30)
- **コマンド**: `node jobs/schedule-match-updates.js`

## 動作確認手順

### 1. Firestore接続テスト
```bash
node jobs/test-firestore.js
```

### 2. ローカルでファイルモードテスト
```bash
STORAGE_MODE=file node jobs/schedule-match-updates.js
```

### 3. ローカルでFirestoreモードテスト
```bash
STORAGE_MODE=firestore node jobs/schedule-match-updates.js
```

## 注意事項

1. **Firestoreのサイズ制限**: 1ドキュメントあたり最大1MB。98MBの巨大JSONを1ドキュメントに保存しないよう、`players/{playerId}` に分割保存しています。

2. **APIレート制限**: API-Footballのレート制限（Pro Plan: 300 requests/minute）を考慮し、リトライロジックとレート制限対策を実装しています。

3. **Idempotent**: 処理済みfixtureを管理することで、Cronで繰り返し実行しても重複処理を防ぎます。

4. **データの永続化**: Renderの一時ファイルシステムに依存せず、Firestoreに永続化されます。

## 次のステップ

1. Render Dashboardで環境変数を設定
2. Render Cron Jobsを作成
3. `node jobs/test-firestore.js` で接続テスト
4. Cron Jobのログを確認
5. Firestore Consoleでデータを確認
