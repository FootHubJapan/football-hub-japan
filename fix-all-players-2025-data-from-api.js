#!/usr/bin/env node

/**
 * 全選手の2025/26シーズンデータをAPIから取得して修正するスクリプト
 * データベースに2025年のデータがある選手について、APIから最新データを取得して更新
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const API_KEY = process.env.API_FOOTBALL_KEY;
const REQUEST_DELAY = 200; // APIレート制限対策

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

async function updatePlayer2025Data(player) {
    const playerId = player.playerId || player.apiFootballId || player.id;
    if (!playerId) return { updated: false, reason: 'No playerId' };
    
    if (!player.careerStats || !Array.isArray(player.careerStats)) {
        return { updated: false, reason: 'No careerStats' };
    }
    
    // APIから2025年のデータを取得
    try {
        const data2025 = await fetchWithDelay(`https://v3.football.api-sports.io/players?season=2025&id=${playerId}`);
        if (!data2025 || !data2025.response || data2025.response.length === 0) {
            return { updated: false, reason: 'No API data for 2025' };
        }
        
        const apiStats2025 = data2025.response[0].statistics || [];
        if (apiStats2025.length === 0) {
            return { updated: false, reason: 'No statistics in API response' };
        }
        
        // 既存の2025/2026シーズンのデータを削除
        player.careerStats = player.careerStats.filter(cs => 
            cs.season !== '2025/2026' && cs.season !== '2025/26'
        );
        
        // APIから取得した2025年のデータを追加
        const changes = [];
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
                matches: matches,
                goals: goals,
                assists: assists
            });
        });
        
        // stats配列も更新
        if (!player.stats || !Array.isArray(player.stats)) {
            player.stats = [];
        }
        
        // 既存の2025/2026シーズンのstatsを削除
        player.stats = player.stats.filter(s => 
            s.season !== '2025/2026' && s.season !== '2025/26'
        );
        
        // APIから取得した2025年のデータをstatsに追加
        apiStats2025.forEach(apiStat => {
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
            
            player.stats.push({
                season: '2025/2026',
                leagueName: apiStat.league?.name || 'Unknown',
                leagueId: apiStat.league?.id || null,
                teamName: apiStat.team?.name || null,
                teamId: apiStat.team?.id || null,
                appearances: games.appearences || 0,
                lineups: games.lineups || 0,
                minutes: games.minutes || 0,
                goals: goals.total ?? 0,
                assists: goals.assists ?? 0,
                yellowCards: cards.yellow || 0,
                redCards: cards.red || 0,
                rating: games.rating ? parseFloat(games.rating) : null,
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
                source: 'api-football-2025-updated',
                lastUpdated: new Date().toISOString()
            });
        });
        
        return { updated: true, changes, playerName: player.name };
    } catch (error) {
        return { updated: false, reason: `Error: ${error.message}` };
    }
}

async function main() {
    const args = process.argv.slice(2);
    const startIndex = args[0] ? parseInt(args[0]) : 0;
    const batchSize = args[1] ? parseInt(args[1]) : 100;
    const endIndex = Math.min(startIndex + batchSize, 999999);
    
    console.log('🚀 全選手の2025/26シーズンデータをAPIから取得して修正開始...\n');
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
    
    let updatedCount = 0;
    const updatedPlayers = [];
    let errorCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < playersToCheck.length; i++) {
        const player = playersToCheck[i];
        const playerId = player.playerId || player.apiFootballId || player.id;
        
        if ((i + 1) % 10 === 0) {
            console.log(`進捗: [${i + 1}/${playersToCheck.length}] (更新: ${updatedCount}名, スキップ: ${skippedCount}名)`);
        }
        
        try {
            const result = await updatePlayer2025Data(player);
            
            if (result.updated) {
                updatedCount++;
                updatedPlayers.push(result);
                
                if (updatedCount <= 10) {
                    console.log(`✅ ${player.name}: ${result.changes.length}コンペティション更新`);
                }
            } else {
                skippedCount++;
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
    console.log(`📊 更新した選手数: ${updatedCount}名`);
    console.log(`⏭️  スキップした選手数: ${skippedCount}名`);
    console.log(`❌ エラー: ${errorCount}名`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('============================================================');
    
    if (endIndex < playersWith2025.length) {
        console.log(`\n💡 続きを実行するには:`);
        console.log(`   node fix-all-players-2025-data-from-api.js ${endIndex} ${batchSize}\n`);
    }
}

main().catch(console.error);
