#!/usr/bin/env node
/**
 * 未更新の選手をすべて更新するスクリプト
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

// 選手データを読み込み
const data = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
const players = Array.isArray(data) ? data : (data.players || []);
const playersWithId = players.filter(p => p.playerId);

// 更新が必要な選手を特定
const needsUpdate = playersWithId.filter(p => {
    const has2025Stats = p.stats && Array.isArray(p.stats) && p.stats.some(s => s.season === '2025/2026');
    const hasCareerStats = p.careerStats && Array.isArray(p.careerStats) && p.careerStats.length > 0;
    return !has2025Stats || !hasCareerStats;
});

console.log(`📊 更新が必要な選手: ${needsUpdate.length}名`);

// バッチサイズ（API制限を考慮）
const BATCH_SIZE = 50;
const TOTAL_BATCHES = Math.ceil(needsUpdate.length / BATCH_SIZE);

console.log(`📊 バッチ数: ${TOTAL_BATCHES}バッチ（1バッチあたり${BATCH_SIZE}名）\n`);

// 各バッチを実行
for (let i = 0; i < TOTAL_BATCHES; i++) {
    const batchNum = i + 1;
    console.log(`\n==========================================`);
    console.log(`バッチ ${batchNum}/${TOTAL_BATCHES} を実行中...`);
    console.log(`==========================================\n`);
    
    try {
        execSync(`node update-all-players-with-career.js ${BATCH_SIZE}`, {
            stdio: 'inherit',
            cwd: __dirname
        });
        
        if (batchNum < TOTAL_BATCHES) {
            console.log(`\nバッチ ${batchNum} 完了。次のバッチまで30秒待機...\n`);
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    } catch (error) {
        console.error(`❌ バッチ ${batchNum} でエラーが発生しました:`, error.message);
        console.log(`次のバッチに進みます...\n`);
    }
}

console.log('\n==========================================');
console.log('✅ 全バッチ完了！');
console.log('==========================================\n');
