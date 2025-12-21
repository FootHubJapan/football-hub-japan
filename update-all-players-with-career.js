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

// 更新するシーズンリスト（キャリアスタッツ用：2007年から2025年まで）
// 2000年からだとリクエスト制限に達するため、2007年からに変更
const SEASONS = [];
for (let year = 2007; year <= 2025; year++) {
    SEASONS.push(year);
}
const REQUEST_DELAY = 200; // 0.2秒（Pro Plan: 300リクエスト/分に対応）

// MAX_PLAYERSの取得（--retry-errorsや--error-fileが指定されていない場合のみ）
// デフォルトを10名に設定（1日のリクエスト制限7,500を考慮）
// 1バッチ（10名）で約190リクエスト = 1日の制限の約2.5%
let MAX_PLAYERS = 10;
if (!RETRY_ERRORS && !ERROR_FILE_PATH) {
    const maxPlayersArg = args.find(arg => !arg.startsWith('--'));
    MAX_PLAYERS = maxPlayersArg ? parseInt(maxPlayersArg) : 10; // デフォルト10名
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
// 既存のcareerStatsがある場合は、不足しているシーズンのみを取得
async function getPlayerCareerStats(playerId, existingCareerStats = [], player = null) {
    const careerStats = [...existingCareerStats]; // 既存のデータを保持
    
    // 既存のシーズンを確認（重複を避けるため）
    const existingSeasons = new Set();
    existingCareerStats.forEach(stat => {
        const seasonStr = stat.season || '';
        // "2020/2021" 形式から "2020" を抽出
        const seasonYear = parseInt(seasonStr.split('/')[0]);
        if (!isNaN(seasonYear)) {
            existingSeasons.add(seasonYear);
        }
    });
    
    console.log(`  📊 既存のシーズン数: ${existingSeasons.size} (${Array.from(existingSeasons).sort((a,b)=>b-a).slice(0,5).join(', ')}...)`);
    
    // 選手の年齢を考慮して取得可能なシーズン範囲を計算
    let possibleSeasons = SEASONS;
    if (player) {
        const currentYear = new Date().getFullYear();
        const startYear = 2007;
        let birthYear = null;
        if (player.age) {
            birthYear = currentYear - player.age;
        } else if (player.birthday || player.dateOfBirth) {
            const birthDate = new Date(player.birthday || player.dateOfBirth);
            birthYear = birthDate.getFullYear();
        }
        
        if (birthYear) {
            const debutYear = birthYear + 16; // プロデビュー年を推定（通常15-16歳から）
            const possibleStartYear = Math.max(startYear, debutYear);
            possibleSeasons = SEASONS.filter(season => season >= possibleStartYear);
            console.log(`  📊 年齢考慮: 生年推定 ${birthYear}年 → デビュー年推定 ${debutYear}年 → 取得可能なシーズン: ${possibleStartYear}年以降`);
        }
    }
    
    // 不足しているシーズンのみを取得（取得可能なシーズン範囲内で）
    const missingSeasons = possibleSeasons.filter(season => !existingSeasons.has(season));
    
    if (missingSeasons.length === 0) {
        console.log(`  ✅ すべてのシーズンのデータが既に存在します`);
        return careerStats;
    }
    
    console.log(`  🔄 不足しているシーズン: ${missingSeasons.length}シーズン (${missingSeasons.slice(0,5).join(', ')}...)`);
    
    let consecutiveFailures = 0; // 連続してデータが取得できなかったシーズン数
    const MAX_CONSECUTIVE_FAILURES = 5; // 5シーズン連続でデータが取得できなかった場合は、それ以降のシーズンも取得できないと判断
    
    for (const season of missingSeasons) {
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
                consecutiveFailures++;
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    console.log(`  ⚠️ ${MAX_CONSECUTIVE_FAILURES}シーズン連続でデータが取得できなかったため、それ以降のシーズンも取得できないと判断してスキップします`);
                    break; // それ以降のシーズンも取得できないと判断
                }
                continue;
            }
            
            if (!data || !data.response || data.response.length === 0) {
                consecutiveFailures++;
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    console.log(`  ⚠️ ${MAX_CONSECUTIVE_FAILURES}シーズン連続でデータが取得できなかったため、それ以降のシーズンも取得できないと判断してスキップします`);
                    break; // それ以降のシーズンも取得できないと判断
                }
                continue;
            }
            
            // データが取得できた場合は連続失敗カウントをリセット
            consecutiveFailures = 0;
            
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
        
        // 選手の年齢から取得可能なシーズン数を計算する関数
        function getPossibleSeasonsCount(player) {
            const currentYear = new Date().getFullYear();
            const startYear = 2007; // スクリプトのシーズン範囲の開始年
            
            // 年齢から生年を推定
            let birthYear = null;
            if (player.age) {
                birthYear = currentYear - player.age;
            } else if (player.birthday || player.dateOfBirth) {
                const birthDate = new Date(player.birthday || player.dateOfBirth);
                birthYear = birthDate.getFullYear();
            }
            
            // 生年が不明な場合は、デフォルトで全シーズン取得可能とみなす
            if (!birthYear) {
                return SEASONS.length;
            }
            
            // プロデビュー年を推定（通常15-16歳から）
            const debutYear = birthYear + 16;
            
            // 取得可能なシーズン範囲を計算
            const possibleStartYear = Math.max(startYear, debutYear);
            const possibleEndYear = currentYear;
            
            // 取得可能なシーズン数
            const possibleSeasons = Math.max(0, possibleEndYear - possibleStartYear + 1);
            
            return possibleSeasons;
        }
        
        // 既に更新された選手をスキップ（careerStatsが存在する場合は既に更新済みとみなす）
        // ただし、careerStatsが3シーズン未満の場合は再更新する
        // ただし、選手の年齢を考慮して、実際に取得可能なシーズン数に近い場合はスキップ
        const playersToUpdateAll = playersWithId.filter(p => {
            // careerStatsUpdatedが存在する場合は、既に更新を試みたとみなして「更新済み」とする
            // これは、24時間以内に更新された選手だけでなく、過去に更新を試みたすべての選手を含む
            if (p.careerStatsUpdated) {
                return false; // 既に更新を試みたので「更新済み」
            }
            
            // careerStatsが存在しない、または空の場合は未更新
            if (!p.careerStats || !Array.isArray(p.careerStats) || p.careerStats.length === 0) {
                return true;
            }
            
            const existingSeasonsCount = p.careerStats.length;
            const possibleSeasonsCount = getPossibleSeasonsCount(p);
            
            // 既存のシーズン数が取得可能なシーズン数の80%以上の場合、更新済みとみなす
            // または、既存のシーズン数が3以上の場合も更新済みとみなす
            if (existingSeasonsCount >= 3) {
                return false; // 更新済み
            }
            
            // 取得可能なシーズン数が少ない場合（若手選手など）
            if (possibleSeasonsCount <= 3) {
                // 既存のシーズン数が2以上の場合、更新済みとみなす（取得可能なシーズン数の80%以上）
                if (existingSeasonsCount >= 2) {
                    return false; // 更新済み
                }
            }
            
            // 取得可能なシーズン数が4以下の場合、2シーズン以上取得していれば更新済みとみなす
            if (possibleSeasonsCount <= 4) {
                if (existingSeasonsCount >= 2) {
                    return false; // 更新済み
                }
            }
            
            // 取得可能なシーズン数が5以上の場合、80%以上取得していれば更新済みとみなす
            if (existingSeasonsCount >= Math.ceil(possibleSeasonsCount * 0.8)) {
                return false; // 更新済み
            }
            
            // それ以外の場合は再更新
            return true;
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
            
            // キャリアスタッツを取得（既存のデータがあれば使用）
            console.log(`  🔄 キャリアスタッツを取得中...`);
            const existingCareerStats = player.careerStats && Array.isArray(player.careerStats) ? player.careerStats : [];
            let careerStats = [];
            
            try {
                careerStats = await getPlayerCareerStats(player.playerId, existingCareerStats, player);
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
                        
                        // 2025年統計をキャリアスタッツに追加（まだ追加されていない場合）
                        if (careerStats.length === 0 || !careerStats.some(s => s.season === '2025/2026')) {
                            apiPlayer.statistics.forEach(stat => {
                                const games = stat.games || {};
                                const goals = stat.goals || {};
                                
                                // 既に存在する場合はスキップ
                                if (careerStats.some(s => s.season === '2025/2026' && s.leagueName === (stat.league?.name || 'Unknown'))) {
                                    return;
                                }
                                
                                careerStats.push({
                                    season: "2025/2026",
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
                            
                            if (careerStats.length > 0) {
                                player.careerStats = careerStats;
                                if (!player.careerStatsUpdated) {
                                    player.careerStatsUpdated = new Date().toISOString();
                                }
                                careerUpdatedCount++;
                                console.log(`  ✅ 2025年統計をキャリアスタッツに追加: ${careerStats.length}レコード`);
                            }
                        }
                    } else {
                        console.log(`  ⚠️ 2025年統計が見つかりませんでした`);
                    }
                }
            } catch (error) {
                console.error(`  ❌ 2025年統計取得エラー:`, error.message);
            }
            
            // キャリアスタッツを取得できなかった場合でも、更新を試みたことを記録する
            if (!player.careerStatsUpdated) {
                player.careerStatsUpdated = new Date().toISOString();
                console.log(`  ✅ 更新を試みたことを記録しました`);
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
