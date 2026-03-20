#!/usr/bin/env node

/**
 * 全選手の2025-26シーズンデータをAPI-Footballから取得してplayers.jsonを更新
 * リーグ→チーム→選手の順で取得（API効率化）
 */

require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');

let API_KEY = process.env.API_FOOTBALL_KEY || process.env.RAPIDAPI_KEY;
if (!API_KEY || API_KEY.length < 10) {
    try {
        const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
        const match = envContent.match(/API_FOOTBALL_KEY=(.+)/);
        if (match && match[1]) API_KEY = match[1].trim();
    } catch (e) {}
}
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const DELAY_MS = 400; // APIレート制限対策

const LEAGUES = [
    { id: 39, name: 'Premier League' },
    { id: 140, name: 'La Liga' },
    { id: 135, name: 'Serie A' },
    { id: 78, name: 'Bundesliga' },
    { id: 61, name: 'Ligue 1' },
    { id: 88, name: 'Eredivisie' },
    { id: 94, name: 'Primeira Liga' },
    { id: 98, name: 'J1 League' },
    { id: 253, name: 'MLS' },
    { id: 307, name: 'Saudi Pro League' }
];

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function normalizeStat(apiStat) {
    const games = apiStat.games || {};
    const goals = apiStat.goals || {};
    const cards = apiStat.cards || {};
    const shots = apiStat.shots || {};
    const passes = apiStat.passes || {};
    const tackles = apiStat.tackles || {};
    const duels = apiStat.duels || {};
    const dribbles = apiStat.dribbles || {};
    const fouls = apiStat.fouls || {};
    const penalty = apiStat.penalty || {};
    return {
        season: '2025/2026',
        leagueName: apiStat.league?.name || 'Unknown',
        leagueId: apiStat.league?.id || null,
        teamName: apiStat.team?.name || 'Unknown',
        teamId: apiStat.team?.id || null,
        appearances: games.appearences || games.appearances || 0,
        lineups: games.lineups || 0,
        minutes: games.minutes || 0,
        rating: games.rating ? parseFloat(games.rating) : null,
        goals: goals.total ?? 0,
        assists: goals.assists ?? 0,
        yellowCards: cards.yellow || 0,
        redCards: cards.red || 0,
        shotsTotal: shots.total || 0,
        shotsOnTarget: shots.on || 0,
        passesTotal: passes.total || 0,
        passesKey: passes.key || 0,
        passesAccuracy: passes.accuracy || null,
        tackles: tackles.total || 0,
        blocks: tackles.blocks || 0,
        interceptions: tackles.interceptions || 0,
        duelsTotal: duels.total || 0,
        duelsWon: duels.won || 0,
        dribblesAttempts: dribbles.attempts || 0,
        dribblesSuccess: dribbles.success || 0,
        foulsDraw: fouls.drawn || 0,
        foulsCommitted: fouls.committed || 0,
        penalty: {
            won: penalty.won || null,
            commited: penalty.committed || null,
            scored: penalty.scored || 0,
            missed: penalty.missed || 0,
            saved: penalty.saved || null
        },
        source: 'api-football-2025-26',
        lastUpdated: new Date().toISOString()
    };
}

async function fetchLeagueTeams(leagueId) {
    await delay(DELAY_MS);
    try {
        const res = await fetch(
            `https://v3.football.api-sports.io/teams?league=${leagueId}&season=2025`,
            { headers: { 'x-apisports-key': API_KEY } }
        );
        const data = await res.json();
        return (data.response || []).map(t => ({ id: t.team.id, name: t.team.name }));
    } catch (e) {
        console.warn(`  ⚠️ リーグ${leagueId} チーム取得エラー:`, e.message);
        return [];
    }
}

async function fetchTeamPlayers(teamId, teamName) {
    await delay(DELAY_MS);
    try {
        const res = await fetch(
            `https://v3.football.api-sports.io/players?team=${teamId}&season=2025`,
            { headers: { 'x-apisports-key': API_KEY } }
        );
        const data = await res.json();
        const items = data.response || [];
        return items.map(item => {
            const p = item.player;
            const stats = item.statistics || [];
            const primaryStat = stats.find(s => s.league?.id === 39 || s.league?.id === 140 || s.league?.id === 135 || s.league?.id === 78 || s.league?.id === 61) || stats[0] || {};
            const normalizedStats = stats.map(normalizeStat);
            return {
                playerId: p.id,
                id: p.id,
                name: p.name,
                fullName: p.name,
                firstName: p.firstname || (p.name || '').split(' ')[0],
                lastName: p.lastname || (p.name || '').split(' ').slice(1).join(' '),
                age: p.age,
                nationality: p.nationality,
                photo: p.photo,
                currentTeam: primaryStat.team?.name || 'Unknown',
                teamId: primaryStat.team?.id,
                league: primaryStat.league?.name || 'Unknown',
                leagueId: primaryStat.league?.id,
                stats: normalizedStats,
                source: 'api-football-2025-26',
                lastUpdated: new Date().toISOString()
            };
        });
    } catch (e) {
        console.warn(`    ⚠️ ${teamName} 選手取得エラー:`, e.message);
        return [];
    }
}

