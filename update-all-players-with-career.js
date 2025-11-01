const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
// APIキーを読み込み（環境変数または.envファイルから）
let API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;

// .envファイルから直接読み込む（dotenvが正しく動作しない場合のフォールバック）
if (!API_FOOTBALL_KEY || API_FOOTBALL_KEY.length < 30) {
    try {
        const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
        const match = envContent.match(/API_FOOTBALL_KEY=(.+)/);
        if (match && match[1]) {
            API_FOOTBALL_KEY = match[1].trim();
            console.log('✅ .envファイルからAPIキーを読み込みました');
        }
    } catch (e) {
        console.log('⚠️ .envファイルの読み込みに失敗:', e.message);
    }
}

if (!API_FOOTBALL_KEY || API_FOOTBALL_KEY.length < 30) {
    console.error('❌ API_FOOTBALL_KEY環境変数が設定されていません');
    console.error('   現在のキー長さ:', API_FOOTBALL_KEY ? API_FOOTBALL_KEY.length : 0);
    console.error('   環境変数を設定するか、.envファイルにAPI_FOOTBALL_KEYを追加してください');
    process.exit(1);
}

// 更新するシーズンリスト（キャリアスタッツ用）
const SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];
const REQUEST_DELAY = 1200; // 1.2秒（API制限対策）
const MAX_PLAYERS = process.argv[2] ? parseInt(process.argv[2]) : 10; // コマンドライン引数で指定可能

// 遅延付きリクエスト
async function fetchWithDelay(url, options = {}) {
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
    
    if (!API_FOOTBALL_KEY || API_FOOTBALL_KEY.length < 10) {
        console.error('❌ APIキーが正しく読み込まれていません。長さ:', API_FOOTBALL_KEY ? API_FOOTBALL_KEY.length : 0);
        return null;
    }
    
    try {
        const headers = {
            'x-apisports-key': API_FOOTBALL_KEY,
            ...(options.headers || {})
        };
        
        const response = await axios.get(url, {
            ...options,
            headers: headers
        });
        
        if (response.data.errors && Object.keys(response.data.errors).length > 0) {
            console.warn(`⚠️ APIエラー:`, response.data.errors);
            return null;
        }
        
        return response.data;
    } catch (error) {
        if (error.response?.status === 429) {
            console.warn('⏳ レート制限に達しました。60秒待機...');
            await new Promise(resolve => setTimeout(resolve, 60000));
            return fetchWithDelay(url, options);
        }
        console.error(`❌ リクエストエラー: ${error.message}`);
        return null;
    }
}

