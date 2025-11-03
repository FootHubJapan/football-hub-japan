const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const ERROR_LOG_FILE = path.join(__dirname, 'data', 'update-errors.json');

// コマンドライン引数の解析
const args = process.argv.slice(2);
const RETRY_ERRORS = args.includes('--retry-errors');
const ERROR_FILE_ARG = args.find(arg => arg.startsWith('--error-file='));
const ERROR_FILE_PATH = ERROR_FILE_ARG ? ERROR_FILE_ARG.split('=')[1] : null;

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

// MAX_PLAYERSの取得（--retry-errorsや--error-fileが指定されていない場合のみ）
let MAX_PLAYERS = 10;
if (!RETRY_ERRORS && !ERROR_FILE_PATH) {
    const maxPlayersArg = args.find(arg => !arg.startsWith('--'));
    MAX_PLAYERS = maxPlayersArg ? parseInt(maxPlayersArg) : 10;
}

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
            
            // リクエスト制限エラーをチェック
            const errorMessages = Object.values(response.data.errors).join(' ').toLowerCase();
            if (errorMessages.includes('request limit') || errorMessages.includes('reached the request limit')) {
                // リクエスト制限エラーをスローして、呼び出し元で処理を停止できるようにする
                const limitError = new Error('API_REQUEST_LIMIT_REACHED');
                limitError.isRequestLimit = true;
                limitError.errorData = response.data.errors;
                throw limitError;
            }
            
            return null;
        }
        
        return response.data;
    } catch (error) {
        // リクエスト制限エラーの場合は再スロー
        if (error.isRequestLimit) {
            throw error;
        }
        
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
            let data;
            
            try {
                data = await fetchWithDelay(url);
            } catch (error) {
                // リクエスト制限エラーの場合は再スロー
                if (error.isRequestLimit) {
                    throw error;
                }
                // その他のエラーはnullを返して続行
                continue;
            }
            
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
    const failedPlayerIds = []; // エラーが出た選手のIDを記録
    
    // エラー再試行モードの場合
    let playersToUpdate = [];
    if (RETRY_ERRORS || ERROR_FILE_PATH) {
        const errorFilePath = ERROR_FILE_PATH || ERROR_LOG_FILE;
        console.log(`\n🔄 エラー再試行モード: ${errorFilePath}からエラー選手を読み込み中...\n`);
        
        if (!fs.existsSync(errorFilePath)) {
            console.error(`❌ エラーログファイルが見つかりません: ${errorFilePath}`);
            console.error(`   まず通常の更新を実行してエラーログファイルを作成してください。`);
            return;
        }
        
        try {
            const errorLogData = JSON.parse(fs.readFileSync(errorFilePath, 'utf8'));
            const errorPlayerIds = errorLogData.players ? errorLogData.players.map(p => p.playerId) : [];
            
            if (errorPlayerIds.length === 0) {
                console.log('✅ エラーが出た選手は見つかりませんでした。');
                return;
            }
            
            console.log(`📊 エラーが出た選手: ${errorPlayerIds.length}名`);
            
            // エラー選手IDに一致する選手を取得
            const errorPlayers = players.filter(p => p.playerId && errorPlayerIds.includes(p.playerId));
            
            if (errorPlayers.length === 0) {
                console.log('⚠️ エラーログに記録された選手IDが現在のデータに見つかりませんでした。');
                return;
            }
            
            playersToUpdate = errorPlayers;
            console.log(`📊 再試行対象: ${playersToUpdate.length}名\n`);
        } catch (error) {
            console.error(`❌ エラーログファイルの読み込みエラー:`, error.message);
            return;
        }
    } else {
        // 通常モード: 未更新の選手を取得
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
        playersToUpdate = playersToUpdateAll.slice(0, MAX_PLAYERS);
    }
    
    for (let i = 0; i < playersToUpdate.length; i++) {
        const player = playersToUpdate[i];
        
        try {
            console.log(`\n📊 [${i + 1}/${playersToUpdate.length}] ${player.name || 'Unknown'} (ID: ${player.playerId})`);
            
            // キャリアスタッツを取得
            console.log(`  🔄 キャリアスタッツを取得中...`);
            let careerStats = [];
            
            try {
                careerStats = await getPlayerCareerStats(player.playerId);
            } catch (error) {
                if (error.isRequestLimit) {
                    console.error(`\n❌ APIリクエスト制限に達しました！`);
                    console.error(`📊 処理済み: ${i}/${playersToUpdate.length}名`);
                    console.error(`📊 残り: ${playersToUpdate.length - i}名`);
                    
                    // 現在の選手と残りの選手をエラーログに記録
                    failedPlayerIds.push({
                        playerId: player.playerId,
                        name: player.name || 'Unknown',
                        error: 'API_REQUEST_LIMIT_REACHED',
                        timestamp: new Date().toISOString()
                    });
                    
                    // 残りの未処理選手もエラーログに追加
                    for (let j = i; j < playersToUpdate.length; j++) {
                        const remainingPlayer = playersToUpdate[j];
                        if (remainingPlayer.playerId) {
                            failedPlayerIds.push({
                                playerId: remainingPlayer.playerId,
                                name: remainingPlayer.name || 'Unknown',
                                error: 'API_REQUEST_LIMIT_REACHED (未処理)',
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                    
                    // データを保存してから終了
                    const outputData = Array.isArray(playersData) ? players : { players: players };
                    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(outputData, null, 2));
                    
                    // エラーログを保存
                    const errorLog = {
                        timestamp: new Date().toISOString(),
                        totalErrors: failedPlayerIds.length,
                        errorType: 'API_REQUEST_LIMIT_REACHED',
                        processedCount: i,
                        remainingCount: playersToUpdate.length - i,
                        players: failedPlayerIds
                    };
                    fs.writeFileSync(ERROR_LOG_FILE, JSON.stringify(errorLog, null, 2));
                    
                    console.log(`\n💾 エラーログを保存しました: ${ERROR_LOG_FILE}`);
                    console.log(`\n💡 明日以降、以下のコマンドで再試行できます:`);
                    console.log(`   node update-all-players-with-career.js --retry-errors\n`);
                    
                    return;
                }
                throw error; // その他のエラーは再スロー
            }
            
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
                let data;
                
                try {
                    data = await fetchWithDelay(url);
                } catch (error) {
                    if (error.isRequestLimit) {
                        console.error(`\n❌ APIリクエスト制限に達しました！`);
                        console.error(`📊 処理済み: ${i}/${playersToUpdate.length}名`);
                        console.error(`📊 残り: ${playersToUpdate.length - i}名`);
                        
                        // 現在の選手と残りの選手をエラーログに記録
                        failedPlayerIds.push({
                            playerId: player.playerId,
                            name: player.name || 'Unknown',
                            error: 'API_REQUEST_LIMIT_REACHED',
                            timestamp: new Date().toISOString()
                        });
                        
                        // 残りの未処理選手もエラーログに追加
                        for (let j = i; j < playersToUpdate.length; j++) {
                            const remainingPlayer = playersToUpdate[j];
                            if (remainingPlayer.playerId) {
                                failedPlayerIds.push({
                                    playerId: remainingPlayer.playerId,
                                    name: remainingPlayer.name || 'Unknown',
                                    error: 'API_REQUEST_LIMIT_REACHED (未処理)',
                                    timestamp: new Date().toISOString()
                                });
                            }
                        }
                        
                        // データを保存してから終了
                        const outputData = Array.isArray(playersData) ? players : { players: players };
                        fs.writeFileSync(PLAYERS_FILE, JSON.stringify(outputData, null, 2));
                        
                        // エラーログを保存
                        const errorLog = {
                            timestamp: new Date().toISOString(),
                            totalErrors: failedPlayerIds.length,
                            errorType: 'API_REQUEST_LIMIT_REACHED',
                            processedCount: i,
                            remainingCount: playersToUpdate.length - i,
                            players: failedPlayerIds
                        };
                        fs.writeFileSync(ERROR_LOG_FILE, JSON.stringify(errorLog, null, 2));
                        
                        console.log(`\n💾 エラーログを保存しました: ${ERROR_LOG_FILE}`);
                        console.log(`\n💡 明日以降、以下のコマンドで再試行できます:`);
                        console.log(`   node update-all-players-with-career.js --retry-errors\n`);
                        
                        return;
                    }
                    throw error; // その他のエラーは再スロー
                }
                
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
            console.error(`❌ ${player.name || 'Unknown'} (ID: ${player.playerId || 'N/A'}): エラー - ${error.message}`);
            errorCount++;
            if (player.playerId) {
                failedPlayerIds.push({
                    playerId: player.playerId,
                    name: player.name || 'Unknown',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }
    
    // データを保存
    console.log('\n💾 データを保存中...');
    const outputData = Array.isArray(playersData) ? players : { players: players };
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(outputData, null, 2));
    
    // エラーが出た選手のIDをファイルに保存
    if (failedPlayerIds.length > 0) {
        console.log(`\n⚠️ エラーが出た選手を記録中: ${failedPlayerIds.length}名`);
        const errorLog = {
            timestamp: new Date().toISOString(),
            totalErrors: failedPlayerIds.length,
            players: failedPlayerIds
        };
        fs.writeFileSync(ERROR_LOG_FILE, JSON.stringify(errorLog, null, 2));
        console.log(`📁 エラーログ保存先: ${ERROR_LOG_FILE}`);
    }
    
    console.log('\n============================================================');
    console.log('✅ 更新完了');
    console.log(`📊 2025年統計更新: ${updatedCount}名`);
    console.log(`📊 キャリアスタッツ更新: ${careerUpdatedCount}名`);
    console.log(`❌ エラー: ${errorCount}名`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('============================================================');
    
    if (failedPlayerIds.length > 0) {
        console.log(`\n💡 エラーが出た選手だけを再試行するには、以下のコマンドを実行してください:`);
        console.log(`   node update-all-players-with-career.js --retry-errors`);
        console.log(`\n   または、特定のエラーログファイルから再試行するには:`);
        console.log(`   node update-all-players-with-career.js --error-file=${ERROR_LOG_FILE}\n`);
    } else {
        console.log(`\n💡 全選手を更新するには、コマンドライン引数で数を指定してください`);
        console.log(`   例: node update-all-players-with-career.js 100\n`);
    }
}

updateAllPlayersWithCareer();
