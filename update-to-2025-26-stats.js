#!/usr/bin/env node

/**
 * careerStatsの2025/2026シーズンデータをメインstatsに反映
 */

const fs = require('fs').promises;
const path = require('path');

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

async function main() {
    console.log('🚀 2025/2026シーズン統計をメインstatsに反映中...\n');
    
    // データ読み込み
    const data = await fs.readFile(PLAYERS_FILE, 'utf8');
    const players = JSON.parse(data);
    
    console.log(`📊 総選手数: ${players.length}名\n`);
    
    let updatedCount = 0;
    
    for (const player of players) {
        if (!player.careerStats || !Array.isArray(player.careerStats)) continue;
        
        // 2025/2026シーズンのリーグ戦データを抽出（プレミア、ラリーガ、セリエA、ブンデス、リーグ1）
        const leagueIds = [39, 140, 135, 78, 61, 253, 307]; // 主要リーグ
        const season2526 = player.careerStats.filter(s => 
            s.season === '2025/2026' && leagueIds.includes(s.leagueId)
        );
        
        if (season2526.length > 0) {
            // リーグ戦の統計を合計
            const totalGoals = season2526.reduce((sum, s) => sum + (s.goals || 0), 0);
            const totalAssists = season2526.reduce((sum, s) => sum + (s.assists || 0), 0);
            const totalMatches = season2526.reduce((sum, s) => sum + (s.matches || s.appearances || 0), 0);
            const totalMinutes = season2526.reduce((sum, s) => sum + (s.minutes || 0), 0);
            
            // 最も出場試合数が多いリーグの情報を使用
            const mainLeague = season2526.sort((a, b) => (b.matches || 0) - (a.matches || 0))[0];
            
            // メインstatsを更新
            if (!player.stats) player.stats = {};
            
            const oldGoals = player.stats.goals || 0;
            const oldAssists = player.stats.assists || 0;
            
            player.stats.goals = totalGoals;
            player.stats.assists = totalAssists;
            player.stats.appearances = totalMatches;
            player.stats.minutes = totalMinutes;
            player.stats.lineups = totalMatches;
            
            // 主要リーグ情報も更新
            if (mainLeague) {
                player.league = mainLeague.leagueName;
                player.leagueId = mainLeague.leagueId;
                player.currentTeam = mainLeague.teamName;
                player.teamId = mainLeague.teamId;
            }
            
            player.season = '2025/2026';
            player.lastUpdated = new Date().toISOString();
            
            if (totalGoals > 0 || totalAssists > 0) {
                console.log(`✅ ${player.name}: ${totalGoals}G ${totalAssists}A ${totalMatches}試合 (${player.currentTeam}) [旧: ${oldGoals}G ${oldAssists}A]`);
                updatedCount++;
            }
        }
    }
    
    // 保存
    await fs.writeFile(PLAYERS_FILE, JSON.stringify(players, null, 2));
    
    console.log('\n============================================================');
    console.log(`✅ 完了`);
    console.log(`📊 2025/26シーズンデータで更新: ${updatedCount}名`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('============================================================');
}

main().catch(console.error);

