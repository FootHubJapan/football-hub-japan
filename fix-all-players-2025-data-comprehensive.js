#!/usr/bin/env node

/**
 * 全選手の2025/26シーズンデータを包括的に修正するスクリプト
 * 1. APIから取得できる場合はAPIデータで更新
 * 2. APIから取得できない場合は、データベース内の2024/25と2025/26の重複を検出・修正
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const API_KEY = process.env.API_FOOTBALL_KEY;
const REQUEST_DELAY = 200;

async function fetchWithDelay(url) {
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
    try {
        const response = await axios.get(url, {
            headers: { 'x-apisports-key': API_KEY }
        });
        if (response.data.errors && Object.keys(response.data.errors).length > 0) {
            return null;
        }
        return response.data;
    } catch (error) {
        if (error.response?.status === 429) {
            await new Promise(resolve => setTimeout(resolve, 60000));
            return null;
        }
        return null;
    }
}

function compareStats(stat1, stat2) {
    const matches1 = stat1.matches || stat1.appearances || 0;
    const matches2 = stat2.matches || stat2.appearances || 0;
    const goals1 = stat1.goals ?? 0;
    const goals2 = stat2.goals ?? 0;
    const assists1 = stat1.assists ?? 0;
    const assists2 = stat2.assists ?? 0;
    const team1 = (stat1.teamName || stat1.team || '').toLowerCase();
    const team2 = (stat2.teamName || stat2.team || '').toLowerCase();
    const league1 = (stat1.leagueName || stat1.league || '').toLowerCase();
    const league2 = (stat2.leagueName || stat2.league || '').toLowerCase();
    
    return matches1 === matches2 && 
           goals1 === goals2 && 
           assists1 === assists2 &&
           team1 === team2 &&
           league1 === league2;
}

async function fixPlayer(player) {
    const playerId = player.playerId || player.apiFootballId || player.id;
    if (!playerId) return { fixed: false, reason: 'No playerId' };
    
    if (!player.careerStats || !Array.isArray(player.careerStats)) {
        return { fixed: false, reason: 'No careerStats' };
    }
    
    const stats2024 = player.careerStats.filter(cs => 
        cs.season === '2024/2025' || cs.season === '2024/25'
    );
    const stats2025 = player.careerStats.filter(cs => 
        cs.season === '2025/2026' || cs.season === '2025/26'
    );
    
    if (stats2025.length === 0) {
        return { fixed: false, reason: 'No 2025 data' };
    }
    
    let fixed = false;
    const changes = [];
    
    // まずAPIから2025年のデータを取得を試みる
    try {
        const data2025 = await fetchWithDelay(`https://v3.football.api-sports.io/players?season=2025&id=${playerId}`);
        
        if (data2025 && data2025.response && data2025.response.length > 0) {
            const apiStats2025 = data2025.response[0].statistics || [];
            
            if (apiStats2025.length > 0) {
                // APIからデータが取得できた場合は、それで更新
                // 既存の2025/2026シーズンのデータを削除
                player.careerStats = player.careerStats.filter(cs => 
                    cs.season !== '2025/2026' && cs.season !== '2025/26'
                );
                
                // APIから取得した2025年のデータを追加
                apiStats2025.forEach(apiStat => {
                    const leagueName = apiStat.league?.name || 'Unknown';
                    const teamName = apiStat.team?.name || 'Unknown';
                    const matches = apiStat.games?.appearences || 0;
                    const goals = apiStat.goals?.total ?? 0;
                    const assists = apiStat.goals?.assists ?? 0;
                    const rating = apiStat.games?.rating ? parseFloat(apiStat.games.rating) : null;
                    const minutes = apiStat.games?.minutes || 0;
                    
                    player.careerStats.push({
                        season: '2025/2026',
                        leagueName: leagueName,
                        leagueId: apiStat.league?.id || null,
                        teamName: teamName,
                        teamId: apiStat.team?.id || null,
                        matches: matches,
                        appearances: matches,
                        goals: goals,
                        assists: assists,
                        rating: rating,
                        minutes: minutes,
                        source: 'api-football-2025-updated',
                        lastUpdated: new Date().toISOString()
                    });
                    
                    changes.push({
                        league: leagueName,
                        method: 'API',
                        matches: matches,
                        goals: goals,
                        assists: assists
                    });
                });
                
                fixed = true;
                return { fixed, changes, playerName: player.name, method: 'API' };
            }
        }
    } catch (error) {
        // API取得エラーは無視して、データベース内の比較に進む
    }
    
    // APIからデータが取得できない場合は、データベース内の2024/25と2025/26を比較
    stats2025.forEach(stat2025 => {
        const team2025 = (stat2025.teamName || stat2025.team || '').toLowerCase();
        const league2025 = (stat2025.leagueName || stat2025.league || '').toLowerCase();
        
        // 同じチーム・同じリーグの2024年のデータを探す
        const matching2024 = stats2024.find(stat2024 => {
            const team2024 = (stat2024.teamName || stat2024.team || '').toLowerCase();
            const league2024 = (stat2024.leagueName || stat2024.league || '').toLowerCase();
            return team2024 === team2025 && league2024 === league2025;
        });
        
        if (matching2024 && compareStats(stat2025, matching2024)) {
            // 2025年のデータが2024年のデータと完全に同じ場合は、2025年のデータを削除
            const index = player.careerStats.indexOf(stat2025);
            if (index >= 0) {
                player.careerStats.splice(index, 1);
                fixed = true;
                changes.push({
                    league: stat2025.leagueName || stat2025.league,
                    method: 'Removed duplicate',
                    matches: stat2025.matches || stat2025.appearances,
                    goals: stat2025.goals,
                    assists: stat2025.assists
                });
            }
        }
    });
    
    return { fixed, changes, playerName: player.name, method: 'Database comparison' };
}

async function main() {
    const args = process.argv.slice(2);
    const startIndex = args[0] ? parseInt(args[0]) : 0;
    const batchSize = args[1] ? parseInt(args[1]) : 500;
    const endIndex = Math.min(startIndex + batchSize, 999999);
    
    console.log('🚀 全選手の2025/26シーズンデータを包括的に修正開始...\n');
    console.log(`📊 チェック範囲: ${startIndex}〜${endIndex}名\n`);
    
    // データ読み込み
    const data = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
    const players = Array.isArray(data) ? data : (data.players || []);
    
    // 2025/2026シーズンのデータがある選手をフィルタリング
    const playersWith2025 = players.filter(p => {
        if (!p.careerStats || !Array.isArray(p.careerStats)) return false;
        return p.careerStats.some(cs => 
            cs.season === '2025/2026' || cs.season === '2025/26'
        );
    });
    
    console.log(`📊 2025/2026シーズンデータがある選手: ${playersWith2025.length}名\n`);
    
    const playersToCheck = playersWith2025.slice(startIndex, endIndex);
    
    let fixedCount = 0;
    const fixedPlayers = [];
    let errorCount = 0;
    
    for (let i = 0; i < playersToCheck.length; i++) {
        const player = playersToCheck[i];
        
        if ((i + 1) % 50 === 0) {
            console.log(`進捗: [${i + 1}/${playersToCheck.length}] (修正: ${fixedCount}名)`);
        }
        
        try {
            const result = await fixPlayer(player);
            
            if (result.fixed) {
                fixedCount++;
                fixedPlayers.push(result);
                
                if (fixedCount <= 20) {
                    console.log(`✅ ${player.name}: ${result.changes.length}件の変更 (${result.method})`);
                }
            }
        } catch (error) {
            errorCount++;
            if (errorCount <= 5) {
                console.error(`❌ ${player.name}: ${error.message}`);
            }
        }
    }
    
    // データを保存
    const outputData = Array.isArray(data) ? players : { players: players };
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(outputData, null, 2));
    
    console.log('\n============================================================');
    console.log('✅ 修正完了');
    console.log(`📊 チェックした選手数: ${playersToCheck.length}名`);
    console.log(`📊 修正した選手数: ${fixedCount}名`);
    console.log(`❌ エラー: ${errorCount}名`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('============================================================');
    
    if (endIndex < playersWith2025.length) {
        console.log(`\n💡 続きを実行するには:`);
        console.log(`   node fix-all-players-2025-data-comprehensive.js ${endIndex} ${batchSize}\n`);
    }
}

main().catch(console.error);
