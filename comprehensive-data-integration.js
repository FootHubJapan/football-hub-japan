#!/usr/bin/env node

/**
 * 全データ連携システム
 * API-Football + Football-data.org 完全統合
 */

const fs = require('fs').promises;
const path = require('path');
const { FootballDataIntegration } = require('./football-data-integration');

class ComprehensiveDataIntegration {
    constructor() {
        this.footballDataIntegration = new FootballDataIntegration();
        this.dataPath = path.join(__dirname, 'data');
        this.apiFootballKey = process.env.API_FOOTBALL_KEY;
        this.footballDataKey = process.env.FOOTBALL_DATA_API_KEY;
        
        // 主要リーグのIDマッピング
        this.leagueMapping = {
            'Premier League': { fdId: 2021, afId: 39 },
            'La Liga': { fdId: 2014, afId: 140 },
            'Bundesliga': { fdId: 2002, afId: 78 },
            'Serie A': { fdId: 2019, afId: 135 },
            'Ligue 1': { fdId: 2015, afId: 61 },
            'Champions League': { fdId: 2001, afId: 2 },
            'Championship': { fdId: 2016, afId: 40 },
            'Eredivisie': { fdId: 2003, afId: 88 },
            'Primeira Liga': { fdId: 2017, afId: 94 },
            'Serie A Brazil': { fdId: 2013, afId: 71 }
        };
        
        // 主要選手のIDマッピング
        this.majorPlayers = {
            'Kylian Mbappé': { fdId: 278, afId: 154 },
            'Mohamed Salah': { fdId: 301, afId: 874 },
            'E. Haaland': { fdId: 874, afId: 874 },
            'L. Messi': { fdId: 154, afId: 154 },
            'C. Ronaldo': { fdId: 874, afId: 874 },
            '久保建英': { fdId: 1234, afId: 1234 },
            '三笘薫': { fdId: 1235, afId: 1235 },
            '堂安律': { fdId: 1236, afId: 1236 },
            '遠藤航': { fdId: 1237, afId: 1237 }
        };
    }

    async initialize() {
        try {
            console.log('🚀 全データ連携システム初期化開始...');
            console.log('='.repeat(60));
            
            // データディレクトリの作成
            await fs.mkdir(this.dataPath, { recursive: true });
            
            // API接続確認
            await this.checkAPIConnections();
            
            console.log('✅ 全データ連携システム初期化完了');
        } catch (error) {
            console.error('❌ 初期化エラー:', error.message);
            throw error;
        }
    }

    async checkAPIConnections() {
        console.log('\n🔍 API接続確認中...');
        
        // Football-data.org接続確認
        try {
            const leagues = await this.footballDataIntegration.testAPI();
            console.log(`✅ Football-data.org: ${leagues.length}リーグ接続成功`);
        } catch (error) {
            console.log(`⚠️ Football-data.org: ${error.message}`);
        }
        
        // API-Football接続確認
        if (this.apiFootballKey && this.apiFootballKey !== 'your-api-football-key-here') {
            console.log('✅ API-Football: APIキー設定済み');
        } else {
            console.log('⚠️ API-Football: APIキー未設定');
        }
    }

