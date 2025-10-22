#!/usr/bin/env node

/**
 * 全選手を2025/2026シーズンAPIデータで更新
 * API制限を考慮して効率的に実行
 */

const fs = require('fs').promises;
const path = require('path');

const API_KEY = '53cfd1d0230dfe92a2d99f81ca0fab88';
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const DELAY = 500; // 0.5秒（API制限対策）

// 主要リーグID
const MAJOR_LEAGUES = [
    39,   // Premier League
    140,  // La Liga
    135,  // Serie A
    78,   // Bundesliga
    61,   // Ligue 1
    88,   // Eredivisie
    94,   // Primeira Liga
    98,   // J1 League
    253,  // MLS
    307   // Saudi Pro League
];

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetch2025Stats(playerId, playerName, currentLeagueId) {
    // まず現在のリーグで2025データを検索
    const leaguesToTry = currentLeagueId ? [currentLeagueId, ...MAJOR_LEAGUES] : MAJOR_LEAGUES;
    const uniqueLeagues = [...new Set(leaguesToTry)];
    
    for (const leagueId of uniqueLeagues) {
        try {
            const response = await fetch(
                `https://v3.football.api-sports.io/players?id=${playerId}&league=${leagueId}&season=2025`,
                {
                    headers: {
                        'x-apisports-key': API_KEY
                    }
                }
            );
            
            if (!response.ok) {
                if (response.status === 429) {
                    console.log('⚠️ API制限に達しました');
                    return null;
                }
                continue;
            }
            
            const data = await response.json();
            
            if (data.errors) {
                console.log('⚠️ API制限に達しました');
                return null;
            }
            
            if (data.results > 0 && data.response && data.response.length > 0) {
                const playerData = data.response[0];
                const stats = playerData.statistics?.[0];
                
                if (stats && stats.games?.appearences > 0) {
                    return {
                        goals: stats.goals?.total || 0,
                        assists: stats.goals?.assists || 0,
                        appearances: stats.games?.appearences || 0,
                        minutes: stats.games?.minutes || 0,
                        rating: stats.games?.rating || 'N/A',
                        yellowCards: stats.cards?.yellow || 0,
                        redCards: stats.cards?.red || 0,
                        league: stats.league?.name,
                        leagueId: stats.league?.id
                    };
                }
            }
            
            await sleep(200); // API制限対策
        } catch (error) {
            console.log(`  ⚠️ エラー (リーグ${leagueId}): ${error.message}`);
        }
    }
    
    return null;
}

async function updateAllPlayers() {
    console.log('🚀 全選手を2025/2026シーズンAPIデータで更新中...');
    
    const playersData = JSON.parse(await fs.readFile(PLAYERS_FILE, 'utf8'));
    console.log(`📊 総選手数: ${playersData.length}名`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    let apiLimitReached = false;
    
    for (let i = 0; i < playersData.length; i++) {
        const player = playersData[i];
        
        if ((i + 1) % 50 === 0) {
            console.log(`進捗: [${i + 1}/${playersData.length}] (更新: ${updatedCount}名, スキップ: ${skippedCount}名)`);
        }
        
        if (apiLimitReached) {
            skippedCount++;
            continue;
        }
        
        // 既に2025データがある選手はスキップ
        if (player.source && player.source.includes('2025') && player.stats.appearances > 0) {
            skippedCount++;
            continue;
        }
        
        // playerIdを取得
        const playerId = player.playerId || player.id?.toString().replace('api_', '');
        if (!playerId || playerId.includes('efficient') || playerId.includes('hybrid')) {
            skippedCount++;
            continue;
        }
        
        const stats2025 = await fetch2025Stats(playerId, player.name, player.leagueId);
        
        if (stats2025 === null) {
            // API制限に達した
            apiLimitReached = true;
            skippedCount++;
            console.log('\n⚠️ API制限に達しました。処理を中断します。');
            break;
        }
        
        if (stats2025 && stats2025.appearances > 0) {
            playersData[i].stats = {
                ...playersData[i].stats,
                goals: stats2025.goals,
                assists: stats2025.assists,
                appearances: stats2025.appearances,
                minutes: stats2025.minutes,
                rating: stats2025.rating,
                yellowCards: stats2025.yellowCards,
                redCards: stats2025.redCards
            };
            playersData[i].season = '2025/2026';
            playersData[i].source = 'api-football-2025';
            playersData[i].lastUpdated = new Date().toISOString();
            
            if (stats2025.league) {
                playersData[i].league = stats2025.league;
            }
            
            updatedCount++;
            
            if (updatedCount <= 10) {
                console.log(`  ✅ ${player.name}: ${stats2025.goals}G ${stats2025.assists}A ${stats2025.appearances}試合`);
            }
        } else {
            skippedCount++;
        }
        
        await sleep(DELAY);
    }
    
    await fs.writeFile(PLAYERS_FILE, JSON.stringify(playersData, null, 2), 'utf8');
    
    console.log('\n============================================================');
    console.log('✅ 更新完了');
    console.log(`📊 2025APIデータで更新: ${updatedCount}名`);
    console.log(`⚠️  2025データなし: ${skippedCount}名`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('============================================================');
    
    // トップスコアラーを表示
    const sortedPlayers = playersData
        .filter(p => p.stats && p.stats.goals > 10)
        .sort((a, b) => b.stats.goals - a.stats.goals)
        .slice(0, 20);
    
    if (sortedPlayers.length > 0) {
        console.log('\n📈 トップスコアラー:');
        sortedPlayers.forEach((p, idx) => {
            console.log(`  ${idx + 1}. ${p.name} (${p.currentTeam}, ${p.league}): ${p.stats.goals}G ${p.stats.assists}A`);
        });
    }
}

updateAllPlayers().catch(console.error);

