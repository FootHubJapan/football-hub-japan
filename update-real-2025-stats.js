#!/usr/bin/env node

/**
 * 全選手を実際の2025/2026シーズンAPIデータで更新
 */

const fs = require('fs').promises;
const path = require('path');

const API_KEY = '53cfd1d0230dfe92a2d99f81ca0fab88';
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const DELAY = 400;

async function fetchPlayer2025Stats(playerId, currentLeagueId) {
    try {
        // まず現在のリーグで2025データを検索
        const leaguesToTry = currentLeagueId ? [currentLeagueId] : [];
        
        // 主要リーグも追加
        const majorLeagues = [39, 140, 135, 78, 61, 88, 94, 98, 253, 307];
        majorLeagues.forEach(l => {
            if (!leaguesToTry.includes(l)) leaguesToTry.push(l);
        });
        
        for (const leagueId of leaguesToTry) {
            try {
                const response = await fetch(
                    `https://v3.football.api-sports.io/players?id=${playerId}&league=${leagueId}&season=2025`,
                    {
                        headers: {
                            'x-apisports-key': API_KEY
                        }
                    }
                );
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.results > 0 && data.response?.[0]?.statistics?.[0]) {
                        const stats = data.response[0].statistics[0];
                        
                        // 試合出場がある場合のみ採用
                        if ((stats.games?.appearences || 0) > 0) {
                            return {
                                league: stats.league?.name,
                                leagueId: stats.league?.id,
                                currentTeam: stats.team?.name,
                                teamId: stats.team?.id,
                                position: stats.games?.position || 'Unknown',
                                stats: {
                                    appearances: stats.games?.appearences || 0,
                                    lineups: stats.games?.lineups || 0,
                                    minutes: stats.games?.minutes || 0,
                                    rating: stats.games?.rating || 'N/A',
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
                                    passAccuracy: stats.passes?.accuracy ? `${stats.passes.accuracy}%` : '0%',
                                    tackles: stats.tackles?.total || 0,
                                    blocks: stats.tackles?.blocks || 0,
                                    interceptions: stats.tackles?.interceptions || 0,
                                    duelsTotal: stats.duels?.total || 0,
                                    duelsWon: stats.duels?.won || 0,
                                    dribblesAttempts: stats.dribbles?.attempts || 0,
                                    dribblesSuccess: stats.dribbles?.success || 0,
                                    foulsDraw: stats.fouls?.drawn || 0,
                                    foulsCommitted: stats.fouls?.committed || 0,
                                    penalty: stats.penalty || {}
                                },
                                season: '2025/2026',
                                source: 'api-football-2025-real',
                                lastUpdated: new Date().toISOString()
                            };
                        }
                    }
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                // 続行
            }
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

async function main() {
    console.log('🚀 全選手を実際の2025/2026シーズンAPIデータで更新中...\n');
    
    let players = JSON.parse(await fs.readFile(PLAYERS_FILE, 'utf8'));
    console.log(`📊 総選手数: ${players.length}名\n`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    const batchSize = 50;
    
    for (let i = 0; i < players.length; i++) {
        const player = players[i];
        
        if (!player.playerId) {
            skippedCount++;
            continue;
        }
        
        const progress = `[${i + 1}/${players.length}]`;
        
        if (i % batchSize === 0) {
            console.log(`\n進捗: ${progress} (更新: ${updatedCount}名, スキップ: ${skippedCount}名)`);
            // 途中保存
            await fs.writeFile(PLAYERS_FILE, JSON.stringify(players, null, 2));
        }
        
        const data2025 = await fetchPlayer2025Stats(player.playerId, player.leagueId);
        
        if (data2025) {
            players[i] = {
                ...players[i],
                ...data2025
            };
            
            if (updatedCount < 10 || player.stats.goals > 10) {
                console.log(`  ✅ ${player.name}: ${data2025.stats.goals}G ${data2025.stats.assists}A ${data2025.stats.appearances}試合 (${data2025.league})`);
            }
            
            updatedCount++;
        } else {
            // 2025データなし、表記だけ2025に変更
            players[i].season = '2025/2026';
            skippedCount++;
        }
        
        await new Promise(resolve => setTimeout(resolve, DELAY));
    }
    
    // 最終保存
    await fs.writeFile(PLAYERS_FILE, JSON.stringify(players, null, 2));
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ 更新完了');
    console.log(`📊 2025APIデータで更新: ${updatedCount}名`);
    console.log(`⚠️  2025データなし: ${skippedCount}名`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('='.repeat(60));
    
    // トップスコアラー
    const topScorers = players
        .filter(p => p.stats.goals > 8)
        .sort((a, b) => b.stats.goals - a.stats.goals)
        .slice(0, 20);
    
    console.log('\n📈 トップスコアラー:');
    topScorers.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.name} (${p.currentTeam}, ${p.league}): ${p.stats.goals}G ${p.stats.assists}A`);
    });
}

main().catch(error => {
    console.error('❌ エラー:', error);
    process.exit(1);
});

