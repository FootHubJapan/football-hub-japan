# Football Hub Japan

サッカー選手データベースと検索システム

## 新機能: API-Football統合とハイブリッドAPI戦略

### 🚀 実装された改善点

#### 1. リクエスト制限エラーの解決（429エラー対策）
- **レート制限機能**: 各APIの制限に応じた自動制御
- **リトライ機能**: 指数バックオフによる自動リトライ
- **並列処理**: 複数APIからの同時データ取得

#### 2. ハイブリッドAPI戦略
- **Football-data.org**: 主要欧州リーグ（PL, La Liga, Serie A, Bundesliga, Ligue 1）
- **API-Football**: Jリーグ、アジアリーグ、詳細選手統計
- **統合検索**: 両方のAPIからデータを取得し、重複を除去

#### 3. 新しいエンドポイント

##### ハイブリッド検索
```
GET /api/hybrid/players/search-v2?query=久保建英&league=39&country=JP
```

##### アジアリーグ
```
GET /api/asian-leagues/leagues-v2
```

##### 日本語選手検索
```
GET /api/japanese-players/search-v2?query=三笘薫&includeOverseas=true
```

##### 詳細統計
```
GET /api/players/123/detailed-stats-v2?season=2024&league=39
```

### 📊 期待される改善効果

#### データ品質の向上
- より多くの日本語選手データ
- より詳細な統計情報
- より広範なリーグカバレッジ

#### パフォーマンスの改善
- リクエスト制限エラーの削減
- より高速なデータ取得
- より安定したサービス

#### ユーザー体験の向上
- より正確な検索結果
- より豊富な選手情報
- より快適な検索体験

### 🔧 セットアップ

#### 1. 環境変数の設定
```bash
# .env ファイルを作成
cp env.example .env

# APIキーを設定
API_FOOTBALL_KEY=your-api-football-key-here
FOOTBALL_DATA_API_KEY=your-football-data-api-key-here
```

#### 2. APIキーの取得
- **API-Football**: https://www.api-football.com/
- **Football-data.org**: https://www.football-data.org/

#### 3. サーバーの起動
```bash
npm install
node index.js
```

### 📈 レート制限設定

```bash
# 環境変数でカスタマイズ可能
FOOTBALL_DATA_RATE_LIMIT=10  # 1分あたりのリクエスト数
API_FOOTBALL_RATE_LIMIT=30   # 1分あたりのリクエスト数
```

### 🔍 使用例

#### 日本語選手の検索
```javascript
// 久保建英を検索（Jリーグ + 海外）
fetch('/api/japanese-players/search-v2?query=久保建英&includeOverseas=true')
  .then(response => response.json())
  .then(data => console.log(data));
```

#### ハイブリッド検索
```javascript
// 両方のAPIから検索
fetch('/api/hybrid/players/search-v2?query=久保建英')
  .then(response => response.json())
  .then(data => console.log(data));
```

#### 詳細統計の取得
```javascript
// 選手の詳細統計
fetch('/api/players/123/detailed-stats-v2?season=2024&league=39')
  .then(response => response.json())
  .then(data => console.log(data));
```

### 🛠️ 技術的な改善点

1. **キャッシュ機能**: 30分間のキャッシュでAPI呼び出しを削減
2. **エラーハンドリング**: 包括的なエラー処理とフォールバック
3. **並列処理**: Promise.allを使用した効率的なデータ取得
4. **レート制限**: 各APIの制限に応じた自動制御

### 📝 既存の機能

- Firebase統合
- リアルタイムデータ更新
- 管理者ダッシュボード
- データベース管理機能

## ライセンス

MIT License