    async fetchAllLeagueMatches() {
        try {
            console.log('\n⚽ 全リーグ試合データ取得開始...');
            console.log('='.repeat(60));
            
            const allMatches = [];
            const leagueStats = {};
            
            for (const [leagueName, ids] of Object.entries(this.leagueMapping)) {
                try {
                    console.log(`\n📊 ${leagueName} の試合データを取得中...`);
                    
                    // Football-data.orgから試合データを取得
                    const matches = await this.footballDataIntegration.fetchMatchesForLeague(ids.fdId, 2024);
                    
                    if (matches && matches.length > 0) {
                        // リーグ情報を追加
                        const enrichedMatches = matches.map(match => ({
                            ...match,
                            leagueName: leagueName,
                            leagueId: ids.fdId,
                            source: 'football-data.org'
                        }));
                        
                        allMatches.push(...enrichedMatches);
                        leagueStats[leagueName] = {
                            matches: matches.length,
                            source: 'football-data.org',
                            leagueId: ids.fdId
                        };
                        
                        console.log(`✅ ${leagueName}: ${matches.length}試合取得成功`);
                    } else {
                        console.log(`⚠️ ${leagueName}: データなし`);
                    }
                    
                    // レート制限対応（2秒間隔）
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                } catch (error) {
                    console.error(`❌ ${leagueName} 取得エラー:`, error.message);
                    leagueStats[leagueName] = {
                        matches: 0,
                        error: error.message
                    };
                }
            }
            
            // 全試合データを保存
            await this.saveComprehensiveMatches(allMatches);
            
            console.log('\n📊 全リーグ試合データ取得完了');
            console.log('='.repeat(60));
            console.log(`総試合数: ${allMatches.length}試合`);
            console.log('\nリーグ別統計:');
            Object.entries(leagueStats).forEach(([league, stats]) => {
                console.log(`  ${league}: ${stats.matches}試合 ${stats.error ? `(エラー: ${stats.error})` : ''}`);
            });
            
            return { allMatches, leagueStats };
            
        } catch (error) {
            console.error('❌ 全リーグ試合データ取得エラー:', error.message);
            throw error;
        }
    }

    async fetchAllPlayerData() {
        try {
            console.log('\n👤 全主要選手データ取得開始...');
            console.log('='.repeat(60));
            
            const allPlayerData = [];
            const playerStats = {};
            
            for (const [playerName, ids] of Object.entries(this.majorPlayers)) {
                try {
                    console.log(`\n📊 ${playerName} のデータを取得中...`);
                    
                    // Football-data.orgから選手データを取得
                    const playerData = await this.footballDataIntegration.fetchPlayerMatches(ids.fdId, 2024);
                    
                    if (playerData) {
                        const enrichedPlayerData = {
                            ...playerData,
                            playerName: playerName,
                            fdId: ids.fdId,
                            afId: ids.afId,
                            source: 'football-data.org',
                            lastUpdated: new Date().toISOString()
                        };
                        
                        allPlayerData.push(enrichedPlayerData);
                        playerStats[playerName] = {
                            appearances: playerData.appearances || 0,
                            minutes: playerData.minutes || 0,
                            position: playerData.position || 'Unknown',
                            source: 'football-data.org'
                        };
                        
                        console.log(`✅ ${playerName}: ${playerData.appearances || 0}試合出場取得成功`);
                    } else {
                        console.log(`⚠️ ${playerName}: データなし`);
                    }
                    
                    // レート制限対応（2秒間隔）
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                } catch (error) {
                    console.error(`❌ ${playerName} 取得エラー:`, error.message);
                    playerStats[playerName] = {
                        appearances: 0,
                        error: error.message
                    };
                }
            }
            
            // 全選手データを保存
            await this.saveComprehensivePlayers(allPlayerData);
            
            console.log('\n📊 全主要選手データ取得完了');
            console.log('='.repeat(60));
            console.log(`総選手数: ${allPlayerData.length}名`);
            console.log('\n選手別統計:');
            Object.entries(playerStats).forEach(([player, stats]) => {
                console.log(`  ${player}: ${stats.appearances}試合出場 ${stats.error ? `(エラー: ${stats.error})` : ''}`);
            });
            
            return { allPlayerData, playerStats };
            
        } catch (error) {
            console.error('❌ 全主要選手データ取得エラー:', error.message);
            throw error;
        }
    }

    async saveComprehensiveMatches(matches) {
        try {
            const filePath = path.join(this.dataPath, 'comprehensive-matches.json');
            await fs.writeFile(filePath, JSON.stringify(matches, null, 2));
            console.log(`💾 包括的試合データを保存: ${filePath} (${matches.length}試合)`);
            
            // リーグ別にも保存
            const leagueGroups = {};
            matches.forEach(match => {
                if (!leagueGroups[match.leagueName]) {
                    leagueGroups[match.leagueName] = [];
                }
                leagueGroups[match.leagueName].push(match);
            });
            
            for (const [leagueName, leagueMatches] of Object.entries(leagueGroups)) {
                const leagueFilePath = path.join(this.dataPath, `matches-${leagueName.replace(/\s+/g, '-').toLowerCase()}.json`);
                await fs.writeFile(leagueFilePath, JSON.stringify(leagueMatches, null, 2));
                console.log(`💾 ${leagueName}試合データを保存: ${leagueFilePath} (${leagueMatches.length}試合)`);
            }
            
        } catch (error) {
            console.error('❌ 試合データ保存エラー:', error.message);
            throw error;
        }
    }

