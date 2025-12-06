#!/usr/bin/env node

/**
 * 試合終了後の自動更新スケジューラー
 * 
 * このスクリプトは、試合が終了した後に自動的に選手データを更新します。
 * RenderのCron JobsやGitHub Actionsなどで定期実行することを想定しています。
 * 
 * 実行頻度の推奨:
 * - 毎時実行（試合が終了する可能性がある時間帯）
 * - または、試合終了後の特定時間（例: 毎日23:00, 02:00, 05:00など）
 */

const { checkAndUpdateFinishedMatches } = require('./update-finished-matches');

async function main() {
    console.log('🕐 スケジュール実行: 終了した試合の選手データを更新中...');
    console.log(`📅 実行時刻: ${new Date().toISOString()}\n`);
    
    try {
        await checkAndUpdateFinishedMatches();
        console.log('\n✅ スケジュール実行が完了しました');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ スケジュール実行エラー:', error.message);
        process.exit(1);
    }
}

main();

