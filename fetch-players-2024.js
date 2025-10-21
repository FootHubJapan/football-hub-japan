#!/usr/bin/env node

/**
 * API-Footballから全選手データを取得（2024シーズン）
 * 2025シーズンでデータが不足している選手のために2024データを取得
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const API_KEY = '53cfd1d0230dfe92a2d99f81ca0fab88';
const PLAYERS_2025_FILE = path.join(__dirname, 'data', 'players.json');
const PLAYERS_2024_FILE = path.join(__dirname, 'data', 'players-2024.json');
const DELAY_BETWEEN_REQUESTS = 500; // 0.5秒

// 主要リーグ設定
const LEAGUES = [
    { id: 39, name: 'Premier League' },
    { id: 140, name: 'La Liga' },
    { id: 135, name: 'Serie A' },
    { id: 78, name: 'Bundesliga' },
    { id: 61, name: 'Ligue 1' }
];

// チームの全選手を取得
async function fetchTeamPlayers(teamId, season = 2024) {
    try {
        const response = await fetch(
            `https://v3.football.api-sports.io/players?team=${teamId}&season=${season}`,
            {
                headers: {
                    'x-apisports-key': API_KEY
                }
            }
        );
        
        if (!response.ok) {
            return [];
        }
        
        const data = await response.json();
        const players = data.response || [];
        
        return players.map(item => {
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
                source: 'api-football-2024',
                season: '2024/2025',
                lastUpdated: new Date().toISOString()
            };
        });
        
    } catch (error) {
        console.log(`    ⚠️ 選手取得エラー: ${error.message}`);
        return [];
    }
}

// リーグの全チームを取得
async function fetchLeagueTeams(leagueId, season = 2024) {
    try {
        console.log(`  🔍 リーグ${leagueId}のチーム一覧を取得中...`);
        
        const response = await fetch(
            `https://v3.football.api-sports.io/teams?league=${leagueId}&season=${season}`,
            {
                headers: {
                    'x-apisports-key': API_KEY
                }
            }
        );
        
        if (!response.ok) {
            console.log(`  ⚠️ チーム取得失敗: ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        const teams = data.response || [];
        console.log(`  ✅ ${teams.length}チームを取得`);
        
        return teams.map(t => ({
            id: t.team.id,
            name: t.team.name
        }));
        
    } catch (error) {
        console.log(`  ❌ エラー: ${error.message}`);
        return [];
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('🚀 2024シーズンデータ取得を開始\n');
    
    const allPlayers = [];
    
    for (const league of LEAGUES) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🏆 ${league.name}`);
        console.log('='.repeat(60));
        
        const teams = await fetchLeagueTeams(league.id);
        
        if (teams.length === 0) {
            console.log('  ⚠️ チームが見つかりませんでした');
            await delay(DELAY_BETWEEN_REQUESTS);
            continue;
        }
        
        for (let i = 0; i < teams.length; i++) {
            const team = teams[i];
            
            console.log(`  [${i + 1}/${teams.length}] ${team.name} の選手を取得中...`);
            
            const players = await fetchTeamPlayers(team.id);
            
            if (players.length > 0) {
                allPlayers.push(...players);
                console.log(`    ✅ ${players.length}名の選手を追加（合計: ${allPlayers.length}名）`);
            } else {
                console.log(`    ⚠️ 選手データなし`);
            }
            
            await delay(DELAY_BETWEEN_REQUESTS);
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`✅ 2024シーズンデータ取得完了: ${allPlayers.length}名`);
    console.log('='.repeat(60));
    
    // 重複を除去
    const uniquePlayers = [];
    const playerIds = new Set();
    
    for (const player of allPlayers.reverse()) {
        if (!playerIds.has(player.playerId)) {
            playerIds.add(player.playerId);
            uniquePlayers.push(player);
        }
    }
    
    console.log(`🔄 重複除去後: ${uniquePlayers.length}名`);
    
    // 2024データを保存
    await fs.writeFile(PLAYERS_2024_FILE, JSON.stringify(uniquePlayers, null, 2));
    console.log(`✅ 2024データを保存: ${PLAYERS_2024_FILE}`);
    
    // 2025データと統合
    const players2025 = JSON.parse(await fs.readFile(PLAYERS_2025_FILE, 'utf8'));
    console.log(`\n📊 2025データ: ${players2025.length}名`);
    console.log(`📊 2024データ: ${uniquePlayers.length}名`);
    
    // 2025データをベースに、2024データで補完
    const player2024Map = new Map();
    uniquePlayers.forEach(p => {
        player2024Map.set(p.name.toLowerCase(), p);
    });
    
    let updatedCount = 0;
    const finalPlayers = players2025.map(p2025 => {
        const p2024 = player2024Map.get(p2025.name.toLowerCase());
        
        // 2025データが不十分な場合（試合数が少ない、統計が0など）、2024データを使用
        if (p2024) {
            const is2025Insufficient = 
                (p2025.stats.appearances || 0) < 5 ||
                ((p2025.stats.goals || 0) === 0 && (p2025.stats.assists || 0) === 0 && p2024.stats.goals > 0);
            
            const is2024Better = 
                (p2024.stats.appearances || 0) > (p2025.stats.appearances || 0) + 10;
            
            if (is2025Insufficient || is2024Better) {
                console.log(`🔄 ${p2025.name}: 2024データを使用 (2024: ${p2024.stats.appearances}試合, 2025: ${p2025.stats.appearances}試合)`);
                updatedCount++;
                return p2024;
            }
        }
        
        return p2025;
    });
    
    console.log(`\n🔄 2024データで更新された選手: ${updatedCount}名`);
    
    // 2024データのみの選手を追加
    const player2025Names = new Set(players2025.map(p => p.name.toLowerCase()));
    const additionalPlayers = uniquePlayers.filter(p => !player2025Names.has(p.name.toLowerCase()));
    
    console.log(`➕ 2024データから新規追加: ${additionalPlayers.length}名`);
    
    finalPlayers.push(...additionalPlayers);
    
    console.log(`\n📊 最終データ: ${finalPlayers.length}名`);
    
    // 最終データを保存
    await fs.writeFile(PLAYERS_2025_FILE, JSON.stringify(finalPlayers, null, 2));
    console.log(`✅ 最終データを保存: ${PLAYERS_2025_FILE}`);
    
    // トップスコアラー
    console.log('\n📈 トップスコアラー:');
    const topScorers = finalPlayers
        .filter(p => p.stats.goals > 10)
        .sort((a, b) => b.stats.goals - a.stats.goals)
        .slice(0, 20);
    
    topScorers.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.name} (${p.currentTeam}, ${p.league}, ${p.season}): ${p.stats.goals}G ${p.stats.assists}A`);
    });
}

main().catch(error => {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
});

