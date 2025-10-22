#!/usr/bin/env node

/**
 * データベース完全統合システム
 * 既存のplayers.jsonと新しいFootball-data.orgデータを統合
 */

const fs = require('fs').promises;
const path = require('path');

class DatabaseIntegration {
    constructor() {
        this.dataPath = path.join(__dirname, 'data');
        this.playersFile = path.join(this.dataPath, 'players.json');
        this.comprehensiveMatchesFile = path.join(this.dataPath, 'comprehensive-matches.json');
        this.comprehensivePlayersFile = path.join(this.dataPath, 'comprehensive-players.json');
    }

    async integrateAllData() {
        try {
            console.log('🔄 データベース完全統合開始...');
            console.log('='.repeat(60));
            
            // 1. 既存の選手データを読み込み
            const existingPlayers = await this.loadExistingPlayers();
            console.log(`📊 既存選手データ: ${existingPlayers.length}名`);
            
            // 2. Football-data.orgの選手データを読み込み
            const fdPlayers = await this.loadFootballDataPlayers();
            console.log(`📊 Football-data.org選手データ: ${fdPlayers.length}名`);
            
            // 3. 選手データを統合
            const integratedPlayers = await this.integratePlayerData(existingPlayers, fdPlayers);
            console.log(`📊 統合後選手データ: ${integratedPlayers.length}名`);
            
            // 4. 試合データを統合
            const integratedMatches = await this.integrateMatchData();
            console.log(`📊 統合後試合データ: ${integratedMatches.length}試合`);
            
            // 5. 統合データを保存
            await this.saveIntegratedData(integratedPlayers, integratedMatches);
            
            // 6. 統合レポート生成
            await this.generateIntegrationReport(integratedPlayers, integratedMatches);
            
            console.log('\n🎉 データベース完全統合完了!');
            console.log('='.repeat(60));
            console.log(`👤 統合選手数: ${integratedPlayers.length}名`);
            console.log(`⚽ 統合試合数: ${integratedMatches.length}試合`);
            console.log(`🔗 データソース: API-Football + Football-data.org`);
            
            return {
                players: integratedPlayers,
                matches: integratedMatches,
                stats: {
                    totalPlayers: integratedPlayers.length,
                    totalMatches: integratedMatches.length,
                    integrationDate: new Date().toISOString()
                }
            };
            
        } catch (error) {
            console.error('❌ データベース統合エラー:', error.message);
            throw error;
        }
    }

