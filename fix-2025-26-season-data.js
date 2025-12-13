#!/usr/bin/env node

/**
 * 2025/26シーズンの誤データ修正スクリプト
 * 試合数30試合以上のデータは2024/25シーズンのデータが間違って保存されている可能性が高いため削除
 */

const fs = require('fs');
const path = require('path');

const playersDataPath = path.join(__dirname, 'data', 'players.json');
const europeanLeagues = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'Champions League'];

console.log('📁 データファイルを読み込み中...');
const data = JSON.parse(fs.readFileSync(playersDataPath, 'utf8'));
const players = Array.isArray(data) ? data : (data.players || []);

console.log(`✅ ${players.length}名の選手データを読み込みました`);

let fixedCount = 0;
let removedCount = 0;
const fixedPlayers = [];

players.forEach((player, index) => {
    let modified = false;
    
    // statsが配列の場合
    if (player.stats && Array.isArray(player.stats)) {
        const originalLength = player.stats.length;
        
        // 2025/26シーズンのデータで30試合以上のものを削除
        player.stats = player.stats.filter(stat => {
            const statSeason = String(stat.season || stat.seasonName || '');
            const is2025Season = statSeason.includes('2025') || statSeason.includes('25/26') || statSeason.includes('25/2026');
            const league = stat.leagueName || stat.league || player.league || '';
            const isEuropeanLeague = europeanLeagues.some(el => league.includes(el));
            
            if (is2025Season && isEuropeanLeague && stat.appearances >= 30) {
                console.log(`❌ 削除: ${player.name} (${league}): ${stat.appearances}試合, シーズン: ${statSeason}`);
                removedCount++;
                modified = true;
                return false;
            }
            return true;
        });
        
        if (player.stats.length !== originalLength) {
            modified = true;
        }
    }
    // statsが単一オブジェクトの場合
    else if (player.stats && typeof player.stats === 'object' && !Array.isArray(player.stats)) {
        const statSeason = String(player.stats.season || player.stats.seasonName || '');
        const is2025Season = statSeason.includes('2025') || statSeason.includes('25/26') || statSeason.includes('25/2026');
        const league = player.league || '';
        const isEuropeanLeague = europeanLeagues.some(el => league.includes(el));
        
        if (is2025Season && isEuropeanLeague && player.stats.appearances >= 30) {
            console.log(`❌ 削除（単一オブジェクト）: ${player.name} (${league}): ${player.stats.appearances}試合`);
            // statsを空の配列に変更（後で他のデータソースから取得できる可能性があるため）
            player.stats = [];
            removedCount++;
            modified = true;
        }
    }
    
    if (modified) {
        fixedCount++;
        fixedPlayers.push({
            name: player.name,
            id: player.id || player.playerId,
            team: player.currentTeam
        });
    }
});

console.log(`\n✅ 修正完了:`);
console.log(`   - 修正された選手: ${fixedCount}名`);
console.log(`   - 削除されたデータ: ${removedCount}件`);

// バックアップを作成
const backupPath = path.join(__dirname, 'data', `players-backup-${new Date().toISOString().replace(/:/g, '-').split('.')[0]}.json`);
console.log(`\n💾 バックアップを作成中: ${backupPath}`);
fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));

// 修正したデータを保存
console.log(`\n💾 修正したデータを保存中...`);
const outputData = Array.isArray(data) ? players : { ...data, players: players };
fs.writeFileSync(playersDataPath, JSON.stringify(outputData, null, 2));

console.log(`\n✅ 完了！修正された選手のリスト:`);
fixedPlayers.slice(0, 20).forEach((p, idx) => {
    console.log(`   ${idx + 1}. ${p.name} (ID: ${p.id})`);
});
if (fixedPlayers.length > 20) {
    console.log(`   ... 他 ${fixedPlayers.length - 20}名`);
}

