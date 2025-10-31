const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;

async function normalizePlayerStats(apiFootballStat) {
    try {
        const stats = apiFootballStat;
        if (!stats || !stats.games) {
            console.error('❌ 無効な統計データ:', apiFootballStat);
            return null;
        }
        
        const normalized = {
        appearances: stats.games.appearences || 0,
        lineups: stats.games.lineups,
        minutes: stats.games.minutes,
        rating: stats.games.rating,
        goals: stats.goals.total,
        assists: stats.goals.assists,
        saves: stats.goals.saves || 0,
        conceded: stats.goals.conceded || 0,
        yellowCards: stats.cards.yellow || 0,
        redCards: stats.cards.red || 0,
        shotsTotal: stats.shots.total || 0,
        shotsOnTarget: stats.shots.on || 0,
        passesTotal: stats.passes.total || 0,
        passesKey: stats.passes.key || 0,
        passAccuracy: stats.passes.accuracy || null,
        tackles: stats.tackles.total || 0,
        blocks: stats.tackles.blocks || 0,
        interceptions: stats.tackles.interceptions || 0,
        duelsTotal: stats.duels.total || 0,
        duelsWon: stats.duels.won || 0,
        dribblesAttempts: stats.dribbles.attempts || 0,
        dribblesSuccess: stats.dribbles.success || 0,
        foulsDraw: stats.fouls.drawn || 0,
        foulsCommitted: stats.fouls.committed || 0,
        penalty: {
            won: stats.penalty.won || null,
            commited: stats.penalty.committed || null,
            scored: stats.penalty.scored || 0,
            missed: stats.penalty.missed || 0,
            saved: stats.penalty.saved || null
        },
        season: "2025/2026",
        leagueName: stats.league.name,
        leagueId: stats.league.id,
        teamName: stats.team.name,
        teamId: stats.team.id,
        source: "api-football-2025",
        lastUpdated: new Date().toISOString()
        };
        return normalized;
    } catch (error) {
        console.error('❌ normalizePlayerStatsエラー:', error.message);
        return null;
    }
}

