#!/usr/bin/env node

/**
 * トップ選手・主要選手を実際の2025/2026シーズンAPIデータで更新
 */

const fs = require('fs').promises;
const path = require('path');

const API_KEY = '53cfd1d0230dfe92a2d99f81ca0fab88';
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

// 主要選手のplayerIdとリーグ
const TOP_PLAYERS = [
    { id: 1100, name: 'E. Haaland', league: 39 },      // Premier League
    { id: 306, name: 'Mohamed Salah', league: 39 },
    { id: 488, name: 'K. De Bruyne', league: 39 },
    { id: 882, name: 'H. Kane', league: 78 },          // Bundesliga
    { id: 276, name: 'K. Mbappé', league: 140 },       // La Liga
    { id: 645, name: 'L. Messi', league: 253 },        // MLS
    { id: 874, name: 'C. Ronaldo', league: 307 },      // Saudi Pro League
    { id: 529, name: 'B. Saka', league: 39 },
    { id: 22, name: 'Phil Foden', league: 39 },
    { id: 627, name: 'Vinícius Júnior', league: 140 },
    { id: 1451, name: 'J. Bellingham', league: 140 },
    { id: 154, name: 'R. Lewandowski', league: 140 },
    { id: 31097, name: 'L. Yamal', league: 140 },
    { id: 46769, name: 'Pedri', league: 140 },
    { id: 2935, name: 'J. Musiala', league: 78 },
    { id: 630, name: 'S. Heung-Min', league: 39 },
    { id: 1484, name: 'V. van Dijk', league: 39 },
    { id: 909, name: 'M. Ødegaard', league: 39 },
    { id: 30949, name: 'T. Kubo', league: 140 },       // 久保建英
    { id: 18830, name: 'K. Mitoma', league: 39 },      // 三苫薫
    { id: 18832, name: 'T. Tomiyasu', league: 39 },    // 富安健洋
    { id: 2505, name: 'W. Endo', league: 39 },         // 遠藤航
    { id: 1480, name: 'R. Doan', league: 78 }          // 堂安律
];

async function fetchPlayer2025(playerId, leagueId) {
    try {
        const response = await fetch(
            `https://v3.football.api-sports.io/players?id=${playerId}&league=${leagueId}&season=2025`,
            {
                headers: {
                    'x-apisports-key': API_KEY
                }
            }
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        if (data.results === 0 || !data.response?.[0]?.statistics?.[0]) return null;
        
        const stats = data.response[0].statistics[0];
        const player = data.response[0].player;
        
        return {
            photo: player.photo,
            age: player.age,
            nationality: player.nationality,
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
    } catch (error) {
        return null;
    }
}

async function main() {
    console.log('🚀 主要選手を実際の2025/2026シーズンAPIデータで更新中...\n');
    
    const players = JSON.parse(await fs.readFile(PLAYERS_FILE, 'utf8'));
    console.log(`📊 総選手数: ${players.length}名\n`);
    
    let updatedCount = 0;
    
    for (const topPlayer of TOP_PLAYERS) {
        console.log(`🔍 ${topPlayer.name} を更新中...`);
        
        const data2025 = await fetchPlayer2025(topPlayer.id, topPlayer.league);
        
        if (data2025) {
            // 該当する選手を検索して更新
            const index = players.findIndex(p => p.playerId === topPlayer.id);
            
            if (index !== -1) {
                players[index] = {
                    ...players[index],
                    ...data2025
                };
                console.log(`  ✅ ${topPlayer.name}: ${data2025.stats.goals}G ${data2025.stats.assists}A ${data2025.stats.appearances}試合 (${data2025.league})`);
                updatedCount++;
            } else {
                console.log(`  ⚠️ プレイヤーが見つかりません`);
            }
        } else {
            console.log(`  ⚠️ 2025データなし`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 残りの選手は表記だけ2025/2026に変更
    for (let i = 0; i < players.length; i++) {
        if (players[i].season !== '2025/2026') {
            players[i].season = '2025/2026';
        }
    }
    
    // 保存
    await fs.writeFile(PLAYERS_FILE, JSON.stringify(players, null, 2));
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ 更新完了');
    console.log(`📊 2025APIデータで更新: ${updatedCount}名`);
    console.log(`📊 全選手: ${players.length}名が2025/2026シーズン表記`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('='.repeat(60));
}

main().catch(error => {
    console.error('❌ エラー:', error);
    process.exit(1);
});

