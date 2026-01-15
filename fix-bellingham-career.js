#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ override: true });

const fsSync = require('fs');
const envContent = fsSync.readFileSync('.env', 'utf8');
const match = envContent.match(/API_FOOTBALL_KEY=(.+)/);
const API_KEY = match && match[1] ? match[1].trim() : '53cfd1d0230dfe92a2d99f81ca0fab88';

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

async function fixBellinghamCareer() {
    console.log('=== ベリンガムのcareerStatsを修正中 ===\n');
    
    const players = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
    const bellingham = players.find(p => p.playerId === 129718);
    
    if (!bellingham) {
        console.log('❌ Jude Bellinghamが見つかりません');
        return;
    }
    
    console.log('現在のチーム:', bellingham.currentTeam);
    console.log('careerStats数:', bellingham.careerStats?.length || 0);
    console.log('');
    
    // APIから最新の2025シーズンデータを取得
    console.log('APIから最新の2025シーズンデータを取得中...');
    const response = await axios.get('https://v3.football.api-sports.io/players?id=129718&season=2025', {
        headers: { 'x-apisports-key': API_KEY },
        timeout: 15000
    });
    
    const apiData = response.data.response[0];
    const stats = apiData.statistics;
    
    console.log(`✅ APIから${stats.length}件の統計データを取得`);
    
    // 2025/2026シーズンのReal Madridのデータをマップ
    const realMadridStats = new Map();
    stats.forEach(s => {
        if (s.team?.name === 'Real Madrid') {
            realMadridStats.set(s.league?.id, s);
        }
    });
    
    console.log(`Real Madridの統計: ${realMadridStats.size}件`);
    
    // careerStatsを更新
    const updatedCareerStats = [];
    const seen2025Leagues = new Set();
    
    // 2025/2026シーズン以外のデータはそのまま保持
    bellingham.careerStats.forEach(cs => {
        if (cs.season !== '2025/2026' && cs.season !== '2025/26') {
            updatedCareerStats.push(cs);
            return;
        }
        
        // 2025/2026シーズンのデータを処理
        const leagueId = cs.leagueId;
        
        // Borussia Dortmundのデータは削除
        if (cs.teamName && (cs.teamName.includes('Borussia Dortmund') || cs.teamName.includes('Dortmund'))) {
            console.log(`削除: ${cs.leagueName} | ${cs.teamName}`);
            return;
        }
        
        // Real Madridのデータがある場合は更新
        if (realMadridStats.has(leagueId)) {
            const stat = realMadridStats.get(leagueId);
            updatedCareerStats.push({
                season: '2025/2026',
                leagueName: stat.league.name,
                leagueId: leagueId,
                teamName: stat.team.name,
                teamId: stat.team.id,
                matches: stat.games.appearences,
                appearances: stat.games.appearences,
                goals: stat.goals.total,
                assists: stat.goals.assists,
                minutes: stat.games.minutes,
                rating: stat.games.rating,
                source: 'api-football-latest',
                lastUpdated: new Date().toISOString()
            });
            seen2025Leagues.add(leagueId);
        } else if (cs.teamName === 'Real Madrid') {
            // Real Madridのデータは保持
            updatedCareerStats.push(cs);
            seen2025Leagues.add(leagueId);
        }
    });
    
    // APIから取得したReal Madridのデータで、まだ追加されていないものを追加
    realMadridStats.forEach((stat, leagueId) => {
        if (!seen2025Leagues.has(leagueId)) {
            updatedCareerStats.unshift({
                season: '2025/2026',
                leagueName: stat.league.name,
                leagueId: leagueId,
                teamName: stat.team.name,
                teamId: stat.team.id,
                matches: stat.games.appearences,
                appearances: stat.games.appearences,
                goals: stat.goals.total,
                assists: stat.goals.assists,
                minutes: stat.games.minutes,
                rating: stat.games.rating,
                source: 'api-football-latest',
                lastUpdated: new Date().toISOString()
            });
        }
    });
    
    // careerStatsをソート（新しい順）
    updatedCareerStats.sort((a, b) => {
        if (a.season === '2025/2026' && b.season !== '2025/2026') return -1;
        if (a.season !== '2025/2026' && b.season === '2025/2026') return 1;
        return 0;
    });
    
    bellingham.careerStats = updatedCareerStats;
    
    // ファイルに保存
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(players, null, 2), 'utf8');
    const comprehensiveFile = path.join(__dirname, 'data', 'comprehensive-players.json');
    fs.writeFileSync(comprehensiveFile, JSON.stringify(players, null, 2), 'utf8');
    
    console.log('\n✅ careerStatsを更新しました');
    console.log(`更新後のcareerStats数: ${updatedCareerStats.length}`);
    console.log('\n2025/2026シーズンのcareerStats:');
    updatedCareerStats.filter(s => s.season === '2025/2026').forEach(s => {
        console.log(`  - ${s.leagueName} | ${s.teamName} | ${s.matches}試合 ${s.goals}G ${s.assists}A`);
    });
}

fixBellinghamCareer().catch(console.error);
