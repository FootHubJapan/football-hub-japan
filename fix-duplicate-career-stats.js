#!/usr/bin/env node

/**
 * 重複したキャリアスタッツデータを修正するスクリプト
 * 同じシーズン・同じチーム・同じリーグ・同じ統計の重複データを削除
 */

const fs = require('fs');
const path = require('path');

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

function removeDuplicateCareerStats(players) {
    let totalRemoved = 0;
    let playersFixed = 0;
    
    players.forEach((player, index) => {
        if (!player.careerStats || !Array.isArray(player.careerStats) || player.careerStats.length === 0) {
            return;
        }
        
        const originalLength = player.careerStats.length;
        const uniqueStats = [];
        const seen = new Set();
        
        // シーズンでソート（新しい順）
        const sorted = [...player.careerStats].sort((a, b) => {
            const aYear = parseInt(a.season?.split('/')[0] || 0);
            const bYear = parseInt(b.season?.split('/')[0] || 0);
            return bYear - aYear;
        });
        
        sorted.forEach(stat => {
            const season = stat.season || 'Unknown';
            const teamName = (stat.teamName || stat.team || 'Unknown').toLowerCase();
            const leagueName = (stat.leagueName || stat.league || 'Unknown').toLowerCase();
            const matches = stat.matches || stat.appearances || 0;
            const goals = stat.goals || 0;
            const assists = stat.assists || 0;
            
            // 重複チェック用のキーを作成（シーズンを含む）
            const key = `${season}|${teamName}|${leagueName}|${matches}|${goals}|${assists}`;
            
            // 同じシーズン・同じチーム・同じリーグ・同じ統計のデータが既に存在する場合はスキップ
            if (seen.has(key)) {
                // 既存のデータを確認
                const existingIndex = uniqueStats.findIndex(s => {
                    const sTeam = (s.teamName || s.team || 'Unknown').toLowerCase();
                    const sLeague = (s.leagueName || s.league || 'Unknown').toLowerCase();
                    const sMatches = s.matches || s.appearances || 0;
                    const sGoals = s.goals || 0;
                    const sAssists = s.assists || 0;
                    return s.season === season && sTeam === teamName && sLeague === leagueName && 
                           sMatches === matches && sGoals === goals && sAssists === assists;
                });
                
                if (existingIndex >= 0) {
                    const existing = uniqueStats[existingIndex];
                    const existingDate = existing.lastUpdated ? new Date(existing.lastUpdated) : new Date(0);
                    const newDate = stat.lastUpdated ? new Date(stat.lastUpdated) : new Date(0);
                    
                    // より新しいデータで置き換え（api-football-latestを優先）
                    if (newDate > existingDate || stat.source === 'api-football-latest') {
                        uniqueStats[existingIndex] = stat;
                    }
                    // それ以外は既存のデータを保持
                }
                return; // 重複なのでスキップ
            }
            
            // シーズンが異なるが、同じチーム・同じリーグ・同じ統計のデータが存在する場合は、最新シーズンのみを保持
            const duplicateIndex = uniqueStats.findIndex(s => {
                const sTeam = (s.teamName || s.team || 'Unknown').toLowerCase();
                const sLeague = (s.leagueName || s.league || 'Unknown').toLowerCase();
                const sMatches = s.matches || s.appearances || 0;
                const sGoals = s.goals || 0;
                const sAssists = s.assists || 0;
                // シーズンは異なるが、チーム・リーグ・統計が同じ
                return s.season !== season && sTeam === teamName && sLeague === leagueName && 
                       sMatches === matches && sGoals === goals && sAssists === assists;
            });
            
            if (duplicateIndex >= 0) {
                const existing = uniqueStats[duplicateIndex];
                const existingYear = parseInt(existing.season?.split('/')[0] || 0);
                const newYear = parseInt(season.split('/')[0] || 0);
                
                // より新しいシーズンのデータで置き換え
                if (newYear > existingYear) {
                    uniqueStats[duplicateIndex] = stat;
                    console.log(`  🔄 ${player.name}: ${existing.season} → ${season} (同じ統計データ)`);
                }
                // それ以外は既存のデータを保持
                return;
            }
            
            seen.add(key);
            uniqueStats.push(stat);
        });
        
        if (uniqueStats.length < originalLength) {
            player.careerStats = uniqueStats;
            totalRemoved += (originalLength - uniqueStats.length);
            playersFixed++;
            
            if (playersFixed <= 10) {
                console.log(`✅ ${player.name}: ${originalLength} → ${uniqueStats.length} (${originalLength - uniqueStats.length}件削除)`);
            }
        }
    });
    
    return { totalRemoved, playersFixed };
}

async function main() {
    console.log('🚀 重複したキャリアスタッツデータを修正開始...\n');
    
    // データ読み込み
    const data = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
    const players = Array.isArray(data) ? data : (data.players || []);
    
    console.log(`📊 総選手数: ${players.length}名\n`);
    
    // 重複データを削除
    const { totalRemoved, playersFixed } = removeDuplicateCareerStats(players);
    
    // データを保存
    const outputData = Array.isArray(data) ? players : { players: players };
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(outputData, null, 2));
    
    console.log('\n============================================================');
    console.log('✅ 修正完了');
    console.log(`📊 修正した選手数: ${playersFixed}名`);
    console.log(`📊 削除した重複データ: ${totalRemoved}件`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('============================================================');
}

main().catch(console.error);
