#!/usr/bin/env node

/**
 * 主要リーグのチーム情報をAPI-Footballから取得して保存
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ override: true });

const API_KEY = process.env.API_FOOTBALL_KEY || '53cfd1d0230dfe92a2d99f81ca0fab88';
const TEAMS_FILE = path.join(__dirname, 'data', 'teams.json');

// 主要リーグのID
const MAJOR_LEAGUES = [
    { id: 39, name: 'Premier League', country: 'England' },
    { id: 140, name: 'La Liga', country: 'Spain' },
    { id: 135, name: 'Serie A', country: 'Italy' },
    { id: 78, name: 'Bundesliga', country: 'Germany' },
    { id: 61, name: 'Ligue 1', country: 'France' },
    { id: 88, name: 'Eredivisie', country: 'Netherlands' },
    { id: 94, name: 'Primeira Liga', country: 'Portugal' },
    { id: 203, name: 'Super Lig', country: 'Turkey' },
    { id: 169, name: 'Championship', country: 'England' },
    { id: 71, name: 'Serie A', country: 'Brazil' },
    { id: 39, name: 'MLS', country: 'USA' },
    { id: 307, name: 'Pro League', country: 'Saudi Arabia' },
    { id: 98, name: 'J1 League', country: 'Japan' }
];

// API呼び出し間隔（ミリ秒）
const API_DELAY = 350;

async function fetchTeamsFromLeague(leagueId, leagueName) {
    try {
        const url = `https://v3.football.api-sports.io/teams?league=${leagueId}&season=2025`;
        const response = await axios.get(url, {
            headers: { 'x-apisports-key': API_KEY },
            timeout: 15000
        });

        if (response.data.response && response.data.response.length > 0) {
            return response.data.response.map(item => ({
                id: item.team.id,
                name: item.team.name,
                code: item.team.code,
                country: item.team.country,
                founded: item.team.founded,
                national: item.team.national,
                logo: item.team.logo,
                venue: item.venue?.name || null,
                venueCity: item.venue?.city || null,
                venueCapacity: item.venue?.capacity || null,
                venueAddress: item.venue?.address || null,
                venueSurface: item.venue?.surface || null,
                venueImage: item.venue?.image || null,
                leagueId: leagueId,
                leagueName: leagueName,
                season: '2025/2026',
                lastUpdated: new Date().toISOString()
            }));
        }
        return [];
    } catch (error) {
        if (error.response?.status === 404) {
            // 2025シーズンがない場合は2024を試す
            try {
                const url2024 = `https://v3.football.api-sports.io/teams?league=${leagueId}&season=2024`;
                const response2024 = await axios.get(url2024, {
                    headers: { 'x-apisports-key': API_KEY },
                    timeout: 15000
                });

                if (response2024.data.response && response2024.data.response.length > 0) {
                    return response2024.data.response.map(item => ({
                        id: item.team.id,
                        name: item.team.name,
                        code: item.team.code,
                        country: item.team.country,
                        founded: item.team.founded,
                        national: item.team.national,
                        logo: item.team.logo,
                        venue: item.venue?.name || null,
                        venueCity: item.venue?.city || null,
                        venueCapacity: item.venue?.capacity || null,
                        venueAddress: item.venue?.address || null,
                        venueSurface: item.venue?.surface || null,
                        venueImage: item.venue?.image || null,
                        leagueId: leagueId,
                        leagueName: leagueName,
                        season: '2024/2025',
                        lastUpdated: new Date().toISOString()
                    }));
                }
            } catch (e) {
                console.error(`  ⚠️ ${leagueName} (2024) の取得エラー:`, e.message);
            }
        } else {
            console.error(`  ⚠️ ${leagueName} の取得エラー:`, error.message);
        }
        return [];
    }
}

async function main() {
    console.log('🚀 主要リーグのチーム情報を取得中...\n');

    let allTeams = [];
    const seenTeamIds = new Set();

    for (const league of MAJOR_LEAGUES) {
        console.log(`📊 ${league.name} (ID: ${league.id}) のチームを取得中...`);
        
        const teams = await fetchTeamsFromLeague(league.id, league.name);
        
        // 重複を排除
        const newTeams = teams.filter(team => {
            if (seenTeamIds.has(team.id)) {
                return false;
            }
            seenTeamIds.add(team.id);
            return true;
        });

        allTeams.push(...newTeams);
        console.log(`  ✅ ${newTeams.length}チームを追加 (合計: ${allTeams.length}チーム)`);

        // API呼び出し間隔
        await new Promise(resolve => setTimeout(resolve, API_DELAY));
    }

    // チームをリーグ順、名前順にソート
    allTeams.sort((a, b) => {
        if (a.leagueId !== b.leagueId) {
            return a.leagueId - b.leagueId;
        }
        return a.name.localeCompare(b.name);
    });

    // ファイルに保存
    fs.writeFileSync(TEAMS_FILE, JSON.stringify(allTeams, null, 2), 'utf8');

    console.log(`\n✨ 完了！`);
    console.log(`   総チーム数: ${allTeams.length}チーム`);
    console.log(`   リーグ数: ${new Set(allTeams.map(t => t.leagueId)).size}リーグ`);
    console.log(`\n📝 ${TEAMS_FILE} を更新しました`);
}

main().catch(console.error);
