#!/usr/bin/env node

/**
 * 全選手を2025/2026シーズンに統一
 */

const fs = require('fs').promises;
const path = require('path');

const API_KEY = '53cfd1d0230dfe92a2d99f81ca0fab88';
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const DELAY = 500;

async function fetchPlayer2025Data(playerId, playerName) {
    try {
        // 主要リーグで2025シーズンデータを検索
        const leagues = [39, 140, 135, 78, 61, 88, 94, 98, 253, 307];
        
        for (const leagueId of leagues) {
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
                    if (data.results > 0 && data.response && data.response.length > 0) {
                        const item = data.response[0];
                        const stats = item.statistics?.[0] || {};
                        
                        // 試合出場がある場合のみ採用
                        if (stats.games?.appearences > 0) {
                            console.log(`   ✅ 2025データ発見: ${playerName} (${stats.league?.name})`);
                            return {
                                league: stats.league?.name || 'Unknown',
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
        console.log(`   ⚠️ エラー: ${error.message}`);
        return null;
    }
}

async function main() {
    console.log('🚀 全選手を2025/2026シーズンに統一中...\n');
    
    const players = JSON.parse(await fs.readFile(PLAYERS_FILE, 'utf8'));
    console.log(`📊 総選手数: ${players.length}名\n`);
    
    // 2024/2025シーズンの選手を抽出
    const players2024 = players.filter(p => p.season === '2024/2025');
    const players2025 = players.filter(p => p.season === '2025/2026');
    
    console.log(`📊 2024/2025シーズン: ${players2024.length}名`);
    console.log(`📊 2025/2026シーズン: ${players2025.length}名\n`);
    
    let updatedCount = 0;
    let notFoundCount = 0;
    
    for (let i = 0; i < players2024.length; i++) {
        const player = players2024[i];
        const progress = `[${i + 1}/${players2024.length}]`;
        
        console.log(`${progress} ${player.name} (${player.currentTeam})`);
        
        // 2025シーズンデータを取得
        const data2025 = await fetchPlayer2025Data(player.playerId, player.name);
        
        if (data2025) {
            // プレイヤーオブジェクトを更新
            const index = players.findIndex(p => p.id === player.id);
            if (index !== -1) {
                players[index] = {
                    ...players[index],
                    ...data2025
                };
                updatedCount++;
            }
        } else {
            console.log(`   ⚠️ 2025データなし、2024データを維持`);
            notFoundCount++;
        }
        
        await new Promise(resolve => setTimeout(resolve, DELAY));
    }
    
    // 保存
    await fs.writeFile(PLAYERS_FILE, JSON.stringify(players, null, 2));
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ 更新完了');
    console.log(`📊 2025シーズンに更新: ${updatedCount}名`);
    console.log(`⚠️  2024シーズンのまま: ${notFoundCount}名`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('='.repeat(60));
    
    // 最終確認
    const finalPlayers = JSON.parse(await fs.readFile(PLAYERS_FILE, 'utf8'));
    const final2024 = finalPlayers.filter(p => p.season === '2024/2025').length;
    const final2025 = finalPlayers.filter(p => p.season === '2025/2026').length;
    
    console.log('\n📊 最終統計:');
    console.log(`   2024/2025シーズン: ${final2024}名`);
    console.log(`   2025/2026シーズン: ${final2025}名`);
}

main().catch(error => {
    console.error('❌ エラー:', error);
    process.exit(1);
});

