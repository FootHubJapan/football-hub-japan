#!/usr/bin/env node

/**
 * 全選手のシーズンデータ不一致を修正するスクリプト
 * 2025年のデータが2024年のデータになっている場合を修正
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const API_KEY = process.env.API_FOOTBALL_KEY;
const REQUEST_DELAY = 200; // APIレート制限対策
const BATCH_SIZE = 50; // 1バッチあたりの処理数

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
            console.warn('⏳ APIレート制限に達しました。60秒待機...');
            await new Promise(resolve => setTimeout(resolve, 60000));
            return null;
        }
        return null;
    }
}

async function verifyAndFixPlayer(player) {
    const playerId = player.playerId || player.apiFootballId || player.id;
    if (!playerId) return { fixed: false, reason: 'No playerId' };
    
    if (!player.careerStats || !Array.isArray(player.careerStats)) {
        return { fixed: false, reason: 'No careerStats' };
    }
    
    // 2025/2026シーズンのデータを確認
    const stats2025 = player.careerStats.filter(cs => 
        cs.season === '2025/2026' || cs.season === '2025/26'
    );
    
    if (stats2025.length === 0) return { fixed: false, reason: 'No 2025 data' };
    
    // APIから2025年のデータを取得
    try {
        const data2025 = await fetchWithDelay(`https://v3.football.api-sports.io/players?season=2025&id=${playerId}`);
        if (!data2025 || !data2025.response || data2025.response.length === 0) {
            return { fixed: false, reason: 'No API data for 2025' };
        }
        
        const apiStats2025 = data2025.response[0].statistics || [];
        let fixed = false;
        const changes = [];
        
        // 各コンペティションのデータを比較・修正
        apiStats2025.forEach(apiStat => {
            const leagueName = apiStat.league?.name || 'Unknown';
            const teamName = apiStat.team?.name || 'Unknown';
            const apiMatches = apiStat.games?.appearences || 0;
            const apiGoals = apiStat.goals?.total ?? 0;
            const apiAssists = apiStat.goals?.assists ?? 0;
            const apiRating = apiStat.games?.rating ? parseFloat(apiStat.games.rating) : null;
            const apiMinutes = apiStat.games?.minutes || 0;
            
            // データベース内の対応するエントリを探す
            const dbStat = stats2025.find(cs => 
                (cs.leagueName === leagueName || cs.league === leagueName) &&
                (cs.teamName === teamName || cs.team === teamName)
            );
            
            if (dbStat) {
                const dbMatches = dbStat.matches || dbStat.appearances || 0;
                const dbGoals = dbStat.goals ?? 0;
                const dbAssists = dbStat.assists ?? 0;
                
                // データが異なる場合は修正
                if (dbMatches !== apiMatches || dbGoals !== apiGoals || dbAssists !== apiAssists) {
                    dbStat.matches = apiMatches;
                    dbStat.appearances = apiMatches;
                    dbStat.goals = apiGoals;
                    dbStat.assists = apiAssists;
                    dbStat.rating = apiRating;
                    dbStat.minutes = apiMinutes;
                    dbStat.lastUpdated = new Date().toISOString();
                    dbStat.source = 'api-football-fixed';
                    
                    fixed = true;
                    changes.push({
                        league: leagueName,
                        matches: `${dbMatches} → ${apiMatches}`,
                        goals: `${dbGoals} → ${apiGoals}`,
                        assists: `${dbAssists} → ${apiAssists}`
                    });
                }
            } else {
                // データベースに存在しない場合は追加
                player.careerStats.push({
                    season: '2025/2026',
                    leagueName: leagueName,
                    leagueId: apiStat.league?.id || null,
                    teamName: teamName,
                    teamId: apiStat.team?.id || null,
                    matches: apiMatches,
                    appearances: apiMatches,
                    goals: apiGoals,
                    assists: apiAssists,
                    rating: apiRating,
                    minutes: apiMinutes,
                    source: 'api-football-fixed',
                    lastUpdated: new Date().toISOString()
                });
                
                fixed = true;
                changes.push({
                    league: leagueName,
                    matches: `0 → ${apiMatches}`,
                    goals: `0 → ${apiGoals}`,
                    assists: `0 → ${apiAssists}`
                });
            }
        });
        
        return { fixed, changes, playerName: player.name };
    } catch (error) {
        return { fixed: false, reason: `Error: ${error.message}` };
    }
}

async function main() {
    const args = process.argv.slice(2);
    const startIndex = args[0] ? parseInt(args[0]) : 0;
    const batchSize = args[1] ? parseInt(args[1]) : BATCH_SIZE;
    const endIndex = Math.min(startIndex + batchSize, 999999);
    
    console.log('🚀 全選手のシーズンデータ不一致を修正開始...\n');
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
        const playerId = player.playerId || player.apiFootballId || player.id;
        
        console.log(`[${i + 1}/${playersToCheck.length}] ${player.name || 'Unknown'} (ID: ${playerId})`);
        
        try {
            const result = await verifyAndFixPlayer(player);
            
            if (result.fixed) {
                fixedCount++;
                fixedPlayers.push(result);
                console.log(`  ✅ 修正: ${result.changes.length}件の変更`);
                result.changes.forEach(change => {
                    console.log(`    - ${change.league}: ${change.matches}, ゴール${change.goals}, アシスト${change.assists}`);
                });
            } else {
                console.log(`  ⏭️  スキップ: ${result.reason}`);
            }
        } catch (error) {
            errorCount++;
            console.error(`  ❌ エラー: ${error.message}`);
        }
        
        console.log('');
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
    
    if (fixedPlayers.length > 0 && fixedPlayers.length <= 20) {
        console.log('\n📊 修正した選手の詳細:');
        fixedPlayers.forEach((fp, i) => {
            console.log(`  ${i + 1}. ${fp.playerName}: ${fp.changes.length}件の変更`);
        });
    }
    
    if (endIndex < playersWith2025.length) {
        console.log(`\n💡 続きを実行するには:`);
        console.log(`   node fix-all-players-season-data.js ${endIndex} ${batchSize}\n`);
    }
}

main().catch(console.error);
