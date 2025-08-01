// 必要なモジュールをインポート
const express = require('express'); // Webサーバーフレームワーク
const { Client, middleware } = require('@line/bot-sdk'); // LINE Bot SDK (middlewareも追加)
const axios = require('axios'); // HTTPクライアント
require('dotenv').config(); // 環境変数をロード (.envファイルから)

// アプリケーションとポートの設定
const app = express();
const PORT = process.env.PORT || 3000; // 環境変数PORTが設定されていなければ3000番ポートを使用

// Content Security Policy ヘッダーを設定
app.use((req, res, next) => {
  // CSPヘッダーを完全に無効化（開発環境用）
  // res.setHeader('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; img-src * data: blob:; font-src * data:; connect-src *; frame-src *; object-src *;");
  
  // または、CSPヘッダーを削除して完全に無効化
  res.removeHeader('Content-Security-Policy');
  next();
});

// 静的ファイルの提供
app.use(express.static('public'));

// favicon.icoの404エラーを修正
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No Content
});

// LINE Botの設定
// 環境変数からチャンネルアクセストークンとチャンネルシークレットを取得
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// LINE Botクライアントの初期化
const client = new Client(lineConfig);

// API-Footballの設定
// 環境変数からAPIキーを取得
const API_KEY = process.env.API_FOOTBALL_KEY;
const API_BASE_URL = 'https://v3.football.api-sports.io'; // API-FootballのベースURL

// --- API-Footballにリクエストする共通関数 ---
/**
 * API-FootballにGETリクエストを送信します。
 * @param {string} endpoint - APIのエンドポイント (例: '/status', '/players')
 * @param {object} [params={}] - クエリパラメータ (オプション)
 * @returns {Promise<object>} APIからの応答データ
 */
async function callApiFootball(endpoint, params = {}) {
  // APIキーが設定されているか確認
  if (!API_KEY) {
    console.error('❌ エラー: API_FOOTBALL_KEYが設定されていません。APIリクエストは実行されません。');
    throw new Error('API_FOOTBALL_KEYが設定されていません。');
  }

  try {
    console.log(`🚀 API-Football リクエスト開始: ${API_BASE_URL}${endpoint} (パラメータ: ${JSON.stringify(params)})`);

    const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'x-apisports-key': API_KEY, // API-Football v3の主要なAPIキーヘッダー
        // もしRapidAPI経由で利用している場合は、以下のヘッダーも必要
        // 'x-rapidapi-key': API_KEY,
        // 'x-rapidapi-host': 'v3.football.api-sports.io'
      },
      params: params, // クエリパラメータを設定
      timeout: 10000 // タイムアウトを10秒に設定
    });

    console.log(`✅ API応答成功: ステータス ${response.status}`);
    // 応答データが大きすぎる場合を考慮し、一部のみログに出力
    console.log(`📊 応答データ (一部): ${JSON.stringify(response.data).substring(0, 500)}...`);

    return response.data; // 応答データを返す

  } catch (error) {
    // エラーハンドリング
    if (axios.isAxiosError(error)) { // Axiosのエラーか確認
      if (error.response) {
        // サーバーが応答したが、ステータスコードが2xxの範囲外の場合 (例: 400, 401, 403, 404, 500)
        console.error(`❌ API-Football エラー (HTTP ${error.response.status}):`, error.response.data);
        // 特に401 (Unauthorized) はAPIキーが不正な可能性が高い
        if (error.response.status === 401 || error.response.status === 403) {
          throw new Error(`API認証エラー: APIキーが不正またはアクセス権限がありません。`);
        }
        throw new Error(`APIエラー: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        // リクエストは送信されたが応答がなかった場合 (例: ネットワークエラー、DNS解決失敗、タイムアウト)
        console.error(`❌ API-Football エラー: 応答なし (リクエスト送信済み)`, error.message);
        throw new Error(`ネットワークエラーまたはタイムアウト: ${error.message}`);
      } else {
        // リクエストの設定時に発生したエラー (例: 不正なURL)
        console.error(`❌ Axiosリクエスト設定エラー:`, error.message);
        throw new Error(`リクエスト設定エラー: ${error.message}`);
      }
    } else {
      // その他の予期せぬエラー (Axios以外のエラー)
      console.error(`❌ 予期せぬエラー (callApiFootball):`, error);
      throw new Error(`予期せぬエラー: ${error.message}`);
    }
  }
}

// --- LINE Botメッセージ処理関数 ---
/**
 * LINE Botからのメッセージイベントを処理します。
 * @param {object} event - LINEメッセージイベントオブジェクト
 */
async function handleMessage(event) {
  // テキストメッセージ以外は無視
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text.toLowerCase(); // ユーザーのメッセージを小文字に変換
  let replyText = ''; // 返信するテキスト

  try {
    if (userMessage === 'test' || userMessage === 'テスト') {
      // API接続テスト
      console.log('🧪 API接続テスト開始');
      const data = await callApiFootball('/status'); // /statusエンドポイントを呼び出し

      // API-Footballのstatusエンドポイントからのレスポンス構造に合わせた表示
      // API-Football v3の/statusエンドポイントのレスポンスは以下の形式が一般的
      // { "get": "status", "parameters": [], "errors": [], "results": 1, "response": { "account": ..., "subscription": ..., "requests": ... } }
      replyText = `✅ API-Football 接続成功！
📊 リクエスト使用量: ${data.response?.requests?.current || 'N/A'} 件 (合計: ${data.response?.requests?.limit || 'N/A'} 件)
🔑 APIキー末尾: ...${API_KEY.slice(-8)}
📅 応答日時: ${new Date().toLocaleString('ja-JP')}
🌐 エンドポイント: ${API_BASE_URL}`;
      
    } else if (userMessage.includes('選手') || userMessage.includes('player')) {
      // 選手検索
      const playerName = userMessage.replace(/選手|player/g, '').trim(); // 選手名を取得
      if (!playerName) {
        replyText = '選手名を指定してください（例: メッシ 選手）';
      } else {
        console.log(`🔍 選手検索: ${playerName}`);
        // /playersエンドポイントを呼び出し、検索クエリとシーズンを指定
        const data = await callApiFootball('/players', {
          search: playerName,
          season: 2024 // 検索したいシーズンを指定 (例: 2024年シーズン)
        });

        if (data.response && data.response.length > 0) {
          // 最初の選手情報を取得
          const playerInfo = data.response[0].player;
          replyText = `⚽ 選手情報
👤 名前: ${playerInfo.name || '不明'}
🎂 年齢: ${playerInfo.age || '不明'}歳
🏃 ポジション: ${playerInfo.position || '不明'}
🏳️ 国籍: ${playerInfo.nationality || '不明'}`;
        } else {
          replyText = `❌ 選手「${playerName}」が見つかりませんでした`;
        }
      }

    } else if (userMessage === 'ライブ' || userMessage === 'live') {
      // ライブスコア
      console.log('🔴 ライブスコア取得');
      // /fixturesエンドポイントを呼び出し、ライブ中の試合を取得
      const data = await callApiFootball('/fixtures', {
        live: 'all' // 全てのライブ中の試合
      });

      if (data.response && data.response.length > 0) {
        // 最大5件の試合情報を表示
        const matches = data.response.slice(0, 5);
        replyText = '🔴 ライブ試合 (最新5件)\n\n' + matches.map(match =>
          `${match.teams.home.name} ${match.goals.home || 0} - ${match.goals.away || 0} ${match.teams.away.name}\n⏰ ${match.fixture.status.elapsed || 'N/A'}' ${match.fixture.status.long || 'N/A'}`
        ).join('\n\n');
      } else {
        replyText = '現在ライブ中の試合はありません';
      }

    } else if (userMessage === 'help' || userMessage === 'ヘルプ') {
      // ヘルプメッセージ
      replyText = `⚽ Football Bot コマンド

🧪 test / テスト - API接続テスト
🔍 [選手名] 選手 - 選手検索 (例: メッシ 選手)
🔴 ライブ / live - ライブスコア
❓ help / ヘルプ - このヘルプを表示`;

    } else {
      // 不明なコマンドの場合のデフォルト応答
      console.log('🔄 不明なコマンド。ヘルプメッセージを推奨。');
      replyText = `⚽ Football Hub Japan BOT
「help」または「ヘルプ」でコマンド一覧を表示します`;
    }

  } catch (error) {
    console.error('❌ メッセージ処理中のエラー:', error);
    // エラーメッセージをユーザーに返す
    replyText = `❌ エラーが発生しました
💡 「test」コマンドで接続を確認してください。
詳細: ${error.message}`;
  }

  // LINEにメッセージを返信
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText
  });
}

