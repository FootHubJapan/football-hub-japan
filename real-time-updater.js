#!/usr/bin/env node

/**
 * リアルタイムデータ更新システム
 * 自動スケジュール実行対応
 */

const { ComprehensiveDataIntegration } = require('./comprehensive-data-integration');
const cron = require('node-cron');

class RealTimeDataUpdater {
    constructor() {
        this.integration = new ComprehensiveDataIntegration();
        this.isRunning = false;
        this.lastUpdate = null;
        this.updateInterval = 30 * 60 * 1000; // 30分間隔
        this.scheduledTasks = [];
    }

    async startRealTimeUpdates() {
        try {
            console.log('🔄 リアルタイムデータ更新システム開始...');
            
            // 初回実行
            await this.performUpdate();
            
            // 定期実行スケジュール
            this.scheduleUpdates();
            
            console.log('✅ リアルタイムデータ更新システム開始完了');
            
        } catch (error) {
            console.error('❌ リアルタイム更新システム開始エラー:', error.message);
            throw error;
        }
    }

    scheduleUpdates() {
        // 毎時0分に実行（試合データ更新）
        const hourlyTask = cron.schedule('0 * * * *', async () => {
            console.log('⏰ 定期更新実行: 試合データ');
            await this.performMatchUpdate();
        }, { scheduled: false });

        // 毎日午前6時に実行（選手データ更新）
        const dailyTask = cron.schedule('0 6 * * *', async () => {
            console.log('⏰ 定期更新実行: 選手データ');
            await this.performPlayerUpdate();
        }, { scheduled: false });

        // 毎週日曜日午前2時に実行（全データ更新）
        const weeklyTask = cron.schedule('0 2 * * 0', async () => {
            console.log('⏰ 定期更新実行: 全データ');
            await this.performFullUpdate();
        }, { scheduled: false });

        this.scheduledTasks = [hourlyTask, dailyTask, weeklyTask];
        
        // スケジュール開始
        this.scheduledTasks.forEach(task => task.start());
        
        console.log('📅 更新スケジュール設定完了:');
        console.log('  - 試合データ: 毎時0分');
        console.log('  - 選手データ: 毎日午前6時');
        console.log('  - 全データ: 毎週日曜日午前2時');
    }

    async performUpdate() {
        if (this.isRunning) {
            console.log('⚠️ 更新処理が既に実行中です');
            return;
        }

        this.isRunning = true;
        try {
            console.log('🔄 データ更新実行中...');
            const result = await this.integration.runFullIntegration();
            this.lastUpdate = new Date().toISOString();
            
            console.log('✅ データ更新完了');
            console.log(`📊 更新結果: ${result.matches.length}試合, ${result.players.length}選手`);
            
            return result;
        } catch (error) {
            console.error('❌ データ更新エラー:', error.message);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    async performMatchUpdate() {
        try {
            console.log('⚽ 試合データ更新実行中...');
            const { allMatches } = await this.integration.fetchAllLeagueMatches();
            console.log(`✅ 試合データ更新完了: ${allMatches.length}試合`);
            return allMatches;
        } catch (error) {
            console.error('❌ 試合データ更新エラー:', error.message);
        }
    }

    async performPlayerUpdate() {
        try {
            console.log('👤 選手データ更新実行中...');
            const { allPlayerData } = await this.integration.fetchAllPlayerData();
            console.log(`✅ 選手データ更新完了: ${allPlayerData.length}選手`);
            return allPlayerData;
        } catch (error) {
            console.error('❌ 選手データ更新エラー:', error.message);
        }
    }

    async performFullUpdate() {
        try {
            console.log('🔄 全データ更新実行中...');
            const result = await this.performUpdate();
            console.log('✅ 全データ更新完了');
            return result;
        } catch (error) {
            console.error('❌ 全データ更新エラー:', error.message);
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            lastUpdate: this.lastUpdate,
            scheduledTasks: this.scheduledTasks.length,
            updateInterval: this.updateInterval,
            status: this.isRunning ? 'updating' : 'idle'
        };
    }

    stopUpdates() {
        console.log('🛑 リアルタイム更新システム停止中...');
        this.scheduledTasks.forEach(task => task.stop());
        this.scheduledTasks = [];
        console.log('✅ リアルタイム更新システム停止完了');
    }
}

// メイン実行
async function main() {
    try {
        const updater = new RealTimeDataUpdater();
        await updater.startRealTimeUpdates();
        
        // プロセス終了時のクリーンアップ
        process.on('SIGINT', () => {
            console.log('\n🛑 プロセス終了信号を受信');
            updater.stopUpdates();
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            console.log('\n🛑 プロセス終了信号を受信');
            updater.stopUpdates();
            process.exit(0);
        });
        
        // ステータス表示
        setInterval(() => {
            const status = updater.getStatus();
            console.log(`📊 システムステータス: ${status.status}, 最終更新: ${status.lastUpdate || '未実行'}`);
        }, 5 * 60 * 1000); // 5分間隔でステータス表示
        
    } catch (error) {
        console.error('❌ メイン処理エラー:', error.message);
        process.exit(1);
    }
}

// スクリプトが直接実行された場合のみmain()を実行
if (require.main === module) {
    main();
}

module.exports = { RealTimeDataUpdater };
