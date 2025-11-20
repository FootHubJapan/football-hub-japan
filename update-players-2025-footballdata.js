const fs = require('fs');
const path = require('path');

// 設定
const API_KEY = 'c578337e9eb343d8af3411ab3a2a71a9';
const BASE_URL = 'https://api.football-data.org/v4';
const PLAYERS_FILE = './data/players.json';
const OUTPUT_FILE = './data/players.json';

// リクエスト制限
const REQUEST_DELAY = 1000; // 1秒
const MAX_REQUESTS_PER_MINUTE = 60;

let requestCount = 0;
let lastRequestTime = 0;

// 遅延付きリクエスト
async function delayedRequest(url, options = {}) {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < REQUEST_DELAY) {
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY - timeSinceLastRequest));
    }
    
    requestCount++;
    lastRequestTime = Date.now();
    
    console.log(`📡 Request ${requestCount}: ${url}`);
    
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'X-Auth-Token': API_KEY,
                ...options.headers
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`❌ Request failed: ${error.message}`);
        throw error;
    }
}

// 選手の試合データから統計を計算
function calculatePlayerStats(matches, playerId) {
    let goals = 0;
    let assists = 0;
    let appearances = 0;
    let minutes = 0;
    let yellowCards = 0;
    let redCards = 0;
    
    matches.forEach(match => {
        // 選手が試合に参加したかチェック
        const isHomePlayer = match.homeTeam?.id === playerId || 
                           match.homeTeam?.players?.some(p => p.id === playerId);
        const isAwayPlayer = match.awayTeam?.id === playerId || 
                            match.awayTeam?.players?.some(p => p.id === playerId);
        
        if (isHomePlayer || isAwayPlayer) {
            appearances++;
            
            // 試合時間を取得（デフォルト90分）
            const matchMinutes = match.minute || 90;
            minutes += matchMinutes;
            
            // ゴールとアシストをカウント
            if (match.goals) {
                match.goals.forEach(goal => {
                    if (goal.scorer?.id === playerId) {
                        goals++;
                    }
                    if (goal.assist?.id === playerId) {
                        assists++;
                    }
                });
            }
            
            // カードをカウント
            if (match.bookings) {
                match.bookings.forEach(booking => {
                    if (booking.player?.id === playerId) {
                        if (booking.card === 'YELLOW') {
                            yellowCards++;
                        } else if (booking.card === 'RED') {
                            redCards++;
                        }
                    }
                });
            }
        }
    });
    
    return {
        goals,
        assists,
        appearances,
        minutes,
        yellowCards,
        redCards,
        goalsPerGame: appearances > 0 ? (goals / appearances).toFixed(2) : 0,
        assistsPerGame: appearances > 0 ? (assists / appearances).toFixed(2) : 0
    };
}

// 選手の2025年統計を取得
async function getPlayer2025Stats(playerId, playerName) {
    try {
        console.log(`🔄 ${playerName}: 2025年統計を取得中...`);
        
        // 選手の2025年試合データを取得
        const url = `${BASE_URL}/players/${playerId}/matches?season=2025`;
        const data = await delayedRequest(url);
        
        if (!data.matches || data.matches.length === 0) {
            console.log(`⚠️ ${playerName}: 2025年試合データなし`);
            return null;
        }
        
        // 統計を計算
        const stats = calculatePlayerStats(data.matches, playerId);
        
        console.log(`✅ ${playerName}: ${stats.goals}G ${stats.assists}A (${stats.appearances}試合)`);
        
        return {
            ...stats,
            source: 'football-data.org',
            season: '2025',
            lastUpdated: new Date().toISOString()
        };
        
    } catch (error) {
        console.error(`❌ ${playerName}: エラー - ${error.message}`);
        return null;
    }
}

// メイン処理
async function updatePlayersTo2025() {
    try {
        console.log('🚀 Football-data.orgを使用して2025年選手統計を更新開始...');
        
        // 選手データを読み込み
        if (!fs.existsSync(PLAYERS_FILE)) {
            console.error('❌ 選手データファイルが見つかりません:', PLAYERS_FILE);
            return;
        }
        
        const playersData = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
        const players = Array.isArray(playersData) ? playersData : (playersData.players || []);
        
        console.log(`📊 総選手数: ${players.length}名`);
        
        let updatedCount = 0;
        let errorCount = 0;
        
        // 統計データが0または古い選手を優先的に更新
        const playersToUpdate = players.filter(player => {
            const stats = player.stats || {};
            const totalStats = (stats.goals || 0) + (stats.assists || 0) + (stats.appearances || 0);
            return totalStats === 0 || !stats.lastUpdated || stats.lastUpdated < '2025-01-01';
        });
        
        console.log(`🔄 更新対象: ${playersToUpdate.length}名`);
        
        for (let i = 0; i < playersToUpdate.length; i++) {
            const player = playersToUpdate[i];
            
            // API制限チェック
            if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
                console.log('⏳ API制限に達しました。1分待機...');
                await new Promise(resolve => setTimeout(resolve, 60000));
                requestCount = 0;
            }
            
            try {
                const stats2025 = await getPlayer2025Stats(player.id, player.name);
                
                if (stats2025) {
                    // 選手データを更新
                    player.stats = {
                        ...player.stats,
                        ...stats2025
                    };
                    updatedCount++;
                }
                
                // 進捗表示
                if ((i + 1) % 10 === 0) {
                    console.log(`進捗: [${i + 1}/${playersToUpdate.length}] (更新: ${updatedCount}名, エラー: ${errorCount}名)`);
                }
                
            } catch (error) {
                console.error(`❌ ${player.name}: 処理エラー - ${error.message}`);
                errorCount++;
            }
        }
        
        // データを保存
        console.log('💾 データを保存中...');
        const outputData = Array.isArray(playersData) ? players : { players: players };
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
        
        console.log('\n============================================================');
        console.log('✅ 2025年統計更新完了');
        console.log(`📊 更新された選手: ${updatedCount}名`);
        console.log(`❌ エラー: ${errorCount}名`);
        console.log(`📁 保存先: ${OUTPUT_FILE}`);
        console.log('============================================================');
        
        // トップスコアラーを表示
        const topScorers = players
            .filter(p => p.stats && p.stats.goals > 0)
            .sort((a, b) => (b.stats.goals || 0) - (a.stats.goals || 0))
            .slice(0, 10);
        
        console.log('\n📈 トップスコアラー (2025年):');
        topScorers.forEach((player, index) => {
            const stats = player.stats || {};
            console.log(`  ${index + 1}. ${player.name} (${player.team || 'Unknown'}): ${stats.goals || 0}G ${stats.assists || 0}A`);
        });
        
    } catch (error) {
        console.error('❌ メイン処理エラー:', error);
    }
}

// スクリプト実行
if (require.main === module) {
    updatePlayersTo2025().catch(console.error);
}

module.exports = { updatePlayersTo2025, getPlayer2025Stats };
