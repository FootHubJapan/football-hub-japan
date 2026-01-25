#!/usr/bin/env node

/**
 * 全選手の2024/25と2025/26シーズンの重複データを修正するスクリプト
 * データベース内のデータを比較して、同じデータが重複している場合は修正
 */

const fs = require('fs');
const path = require('path');

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

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

function fixPlayer(player) {
    if (!player.careerStats || !Array.isArray(player.careerStats)) {
        return { fixed: false, reason: 'No careerStats' };
    }
    
    const stats2024 = player.careerStats.filter(cs => 
        cs.season === '2024/2025' || cs.season === '2024/25'
    );
    const stats2025 = player.careerStats.filter(cs => 
        cs.season === '2025/2026' || cs.season === '2025/26'
    );
    
    if (stats2024.length === 0 || stats2025.length === 0) {
        return { fixed: false, reason: 'No 2024 or 2025 data' };
    }
    
    let fixed = false;
    const changes = [];
    
    // 2025年のデータが2024年のデータと重複しているかチェック
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
            // 2025年のデータが2024年のデータと完全に同じ場合は、2025年のデータを削除またはマーク
            // ただし、これは実際のAPIデータと比較する必要があるため、ここではマークのみ
            stat2025.needsVerification = true;
            stat2025.duplicateWith2024 = true;
            fixed = true;
            changes.push({
                league: stat2025.leagueName || stat2025.league,
                team: stat2025.teamName || stat2025.team,
                action: 'Marked as duplicate with 2024/25'
            });
        }
    });
    
    return { fixed, changes, playerName: player.name };
}

async function main() {
    console.log('🚀 全選手の2024/25と2025/26シーズンの重複データを修正開始...\n');
    
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
    
    let fixedCount = 0;
    const fixedPlayers = [];
    
    for (let i = 0; i < playersWith2025.length; i++) {
        const player = playersWith2025[i];
        
        if ((i + 1) % 100 === 0) {
            console.log(`進捗: [${i + 1}/${playersWith2025.length}] (修正: ${fixedCount}名)`);
        }
        
        const result = fixPlayer(player);
        
        if (result.fixed) {
            fixedCount++;
            fixedPlayers.push(result);
            
            if (fixedCount <= 20) {
                console.log(`✅ ${player.name}: ${result.changes.length}件の重複を検出`);
            }
        }
    }
    
    // データを保存
    const outputData = Array.isArray(data) ? players : { players: players };
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(outputData, null, 2));
    
    console.log('\n============================================================');
    console.log('✅ 修正完了');
    console.log(`📊 チェックした選手数: ${playersWith2025.length}名`);
    console.log(`📊 重複を検出した選手数: ${fixedCount}名`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('============================================================');
    
    if (fixedPlayers.length > 0 && fixedPlayers.length <= 30) {
        console.log('\n📊 重複を検出した選手（最初の30名）:');
        fixedPlayers.slice(0, 30).forEach((fp, i) => {
            console.log(`  ${i + 1}. ${fp.playerName}: ${fp.changes.length}件`);
        });
    }
}

main().catch(console.error);
