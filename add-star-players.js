#!/usr/bin/env node

/**
 * 主要スター選手を直接APIから取得して追加
 */

const fs = require('fs').promises;
const path = require('path');

const API_KEY = '53cfd1d0230dfe92a2d99f81ca0fab88';
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

// 主要スター選手のAPI-Football ID
const STAR_PLAYERS = [
    { id: 1100, name: 'E. Haaland' },
    { id: 306, name: 'Mohamed Salah' },
    { id: 488, name: 'K. De Bruyne' },
    { id: 882, name: 'H. Kane' },
    { id: 276, name: 'K. Mbappé' },
    { id: 645, name: 'L. Messi' },
    { id: 874, name: 'C. Ronaldo' },
    { id: 640, name: 'Neymar Jr' },
    { id: 529, name: 'B. Saka' },
    { id: 22, name: 'Phil Foden' },
    { id: 627, name: 'Vinícius Júnior' },
    { id: 1451, name: 'J. Bellingham' },
    { id: 154, name: 'R. Lewandowski' },
    { id: 31097, name: 'L. Yamal' },
    { id: 46769, name: 'Pedri' },
    { id: 2935, name: 'J. Musiala' },
    { id: 31478, name: 'F. Wirtz' },
    { id: 896, name: 'L. Martínez' },
    { id: 630, name: 'S. Heung-Min' },
    { id: 1484, name: 'V. van Dijk' }
];

async function fetchPlayerData(playerId, season = 2024) {
    try {
        const response = await fetch(
            `https://v3.football.api-sports.io/players?id=${playerId}&season=${season}`,
            {
                headers: {
                    'x-apisports-key': API_KEY
                }
            }
        );
        
        if (!response.ok) {
            console.log(`  ⚠️ 取得失敗: ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        
        if (!data.response || data.response.length === 0) {
            return null;
        }
        
        const item = data.response[0];
        const player = item.player;
        const stats = item.statistics?.[0] || {};
        
        return {
            id: `api_${player.id}`,
            playerId: player.id,
            name: player.name,
            fullName: player.name,
            firstName: player.firstname || player.name.split(' ')[0],
            lastName: player.lastname || player.name.split(' ').slice(1).join(' '),
            age: player.age,
            nationality: player.nationality,
            photo: player.photo,
            currentTeam: stats.team?.name || 'Unknown',
            teamId: stats.team?.id,
            position: stats.games?.position || 'Unknown',
            league: stats.league?.name || 'Unknown',
            leagueId: stats.league?.id,
            country: player.nationality,
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
            source: 'api-football-star-player',
            season: '2024/2025',
            lastUpdated: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`  ❌ エラー: ${error.message}`);
        return null;
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('🚀 主要スター選手データを追加中...\n');
    
    // 既存データを読み込み
    const players = JSON.parse(await fs.readFile(PLAYERS_FILE, 'utf8'));
    console.log(`📊 既存データ: ${players.length}名`);
    
    // 既存の選手IDを記録
    const existingIds = new Set(players.map(p => p.playerId).filter(Boolean));
    
    const starPlayers = [];
    
    for (const star of STAR_PLAYERS) {
        if (existingIds.has(star.id)) {
            console.log(`⏭️  ${star.name}: 既に存在します`);
            continue;
        }
        
        console.log(`🔍 ${star.name} を取得中...`);
        
        const playerData = await fetchPlayerData(star.id);
        
        if (playerData) {
            starPlayers.push(playerData);
            console.log(`  ✅ ${playerData.name} (${playerData.currentTeam}, ${playerData.league}): ${playerData.stats.goals}G ${playerData.stats.assists}A ${playerData.stats.appearances}試合`);
        } else {
            console.log(`  ⚠️  データ取得失敗`);
        }
        
        await delay(500);
    }
    
    console.log(`\n📊 追加する選手: ${starPlayers.length}名`);
    
    // データをマージ
    const finalPlayers = [...players, ...starPlayers];
    
    // 保存
    await fs.writeFile(PLAYERS_FILE, JSON.stringify(finalPlayers, null, 2));
    
    console.log(`✅ 最終データ: ${finalPlayers.length}名`);
    console.log(`✅ データを保存しました: ${PLAYERS_FILE}`);
    
    // スター選手を表示
    console.log('\n⭐ 追加されたスター選手:');
    starPlayers.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.name} (${p.currentTeam}, ${p.league}): ${p.stats.goals}G ${p.stats.assists}A`);
    });
}

main().catch(error => {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
});

