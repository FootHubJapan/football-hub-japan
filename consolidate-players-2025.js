#!/usr/bin/env node

/**
 * 選手データを統合し、最も重要な統計を選択（2025/2026シーズン）
 * 同じ選手が複数のリーグに登録されている場合、最も重要な統計を持つものを選択
 */

const fs = require('fs').promises;
const path = require('path');

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

// リーグの優先度（数字が大きいほど優先）
const LEAGUE_PRIORITY = {
    'Premier League': 100,
    'La Liga': 99,
    'Bundesliga': 98,
    'Serie A': 97,
    'Ligue 1': 96,
    'Eredivisie': 90,
    'Primeira Liga': 89,
    'J1 League': 85,
    'Major League Soccer': 80,
    'Pro League': 75,
    'UEFA Champions League': 95,
    'UEFA Europa League': 85,
    'UEFA Europa Conference League': 80,
    'FIFA Club World Cup': 70,
    'Community Shield': 10,
    'League Cup': 15,
    'DFB Pokal': 15,
    'Coppa Italia': 15,
    'King\'s Cup': 15,
    'Super Cup': 10,
    'Friendlies Clubs': 5
};

// 統計の重要度を計算
function calculateImportance(player) {
    const stats = player.stats || {};
    const leaguePriority = LEAGUE_PRIORITY[player.league] || 0;
    
    // 出場数、ゴール、アシスト、プレイ時間を考慮
    const statsScore = 
        (stats.appearances || 0) * 10 +
        (stats.goals || 0) * 5 +
        (stats.assists || 0) * 3 +
        (stats.minutes || 0) / 10;
    
    return leaguePriority * 100 + statsScore;
}

async function main() {
    console.log('🚀 選手データを統合中...\n');
    
    // データを読み込み
    const playersData = JSON.parse(await fs.readFile(PLAYERS_FILE, 'utf8'));
    console.log(`📊 ${playersData.length}名の選手データを読み込みました`);
    
    // 選手名でグループ化
    const playerGroups = {};
    
    for (const player of playersData) {
        const key = player.name.toLowerCase().trim();
        
        if (!playerGroups[key]) {
            playerGroups[key] = [];
        }
        
        playerGroups[key].push(player);
    }
    
    console.log(`👥 ${Object.keys(playerGroups).length}名のユニーク選手を検出\n`);
    
    // 各グループから最も重要な統計を持つ選手を選択
    const consolidatedPlayers = [];
    let consolidatedCount = 0;
    
    for (const [name, players] of Object.entries(playerGroups)) {
        if (players.length === 1) {
            consolidatedPlayers.push(players[0]);
        } else {
            // 複数のエントリがある場合、最も重要なものを選択
            players.sort((a, b) => calculateImportance(b) - calculateImportance(a));
            const best = players[0];
            
            console.log(`🔄 統合: ${best.name}`);
            console.log(`   ✅ 選択: ${best.league} (${best.stats.appearances}試合, ${best.stats.goals}G, ${best.stats.assists}A)`);
            
            if (players.length > 1) {
                console.log(`   📋 その他のリーグ: ${players.slice(1).map(p => `${p.league} (${p.stats.appearances}試合)`).join(', ')}`);
            }
            
            consolidatedPlayers.push(best);
            consolidatedCount++;
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`✅ 統合完了`);
    console.log(`📊 統合前: ${playersData.length}名`);
    console.log(`📊 統合後: ${consolidatedPlayers.length}名`);
    console.log(`🔄 統合された選手: ${consolidatedCount}名`);
    console.log('='.repeat(60));
    
    // データを保存
    await fs.writeFile(PLAYERS_FILE, JSON.stringify(consolidatedPlayers, null, 2));
    console.log(`\n✅ データを保存しました: ${PLAYERS_FILE}`);
    
    // トップ選手を表示
    console.log('\n📈 トップスコアラー（統合後）:');
    const topScorers = consolidatedPlayers
        .filter(p => p.stats.goals > 5)
        .sort((a, b) => b.stats.goals - a.stats.goals)
        .slice(0, 20);
    
    topScorers.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.name} (${p.currentTeam}, ${p.league}): ${p.stats.goals}G ${p.stats.assists}A ${p.stats.appearances}試合`);
    });
}

main().catch(error => {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
});

