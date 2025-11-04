const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

// .envファイルから直接APIキーを読み込む（フォールバック）
let API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
if (!API_FOOTBALL_KEY || API_FOOTBALL_KEY.length < 30) {
    try {
        const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
        const apiKeyMatch = envFile.match(/API_FOOTBALL_KEY=(.+)/);
        if (apiKeyMatch && apiKeyMatch[1]) {
            API_FOOTBALL_KEY = apiKeyMatch[1].trim();
            console.log('✅ .envファイルからAPIキーを読み込みました');
        }
    } catch (error) {
        console.error('❌ .envファイルの読み込みエラー:', error.message);
    }
}

async function normalizePlayerStats(apiFootballStat) {
    try {
        const stats = apiFootballStat;
        if (!stats || !stats.games) {
            return null;
        }
        
        const normalized = {
            appearances: stats.games.appearences || 0,
            lineups: stats.games.lineups || 0,
            minutes: stats.games.minutes || 0,
            rating: stats.games.rating ? parseFloat(stats.games.rating) : null,
            goals: stats.goals?.total || 0,
            assists: stats.goals?.assists || 0,
            saves: stats.goals?.saves || 0,
            conceded: stats.goals?.conceded || 0,
            yellowCards: stats.cards?.yellow || 0,
            redCards: stats.cards?.red || 0,
            shotsTotal: stats.shots?.total || 0,
            shotsOnTarget: stats.shots?.on || 0,
            passesTotal: stats.passes?.total || 0,
            passesKey: stats.passes?.key || 0,
            passAccuracy: stats.passes?.accuracy || null,
            tackles: stats.tackles?.total || 0,
            blocks: stats.tackles?.blocks || 0,
            interceptions: stats.tackles?.interceptions || 0,
            duelsTotal: stats.duels?.total || 0,
            duelsWon: stats.duels?.won || 0,
            dribblesAttempts: stats.dribbles?.attempts || 0,
            dribblesSuccess: stats.dribbles?.success || 0,
            foulsDraw: stats.fouls?.drawn || 0,
            foulsCommitted: stats.fouls?.committed || 0,
            penalty: {
                won: stats.penalty?.won || null,
                commited: stats.penalty?.committed || null,
                scored: stats.penalty?.scored || 0,
                missed: stats.penalty?.missed || 0,
                saved: stats.penalty?.saved || null
            },
            season: "2025/2026",
            leagueName: stats.league?.name || 'Unknown',
            leagueId: stats.league?.id || null,
            teamName: stats.team?.name || null,
            teamId: stats.team?.id || null,
            source: "api-football-2025",
            lastUpdated: new Date().toISOString()
        };
        return normalized;
    } catch (error) {
        console.error('❌ normalizePlayerStatsエラー:', error.message);
        return null;
    }
}

async function updatePlayerData(playerId, playerName) {
    console.log(`\n🚀 ${playerName} (ID: ${playerId}) の2025年データを更新開始...`);

    // API-Footballから最新データを取得
    try {
        console.log('📡 API-Footballから最新データを取得中...');
        const response = await axios.get(`https://v3.football.api-sports.io/players?season=2025&id=${playerId}`, {
            headers: {
                'x-apisports-key': API_FOOTBALL_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            },
            timeout: 15000
        });

        if (!response.data.response || response.data.response.length === 0) {
            console.error(`❌ API-Footballからデータを取得できませんでした: ${playerName}`);
            return;
        }

        const apiData = response.data.response[0];
        console.log(`✅ API-Footballからデータを取得成功: ${apiData.statistics.length}コンペティション`);

        // データベースを読み込み
        let playersData = [];
        if (fs.existsSync(PLAYERS_FILE)) {
            const data = await fs.promises.readFile(PLAYERS_FILE, 'utf8');
            const parsed = JSON.parse(data);
            playersData = Array.isArray(parsed) ? parsed : (parsed.players || []);
        }

        // 選手を検索（playerIdを優先）
        let playerIndex = playersData.findIndex(p => 
            p.playerId === playerId || p.playerId === String(playerId) || p.playerId === Number(playerId)
        );
        
        // playerIdで見つからない場合はidで検索
        if (playerIndex === -1) {
            playerIndex = playersData.findIndex(p => p.id === `api_${playerId}`);
        }

        if (playerIndex === -1) {
            console.error(`❌ データベースに${playerName} (ID: ${playerId}) が見つかりませんでした`);
            return;
        }

        const player = playersData[playerIndex];
        console.log(`✅ ${player.name} (ID: ${player.playerId}) を検索`);

        // コンペティション別統計を配列形式で作成
        const statsArrayPromises = apiData.statistics.map(async (stat) => {
            return await normalizePlayerStats(stat);
        });
        const statsArray = (await Promise.all(statsArrayPromises)).filter(s => s !== null);

        console.log(`📊 正規化された統計: ${statsArray.length}コンペティション`);
        statsArray.forEach((stat, idx) => {
            console.log(`  ${idx + 1}. ${stat.leagueName}: ${stat.appearances}試合, ${stat.goals}ゴール, チーム: ${stat.teamName}`);
        });

        // 最新のチーム名を取得（最も出場数の多いコンペティションの統計から）
        const mainStats = statsArray.sort((a, b) => (b.appearances || 0) - (a.appearances || 0))[0];
        const latestTeamName = mainStats?.teamName || apiData.statistics[0]?.team?.name || player.currentTeam;
        const latestLeagueName = mainStats?.leagueName || apiData.statistics[0]?.league?.name || player.league;

        // 選手データを更新
        player.currentTeam = latestTeamName;
        player.teamId = statsArray[0]?.teamId || apiData.statistics[0]?.team?.id || player.teamId;
        player.league = latestLeagueName;
        
        // 既存の2025/2026シーズンの統計を削除
        if (Array.isArray(player.stats)) {
            player.stats = player.stats.filter(s => s.season !== '2025/2026' && s.season !== '2025/26' && s.season !== '2025');
        } else {
            player.stats = [];
        }

        // 新しい統計を追加
        player.stats = [...player.stats, ...statsArray];
        player.lastUpdated = new Date().toISOString();

        console.log(`✅ ${playerName}のデータを更新しました`);
        console.log(`   チーム: ${player.currentTeam}`);
        console.log(`   リーグ: ${player.league}`);
        console.log(`   統計: ${player.stats.length}コンペティション`);

        // データを保存
        const outputData = Array.isArray(playersData) ? playersData : { players: playersData };
        await fs.promises.writeFile(PLAYERS_FILE, JSON.stringify(outputData, null, 2));

        return true;
    } catch (error) {
        console.error(`❌ ${playerName}の更新エラー:`, error.message);
        if (error.response) {
            console.error(`   ステータス: ${error.response.status}`);
            console.error(`   エラー: ${JSON.stringify(error.response.data)}`);
        }
        return false;
    }
}

async function main() {
    console.log('🚀 ガルナチョとヴィルツのデータを更新開始...');
    console.log(`🔑 APIキー: ${API_FOOTBALL_KEY ? API_FOOTBALL_KEY.substring(0, 8) + '...' : '未設定'}\n`);

    // 1.2秒の遅延を追加
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // ガルナチョを更新
    await updatePlayerData(284324, 'A. Garnacho');
    await delay(1200);

    // ヴィルツを更新
    await updatePlayerData(203224, 'F. Wirtz');

    console.log('\n============================================================');
    console.log('✅ 更新完了');
    console.log('============================================================');
}

main().catch(console.error);

