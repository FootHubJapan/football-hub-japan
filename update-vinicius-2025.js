#!/usr/bin/env node

/**
 * API-Footballからヴィニシウス・ジュニオルの2025-26シーズンデータを取得してplayers.jsonに反映
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

require('dotenv').config({ override: true });

const API_KEY = process.env.API_FOOTBALL_KEY || process.env.RAPIDAPI_KEY;
const PLAYER_ID = 762; // Vinícius Júnior
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

if (!API_KEY || API_KEY.length < 10) {
    console.error('❌ APIキーが正しく設定されていません');
    process.exit(1);
}

function normalizePlayerStats(stat) {
    if (!stat) return null;
    return {
        season: '2025/2026',
        leagueName: stat.league?.name || 'Unknown',
        leagueId: stat.league?.id || null,
        teamName: stat.team?.name || 'Unknown',
        teamId: stat.team?.id || null,
        appearances: stat.games?.appearences || stat.games?.appearances || 0,
        lineups: stat.games?.lineups || 0,
        minutes: stat.games?.minutes || 0,
        rating: stat.games?.rating ? parseFloat(stat.games.rating) : null,
        goals: stat.goals?.total || 0,
        assists: stat.goals?.assists || 0,
        yellowCards: stat.cards?.yellow || 0,
        redCards: stat.cards?.red || 0,
        shotsTotal: stat.shots?.total || 0,
        shotsOnTarget: stat.shots?.on || 0,
        passesTotal: stat.passes?.total || 0,
        passesKey: stat.passes?.key || 0,
        passesAccuracy: stat.passes?.accuracy || null,
        tackles: stat.tackles?.total || 0,
        blocks: stat.tackles?.blocks || 0,
        interceptions: stat.tackles?.interceptions || 0,
        duelsTotal: stat.duels?.total || 0,
        duelsWon: stat.duels?.won || 0,
        dribblesAttempts: stat.dribbles?.attempts || 0,
        dribblesSuccess: stat.dribbles?.success || 0,
        foulsDraw: stat.fouls?.drawn || 0,
        foulsCommitted: stat.fouls?.committed || 0,
        penalty: {
            won: stat.penalty?.won || null,
            commited: stat.penalty?.commited || null,
            scored: stat.penalty?.scored || 0,
            missed: stat.penalty?.missed || 0,
            saved: stat.penalty?.saved || null
        },
        source: 'api-football-2025-26',
        lastUpdated: new Date().toISOString()
    };
}

async function main() {
    console.log('🔍 API-Footballからヴィニシウス・ジュニオルの2025シーズンデータを取得中...');
    console.log('Player ID:', PLAYER_ID);

    const response = await axios.get('https://v3.football.api-sports.io/players', {
        headers: {
            'x-apisports-key': API_KEY,
            'x-rapidapi-host': 'v3.football.api-sports.io'
        },
        params: { id: PLAYER_ID, season: 2025 },
        timeout: 30000
    });

    if (!response.data?.response?.length) {
        console.error('❌ APIからデータが取得できませんでした');
        process.exit(1);
    }

    const apiData = response.data.response[0];
    const player = apiData.player;
    const statsArray = (apiData.statistics || [])
        .map(normalizePlayerStats)
        .filter(Boolean);

    console.log('✅ 取得成功:', player.name);
    statsArray.forEach((s) => {
        console.log(`  【${s.leagueName}】 ${s.appearances}試合 ${s.goals}G ${s.assists}A`);
    });

    const data = await fs.readFile(PLAYERS_FILE, 'utf8');
    const playersData = JSON.parse(data);
    const players = Array.isArray(playersData) ? playersData : (playersData.players || []);

    const idx = players.findIndex(
        (p) => p.playerId === PLAYER_ID || p.id === PLAYER_ID
    );
    if (idx === -1) {
        console.error('❌ players.json にヴィニシウスが見つかりません');
        process.exit(1);
    }

    const existing = players[idx];
    if (!existing.stats) existing.stats = [];
    existing.stats = existing.stats.filter(
        (s) => !String(s.season || '').includes('2025') && !String(s.season || '').includes('25/26')
    );
    statsArray.forEach((s) => existing.stats.push(s));
    existing.stats.sort((a, b) => String(b.season || '').localeCompare(String(a.season || '')));

    const la = statsArray.find((s) => s.leagueId === 140);
    if (la) {
        existing.currentTeam = la.teamName;
        existing.league = la.leagueName;
        existing.leagueId = la.leagueId;
        existing.teamId = la.teamId;
    }

    existing.id = PLAYER_ID;
    if (player.firstname && player.lastname) {
        existing.fullName = `${player.firstname} ${player.lastname}`.trim();
    }
    existing.age = player.age ?? existing.age;
    existing.nationality = player.nationality || existing.nationality;
    existing.photo = player.photo || existing.photo;
    existing.lastUpdated = new Date().toISOString();

    const out = Array.isArray(playersData) ? players : { ...playersData, players };
    await fs.writeFile(PLAYERS_FILE, JSON.stringify(out, null, 2), 'utf8');
    console.log('\n✅ players.json を更新しました');
}

main().catch((e) => {
    console.error('❌', e.message);
    process.exit(1);
});
