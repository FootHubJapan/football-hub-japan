const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// CSPヘッダーを完全に無効化（開発環境用）
app.use((req, res, next) => {
  // CSPヘッダーを削除して完全に無効化
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('X-Content-Type-Options');
  res.removeHeader('X-Frame-Options');
  res.removeHeader('X-XSS-Protection');
  
  // すべてのリソースを許可するCSPを設定
  res.setHeader('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval' 'unsafe-hashes' data: blob:; script-src * 'unsafe-inline' 'unsafe-eval' 'unsafe-hashes'; style-src * 'unsafe-inline'; img-src * data: blob:; font-src * data:; connect-src *; frame-src *; object-src *;");
  next();
});

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));

// ルートでindex.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ログインページ
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ダッシュボード（ログイン後）
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});