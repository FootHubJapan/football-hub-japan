const DatabaseManager = require('./databaseManager');

class CacheManager {
    constructor() {
        this.db = new DatabaseManager();
        this.cacheExpiry = 24 * 60 * 60 * 1000; // 24時間
        this.updateIntervals = {
            players: 24 * 60 * 60 * 1000,      // 選手データ：24時間
            stats: 7 * 24 * 60 * 60 * 1000,    // 統計データ：7日
            teams: 30 * 24 * 60 * 60 * 1000    // チームデータ：30日
        };
    }

    // キャッシュされた選手データの取得
    async getCachedPlayers(forceRefresh = false) {
        try {
            // 強制更新でない場合、キャッシュから取得
            if (!forceRefresh) {
                const cachedPlayers = this.db.getAllPlayers(1000);
                if (cachedPlayers.length > 0) {
                    console.log(`📊 Retrieved ${cachedPlayers.length} players from cache`);
                    return this.formatCachedPlayers(cachedPlayers);
                }
            }

            // キャッシュが空または期限切れの場合、フォールバックデータを使用
            console.log('🔄 Cache empty or expired, using fallback data');
            return this.getFallbackPlayers();
        } catch (error) {
            console.error('Error getting cached players:', error);
            return this.getFallbackPlayers();
        }
    }

    // キャッシュされた選手データの検索
    async searchCachedPlayers(query, league = '', position = '') {
        try {
            let players = [];

            if (query) {
                // 名前での検索
                const player = this.db.getPlayerByName(query);
                if (player) players.push(player);
            }

            if (league) {
                // リーグでの検索
                const leaguePlayers = this.db.getPlayersByLeague(league);
                players = players.concat(leaguePlayers);
            }

            if (position) {
                // ポジションでのフィルタリング
                players = players.filter(p => 
                    p.position && p.position.toLowerCase().includes(position.toLowerCase())
                );
            }

            // 重複を除去
            const uniquePlayers = this.removeDuplicates(players);
            console.log(`🔍 Found ${uniquePlayers.length} players in cache for query: ${query}`);
            
            return this.formatCachedPlayers(uniquePlayers);
        } catch (error) {
            console.error('Error searching cached players:', error);
            return this.getFallbackPlayers();
        }
    }

    // 選手データの保存（APIから取得した場合）
    async savePlayerData(playerData) {
        try {
            const playerId = this.db.savePlayer(playerData);
            
            if (playerId && playerData.stats) {
                this.db.savePlayerStats(playerId, playerData.stats);
            }

            console.log(`💾 Saved player data for: ${playerData.name}`);
            return playerId;
        } catch (error) {
            console.error('Error saving player data:', error);
            return null;
        }
    }

    // チームデータの一括保存
    async saveTeamPlayers(teamName, players) {
        try {
            let savedCount = 0;
            
            for (const player of players) {
                const playerId = await this.savePlayerData({
                    ...player,
                    currentTeam: teamName
                });
                
                if (playerId) savedCount++;
            }

            console.log(`💾 Saved ${savedCount} players for team: ${teamName}`);
            return savedCount;
        } catch (error) {
            console.error('Error saving team players:', error);
            return 0;
        }
    }

    // キャッシュの更新が必要かチェック
    needsUpdate(dataType = 'players') {
        try {
            const stats = this.db.getDatabaseStats();
            const lastUpdate = this.getLastUpdateTime(dataType);
            const now = Date.now();
            
            if (dataType === 'players' && stats.players === 0) {
                return true; // 初回実行
            }

            if (dataType === 'stats' && stats.stats === 0) {
                return true; // 統計データが未取得
            }

            const interval = this.updateIntervals[dataType] || this.cacheExpiry;
            return (now - lastUpdate) > interval;
        } catch (error) {
            console.error('Error checking update need:', error);
            return true; // エラーの場合は更新
        }
    }

    // 最後の更新時刻を取得
    getLastUpdateTime(dataType) {
        try {
            const stats = this.db.getDatabaseStats();
            
            if (dataType === 'players' && stats.players > 0) {
                const result = this.db.db.prepare(`
                    SELECT MAX(last_updated) as last_update FROM players
                `).get();
                
                return result.last_update ? new Date(result.last_update).getTime() : 0;
            }

            return 0;
        } catch (error) {
            console.error('Error getting last update time:', error);
            return 0;
        }
    }

    // キャッシュの統計情報
    getCacheStats() {
        try {
            const dbStats = this.db.getDatabaseStats();
            const lastUpdate = this.getLastUpdateTime('players');
            const now = Date.now();
            
            return {
                totalPlayers: dbStats.players,
                totalTeams: dbStats.teams,
                totalStats: dbStats.stats,
                lastUpdate: lastUpdate ? new Date(lastUpdate).toISOString() : 'Never',
                nextUpdate: lastUpdate ? new Date(lastUpdate + this.cacheExpiry).toISOString() : 'Unknown',
                cacheAge: lastUpdate ? Math.floor((now - lastUpdate) / (1000 * 60 * 60)) : 0 // 時間単位
            };
        } catch (error) {
            console.error('Error getting cache stats:', error);
            return { totalPlayers: 0, totalTeams: 0, totalStats: 0 };
        }
    }

    // キャッシュのクリーンアップ
    async cleanupCache() {
        try {
            const cleanedCount = this.db.cleanupOldData();
            console.log(`🧹 Cache cleanup completed: ${cleanedCount} old records removed`);
            return cleanedCount;
        } catch (error) {
            console.error('Error cleaning up cache:', error);
            return 0;
        }
    }

    // フォールバックデータの取得
    getFallbackPlayers() {
        // 既存のフォールバックデータ生成関数を使用
        const { generateFallbackPlayers } = require('./index.js');
        return generateFallbackPlayers(19);
    }

    // キャッシュされたデータのフォーマット
    formatCachedPlayers(cachedPlayers) {
        return cachedPlayers.map(player => ({
            id: player.id,
            name: player.name,
            fullName: player.full_name || player.name,
            currentTeam: player.current_team,
            position: player.position,
            nationality: player.nationality,
            age: player.age,
            photo: player.photo_url,
            league: player.league,
            englishName: player.english_name,
            stats: {
                goals: player.goals || 0,
                assists: player.assists || 0,
                appearances: player.appearances || 0,
                minutes: player.minutes || 0,
                rating: player.rating || 0.0,
                yellowCards: player.yellow_cards || 0,
                shotsTotal: player.shots_total || 0,
                shotsOnTarget: player.shots_on_target || 0,
                expectedGoals: player.expected_goals || 0.0,
                passAccuracy: player.pass_accuracy || '0%',
                tackles: player.tackles || 0,
                interceptions: player.interceptions || 0
            }
        }));
    }

    // 重複データの除去
    removeDuplicates(players) {
        const seen = new Set();
        return players.filter(player => {
            const key = `${player.name}-${player.current_team}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    // データベースのクローズ
    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

module.exports = CacheManager; 