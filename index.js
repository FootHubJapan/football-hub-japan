const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// 開発用CSP（本番は厳しく！）
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;");
  next();
});

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));

// ルートでindex.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});