#!/usr/bin/env node

/**
 * 2025/26シーズンの正しいデータを統合するスクリプト
 * Entry 1（api_XXX形式）のstatsが空の場合、Entry 2（数値ID）の正しいデータをコピー
 */

const fs = require('fs');
const path = require('path');

const playersDataPath = path.join(__dirname, 'data', 'players.json');
const europeanLeagues = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'Champions League'];

console.log('📁 データファイルを読み込み中...');
const data = JSON.parse(fs.readFileSync(playersDataPath, 'utf8'));
const players = Array.isArray(data) ? data : (data.players || []);

console.log(`✅ ${players.length}名の選手データを読み込みました`);

// 選手をIDでグループ化
const playersById = {};
players.forEach(player => {
    const numericId = player.playerId || (player.id && typeof player.id === 'number' ? player.id : null);
    const apiId = player.id && typeof player.id === 'string' && player.id.startsWith('api_') ? player.id : null;
    
    if (numericId) {
        if (!playersById[numericId]) {
            playersById[numericId] = [];
        }
        playersById[numericId].push({ ...player, idType: 'numeric' });
    }
    
    if (apiId) {
        const numId = parseInt(apiId.replace('api_', ''), 10);
        if (!isNaN(numId)) {
            if (!playersById[numId]) {
                playersById[numId] = [];
            }
            playersById[numId].push({ ...player, idType: 'api' });
        }
    }
});

let mergedCount = 0;
const mergedPlayers = [];

// 各IDグループを処理
Object.keys(playersById).forEach(idStr => {
    const id = parseInt(idStr, 10);
    const group = playersById[id];
    
    if (group.length < 2) return; // 2つ以上のエントリがある場合のみ処理
    
    // Entry 1 (api_XXX形式) と Entry 2 (数値ID) を特定
    const entry1 = group.find(p => p.idType === 'api');
    const entry2 = group.find(p => p.idType === 'numeric');
    
    if (!entry1 || !entry2) return;
    
    // Entry 1のstatsが空または少ない場合、Entry 2の正しいデータをコピー
    const entry1Stats = Array.isArray(entry1.stats) ? entry1.stats : [];
    const entry2Stats = Array.isArray(entry2.stats) ? entry2.stats : [];
    
    // Entry 2に2025/26シーズンの正しいデータ（30試合未満）があるか確認
    const entry2HasCorrect2025 = entry2Stats.some(stat => {
        const statSeason = String(stat.season || stat.seasonName || '');
        const is2025Season = statSeason.includes('2025') || statSeason.includes('25/26') || statSeason.includes('25/2026');
        const league = stat.leagueName || stat.league || entry2.league || '';
        const isEuropeanLeague = europeanLeagues.some(el => league.includes(el));
        return is2025Season && isEuropeanLeague && stat.appearances < 30;
    });
    
    // Entry 1に2025/26シーズンのデータがない、または間違ったデータ（30試合以上）がある場合
    const entry1HasWrong2025 = entry1Stats.some(stat => {
        const statSeason = String(stat.season || stat.seasonName || '');
        const is2025Season = statSeason.includes('2025') || statSeason.includes('25/26') || statSeason.includes('25/2026');
        const league = stat.leagueName || stat.league || entry1.league || '';
        const isEuropeanLeague = europeanLeagues.some(el => league.includes(el));
        return is2025Season && isEuropeanLeague && stat.appearances >= 30;
    });
    
    const entry1HasNo2025 = !entry1Stats.some(stat => {
        const statSeason = String(stat.season || stat.seasonName || '');
        return statSeason.includes('2025') || statSeason.includes('25/26') || statSeason.includes('25/2026');
    });
    
    if (entry2HasCorrect2025 && (entry1HasNo2025 || entry1HasWrong2025 || entry1Stats.length === 0)) {
        // Entry 1のインデックスを取得
        const entry1Index = players.findIndex(p => p.id === entry1.id);
        
        if (entry1Index !== -1) {
            console.log(`✅ 統合: ${entry1.name} (ID: ${entry1.id})`);
            console.log(`   Entry 1のstats: ${entry1Stats.length}件 → Entry 2のstats: ${entry2Stats.length}件`);
            
            // Entry 2の正しいデータをコピー
            players[entry1Index].stats = entry2Stats;
            
            // currentTeamも更新（Entry 2の方が新しい可能性がある）
            if (entry2.currentTeam && entry2.currentTeam !== entry1.currentTeam) {
                players[entry1Index].currentTeam = entry2.currentTeam;
                console.log(`   チーム更新: ${entry1.currentTeam} → ${entry2.currentTeam}`);
            }
            
            mergedCount++;
            mergedPlayers.push({
                name: entry1.name,
                id: entry1.id,
                team: entry2.currentTeam || entry1.currentTeam
            });
        }
    }
});

console.log(`\n✅ 統合完了:`);
console.log(`   - 統合された選手: ${mergedCount}名`);

// バックアップを作成
const backupPath = path.join(__dirname, 'data', `players-backup-${new Date().toISOString().replace(/:/g, '-').split('.')[0]}.json`);
console.log(`\n💾 バックアップを作成中: ${backupPath}`);
fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));

// 修正したデータを保存
console.log(`\n💾 修正したデータを保存中...`);
const outputData = Array.isArray(data) ? players : { ...data, players: players };
fs.writeFileSync(playersDataPath, JSON.stringify(outputData, null, 2));

console.log(`\n✅ 完了！統合された選手のリスト:`);
mergedPlayers.slice(0, 20).forEach((p, idx) => {
    console.log(`   ${idx + 1}. ${p.name} (ID: ${p.id}, Team: ${p.team})`);
});
if (mergedPlayers.length > 20) {
    console.log(`   ... 他 ${mergedPlayers.length - 20}名`);
}

