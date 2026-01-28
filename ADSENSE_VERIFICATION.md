# Google AdSense 検証手順

## 目的
本番環境（Render）で配信されるHTMLにAdSenseタグが確実に含まれていることを確認する。

## 検証手順

### 1. ページソースでの確認
1. ブラウザで `https://football-hub-japan-ubzb.onrender.com/` にアクセス
2. ページ上で右クリック → 「ページのソースを表示」
3. 検索機能（`Cmd+F` / `Ctrl+F`）で以下を検索：
   - `ca-pub-6574544891375303` → **見つかること**
   - `adsbygoogle` → **見つかること**

### 2. DevTools Networkタブでの確認
1. F12でDevToolsを開く
2. Networkタブを選択
3. フィルタを「Doc」に設定
4. ページをリロード（`Cmd+R` / `Ctrl+R`）
5. `football-hub-japan-ubzb.onrender.com`（Document）をクリック
6. **Responseタブ**を選択
7. 検索バーで以下を検索：
   - `ca-pub-6574544891375303` → **見つかること**
   - `adsbygoogle` → **見つかること**
   - `googletagmanager.com` → **見つかること**（GA4用）

### 3. Networkタブでスクリプトの読み込み確認
1. Networkタブでフィルタを「JS」に設定
2. ページをリロード
3. `adsbygoogle.js` のリクエストが表示されること
4. ステータスが **200** であること
5. `googletagmanager.com` のリクエストも **200** であること

### 4. ads.txtの確認
1. ブラウザで `https://football-hub-japan-ubzb.onrender.com/ads.txt` にアクセス
2. 以下の内容が表示されること：
   ```
   google.com, pub-6574544891375303, DIRECT, f08c47fec0942fa0
   ```

## 期待される結果

### ✅ 成功条件
- ページソースに `ca-pub-6574544891375303` が含まれる
- Network Responseタブに `adsbygoogle.js?client=ca-pub-6574544891375303` が含まれる
- `adsbygoogle.js` が200で読み込まれる
- `/ads.txt` が正しく表示される

### ❌ 失敗時の確認事項
1. **デプロイが完了しているか**
   - Render.comダッシュボードで最新デプロイのステータスを確認
   - 「Live」になっていること

2. **キャッシュの問題**
   - ハードリロード: `Cmd+Shift+R` (Mac) / `Ctrl+Shift+F5` (Windows)
   - DevToolsで「Disable cache」にチェックを入れて再読み込み

3. **ルーティングの問題**
   - Render.comのログで `[ROUTE /] Serving index.html from:` が表示されること
   - エラーログがないこと

## トラブルシューティング

### コードが見つからない場合
1. 変更をコミット・プッシュしているか確認
   ```bash
   git status
   git log --oneline -5
   ```

2. Render.comでデプロイを再実行
   - 「Manual Deploy」→「Deploy latest commit」

3. デプロイログを確認
   - Render.comダッシュボード → 「Logs」タブ
   - `[ROUTE /]` のログが表示されること

### ads.txtが表示されない場合
1. `/ads.txt`ルートが正しく設定されているか確認
2. `public/ads.txt`ファイルが存在するか確認
3. Render.comのログでエラーがないか確認

## 参考
- AdSenseコードは `<meta charset>` の直後に配置
- すべてのHTMLファイル（22ファイル）にコードが含まれている
- Expressのルーティングで `/` は `public/index.html` を配信