// --- Expressサーバーの設定 ---

// Webhookエンドポイント
// LINEからのWebhookリクエストを受け取る
// `middleware`関数を使って署名検証とイベントのパースを自動的に行う
app.post('/webhook', middleware(lineConfig), (req, res) => {
  // `req.body.events` にはLINEからのイベント配列が含まれる
  if (req.body.events) {
    Promise.all(req.body.events.map(handleMessage))
      .then(() => res.status(200).end())
      .catch((err) => {
        console.error('Webhookイベント処理エラー:', err);
        res.status(500).end(); // エラー時は500を返す
      });
  } else {
    // イベントがない場合は200 OKを返す
    res.status(200).end();
  }
});

// ヘルスチェックエンドポイント
// サーバーが正常に動作しているか確認するために使用
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 Football Bot サーバー起動: ポート${PORT}`);
  console.log(`🔑 API-Footballキー: ${API_KEY ? '設定済み' : '未設定'}`);
  console.log(`📱 LINEチャネルアクセストークン: ${lineConfig.channelAccessToken ? '設定済み' : '未設定'}`);
  console.log(`📱 LINEチャネルシークレット: ${lineConfig.channelSecret ? '設定済み' : '未設定'}`);

  // 環境変数の不足を警告
  if (!API_KEY) {
    console.warn('⚠️ 警告: 環境変数 API_FOOTBALL_KEY が設定されていません。APIリクエストが失敗します。');
  }
  if (!lineConfig.channelAccessToken) {
    console.warn('⚠️ 警告: 環境変数 LINE_CHANNEL_ACCESS_TOKEN が設定されていません。LINEからのメッセージを受信できません。');
  }
  if (!lineConfig.channelSecret) {
    console.warn('⚠️ 警告: 環境変数 LINE_CHANNEL_SECRET が設定されていません。LINEからのメッセージを受信できません。');
  }
});