async function updateHaalandData() {
    console.log('🚀 ハーランドの2025年データを更新開始...');

    // API-Footballから最新データを取得
    try {
        console.log('📡 API-Footballから最新データを取得中...');
        const response = await axios.get(`https://v3.football.api-sports.io/players?season=2025&id=1100`, {
            headers: {
                'x-apisports-key': API_FOOTBALL_KEY
            }
        });

        if (!response.data.response || response.data.response.length === 0) {
            console.error('❌ API-Footballからデータを取得できませんでした');
            return;
        }

        const apiData = response.data.response[0];
        console.log(`✅ API-Footballからデータを取得成功: ${apiData.statistics.length}コンペティション`);
        console.log('🔍 最初の統計データ構造:', JSON.stringify(apiData.statistics[0], null, 2).substring(0, 500));

        // データベースを読み込み
        let playersData = [];
        if (fs.existsSync(PLAYERS_FILE)) {
            const data = await fs.promises.readFile(PLAYERS_FILE, 'utf8');
            const parsed = JSON.parse(data);
            playersData = Array.isArray(parsed) ? parsed : (parsed.players || []);
        }

        // ハーランドを検索
        const haalandIndex = playersData.findIndex(p => 
            p.playerId === 1100 || p.id === 'api_1100' || (p.name && p.name.includes('Haaland'))
        );

        if (haalandIndex === -1) {
            console.error('❌ データベースにハーランドが見つかりませんでした');
            return;
        }

        const haaland = playersData[haalandIndex];
        console.log(`✅ ハーランドを検索: ${haaland.name}`);

        // コンペティション別統計を配列形式で作成
        const statsArrayPromises = apiData.statistics.map(async (stat) => {
            try {
                const normalized = await normalizePlayerStats(stat);
                if (normalized) {
                    console.log('🔍 正規化された統計:', normalized.leagueName, normalized.appearances, normalized.goals);
                }
                return normalized;
            } catch (error) {
                console.error('❌ 統計データの正規化エラー:', error.message, stat);
                return null;
            }
        });
        const statsArray = (await Promise.all(statsArrayPromises)).filter(s => s !== null);
        
        // 合計統計を計算
        const totalStats = {
            appearances: statsArray.reduce((sum, s) => sum + s.appearances, 0),
            lineups: statsArray.reduce((sum, s) => sum + s.lineups, 0),
            minutes: statsArray.reduce((sum, s) => sum + s.minutes, 0),
            goals: statsArray.reduce((sum, s) => sum + s.goals, 0),
            assists: statsArray.reduce((sum, s) => sum + s.assists, 0),
            yellowCards: statsArray.reduce((sum, s) => sum + s.yellowCards, 0),
            redCards: statsArray.reduce((sum, s) => sum + s.redCards, 0),
            shotsTotal: statsArray.reduce((sum, s) => sum + s.shotsTotal, 0),
            shotsOnTarget: statsArray.reduce((sum, s) => sum + s.shotsOnTarget, 0),
            passesTotal: statsArray.reduce((sum, s) => sum + s.passesTotal, 0),
            passesKey: statsArray.reduce((sum, s) => sum + s.passesKey, 0),
            tackles: statsArray.reduce((sum, s) => sum + s.tackles, 0),
            interceptions: statsArray.reduce((sum, s) => sum + s.interceptions, 0),
            duelsTotal: statsArray.reduce((sum, s) => sum + s.duelsTotal, 0),
            duelsWon: statsArray.reduce((sum, s) => sum + s.duelsWon, 0),
            dribblesAttempts: statsArray.reduce((sum, s) => sum + s.dribblesAttempts, 0),
            dribblesSuccess: statsArray.reduce((sum, s) => sum + s.dribblesSuccess, 0),
            foulsDraw: statsArray.reduce((sum, s) => sum + s.foulsDraw, 0),
            foulsCommitted: statsArray.reduce((sum, s) => sum + s.foulsCommitted, 0)
        };

        // 平均レーティングを計算
        const validRatings = statsArray.filter(s => s.rating && !isNaN(parseFloat(s.rating))).map(s => parseFloat(s.rating));
        totalStats.rating = validRatings.length > 0 
            ? (validRatings.reduce((sum, r) => sum + r, 0) / validRatings.length).toFixed(2)
            : null;

        // プレミアリーグの統計を取得（メイン統計として使用）
        const premierLeagueStat = statsArray.find(s => s.leagueName === 'Premier League');
        
        // データを更新
        haaland.stats = statsArray; // コンペティション別統計を配列形式で保存
        haaland.lastUpdated = new Date().toISOString();
        
        // 基本情報も更新（必要に応じて）
        if (apiData.player) {
            haaland.height = apiData.player.height || haaland.height;
            haaland.weight = apiData.player.weight || haaland.weight;
            haaland.age = apiData.player.age || haaland.age;
        }

        playersData[haalandIndex] = haaland;

        // データを保存
        const outputData = Array.isArray(JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'))) 
            ? playersData 
            : { players: playersData };
        
        fs.writeFileSync(PLAYERS_FILE, JSON.stringify(outputData, null, 2));

        console.log('\n============================================================');
        console.log('✅ ハーランドの2025年データ更新完了');
        console.log(`📊 コンペティション数: ${statsArray.length}`);
        console.log(`📊 総出場試合数: ${totalStats.appearances}試合`);
        console.log(`📊 総ゴール数: ${totalStats.goals}得点`);
        console.log(`📊 総アシスト数: ${totalStats.assists}回`);
        console.log(`📊 プレミアリーグ: ${premierLeagueStat ? premierLeagueStat.appearances + '試合' : 'N/A'}`);
        console.log(`📁 保存先: ${PLAYERS_FILE}`);
        console.log('============================================================');

        // コンペティション別内訳を表示
        console.log('\n📈 コンペティション別内訳:');
        statsArray.forEach(stat => {
            console.log(`  - ${stat.leagueName}: ${stat.appearances}試合 (${stat.goals}G ${stat.assists}A)`);
        });

    } catch (error) {
        console.error('❌ エラー:', error.message);
        if (error.response) {
            console.error('APIレスポンス:', error.response.status, error.response.data);
        }
    }
}

updateHaalandData();

