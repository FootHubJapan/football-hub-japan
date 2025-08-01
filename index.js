const express = require('express');
const path = require('path');
const dataService = require('./dataService');
const app = express();
const PORT = process.env.PORT || 3000;

// JSONパーサーを有効化
app.use(express.json());

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

// サッカーデータベース
app.get('/database', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'database.html'));
});

// レーダーチャート比較
app.get('/radar', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'radar.html'));
});

// APIエンドポイント
// リーグ一覧を取得
app.get('/api/leagues', async (req, res) => {
  try {
    const country = req.query.country || 'Japan';
    const data = await dataService.getLeagues(country);
    const formattedData = dataService.formatLeagueData(data);
    res.json(formattedData);
  } catch (error) {
    console.error('リーグ取得エラー:', error);
    res.status(500).json({ error: 'リーグデータの取得に失敗しました' });
  }
});

// チーム一覧を取得
app.get('/api/teams', async (req, res) => {
  try {
    const leagueId = req.query.leagueId;
    if (!leagueId) {
      return res.status(400).json({ error: 'リーグIDが必要です' });
    }
    const data = await dataService.getTeams(leagueId);
    const formattedData = dataService.formatTeamData(data);
    res.json(formattedData);
  } catch (error) {
    console.error('チーム取得エラー:', error);
    res.status(500).json({ error: 'チームデータの取得に失敗しました' });
  }
});

// 選手一覧を取得
app.get('/api/players', async (req, res) => {
  try {
    const teamId = req.query.teamId;
    if (!teamId) {
      return res.status(400).json({ error: 'チームIDが必要です' });
    }
    const data = await dataService.getPlayers(teamId);
    const formattedData = dataService.formatPlayerData(data);
    res.json(formattedData);
  } catch (error) {
    console.error('選手取得エラー:', error);
    res.status(500).json({ error: '選手データの取得に失敗しました' });
  }
});

// 選手検索
app.get('/api/search/players', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: '検索クエリが必要です' });
    }
    const data = await dataService.searchPlayers(query);
    const formattedData = dataService.formatPlayerData(data);
    res.json(formattedData);
  } catch (error) {
    console.error('選手検索エラー:', error);
    res.status(500).json({ error: '選手検索に失敗しました' });
  }
});

// 選手統計を取得
app.get('/api/players/:id/stats', async (req, res) => {
  try {
    const playerId = req.params.id;
    const data = await dataService.getPlayerStats(playerId);
    res.json(data);
  } catch (error) {
    console.error('選手統計取得エラー:', error);
    res.status(500).json({ error: '選手統計の取得に失敗しました' });
  }
});

// チーム統計を取得
app.get('/api/teams/:id/stats', async (req, res) => {
  try {
    const teamId = req.params.id;
    const leagueId = req.query.leagueId;
    if (!leagueId) {
      return res.status(400).json({ error: 'リーグIDが必要です' });
    }
    const data = await dataService.getTeamStats(teamId, leagueId);
    res.json(data);
  } catch (error) {
    console.error('チーム統計取得エラー:', error);
    res.status(500).json({ error: 'チーム統計の取得に失敗しました' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});