const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs');
const path = require('path');

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const BATCH_SIZE = 10;
const MAX_BATCHES = 100; // 最大100バッチ（1,000名）まで実行

function getPossibleSeasonsCount(player) {
    const currentYear = new Date().getFullYear();
    const startYear = 2007;
    let birthYear = null;
    if (player.age) {
        birthYear = currentYear - player.age;
    } else if (player.birthday || player.dateOfBirth) {
        const birthDate = new Date(player.birthday || player.dateOfBirth);
        birthYear = birthDate.getFullYear();
    }
    if (!birthYear) {
        return 19;
    }
    const debutYear = birthYear + 16;
    const possibleStartYear = Math.max(startYear, debutYear);
    const possibleEndYear = currentYear;
    const possibleSeasons = Math.max(0, possibleEndYear - possibleStartYear + 1);
    return possibleSeasons;
}

async function getProgress() {
    try {
        const data = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
        const players = Array.isArray(data) ? data : (data.players || []);
        const playersWithId = players.filter(p => p.playerId);
        
        // 進捗計算: 3シーズン以上、または取得可能なシーズン数の80%以上を取得している選手を「更新済み」とみなす
        // または、取得可能なシーズン数が3以下の場合は、2シーズン以上取得していれば「更新済み」とみなす
        // または、careerStatsUpdatedが存在する場合は、既に更新を試みたとみなして「更新済み」とする
        const playersWithCareerStats = playersWithId.filter(p => {
            // careerStatsUpdatedが存在する場合は、既に更新を試みたとみなして「更新済み」とする
            if (p.careerStatsUpdated) {
                return true;
            }
            
            if (!p.careerStats || !Array.isArray(p.careerStats) || p.careerStats.length === 0) {
                return false;
            }
            const existingSeasonsCount = p.careerStats.length;
            if (existingSeasonsCount >= 3) {
                return true;
            }
            const possibleSeasonsCount = getPossibleSeasonsCount(p);
            // 取得可能なシーズン数が3以下の場合、2シーズン以上取得していれば「更新済み」とみなす
            if (possibleSeasonsCount <= 3) {
                if (existingSeasonsCount >= 2) {
                    return true;
                }
            }
            // 取得可能なシーズン数が4以下の場合、2シーズン以上取得していれば「更新済み」とみなす
            if (possibleSeasonsCount <= 4) {
                if (existingSeasonsCount >= 2) {
                    return true;
                }
            }
            // 取得可能なシーズン数が5以上の場合、80%以上取得していれば「更新済み」とみなす
            if (existingSeasonsCount >= Math.ceil(possibleSeasonsCount * 0.8)) {
                return true;
            }
            return false;
        });
        
        const playersNeedingUpdate = playersWithId.filter(p => {
            // careerStatsUpdatedが存在する場合は、既に更新を試みたとみなして「更新済み」とする
            if (p.careerStatsUpdated) {
                return false;
            }
            
            if (!p.careerStats || !Array.isArray(p.careerStats) || p.careerStats.length === 0) {
                return true;
            }
            const existingSeasonsCount = p.careerStats.length;
            if (existingSeasonsCount >= 3) {
                return false;
            }
            const possibleSeasonsCount = getPossibleSeasonsCount(p);
            // 取得可能なシーズン数が3以下の場合、2シーズン以上取得していれば「更新済み」とみなす
            if (possibleSeasonsCount <= 3) {
                if (existingSeasonsCount >= 2) {
                    return false;
                }
            }
            // 取得可能なシーズン数が4以下の場合、2シーズン以上取得していれば「更新済み」とみなす
            if (possibleSeasonsCount <= 4) {
                if (existingSeasonsCount >= 2) {
                    return false;
                }
            }
            // 取得可能なシーズン数が5以上の場合、80%以上取得していれば「更新済み」とみなす
            if (existingSeasonsCount >= Math.ceil(possibleSeasonsCount * 0.8)) {
                return false;
            }
            return true;
        });
        
        return {
            total: playersWithId.length,
            completed: playersWithCareerStats.length,
            remaining: playersNeedingUpdate.length,
            progress: ((playersWithCareerStats.length / playersWithId.length) * 100).toFixed(1)
        };
    } catch (error) {
        console.error('進捗取得エラー:', error.message);
        return null;
    }
}

async function runBatch(batchNumber) {
    const logFile = `update-career-stats-${Date.now()}.log`;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 バッチ ${batchNumber} を実行中... (${BATCH_SIZE}名)`);
    console.log(`${'='.repeat(60)}\n`);
    
    try {
        const { stdout, stderr } = await execAsync(
            `node update-all-players-with-career.js ${BATCH_SIZE}`,
            { 
                cwd: __dirname,
                maxBuffer: 10 * 1024 * 1024 // 10MB
            }
        );
        
        // エラーが含まれているかチェック
        if (stderr && (stderr.includes('API_REQUEST_LIMIT_REACHED') || stderr.includes('request limit'))) {
            console.error('\n⚠️ APIリクエスト制限に達しました。処理を停止します。');
            return false; // 制限に達した場合は停止
        }
        
        // 進捗を表示
        const progress = await getProgress();
        if (progress) {
            console.log(`\n✅ バッチ ${batchNumber} 完了`);
            console.log(`📊 進捗: ${progress.progress}% (${progress.completed}/${progress.total})`);
            console.log(`📊 残り: ${progress.remaining}名\n`);
        }
        
        return true; // 成功
    } catch (error) {
        // エラーメッセージをチェック
        if (error.message && (error.message.includes('API_REQUEST_LIMIT_REACHED') || error.message.includes('request limit'))) {
            console.error('\n⚠️ APIリクエスト制限に達しました。処理を停止します。');
            return false; // 制限に達した場合は停止
        }
        
        console.error(`\n❌ バッチ ${batchNumber} でエラーが発生しました:`, error.message);
        return true; // エラーでも続行（一時的なエラーの可能性）
    }
}

async function runContinuous() {
    console.log('🚀 キャリアスタッツの連続更新を開始します...\n');
    
    // 初期進捗を表示
    const initialProgress = await getProgress();
    if (initialProgress) {
        console.log(`📊 初期状態:`);
        console.log(`   進捗: ${initialProgress.progress}% (${initialProgress.completed}/${initialProgress.total})`);
        console.log(`   残り: ${initialProgress.remaining}名\n`);
    }
    
    let batchNumber = 1;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;
    
    while (batchNumber <= MAX_BATCHES) {
        const success = await runBatch(batchNumber);
        
        if (!success) {
            // API制限に達した場合は停止
            console.log('\n⏸️  APIリクエスト制限のため、処理を停止しました。');
            console.log('   しばらく待ってから再実行してください。\n');
            break;
        }
        
        // 進捗を確認
        const progress = await getProgress();
        if (progress && progress.remaining === 0) {
            console.log('\n🎉 すべての選手の更新が完了しました！\n');
            break;
        }
        
        batchNumber++;
        
        // 次のバッチまでの短い待機時間（1秒）
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 最終進捗を表示
    const finalProgress = await getProgress();
    if (finalProgress) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📊 最終進捗:`);
        console.log(`   進捗: ${finalProgress.progress}% (${finalProgress.completed}/${finalProgress.total})`);
        console.log(`   残り: ${finalProgress.remaining}名`);
        console.log(`   実行したバッチ数: ${batchNumber - 1}`);
        console.log(`${'='.repeat(60)}\n`);
    }
}

runContinuous().catch(error => {
    console.error('❌ 致命的なエラー:', error);
    process.exit(1);
});

