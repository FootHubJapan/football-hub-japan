/**
 * Render Cron用の試合更新ジョブ
 * 終了した試合を検知して選手スタッツを更新
 * 
 * 使用方法:
 * - Render Cron: 5分ごと
 * - 保険の再同期: 毎日4:30
 */

require('dotenv').config();
const { checkAndUpdateFinishedMatches } = require('../update-finished-matches');

async function main() {
    console.log('🚀 試合更新ジョブを開始...');
    console.log(`   ストレージモード: ${process.env.STORAGE_MODE || 'file'}`);
    console.log(`   環境: ${process.env.RENDER ? 'Render' : 'ローカル'}`);
    
    try {
        await checkAndUpdateFinishedMatches();
        console.log('\n✅ 試合更新ジョブが完了しました');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ 試合更新ジョブエラー:', error);
        process.exit(1);
    }
}

// 実行
main();
