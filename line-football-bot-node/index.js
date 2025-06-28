const express = require('express');
const { Client } = require('@line/bot-sdk');
const axios = require('axios');
require('dotenv').config();

// デバッグ用
console.log('🔍 環境変数デバッグ:');
console.log('API_FOOTBALL_KEY:', process.env.API_FOOTBALL_KEY);
console.log('LINE_CHANNEL_ACCESS_TOKEN:', process.env.LINE_CHANNEL_ACCESS_TOKEN ? '設定済み' : '未設定');

const app = express();
const PORT = process.env.PORT || 3000;

// LINE Bot設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new Client(config);

// API-Football設定
const API_KEY = process.env.API_FOOTBALL_KEY;
const API_BASE_URL = 'https://v3.football.api-sports.io';

// API-Footballにリクエストする関数
async function callApiFootball(endpoint, params = {}) {
  try {
    console.log(`🚀 API-Football リクエスト開始: ${endpoint}`);
    
    const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'x-apisports-key': API_KEY
      },
      params: params,
      timeout: 10000
    });
    
    console.log(`✅ API応答成功: ${response.status}`);
    console.log(`📊 応答データ: ${JSON.stringify(response.data).substring(0, 200)}...`);
    
    return response.data;
    
  } catch (error) {
    console.error(`❌ API-Football エラー:`, error.response?.data || error.message);
    throw error;
  }
}

// メッセージ処理
async function handleMessage(event) {
  const message = event.message.text.toLowerCase();
  let replyText = '';
  
  try {
    if (message === 'test' || message === 'テスト') {
      // APIテスト - 確実にリクエストが飛ぶ
      console.log('🧪 API接続テスト開始');
      const data = await callApiFootball('/status');
      
      replyText = `✅ API-Football 接続成功！
📊 リクエスト使用量: ${data.results || 'データなし'}
🔑 APIキー: ...${API_KEY.slice(-8)}
📅 日付: ${new Date().toLocaleString('ja-JP')}
🌐 エンドポイント: ${API_BASE_URL}`;
      
    } else if (message.includes('選手') || message.includes('player')) {
      // 選手検索 - リクエスト発生
      const playerName = message.replace(/選手|player/g, '').trim() || 'messi';
      console.log(`🔍 選手検索: ${playerName}`);
      
      const data = await callApiFootball('/players', {
        search: playerName,
        season: 2024
      });
      
      if (data.response && data.response.length > 0) {
        const player = data.response[0].player;
        replyText = `⚽ 選手情報
👤 名前: ${player.name}
🎂 年齢: ${player.age}歳
🏃 ポジション: ${player.position || '不明'}
🏳️ 国籍: ${player.nationality}`;
      } else {
        replyText = `❌ 選手「${playerName}」が見つかりませんでした`;
      }
      
    } else if (message === 'ライブ' || message === 'live') {
      // ライブスコア - リクエスト発生
      console.log('🔴 ライブスコア取得');
      
      const data = await callApiFootball('/fixtures', {
        live: 'all'
      });
      
      if (data.response && data.response.length > 0) {
        const matches = data.response.slice(0, 5);
        replyText = '🔴 ライブ試合\n\n' + matches.map(match => 
          `${match.teams.home.name} ${match.goals.home} - ${match.goals.away} ${match.teams.away.name}\n⏰ ${match.fixture.status.elapsed}'`
        ).join('\n\n');
      } else {
        replyText = '現在ライブ中の試合はありません';
      }
      
    } else if (message === 'help' || message === 'ヘルプ') {
      replyText = `⚽ Football Bot コマンド

🧪 test - API接続テスト
🔍 [選手名] + 選手 - 選手検索
🔴 ライブ - ライブスコア
❓ help - このヘルプ

例: 
「メッシ 選手」
「ライブ」
「test」`;
      
    } else {
      // デフォルト応答でもAPIテスト
      console.log('🔄 デフォルト応答でAPIテスト実行');
      await callApiFootball('/status');
      
      replyText = `⚽ Football Hub Japan BOT
「help」でコマンド一覧を表示します
API接続テスト完了！`;
    }
    
  } catch (error) {
    console.error('❌ メッセージ処理エラー:', error);
    replyText = `❌ エラーが発生しました
💡 「test」コマンドで接続を確認してください`;
  }
  
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText
  });
}

// Webhook設定 - 修正版
app.use('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.get('X-Line-Signature');
  
  try {
    const events = JSON.parse(req.body.toString());
    
    if (events.events) {
      events.events.forEach(event => {
        if (event.type === 'message' && event.message.type === 'text') {
          handleMessage(event);
        }
      });
    }
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error('Webhook エラー:', error);
    res.status(400).send('Bad Request');
  }
});

// ヘルスチェック - 修正版
app.get('/', (req, res) => {
  res.send(`⚽ Football Hub Japan BOT (Node.js版)
🕐 起動時間: ${new Date().toLocaleString('ja-JP')}
🔑 APIキー設定: ${API_KEY ? '✅' : '❌'}
📱 LINE設定: ${config.channelAccessToken ? '✅' : '❌'}`);
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 Football Bot サーバー起動: ポート${PORT}`);
  console.log(`🔑 APIキー: ${API_KEY ? '設定済み' : '未設定'}`);
  console.log(`📱 LINE設定: ${config.channelAccessToken ? '設定済み' : '未設定'}`);
});