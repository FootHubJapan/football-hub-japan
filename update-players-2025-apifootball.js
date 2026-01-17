const fs = require('fs');
const path = require('path');

// 設定
const API_KEY = '53cfd1d0230dfe92a2d99f81ca0fab88'; // API-Football key
const BASE_URL = 'https://v3.football.api-sports.io';
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
                'x-apisports-key': API_KEY,
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

// チームのスカッド（名簿）を取得
async function getTeamSquad(teamId, teamName) {
    try {
        console.log(`🔄 ${teamName}: スカッドを取得中...`);
        
        const url = `${BASE_URL}/players/squads?team=${teamId}`;
        const data = await delayedRequest(url);
        
        if (!data.response || data.response.length === 0) {
            console.log(`⚠️ ${teamName}: スカッドデータなし`);
            return [];
        }
        
        const squad = data.response[0].players || [];
        console.log(`✅ ${teamName}: ${squad.length}名の選手を取得`);
        
        return squad.map(player => ({
            ...player,
            teamId: teamId,
            teamName: teamName
        }));
        
    } catch (error) {
        console.error(`❌ ${teamName}: スカッド取得エラー - ${error.message}`);
        return [];
    }
}

// チームの選手成績を取得（ページング対応）
async function getTeamPlayerStats(teamId, teamName, season = 2025) {
    try {
        console.log(`🔄 ${teamName}: ${season}年選手成績を取得中...`);
        
        let allPlayers = [];
        let page = 1;
        let totalPages = 1;
        
        do {
            const url = `${BASE_URL}/players?season=${season}&team=${teamId}&page=${page}`;
            const data = await delayedRequest(url);
            
            if (!data.response) {
                console.log(`⚠️ ${teamName}: ページ${page}のデータなし`);
                break;
            }
            
            allPlayers = allPlayers.concat(data.response);
            
            // ページング情報を取得
            if (data.paging) {
                totalPages = data.paging.total || 1;
                console.log(`📄 ${teamName}: ページ${page}/${totalPages} (${data.response.length}名)`);
            }
            
            page++;
            
        } while (page <= totalPages);
        
        console.log(`✅ ${teamName}: 合計${allPlayers.length}名の選手成績を取得`);
        
        return allPlayers.map(player => ({
            ...player,
            teamId: teamId,
            teamName: teamName,
            season: season
        }));
        
    } catch (error) {
        console.error(`❌ ${teamName}: 選手成績取得エラー - ${error.message}`);
        return [];
    }
}

// 主要チームのIDリスト（Premier League）
const MAJOR_TEAMS = [
    { id: 40, name: 'Liverpool' },
    { id: 50, name: 'Manchester City' },
    { id: 33, name: 'Manchester United' },
    { id: 49, name: 'Chelsea' },
    { id: 42, name: 'Arsenal' },
    { id: 47, name: 'Tottenham' },
    { id: 39, name: 'Wolves' },
    { id: 66, name: 'Aston Villa' },
    { id: 51, name: 'Brighton' },
    { id: 52, name: 'Crystal Palace' }
];

// メイン処理
async function updatePlayersTo2025() {
    try {
        console.log('🚀 API-Footballを使用して2025年選手データを更新開始...');
        
        // 選手データを読み込み
        if (!fs.existsSync(PLAYERS_FILE)) {
            console.error('❌ 選手データファイルが見つかりません:', PLAYERS_FILE);
            return;
        }
        
        const playersData = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
        const existingPlayers = Array.isArray(playersData) ? playersData : (playersData.players || []);
        
        console.log(`📊 既存選手数: ${existingPlayers.length}名`);
        
        let newPlayers = [];
        let updatedCount = 0;
        
        // 主要チームから2025年データを取得
        for (const team of MAJOR_TEAMS) {
            // API制限チェック
            if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
                console.log('⏳ API制限に達しました。1分待機...');
                await new Promise(resolve => setTimeout(resolve, 60000));
                requestCount = 0;
            }
            
            try {
                // 1. スカッド（名簿）を取得
                const squad = await getTeamSquad(team.id, team.name);
                
                // 2. 選手成績を取得
                const playerStats = await getTeamPlayerStats(team.id, team.name, 2025);
                
                // データを統合
                const teamPlayers = squad.map(squadPlayer => {
                    const statsPlayer = playerStats.find(p => p.id === squadPlayer.id);
                    return {
                        ...squadPlayer,
                        stats: statsPlayer ? {
                            ...statsPlayer.statistics?.[0]?.statistics,
                            season: 2025,
                            source: 'api-football',
                            lastUpdated: new Date().toISOString()
                        } : {
                            season: 2025,
                            source: 'api-football-squad',
                            lastUpdated: new Date().toISOString()
                        }
                    };
                });
                
                newPlayers = newPlayers.concat(teamPlayers);
                updatedCount += teamPlayers.length;
                
                console.log(`✅ ${team.name}: ${teamPlayers.length}名のデータを統合`);
                
            } catch (error) {
                console.error(`❌ ${team.name}: 処理エラー - ${error.message}`);
            }
        }
        
        // 既存データと新しいデータを統合
        const allPlayers = [...existingPlayers, ...newPlayers];
        
        // 重複を除去（IDで判定）
        const uniquePlayers = allPlayers.reduce((acc, player) => {
            const existing = acc.find(p => p.id === player.id);
            if (!existing) {
                acc.push(player);
            } else {
                // 2025年データがあれば更新
                if (player.stats && player.stats.season === 2025) {
                    existing.stats = { ...existing.stats, ...player.stats };
                }
            }
            return acc;
        }, []);
        
        // データを保存
        console.log('💾 データを保存中...');
        const outputData = Array.isArray(playersData) ? uniquePlayers : { players: uniquePlayers };
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
        
        console.log('\n============================================================');
        console.log('✅ 2025年選手データ更新完了');
        console.log(`📊 新規取得: ${newPlayers.length}名`);
        console.log(`📊 総選手数: ${uniquePlayers.length}名`);
        console.log(`📁 保存先: ${OUTPUT_FILE}`);
        console.log('============================================================');
        
        // 2025年データを持つ選手を表示
        const players2025 = uniquePlayers.filter(p => p.stats && p.stats.season === 2025);
        console.log(`\n📈 2025年データを持つ選手: ${players2025.length}名`);
        
        // トップスコアラーを表示（2025年データのみ）
        const topScorers = players2025
            .filter(p => p.stats && p.stats.goals && p.stats.goals.total > 0)
            .sort((a, b) => (b.stats.goals.total || 0) - (a.stats.goals.total || 0))
            .slice(0, 10);
        
        if (topScorers.length > 0) {
            console.log('\n📈 トップスコアラー (2025年):');
            topScorers.forEach((player, index) => {
                const stats = player.stats || {};
                console.log(`  ${index + 1}. ${player.name} (${player.teamName || 'Unknown'}): ${stats.goals?.total || 0}G ${stats.assists?.total || 0}A`);
            });
        }
        
    } catch (error) {
        console.error('❌ メイン処理エラー:', error);
    }
}

// スクリプト実行
if (require.main === module) {
    updatePlayersTo2025().catch(console.error);
}

module.exports = { updatePlayersTo2025, getTeamSquad, getTeamPlayerStats };






