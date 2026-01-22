#!/usr/bin/env node

/**
 * 全選手の2025/26シーズンとキャリアスタッツを継続的に更新するスクリプト
 * APIリクエスト制限を考慮して、バッチ処理で実行
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const BATCH_SIZE = 100; // 1バッチあたりの更新数
const DELAY_BETWEEN_BATCHES = 60000; // バッチ間の待機時間（60秒）
const MAX_BATCHES = 50; // 最大バッチ数（API制限を考慮）

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const PROGRESS_FILE = path.join(__dirname, 'data', 'update-progress.json');

// 進捗状況を読み込み
function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        } catch (e) {
            return { lastBatch: 0, totalUpdated: 0 };
        }
    }
    return { lastBatch: 0, totalUpdated: 0 };
}

// 進捗状況を保存
function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// 未更新の選手数を取得
function getRemainingCount() {
    try {
        const data = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
        const players = Array.isArray(data) ? data : (data.players || []);
        const playersWithId = players.filter(p => p.playerId);
        const alreadyUpdated = players.filter(p => 
            p.stats && Array.isArray(p.stats) && p.stats.some(s => s.season === '2025/2026')
        );
        return playersWithId.length - alreadyUpdated.length;
    } catch (e) {
        return 0;
    }
}

// バッチを実行
function runBatch(batchNumber) {
    return new Promise((resolve, reject) => {
        console.log(`\n🚀 バッチ ${batchNumber} を実行中... (${BATCH_SIZE}名)`);
        
        const command = `node update-all-players-with-career.js ${BATCH_SIZE}`;
        
        exec(command, { cwd: __dirname }, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ バッチ ${batchNumber} でエラー:`, error.message);
                // API制限エラーの場合は待機
                if (stderr.includes('request limit') || stderr.includes('429')) {
                    console.log('⏳ API制限に達しました。60秒待機してから再試行...');
                    setTimeout(() => resolve(false), 60000);
                    return;
                }
                reject(error);
                return;
            }
            
            console.log(`✅ バッチ ${batchNumber} 完了`);
            console.log(stdout);
            
            resolve(true);
        });
    });
}

// メイン処理
async function main() {
    console.log('🚀 全選手の2025/26シーズンとキャリアスタッツを継続的に更新開始...\n');
    
    const progress = loadProgress();
    let currentBatch = progress.lastBatch + 1;
    let totalUpdated = progress.totalUpdated;
    
    console.log(`📊 現在の進捗: バッチ ${progress.lastBatch} 完了、${totalUpdated}名更新済み`);
    
    let remaining = getRemainingCount();
    console.log(`📊 未更新の選手: ${remaining}名\n`);
    
    if (remaining === 0) {
        console.log('✅ 全選手の更新が完了しています！');
        return;
    }
    
    const batchesToRun = Math.min(
        Math.ceil(remaining / BATCH_SIZE),
        MAX_BATCHES - progress.lastBatch
    );
    
    console.log(`📊 実行予定のバッチ数: ${batchesToRun}\n`);
    
    for (let i = 0; i < batchesToRun; i++) {
        const batchNumber = currentBatch + i;
        
        try {
            const success = await runBatch(batchNumber);
            
            if (success) {
                // 進捗を更新
                progress.lastBatch = batchNumber;
                progress.totalUpdated = totalUpdated + BATCH_SIZE;
                saveProgress(progress);
                
                // 残り数を再計算
                remaining = getRemainingCount();
                console.log(`\n📊 残り未更新選手: ${remaining}名`);
                
                if (remaining === 0) {
                    console.log('\n✅ 全選手の更新が完了しました！');
                    break;
                }
                
                // バッチ間の待機（最後のバッチ以外）
                if (i < batchesToRun - 1) {
                    console.log(`\n⏳ ${DELAY_BETWEEN_BATCHES / 1000}秒待機中...\n`);
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
                }
            } else {
                // API制限エラーの場合は待機して再試行
                console.log(`\n⏳ API制限のため、${DELAY_BETWEEN_BATCHES / 1000}秒待機してから再試行...\n`);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
                i--; // 同じバッチを再試行
            }
        } catch (error) {
            console.error(`❌ バッチ ${batchNumber} でエラーが発生:`, error.message);
            console.log('⏳ 60秒待機してから次のバッチに進みます...\n');
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
    }
    
    remaining = getRemainingCount();
    console.log('\n============================================================');
    console.log('📊 更新セッション完了');
    console.log(`📊 今回更新した選手: ${progress.totalUpdated - totalUpdated}名`);
    console.log(`📊 残り未更新選手: ${remaining}名`);
    console.log(`📊 次回実行時の開始バッチ: ${progress.lastBatch + 1}`);
    console.log('============================================================');
    
    if (remaining > 0) {
        console.log('\n💡 続きを実行するには、再度このスクリプトを実行してください:');
        console.log('   node update-all-players-continuous.js\n');
    }
}

main().catch(console.error);
