const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || process.env.RAPIDAPI_KEY;

if (!API_FOOTBALL_KEY) {
    console.error('❌ API_FOOTBALL_KEY環境変数が設定されていません');
    process.exit(1);
}

const SEASONS = [];
for (let year = 2000; year <= 2025; year++) {
    SEASONS.push(year);
}
const REQUEST_DELAY = 200; // 0.2秒

async function fetchWithDelay(url) {
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
    
    const response = await axios.get(url, {
        headers: {
            'x-apisports-key': API_FOOTBALL_KEY,
            'x-rapidapi-host': 'v3.football.api-sports.io'
        },
        timeout: 15000
    });
    
    if (response.data.errors && response.data.errors.token) {
        const error = new Error('APIキーエラー');
        error.isRequestLimit = false;
        throw error;
    }
    
    if (response.data.errors && response.data.errors.requests) {
        const error = new Error('APIリクエスト制限に達しました');
        error.isRequestLimit = true;
        throw error;
    }
    
    return response.data;
}

async function getPlayerCareerStats(playerId, existingCareerStats = []) {
    const careerStats = [...existingCareerStats];
    
    const existingSeasons = new Set();
    existingCareerStats.forEach(stat => {
        const seasonStr = stat.season || '';
        const seasonYear = parseInt(seasonStr.split('/')[0]);
        if (!isNaN(seasonYear)) {
            existingSeasons.add(seasonYear);
        }
    });
    
    console.log(`  📊 既存のシーズン数: ${existingSeasons.size}`);
    
    const missingSeasons = SEASONS.filter(season => !existingSeasons.has(season));
    
    if (missingSeasons.length === 0) {
        console.log(`  ✅ すべてのシーズンのデータが既に存在します`);
        return careerStats;
    }
    
    console.log(`  🔄 不足しているシーズン: ${missingSeasons.length}シーズン`);
    
    for (const season of missingSeasons) {
        try {
            const url = `https://v3.football.api-sports.io/players?season=${season}&id=${playerId}`;
            let data;
            
            try {
                data = await fetchWithDelay(url);
            } catch (error) {
                if (error.isRequestLimit) {
                    throw error;
                }
                continue;
            }
            
            if (!data || !data.response || data.response.length === 0) {
                console.log(`    ⚠️ シーズン${season}: データなし`);
                continue;
            }
            
            const playerData = data.response[0];
            
            if (playerData.statistics && Array.isArray(playerData.statistics)) {
                playerData.statistics.forEach(stat => {
                    const games = stat.games || {};
                    const goals = stat.goals || {};
                    const league = stat.league || {};
                    
                    // データがある場合のみ追加
                    if (games.appearences > 0 || goals.total > 0 || goals.assists > 0) {
                        careerStats.push({
                            season: `${season}/${season + 1}`,
                            leagueName: league.name || 'Unknown',
                            leagueId: league.id || null,
                            teamName: stat.team?.name || 'Unknown',
                            teamId: stat.team?.id || null,
                            matches: games.appearences || 0,
                            goals: goals.total || 0,
                            assists: goals.assists || 0,
                            rating: games.rating ? parseFloat(games.rating) : null,
                            appearances: games.appearences || 0,
                            minutes: games.minutes || 0,
                            source: 'api-football',
                            lastUpdated: new Date().toISOString()
                        });
                        console.log(`    ✅ シーズン${season}: ${league.name || 'Unknown'} - ${games.appearences || 0}試合, ${goals.total || 0}ゴール`);
                    }
                });
            } else {
                console.log(`    ⚠️ シーズン${season}: 統計データなし`);
            }
        } catch (error) {
            if (error.isRequestLimit) {
                throw error;
            }
            console.error(`  ⚠️ シーズン${season}のデータ取得エラー:`, error.message);
        }
    }
    
    return careerStats;
}

async function updateBurkardt() {
    console.log('🚀 J. Burkardtのキャリアスタッツを更新開始...\n');
    
    let playersData = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
    let players = Array.isArray(playersData) ? playersData : (playersData.players || []);
    
    const burkardtIndex = players.findIndex(p => p.id === 'api_25926' || p.playerId === 25926);
    
    if (burkardtIndex === -1) {
        console.error('❌ J. Burkardtが見つかりません');
        return;
    }
    
    const player = players[burkardtIndex];
    const playerId = player.playerId || 25926;
    
    console.log(`📊 ${player.name} (ID: ${playerId})`);
    
    try {
        const existingCareerStats = player.careerStats && Array.isArray(player.careerStats) ? player.careerStats : [];
        console.log(`  🔄 キャリアスタッツを取得中...`);
        
        const careerStats = await getPlayerCareerStats(playerId, existingCareerStats);
        
        console.log(`  ✅ キャリアスタッツ取得: ${careerStats.length}レコード`);
        
        // 選手データを更新
        players[burkardtIndex] = {
            ...player,
            careerStats: careerStats,
            lastUpdated: new Date().toISOString()
        };
        
        // 保存
        const updatedData = Array.isArray(playersData) ? players : { ...playersData, players };
        fs.writeFileSync(PLAYERS_FILE, JSON.stringify(updatedData, null, 2));
        
        console.log('\n✅ 更新完了！');
        console.log(`📊 キャリアスタッツ数: ${careerStats.length}シーズン`);
        if (careerStats.length > 0) {
            console.log(`📊 最新シーズン: ${careerStats[careerStats.length - 1].season}`);
            console.log(`📊 最古シーズン: ${careerStats[0].season}`);
        }
    } catch (error) {
        console.error(`\n❌ エラー:`, error.message);
        if (error.isRequestLimit) {
            console.error('APIリクエスト制限に達しました。しばらく待ってから再実行してください。');
        }
    }
}

updateBurkardt();