    async loadExistingPlayers() {
        try {
            const data = await fs.readFile(this.playersFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.log('⚠️ 既存選手データファイルが見つかりません');
            return [];
        }
    }

    async loadFootballDataPlayers() {
        try {
            const data = await fs.readFile(this.comprehensivePlayersFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.log('⚠️ Football-data.org選手データファイルが見つかりません');
            return [];
        }
    }

    async integratePlayerData(existingPlayers, fdPlayers) {
        console.log('\n🔄 選手データ統合中...');
        
        const integratedPlayers = [...existingPlayers];
        const existingPlayerIds = new Set(existingPlayers.map(p => p.id || p.name));
        
        let addedCount = 0;
        let updatedCount = 0;
        
        for (const fdPlayer of fdPlayers) {
            const playerName = fdPlayer.playerName;
            const existingPlayer = existingPlayers.find(p => 
                p.name === playerName || 
                p.name.includes(playerName) || 
                playerName.includes(p.name)
            );
            
            if (existingPlayer) {
                // 既存選手のデータを更新
                existingPlayer.footballDataStats = {
                    appearances: fdPlayer.appearances,
                    minutes: fdPlayer.minutes,
                    position: fdPlayer.position,
                    source: 'football-data.org',
                    lastUpdated: new Date().toISOString()
                };
                
                // チーム情報を更新（Football-data.orgの方が新しい場合）
                if (fdPlayer.matches && fdPlayer.matches.length > 0) {
                    const latestMatch = fdPlayer.matches[0];
                    if (latestMatch.homeTeam && latestMatch.homeTeam.name) {
                        existingPlayer.currentTeam = latestMatch.homeTeam.name;
                    }
                }
                
                updatedCount++;
            } else {
                // 新しい選手を追加
                const newPlayer = {
                    id: fdPlayer.playerId || `fd_${fdPlayer.fdId}`,
                    name: playerName,
                    currentTeam: fdPlayer.matches && fdPlayer.matches.length > 0 ? 
                        fdPlayer.matches[0].homeTeam?.name || 'Unknown' : 'Unknown',
                    league: 'Unknown',
                    position: fdPlayer.position || 'Unknown',
                    stats: {
                        appearances: fdPlayer.appearances || 0,
                        minutes: fdPlayer.minutes || 0,
                        goals: 0,
                        assists: 0,
                        season: '2024/2025',
                        source: 'football-data.org'
                    },
                    footballDataStats: {
                        appearances: fdPlayer.appearances,
                        minutes: fdPlayer.minutes,
                        position: fdPlayer.position,
                        source: 'football-data.org',
                        lastUpdated: new Date().toISOString()
                    },
                    source: 'football-data.org',
                    lastUpdated: new Date().toISOString()
                };
                
                integratedPlayers.push(newPlayer);
                addedCount++;
            }
        }
        
        console.log(`✅ 選手データ統合完了: ${addedCount}名追加, ${updatedCount}名更新`);
        return integratedPlayers;
    }

    async integrateMatchData() {
        try {
            console.log('\n🔄 試合データ統合中...');
            
            const data = await fs.readFile(this.comprehensiveMatchesFile, 'utf8');
            const matches = JSON.parse(data);
            
            // 試合データを正規化
            const normalizedMatches = matches.map(match => ({
                id: match.id,
                homeTeam: {
                    id: match.homeTeam.id,
                    name: match.homeTeam.name
                },
                awayTeam: {
                    id: match.awayTeam.id,
                    name: match.awayTeam.name
                },
                league: match.leagueName,
                leagueId: match.leagueId,
                season: match.season,
                date: match.date,
                status: match.status,
                matchday: match.matchday,
                stage: match.stage,
                score: match.score,
                venue: match.venue,
                referees: match.referees,
                lineups: match.lineups || [],
                bookings: match.bookings || [],
                goalScorers: match.goalScorers || [],
                lastUpdated: match.lastUpdated,
                source: 'football-data.org',
                integratedAt: new Date().toISOString()
            }));
            
            console.log(`✅ 試合データ統合完了: ${normalizedMatches.length}試合`);
            return normalizedMatches;
            
        } catch (error) {
            console.error('❌ 試合データ統合エラー:', error.message);
            return [];
        }
    }

    async saveIntegratedData(players, matches) {
        try {
            console.log('\n💾 統合データ保存中...');
            
            // 選手データを保存
            await fs.writeFile(this.playersFile, JSON.stringify(players, null, 2));
            console.log(`✅ 統合選手データを保存: ${players.length}名`);
            
            // 試合データを保存
            const matchesFile = path.join(this.dataPath, 'integrated-matches.json');
            await fs.writeFile(matchesFile, JSON.stringify(matches, null, 2));
            console.log(`✅ 統合試合データを保存: ${matches.length}試合`);
            
            // バックアップを作成
            const backupDir = path.join(this.dataPath, 'backups');
            await fs.mkdir(backupDir, { recursive: true });
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPlayersFile = path.join(backupDir, `players-backup-${timestamp}.json`);
            const backupMatchesFile = path.join(backupDir, `matches-backup-${timestamp}.json`);
            
            await fs.writeFile(backupPlayersFile, JSON.stringify(players, null, 2));
            await fs.writeFile(backupMatchesFile, JSON.stringify(matches, null, 2));
            
            console.log(`✅ バックアップを作成: ${timestamp}`);
            
        } catch (error) {
            console.error('❌ 統合データ保存エラー:', error.message);
            throw error;
        }
    }

    async generateIntegrationReport(players, matches) {
        try {
            console.log('\n📋 統合レポート生成中...');
            
            const report = {
                integrationDate: new Date().toISOString(),
                summary: {
                    totalPlayers: players.length,
                    totalMatches: matches.length,
                    dataSources: ['API-Football', 'Football-data.org']
                },
                playerStats: {
                    withFootballDataStats: players.filter(p => p.footballDataStats).length,
                    apiFootballOnly: players.filter(p => !p.footballDataStats).length,
                    updatedPlayers: players.filter(p => p.footballDataStats?.lastUpdated).length
                },
                matchStats: {
                    byLeague: {},
                    byStatus: {},
                    totalVenues: new Set(matches.map(m => m.venue?.name).filter(Boolean)).size
                },
                integration: {
                    status: 'completed',
                    features: [
                        'Dual API integration',
                        'Real-time data updates',
                        'Comprehensive match data',
                        'Enhanced player statistics',
                        'Data persistence',
                        'Backup system'
                    ]
                }
            };
            
            // リーグ別統計
            matches.forEach(match => {
                const league = match.league;
                if (!report.matchStats.byLeague[league]) {
                    report.matchStats.byLeague[league] = 0;
                }
                report.matchStats.byLeague[league]++;
                
                const status = match.status;
                if (!report.matchStats.byStatus[status]) {
                    report.matchStats.byStatus[status] = 0;
                }
                report.matchStats.byStatus[status]++;
            });
            
            const reportFile = path.join(this.dataPath, 'database-integration-report.json');
            await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
            console.log(`📋 統合レポートを保存: ${reportFile}`);
            
            return report;
            
        } catch (error) {
            console.error('❌ レポート生成エラー:', error.message);
            throw error;
        }
    }
}

// メイン実行
async function main() {
    try {
        const integration = new DatabaseIntegration();
        await integration.integrateAllData();
    } catch (error) {
        console.error('❌ メイン処理エラー:', error.message);
        process.exit(1);
    }
}

// スクリプトが直接実行された場合のみmain()を実行
if (require.main === module) {
    main();
}

module.exports = { DatabaseIntegration };