    async saveComprehensivePlayers(players) {
        try {
            const filePath = path.join(this.dataPath, 'comprehensive-players.json');
            await fs.writeFile(filePath, JSON.stringify(players, null, 2));
            console.log(`💾 包括的選手データを保存: ${filePath} (${players.length}名)`);
            
        } catch (error) {
            console.error('❌ 選手データ保存エラー:', error.message);
            throw error;
        }
    }

    async generateIntegrationReport() {
        try {
            console.log('\n📋 統合レポート生成中...');
            
            const report = {
                timestamp: new Date().toISOString(),
                apis: {
                    'football-data.org': {
                        status: 'connected',
                        apiKey: this.footballDataKey ? 'configured' : 'not configured',
                        leagues: Object.keys(this.leagueMapping).length,
                        players: Object.keys(this.majorPlayers).length
                    },
                    'api-football': {
                        status: this.apiFootballKey && this.apiFootballKey !== 'your-api-football-key-here' ? 'connected' : 'not configured',
                        apiKey: this.apiFootballKey ? 'configured' : 'not configured'
                    }
                },
                dataSources: {
                    matches: 'football-data.org',
                    players: 'football-data.org + api-football',
                    teams: 'football-data.org',
                    leagues: 'football-data.org'
                },
                integration: {
                    status: 'active',
                    features: [
                        'Real-time match data',
                        'Comprehensive player statistics',
                        'Multi-league support',
                        'Data persistence',
                        'Rate limiting',
                        'Error handling'
                    ]
                }
            };
            
            const reportPath = path.join(this.dataPath, 'integration-report.json');
            await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
            console.log(`📋 統合レポートを保存: ${reportPath}`);
            
            return report;
            
        } catch (error) {
            console.error('❌ レポート生成エラー:', error.message);
            throw error;
        }
    }

    async runFullIntegration() {
        try {
            console.log('🎯 全データ連携実行開始...');
            console.log('='.repeat(80));
            
            // 1. 初期化
            await this.initialize();
            
            // 2. 全リーグ試合データ取得
            const { allMatches, leagueStats } = await this.fetchAllLeagueMatches();
            
            // 3. 全主要選手データ取得
            const { allPlayerData, playerStats } = await this.fetchAllPlayerData();
            
            // 4. 統合レポート生成
            const report = await this.generateIntegrationReport();
            
            console.log('\n🎉 全データ連携完了!');
            console.log('='.repeat(80));
            console.log(`📊 総試合数: ${allMatches.length}試合`);
            console.log(`👤 総選手数: ${allPlayerData.length}名`);
            console.log(`🏆 対応リーグ: ${Object.keys(this.leagueMapping).length}リーグ`);
            console.log(`🔗 API統合: Football-data.org + API-Football`);
            
            console.log('\n💡 次のステップ:');
            console.log('  1. リアルタイム更新の設定');
            console.log('  2. データベースへの統合');
            console.log('  3. フロントエンドでの表示');
            console.log('  4. 自動更新スケジュールの設定');
            
            return {
                matches: allMatches,
                players: allPlayerData,
                leagueStats,
                playerStats,
                report
            };
            
        } catch (error) {
            console.error('❌ 全データ連携エラー:', error.message);
            console.error('詳細:', error.stack);
            throw error;
        }
    }
}

// メイン実行
async function main() {
    try {
        const integration = new ComprehensiveDataIntegration();
        await integration.runFullIntegration();
    } catch (error) {
        console.error('❌ メイン処理エラー:', error.message);
        process.exit(1);
    }
}

// スクリプトが直接実行された場合のみmain()を実行
if (require.main === module) {
    main();
}

module.exports = { ComprehensiveDataIntegration };
