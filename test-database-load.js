/**
 * DatabaseManagerからデータが正しく読み込めるかテストするスクリプト
 */

require('dotenv').config();
const path = require('path');

async function testDatabaseLoad() {
    try {
        console.log('🧪 DatabaseManagerのデータ読み込みテストを開始...');
        console.log(`📊 STORAGE_MODE: ${process.env.STORAGE_MODE || 'file (デフォルト)'}`);
        
        // apiServiceを初期化
        const apiServicePath = path.join(__dirname, 'apiService.js');
        if (!require('fs').existsSync(apiServicePath)) {
            console.error('❌ apiService.jsが見つかりません');
            process.exit(1);
        }
        
        const APIService = require('./apiService');
        const apiService = new APIService();
        
        // DatabaseManagerが利用可能か確認
        if (!apiService.dbManager) {
            console.error('❌ DatabaseManagerが初期化されていません');
            process.exit(1);
        }
        
        console.log(`✅ DatabaseManager初期化完了 (STORAGE_MODE=${apiService.dbManager.storageMode})`);
        
        // データを読み込む
        console.log('🔄 選手データを読み込み中...');
        const startTime = Date.now();
        const players = await apiService.dbManager.loadComprehensivePlayers(100); // 最初の100件のみ
        const loadTime = Date.now() - startTime;
        
        if (players && players.length > 0) {
            console.log(`✅ 成功！${players.length}名の選手データを読み込みました（${loadTime}ms）`);
            console.log('\n📋 サンプルデータ（最初の3名）:');
            players.slice(0, 3).forEach((player, index) => {
                console.log(`\n  ${index + 1}. ${player.name || '名前なし'}`);
                console.log(`     ID: ${player.id || 'なし'}`);
                console.log(`     チーム: ${player.currentTeam || player.team || 'なし'}`);
                console.log(`     リーグ: ${player.league || 'なし'}`);
            });
            
            // 全件数を取得（時間がかかる可能性があるため、オプション）
            console.log('\n📊 全件数を取得中...（時間がかかる場合があります）');
            const allPlayers = await apiService.dbManager.loadComprehensivePlayers();
            console.log(`✅ 総選手数: ${allPlayers.length}名`);
            
            process.exit(0);
        } else {
            console.error('❌ 選手データが空です');
            console.log('   データソースを確認してください:');
            console.log(`   - STORAGE_MODE: ${apiService.dbManager.storageMode}`);
            if (apiService.dbManager.storageMode === 'file') {
                console.log(`   - ファイルパス: ${apiService.dbManager.playersPath}`);
                const fs = require('fs');
                if (fs.existsSync(apiService.dbManager.playersPath)) {
                    const stats = fs.statSync(apiService.dbManager.playersPath);
                    console.log(`   - ファイルサイズ: ${(stats.size / (1024 * 1024)).toFixed(2)}MB`);
                } else {
                    console.log('   - ⚠️ ファイルが存在しません');
                }
            }
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ テストエラー:', error);
        console.error('   スタックトレース:', error.stack);
        process.exit(1);
    }
}

testDatabaseLoad();
