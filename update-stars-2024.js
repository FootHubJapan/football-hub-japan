#!/usr/bin/env node

/**
 * 主要スター選手を2024/2025シーズンデータで追加・更新
 */

const fs = require('fs').promises;
const path = require('path');

const API_KEY = '53cfd1d0230dfe92a2d99f81ca0fab88';
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

// 主要選手リスト（API ID + リーグ）
const STAR_PLAYERS = [
    // Premier League
    { apiId: 1100, league: 39 },   // Haaland
    { apiId: 306, league: 39 },    // Salah
    { apiId: 629, league: 39 },    // De Bruyne
    { apiId: 631, league: 39 },    // Foden
    { apiId: 1460, league: 39 },   // Saka
    { apiId: 186, league: 39 },    // Son Heung-min
    { apiId: 290, league: 39 },    // van Dijk
    { apiId: 647, league: 39 },    // Ødegaard
    { apiId: 106835, league: 39 }, // Mitoma
    { apiId: 2597, league: 39 },   // Tomiyasu
    { apiId: 8500, league: 39 },   // Endo
    { apiId: 1485, league: 39 },   // Alexander-Arnold
    { apiId: 2879, league: 39 },   // Rice
    { apiId: 18767, league: 39 },  // Palmer
    { apiId: 284, league: 39 },    // Bruno Fernandes
    
    // La Liga
    { apiId: 278, league: 140 },   // Mbappé
    { apiId: 762, league: 140 },   // Vinícius Júnior
    { apiId: 129718, league: 140 },// Bellingham
    { apiId: 521, league: 140 },   // Lewandowski
    { apiId: 386828, league: 140 },// Lamine Yamal
    { apiId: 133609, league: 140 },// Pedri
    { apiId: 32862, league: 140 }, // Kubo
    { apiId: 1098, league: 140 },  // Gavi
    { apiId: 733, league: 140 },   // Rodrygo
    { apiId: 26169, league: 140 }, // Valverde
    
    // Bundesliga
    { apiId: 184, league: 78 },    // Kane
    { apiId: 181812, league: 78 }, // Musiala
    { apiId: 203224, league: 78 }, // Wirtz
    { apiId: 2598, league: 78 },   // Doan
    
    // Serie A
    { apiId: 303, league: 135 },   // Lautaro Martinez
    { apiId: 31, league: 135 },    // Osimhen
    
    // Ligue 1
    { apiId: 666, league: 61 },    // Dembélé
    
    // MLS
    { apiId: 154, league: 253 },   // Messi
    
    // Saudi Pro League
    { apiId: 874, league: 307 },   // Ronaldo
];

async function fetchPlayerData(apiId, leagueId) {
    try {
        const response = await fetch(
            `https://v3.football.api-sports.io/players?id=${apiId}&league=${leagueId}&season=2024`,
            {
                headers: { 'x-apisports-key': API_KEY }
            }
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        if (data.results === 0 || !data.response?.[0]) return null;
        
        const player = data.response[0].player;
        const stats = data.response[0].statistics[0] || {};
        
        return {
            playerId: apiId,
            name: player.name,
            fullName: `${player.firstname} ${player.lastname}`,
            photo: player.photo,
            age: player.age,
            nationality: player.nationality,
            height: player.height,
            weight: player.weight,
            currentTeam: stats.team?.name,
            teamId: stats.team?.id,
            teamLogo: stats.team?.logo,
            league: stats.league?.name,
            leagueId: stats.league?.id,
            leagueLogo: stats.league?.logo,
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
                interceptions: stats.tackles?.interceptions || 0,
                duelsTotal: stats.duels?.total || 0,
                duelsWon: stats.duels?.won || 0,
                dribblesAttempts: stats.dribbles?.attempts || 0,
                dribblesSuccess: stats.dribbles?.success || 0,
                foulsDrawn: stats.fouls?.drawn || 0,
                foulsCommitted: stats.fouls?.committed || 0
            },
            season: '2024/2025',
            source: 'api-football-2024',
            lastUpdated: new Date().toISOString()
        };
    } catch (error) {
        console.error(`エラー (ID ${apiId}):`, error.message);
        return null;
    }
}

async function main() {
    console.log('🚀 主要スター選手の2024/2025シーズンデータを取得中...\n');
    
    // 既存データ読み込み
    let players = [];
    try {
        const data = await fs.readFile(PLAYERS_FILE, 'utf8');
        players = JSON.parse(data);
        console.log(`📊 既存選手数: ${players.length}名\n`);
    } catch (error) {
        console.log('新規データベースを作成します\n');
    }
    
    let updatedCount = 0;
    let addedCount = 0;
    
    for (const star of STAR_PLAYERS) {
        const data = await fetchPlayerData(star.apiId, star.league);
        
        if (data) {
            // 既存選手を検索
            const existingIndex = players.findIndex(p => 
                p.playerId === star.apiId || 
                (p.name && data.name && p.name.toLowerCase() === data.name.toLowerCase())
            );
            
            if (existingIndex !== -1) {
                // 既存選手を更新
                players[existingIndex] = {
                    ...players[existingIndex],
                    ...data
                };
                console.log(`✅ 更新: ${data.name} - ${data.stats.goals}G ${data.stats.assists}A (${data.currentTeam})`);
                updatedCount++;
            } else {
                // 新規選手を追加
                players.push(data);
                console.log(`➕ 追加: ${data.name} - ${data.stats.goals}G ${data.stats.assists}A (${data.currentTeam})`);
                addedCount++;
            }
        } else {
            console.log(`⚠️ データなし: API ID ${star.apiId}`);
        }
        
        // APIレート制限対策
        await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    // 保存
    await fs.writeFile(PLAYERS_FILE, JSON.stringify(players, null, 2));
    
    console.log('\n============================================================');
    console.log(`✅ 完了`);
    console.log(`📊 更新: ${updatedCount}名`);
    console.log(`📊 新規追加: ${addedCount}名`);
    console.log(`📊 総選手数: ${players.length}名`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('============================================================');
}

main().catch(console.error);

