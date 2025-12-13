#!/usr/bin/env node

/**
 * Mbeumoの正しいデータをEntry 1に統合するスクリプト
 * Entry 2の正しい2025/26シーズンデータをEntry 1に追加
 */

const fs = require('fs');
const path = require('path');

const playersDataPath = path.join(__dirname, 'data', 'players.json');

console.log('📁 データファイルを読み込み中...');
const data = JSON.parse(fs.readFileSync(playersDataPath, 'utf8'));
const players = Array.isArray(data) ? data : (data.players || []);

console.log(`✅ ${players.length}名の選手データを読み込みました`);

// Entry 1とEntry 2を取得
const entry1 = players.find(p => p.id === 'api_20589');
const entry2 = players.find(p => p.id === 20589 && p.id !== 'api_20589');

if (!entry1) {
    console.error('❌ Entry 1 (api_20589) が見つかりません');
    process.exit(1);
}

if (!entry2) {
    console.error('❌ Entry 2 (20589) が見つかりません');
    process.exit(1);
}

console.log('\n📊 Entry 1の現在の状態:');
console.log(`   - ID: ${entry1.id}`);
console.log(`   - Current Team: ${entry1.currentTeam}`);
console.log(`   - Stats配列の長さ: ${Array.isArray(entry1.stats) ? entry1.stats.length : 'N/A'}`);

console.log('\n📊 Entry 2の2025/26データ:');
const season2025Data = entry2.stats && Array.isArray(entry2.stats) 
    ? entry2.stats.find(s => s.season && (s.season.includes('2025') || s.season.includes('25/26')))
    : null;

if (!season2025Data) {
    console.error('❌ Entry 2に2025/26シーズンのデータが見つかりません');
    process.exit(1);
}

console.log(`   - シーズン: ${season2025Data.season}`);
console.log(`   - チーム: ${season2025Data.teamName}`);
console.log(`   - 試合数: ${season2025Data.appearances}`);
console.log(`   - ゴール: ${season2025Data.goals}`);
console.log(`   - アシスト: ${season2025Data.assists}`);

// Entry 1のstats配列に2025/26データを追加または更新
if (!Array.isArray(entry1.stats)) {
    entry1.stats = [];
}

// 既存の2025/26データがあるかチェック
const existingIndex = entry1.stats.findIndex(s => {
    const season = s.season || s.seasonName || '';
    return season.includes('2025') || season.includes('25/26') || season.includes('25/2026');
});

if (existingIndex >= 0) {
    console.log(`\n🔄 既存の2025/26データを更新中（インデックス: ${existingIndex}）...`);
    entry1.stats[existingIndex] = { ...season2025Data };
} else {
    console.log('\n➕ 新しい2025/26データを追加中...');
    entry1.stats.push({ ...season2025Data });
}

// Entry 1のcurrentTeamも更新（Entry 2の方が新しい可能性がある）
if (entry2.currentTeam && entry2.currentTeam !== entry1.currentTeam) {
    console.log(`\n🔄 Current Teamを更新: ${entry1.currentTeam} → ${entry2.currentTeam}`);
    entry1.currentTeam = entry2.currentTeam;
}

// バックアップを作成
const backupPath = path.join(__dirname, 'data', `players-backup-${new Date().toISOString().replace(/:/g, '-').split('.')[0]}.json`);
console.log(`\n💾 バックアップを作成中: ${backupPath}`);
fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));

// 修正したデータを保存
console.log(`\n💾 修正したデータを保存中...`);
const outputData = Array.isArray(data) ? players : { ...data, players: players };
fs.writeFileSync(playersDataPath, JSON.stringify(outputData, null, 2));

console.log(`\n✅ 完了！Entry 1に正しい2025/26データが反映されました`);
console.log(`   - シーズン: ${season2025Data.season}`);
console.log(`   - 試合数: ${season2025Data.appearances}`);
console.log(`   - ゴール: ${season2025Data.goals}`);
console.log(`   - アシスト: ${season2025Data.assists}`);

