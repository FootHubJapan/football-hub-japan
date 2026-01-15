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
const API_DELAY = 500;

async function fetchSeasonStats(playerId, season) {
    try {
        const url = `https://v3.football.api-sports.io/players?id=${playerId}&season=${season}`;
        const response = await axios.get(url, {
            headers: { 'x-apisports-key': API_KEY },
            timeout: 15000
        });

        if (response.data.response && response.data.response.length > 0) {
            return response.data.response[0].statistics;
        }
        return [];
    } catch (error) {
        console.error(`  ⚠️ ${season}シーズンの取得エラー:`, error.message);
        return [];
    }
}

async function updateBellinghamCareer() {
    console.log('=== APIからベリンガムのキャリアスタッツを取得して更新 ===\n');
    
    const players = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
    const bellingham = players.find(p => p.playerId === 129718);
    
    if (!bellingham) {
        console.log('❌ Jude Bellinghamが見つかりません');
        return;
    }
    
    console.log('現在のチーム:', bellingham.currentTeam);
    console.log('既存のcareerStats数:', bellingham.careerStats?.length || 0);
    console.log('');
    
    // 2021-2025シーズンのデータを取得
    const seasons = [2025, 2024, 2023, 2022, 2021];
    const newCareerStats = [];
    
    for (const season of seasons) {
        console.log(`📊 ${season}シーズンのデータを取得中...`);
        const stats = await fetchSeasonStats(129718, season);
        
        if (stats.length > 0) {
            stats.forEach(stat => {
                // 主要リーグと国際大会のみを保存
                const leagueId = stat.league?.id;
                const leagueName = stat.league?.name;
                const teamName = stat.team?.name;
                
                const leagueLower = (leagueName || '').toLowerCase();
                
                // フレンドリーマッチやU18リーグなどは除外
                if (leagueLower.includes('friendly') ||
                    leagueLower.includes('friendlies') ||
                    leagueLower.includes('u18') ||
                    leagueLower.includes('u17') ||
                    leagueLower.includes('u19') ||
                    leagueLower.includes('u21') ||
                    leagueLower.includes('youth')) {
                    return;
                }
                
                // 試合数が0のデータも除外（ただし国際大会は例外）
                const isInternational = leagueLower.includes('world cup') || 
                                       leagueLower.includes('euro') ||
                                       leagueLower.includes('nations league');
                if (!isInternational && (stat.games?.appearences || 0) === 0 && 
                    (stat.goals?.total || 0) === 0 && (stat.goals?.assists || 0) === 0) {
                    return;
                }
                
                const seasonStr = `${season}/${season + 1}`;
                newCareerStats.push({
                    season: seasonStr,
                    leagueName: leagueName,
                    leagueId: leagueId,
                    teamName: teamName,
                    teamId: stat.team?.id,
                    matches: stat.games?.appearences || 0,
                    appearances: stat.games?.appearences || 0,
                    goals: stat.goals?.total || 0,
                    assists: stat.goals?.assists || 0,
                    minutes: stat.games?.minutes || 0,
                    rating: stat.games?.rating || null,
                    source: 'api-football',
                    lastUpdated: new Date().toISOString()
                });
            });
            console.log(`  ✅ ${stats.length}件の統計を取得`);
        } else {
            console.log(`  ⚠️ データなし`);
        }
        
        await new Promise(resolve => setTimeout(resolve, API_DELAY));
    }
    
    // シーズンとリーグでソート（新しい順、主要リーグ優先）
    newCareerStats.sort((a, b) => {
        const aSeason = parseInt(a.season.split('/')[0]);
        const bSeason = parseInt(b.season.split('/')[0]);
        if (aSeason !== bSeason) return bSeason - aSeason;
        
        // 同じシーズン内では主要リーグを優先
        const majorLeagues = [39, 140, 135, 78, 61]; // Premier League, La Liga, Serie A, Bundesliga, Ligue 1
        const aIsMajor = majorLeagues.includes(a.leagueId);
        const bIsMajor = majorLeagues.includes(b.leagueId);
        if (aIsMajor && !bIsMajor) return -1;
        if (!aIsMajor && bIsMajor) return 1;
        
        return 0;
    });
    
    // 2021年以前のデータは既存のものを保持
    const oldCareerStats = (bellingham.careerStats || []).filter(cs => {
        const seasonYear = parseInt(cs.season?.split('/')[0]);
        return seasonYear && seasonYear < 2021;
    });
    
    bellingham.careerStats = [...newCareerStats, ...oldCareerStats];
    
    // ファイルに保存
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(players, null, 2), 'utf8');
    const comprehensiveFile = path.join(__dirname, 'data', 'comprehensive-players.json');
    fs.writeFileSync(comprehensiveFile, JSON.stringify(players, null, 2), 'utf8');
    
    console.log('\n✅ careerStatsを更新しました');
    console.log(`更新後のcareerStats数: ${bellingham.careerStats.length}`);
    console.log('\n=== 更新後のキャリアスタッツ（2021年以降） ===');
    bellingham.careerStats.filter(cs => {
        const seasonYear = parseInt(cs.season?.split('/')[0]);
        return seasonYear >= 2021;
    }).forEach((s, i) => {
        console.log(`${i+1}. ${s.season} - ${s.leagueName}`);
        console.log(`   チーム: ${s.teamName} | ${s.matches}試合 ${s.goals}G ${s.assists}A`);
    });
}

updateBellinghamCareer().catch(console.error);