async function main() {
    if (!API_KEY || API_KEY.length < 10) {
        console.error('❌ API_FOOTBALL_KEY を .env に設定してください');
        process.exit(1);
    }

    console.log('🚀 全選手の2025-26シーズンデータをAPIから取得して更新します\n');

    // 1. APIから全選手データを取得
    const apiPlayersMap = new Map(); // playerId -> player data
    let totalFetched = 0;

    for (const league of LEAGUES) {
        console.log(`\n🏆 ${league.name} (ID: ${league.id})`);
        const teams = await fetchLeagueTeams(league.id);
        console.log(`   ${teams.length}チーム`);

        for (let i = 0; i < teams.length; i++) {
            const team = teams[i];
            const players = await fetchTeamPlayers(team.id, team.name);
            for (const p of players) {
                const pid = p.playerId || p.id;
                if (pid) {
                    const existing = apiPlayersMap.get(pid);
                    if (!existing || (p.stats && p.stats.length > (existing.stats?.length || 0))) {
                        apiPlayersMap.set(pid, p);
                    }
                }
            }
            totalFetched += players.length;
            if ((i + 1) % 5 === 0) process.stdout.write(`   ${i + 1}/${teams.length}チーム完了\r`);
        }
        console.log(`   ✅ ${league.name} 完了`);
    }

    console.log(`\n📊 APIから取得: ${apiPlayersMap.size}名（重複除く）`);

    // 2. 既存players.jsonを読み込み
    let existingData;
    try {
        const raw = await fs.promises.readFile(PLAYERS_FILE, 'utf8');
        existingData = JSON.parse(raw);
    } catch (e) {
        console.error('❌ players.json の読み込みに失敗:', e.message);
        process.exit(1);
    }

    const existingPlayers = Array.isArray(existingData) ? existingData : (existingData.players || []);
    const isArrayFormat = Array.isArray(existingData);
    console.log(`📁 既存選手数: ${existingPlayers.length}名`);

    // 3. 既存選手の2025/2026データを更新
    let updatedCount = 0;
    let addedCount = 0;
    const existingIds = new Set(existingPlayers.map(p => p.playerId || p.id).filter(Boolean));

    for (const player of existingPlayers) {
        const pid = player.playerId || player.id;
        if (!pid) continue;

        const apiPlayer = apiPlayersMap.get(pid);
        if (!apiPlayer) continue;

        // 2025/2026, 2025/26 の既存statsを削除
        if (!player.stats || !Array.isArray(player.stats)) player.stats = [];
        player.stats = player.stats.filter(s => {
            const season = String(s.season || '');
            return !season.includes('2025') && !season.includes('25/26');
        });

        // APIの2025 statsを追加
        if (apiPlayer.stats && apiPlayer.stats.length > 0) {
            player.stats.push(...apiPlayer.stats);
            player.stats.sort((a, b) => String(b.season || '').localeCompare(String(a.season || '')));
        }

        // チーム・リーグ情報を更新
        const laliga = apiPlayer.stats?.find(s => s.leagueId === 140);
        const pl = apiPlayer.stats?.find(s => s.leagueId === 39);
        const primary = laliga || pl || apiPlayer.stats?.[0];
        if (primary) {
            player.currentTeam = primary.teamName;
            player.teamId = primary.teamId;
            player.league = primary.leagueName;
            player.leagueId = primary.leagueId;
        }

        updatedCount++;
        apiPlayersMap.delete(pid);
    }

    // 4. APIにのみ存在する新規選手を追加
    for (const [, apiPlayer] of apiPlayersMap) {
        if (apiPlayer.stats && apiPlayer.stats.length > 0) {
            existingPlayers.push(apiPlayer);
            addedCount++;
        }
    }

    // 5. 保存
    const output = isArrayFormat ? existingPlayers : { players: existingPlayers };
    await fs.promises.writeFile(PLAYERS_FILE, JSON.stringify(output, null, 2));

    console.log('\n' + '='.repeat(50));
    console.log('✅ 更新完了');
    console.log(`📊 更新した選手: ${updatedCount}名`);
    console.log(`➕ 新規追加: ${addedCount}名`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('='.repeat(50));
}

main().catch(e => {
    console.error('❌ エラー:', e);
    process.exit(1);
});
