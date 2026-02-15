# Render Cron設定ガイド

## 概要

API-Footballのデータ更新を自動化し、Render本番環境で永続化するための設定ガイドです。

## ストレージモード

環境変数 `STORAGE_MODE` で保存先を切り替え可能です：

- `file`: ローカル開発用（`data/*.json` に保存）
- `firestore`: 本番環境用（Firestoreに永続化）

## 必要な環境変数（Render Secrets）

### 必須環境変数

```bash
# ストレージモード（本番は firestore）
STORAGE_MODE=firestore

# API-Football API Key
API_FOOTBALL_KEY=your-api-football-key

# Firebase Admin SDK認証情報
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Node環境
NODE_ENV=production
```

### Firebase認証情報の取得方法

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. プロジェクトを選択
3. 設定（⚙️）→ プロジェクトの設定 → サービスアカウント
4. 「新しい秘密鍵の生成」をクリック
5. ダウンロードしたJSONファイルから以下を取得：
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY`（改行文字 `\n` を含む）

**重要**: `FIREBASE_PRIVATE_KEY` は改行文字を含むため、Renderの環境変数設定でそのまま貼り付けてください。

## Render Cron Jobs設定

### 1. メインの更新ジョブ（5分ごと）

**スケジュール**: `*/5 * * * *`

**コマンド**: `node jobs/schedule-match-updates.js`

**説明**: 終了した試合（FT, AET, PEN）を検知して、該当試合の選手スタッツを更新します。

### 2. 保険の再同期ジョブ（毎日4:30）

**スケジュール**: `30 4 * * *`

**コマンド**: `node jobs/schedule-match-updates.js`

**説明**: 取りこぼしを回収するための再同期ジョブです。

## Renderでの設定手順

1. Render Dashboardにアクセス
2. プロジェクトを選択
3. 「Cron Jobs」タブを開く
4. 「New Cron Job」をクリック
5. 以下を設定：

   **Cron Job 1（メイン更新）**:
   - Name: `update-finished-matches`
   - Schedule: `*/5 * * * *`
   - Command: `node jobs/schedule-match-updates.js`
   - Environment: `Production`

   **Cron Job 2（再同期）**:
   - Name: `sync-match-updates-backup`
   - Schedule: `30 4 * * *`
   - Command: `node jobs/schedule-match-updates.js`
   - Environment: `Production`

6. 環境変数を設定（上記の「必要な環境変数」を参照）

## Firestoreデータ構造

### players コレクション

```
players/{playerId}
  - id: number
  - name: string
  - fullName: string
  - position: string
  - currentTeam: string
  - stats: array
  - lastUpdated: timestamp
  - ...
```

**重要**: 98MBの巨大JSONを1ドキュメントに保存しません。各選手を `players/{playerId}` ドキュメントに分割保存します。

### sync_processed_fixtures コレクション

```
sync_processed_fixtures/{fixtureId}
  - status: 'processing' | 'done' | 'error'
  - updatedAt: timestamp
  - finishedAt: timestamp (done時のみ)
  - retryCount: number
  - lastError: string (error時のみ)
```

**目的**: 処理済みfixtureを永続管理し、重複処理を防ぎます（idempotent）。

## トラブルシューティング

### Firestore接続テスト

```bash
node jobs/test-firestore.js
```

このコマンドで以下を確認できます：
- Firestore接続が成功するか
- `metadata/healthcheck` ドキュメントが作成されるか
- 環境変数が正しく設定されているか

### よくある問題

#### 1. Firestore接続エラー

**症状**: `Firebase Admin SDK initialization failed`

**解決策**:
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` が正しく設定されているか確認
- `FIREBASE_PRIVATE_KEY` に改行文字（`\n`）が含まれているか確認
- Firebase Consoleでサービスアカウントの権限を確認

#### 2. 429エラー（レート制限）

**症状**: `429 Too Many Requests`

**解決策**:
- コード内で指数バックオフによるリトライが実装されています
- API-Footballのプラン制限を確認（Pro Plan推奨: 300 requests/minute）

#### 3. 処理済みfixtureが増えない

**症状**: `sync_processed_fixtures` コレクションにドキュメントが作成されない

**解決策**:
- `STORAGE_MODE=firestore` が設定されているか確認
- Firestoreの権限設定を確認（書き込み権限が必要）
- ログでエラーメッセージを確認

#### 4. データが更新されない

**症状**: 選手データが更新されない

**解決策**:
- Cron Jobのログを確認
- `checkProcessedFixture` で処理済みとしてマークされていないか確認
- `update-finished-matches.js` のログを確認

## ローカル開発

### ファイルモードで実行

```bash
# 環境変数を設定（.envファイル）
STORAGE_MODE=file
API_FOOTBALL_KEY=your-key

# 実行
node jobs/schedule-match-updates.js
```

### Firestoreモードで実行（テスト）

```bash
# 環境変数を設定
STORAGE_MODE=firestore
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-email
FIREBASE_PRIVATE_KEY="your-key"

# Firestore接続テスト
node jobs/test-firestore.js

# 更新ジョブ実行
node jobs/schedule-match-updates.js
```

## データの永続化

### ファイルモード（ローカル）

- `data/players.json` - 選手データ（98MB等の巨大ファイル）
- `data/matches.json` - 試合データ
- `data/backups/` - バックアップファイル

**注意**: `data/` ディレクトリは `.gitignore` に追加されているため、Gitにコミットされません。

### Firestoreモード（本番）

- `players/{playerId}` - 選手データ（分割保存）
- `sync_processed_fixtures/{fixtureId}` - 処理済みfixture管理
- `metadata/healthcheck` - ヘルスチェック用

**利点**:
- Renderの一時ファイルシステムに依存しない
- データが永続化される
- スケーラブル

## パフォーマンス

- **バッチ書き込み**: Firestoreへの書き込みは500件ずつバッチ処理されます
- **ページング読み込み**: 選手データの読み込みは1000件ずつページングされます
- **リトライロジック**: 429/5xxエラーに対して指数バックオフでリトライします
- **Idempotent**: 処理済みfixtureを管理することで、重複処理を防ぎます

## 監視

### ログ確認

Render Dashboardの「Logs」タブで以下を確認できます：

- 処理された試合数
- スキップされた試合数
- エラー発生時の詳細

### Firestore Console

[Firebase Console](https://console.firebase.google.com/) で以下を確認できます：

- `players` コレクションのドキュメント数
- `sync_processed_fixtures` コレクションの状態
- データの更新頻度

## 関連ファイル

- `firebaseAdmin.js` - Firebase Admin SDK共通初期化
- `databaseManager.js` - ストレージ抽象化レイヤー
- `update-finished-matches.js` - 試合更新ロジック
- `jobs/schedule-match-updates.js` - Cron用エントリーポイント
- `jobs/test-firestore.js` - Firestore接続テスト