// 選手のキャリアスタッツを取得（複数シーズン）
async function getPlayerCareerStats(playerId) {
    const careerStats = [];
    
    for (const season of SEASONS) {
        try {
            const url = `https://v3.football.api-sports.io/players?season=${season}&id=${playerId}`;
            const data = await fetchWithDelay(url);
            
            if (!data || !data.response || data.response.length === 0) {
                continue;
            }
            
            const playerData = data.response[0];
            
            // 各コンペティションの統計を処理
            if (playerData.statistics && Array.isArray(playerData.statistics)) {
                playerData.statistics.forEach(stat => {
                    const games = stat.games || {};
                    const goals = stat.goals || {};
                    
                    careerStats.push({
                        season: `${season}/${season + 1}`,
                        leagueName: stat.league?.name || 'Unknown',
                        leagueId: stat.league?.id || null,
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
                });
            }
        } catch (error) {
            console.error(`❌ シーズン${season}のデータ取得エラー (選手ID: ${playerId}):`, error.message);
        }
    }
    
    return careerStats;
}

// メイン処理
async function updateAllPlayersWithCareer() {
    console.log('🚀 全選手の2025年データとキャリアスタッツを更新開始...');
    console.log(`🔑 APIキー: ${API_FOOTBALL_KEY.substring(0, 8)}...`);
    console.log(`📊 更新対象: 最大${MAX_PLAYERS}名\n`);
    
    // 選手データを読み込み
    if (!fs.existsSync(PLAYERS_FILE)) {
        console.error('❌ 選手データファイルが見つかりません:', PLAYERS_FILE);
        return;
    }
    
    let playersData = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
    let players = Array.isArray(playersData) ? playersData : (playersData.players || []);
    
    console.log(`📊 総選手数: ${players.length}名`);
    console.log(`📊 更新するシーズン: ${SEASONS.join(', ')}\n`);
    
    let updatedCount = 0;
    let careerUpdatedCount = 0;
    let errorCount = 0;
    
    // playerIdを持つ選手をフィルタリング（未更新の選手のみ）
    const playersWithId = players.filter(p => p.playerId);
    
    // 既に更新された選手をスキップ（careerStatsが存在する場合は既に更新済みとみなす）
    const playersToUpdateAll = playersWithId.filter(p => {
        // careerStatsが存在しない、または空の場合は未更新
        return !p.careerStats || !Array.isArray(p.careerStats) || p.careerStats.length === 0;
    });
    
    console.log(`📊 playerIdを持つ選手: ${playersWithId.length}名`);
    console.log(`✅ 既に更新済み: ${playersWithId.length - playersToUpdateAll.length}名`);
    console.log(`📊 未更新の選手: ${playersToUpdateAll.length}名`);
    console.log(`📊 最初の${MAX_PLAYERS}名を更新します\n`);
    
    // 指定数の選手を更新
    const playersToUpdate = playersToUpdateAll.slice(0, MAX_PLAYERS);
    
    for (let i = 0; i < playersToUpdate.length; i++) {
        const player = playersToUpdate[i];
        
        try {
            console.log(`\n📊 [${i + 1}/${playersToUpdate.length}] ${player.name || 'Unknown'} (ID: ${player.playerId})`);
            
            // キャリアスタッツを取得
            console.log(`  🔄 キャリアスタッツを取得中...`);
            const careerStats = await getPlayerCareerStats(player.playerId);
            
            if (careerStats.length > 0) {
                // キャリアスタッツを保存
                player.careerStats = careerStats;
                player.careerStatsUpdated = new Date().toISOString();
                careerUpdatedCount++;
                console.log(`  ✅ キャリアスタッツ取得: ${careerStats.length}レコード`);
                
                // 最新のチーム名を更新（最新シーズンのデータから）
                const latestStat = careerStats[careerStats.length - 1];
                if (latestStat && latestStat.teamName) {
                    player.currentTeam = latestStat.teamName;
                    player.teamId = latestStat.teamId;
                }
            } else {
                console.log(`  ⚠️ キャリアスタッツが見つかりませんでした`);
            }
            
            // 2025年の統計を取得（全コンペティション）
            console.log(`  🔄 2025年統計を取得中...`);
            try {
                const url = `https://v3.football.api-sports.io/players?season=2025&id=${player.playerId}`;
                const data = await fetchWithDelay(url);
                
                if (data && data.response && data.response.length > 0) {
                    const apiPlayer = data.response[0];
                    
                    // 全コンペティション統計を取得
                    if (apiPlayer.statistics && apiPlayer.statistics.length > 0) {
                        if (!Array.isArray(player.stats)) {
                            player.stats = [];
                        }
                        
                        // 既存の2025年統計を削除
                        player.stats = player.stats.filter(s => s.season !== '2025/2026');
                        
                        // 新しい2025年統計を追加（全コンペティション）
                        apiPlayer.statistics.forEach(stat => {
                            const games = stat.games || {};
                            const goals = stat.goals || {};
                            const cards = stat.cards || {};
                            const shots = stat.shots || {};
                            const passes = stat.passes || {};
                            const tackles = stat.tackles || {};
                            const duels = stat.duels || {};
                            const dribbles = stat.dribbles || {};
                            const fouls = stat.fouls || {};
                            const penalty = stat.penalty || {};
                            
                            player.stats.push({
                                appearances: games.appearences || 0,
                                lineups: games.lineups || 0,
                                minutes: games.minutes || 0,
                                rating: games.rating ? parseFloat(games.rating) : null,
                                goals: goals.total || 0,
                                assists: goals.assists || 0,
                                saves: goals.saves || 0,
                                conceded: goals.conceded || 0,
                                yellowCards: cards.yellow || 0,
                                redCards: cards.red || 0,
                                shotsTotal: shots.total || 0,
                                shotsOnTarget: shots.on || 0,
                                passesTotal: passes.total || 0,
                                passesKey: passes.key || 0,
                                passAccuracy: passes.accuracy || null,
                                tackles: tackles.total || 0,
                                blocks: tackles.blocks || 0,
                                interceptions: tackles.interceptions || 0,
                                duelsTotal: duels.total || 0,
                                duelsWon: duels.won || 0,
                                dribblesAttempts: dribbles.attempts || 0,
                                dribblesSuccess: dribbles.success || 0,
                                foulsDraw: fouls.drawn || 0,
                                foulsCommitted: fouls.committed || 0,
                                penalty: {
                                    won: penalty.won || null,
                                    commited: penalty.committed || null,
                                    scored: penalty.scored || 0,
                                    missed: penalty.missed || 0,
                                    saved: penalty.saved || null
                                },
                                season: "2025/2026",
                                leagueName: stat.league?.name || 'Unknown',
                                leagueId: stat.league?.id || null,
                                teamName: stat.team?.name || null,
                                teamId: stat.team?.id || null,
                                source: "api-football-2025",
                                lastUpdated: new Date().toISOString()
                            });
                        });
                        
                        updatedCount++;
                        console.log(`  ✅ 2025年統計を更新: ${apiPlayer.statistics.length}コンペティション`);
                    } else {
                        console.log(`  ⚠️ 2025年統計が見つかりませんでした`);
                    }
                }
            } catch (error) {
                console.error(`  ❌ 2025年統計取得エラー:`, error.message);
            }
            
            player.lastUpdated = new Date().toISOString();
            
        } catch (error) {
            console.error(`❌ ${player.name || 'Unknown'}: エラー - ${error.message}`);
            errorCount++;
        }
    }
    
    // データを保存
    console.log('\n💾 データを保存中...');
    const outputData = Array.isArray(playersData) ? players : { players: players };
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(outputData, null, 2));
    
    console.log('\n============================================================');
    console.log('✅ 更新完了');
    console.log(`📊 2025年統計更新: ${updatedCount}名`);
    console.log(`📊 キャリアスタッツ更新: ${careerUpdatedCount}名`);
    console.log(`❌ エラー: ${errorCount}名`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('============================================================');
    console.log(`\n💡 ヒント: 全選手を更新するには、コマンドライン引数で数を指定してください`);
    console.log(`   例: node update-all-players-with-career.js 100\n`);
}

updateAllPlayersWithCareer();
