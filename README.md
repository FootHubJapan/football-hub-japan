# Football Hub Japan

サッカーAIエージェント - 最先端のAI技術で日本サッカーを分析・予測

## 機能

- **サッカーデータベース**: 世界中のリーグ、チーム、選手の詳細なデータ
- **レーダーチャート比較**: 選手やチームのパフォーマンスを視覚的に比較
- **試合レビュー/プレビュー**: AIが生成する詳細な試合分析
- **試合スケジュール**: お気に入りのチームや選手の試合スケジュール
- **AI分析エージェント**: 最新のAI技術で試合結果を予想
- **ランキングシステム**: ポジション別、リーグ別の詳細なランキング

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

1. `env.example` を `.env` にコピー
2. API-FootballのAPIキーを取得: https://www.api-football.com/
3. `.env` ファイルにAPIキーを設定

```bash
cp env.example .env
# .envファイルを編集してAPIキーを設定
```

### 3. サーバーの起動

```bash
npm start
```

## API エンドポイント

### リーグ関連
- `GET /api/leagues` - リーグ一覧を取得
- `GET /api/teams?leagueId={id}` - リーグのチーム一覧を取得

### チーム関連
- `GET /api/teams/:id/stats?leagueId={id}` - チーム統計を取得

### 選手関連
- `GET /api/players?teamId={id}` - チームの選手一覧を取得
- `GET /api/search/players?q={query}` - 選手検索
- `GET /api/players/:id/stats` - 選手統計を取得

## 技術スタック

- **バックエンド**: Node.js, Express.js
- **フロントエンド**: HTML5, CSS3, JavaScript (ES6+)
- **データベース**: API-Football (外部API)
- **チャート**: Chart.js
- **キャッシュ**: Node-Cache

## デプロイ

### Render.com

1. GitHubリポジトリをRender.comに接続
2. 環境変数 `FOOTBALL_API_KEY` を設定
3. ビルドコマンド: `npm install`
4. 起動コマンド: `npm start`

## ライセンス

MIT License