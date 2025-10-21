#!/usr/bin/env node

/**
 * API-Footballから全選手データを取得（2025/2026シーズン）
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const API_KEY = '53cfd1d0230dfe92a2d99f81ca0fab88';
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const DELAY_BETWEEN_REQUESTS = 500; // 0.5秒

// 主要リーグ設定
const LEAGUES = [
    { id: 39, name: 'Premier League', country: 'England' },
    { id: 140, name: 'La Liga', country: 'Spain' },
    { id: 135, name: 'Serie A', country: 'Italy' },
    { id: 78, name: 'Bundesliga', country: 'Germany' },
    { id: 61, name: 'Ligue 1', country: 'France' },
    { id: 88, name: 'Eredivisie', country: 'Netherlands' },
    { id: 94, name: 'Primeira Liga', country: 'Portugal' },
    { id: 98, name: 'J1 League', country: 'Japan' },
    { id: 253, name: 'MLS', country: 'USA' },
    { id: 307, name: 'Saudi Pro League', country: 'Saudi Arabia' }
];

// リーグの全チームを取得
async function fetchLeagueTeams(leagueId, season = 2025) {
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

// チームの全選手を取得
async function fetchTeamPlayers(teamId, season = 2025) {
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
                source: 'api-football-2025',
                season: '2025/2026',
                lastUpdated: new Date().toISOString()
            };
        });
        
    } catch (error) {
        console.log(`    ⚠️ 選手取得エラー: ${error.message}`);
        return [];
    }
}

// 遅延関数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// メイン処理
async function main() {
    console.log('🚀 全選手データ取得を開始（2025/2026シーズン）\n');
    
    const allPlayers = [];
    let totalTeams = 0;
    let processedTeams = 0;
    
    for (const league of LEAGUES) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🏆 ${league.name} (${league.country})`);
        console.log('='.repeat(60));
        
        // リーグのチーム一覧を取得
        const teams = await fetchLeagueTeams(league.id);
        totalTeams += teams.length;
        
        if (teams.length === 0) {
            console.log('  ⚠️ チームが見つかりませんでした');
            await delay(DELAY_BETWEEN_REQUESTS);
            continue;
        }
        
        // 各チームの選手を取得
        for (let i = 0; i < teams.length; i++) {
            const team = teams[i];
            processedTeams++;
            
            console.log(`  [${i + 1}/${teams.length}] ${team.name} の選手を取得中...`);
            
            const players = await fetchTeamPlayers(team.id);
            
            if (players.length > 0) {
                allPlayers.push(...players);
                console.log(`    ✅ ${players.length}名の選手を追加（合計: ${allPlayers.length}名）`);
            } else {
                console.log(`    ⚠️ 選手データなし`);
            }
            
            // APIレート制限対策
            await delay(DELAY_BETWEEN_REQUESTS);
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 データ取得完了');
    console.log('='.repeat(60));
    console.log(`🏟️  処理したリーグ: ${LEAGUES.length}個`);
    console.log(`⚽  処理したチーム: ${processedTeams}個`);
    console.log(`👥  取得した選手: ${allPlayers.length}名`);
    
    // 重複を除去（同じplayerIdの選手は最新のデータを使用）
    const uniquePlayers = [];
    const playerIds = new Set();
    
    for (const player of allPlayers.reverse()) {
        if (!playerIds.has(player.playerId)) {
            playerIds.add(player.playerId);
            uniquePlayers.push(player);
        }
    }
    
    console.log(`🔄  重複除去後: ${uniquePlayers.length}名`);
    
    // データを保存
    await fs.writeFile(PLAYERS_FILE, JSON.stringify(uniquePlayers, null, 2));
    
    console.log(`\n✅ データを保存しました: ${PLAYERS_FILE}`);
    console.log('='.repeat(60));
    
    // 統計情報
    const stats = {
        totalPlayers: uniquePlayers.length,
        byLeague: {},
        byPosition: {},
        topScorers: uniquePlayers
            .filter(p => p.stats.goals > 0)
            .sort((a, b) => b.stats.goals - a.stats.goals)
            .slice(0, 10)
            .map(p => `${p.name} (${p.currentTeam}): ${p.stats.goals}G`)
    };
    
    uniquePlayers.forEach(p => {
        stats.byLeague[p.league] = (stats.byLeague[p.league] || 0) + 1;
        stats.byPosition[p.position] = (stats.byPosition[p.position] || 0) + 1;
    });
    
    console.log('\n📈 統計情報:');
    console.log('\nリーグ別選手数:');
    Object.entries(stats.byLeague).forEach(([league, count]) => {
        console.log(`  ${league}: ${count}名`);
    });
    
    console.log('\nポジション別選手数:');
    Object.entries(stats.byPosition).forEach(([position, count]) => {
        console.log(`  ${position}: ${count}名`);
    });
    
    console.log('\nトップスコアラー（Top 10）:');
    stats.topScorers.forEach((scorer, i) => {
        console.log(`  ${i + 1}. ${scorer}`);
    });
}

main().catch(error => {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
});

