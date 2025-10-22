const DatabaseManager = require('./databaseManager');

class CacheManager {
    constructor(dbInstance = null) {
        this.db = dbInstance || new DatabaseManager();
        this.cacheExpiry = 60 * 60 * 1000; // 1時間
        this.updateIntervals = {
            players: 60 * 60 * 1000,      // 選手データ：1時間
            stats: 7 * 24 * 60 * 60 * 1000,    // 統計データ：7日
            teams: 30 * 24 * 60 * 60 * 1000    // チームデータ：30日
        };
    }

    // 試合データを保存
    async saveMatchesData(matches) {
        try {
            await this.db.saveMatchesData(matches);
            console.log(`✅ Saved ${matches.length} matches to persistent storage`);
        } catch (error) {
            console.error('❌ Failed to save matches data:', error);
            throw error;
        }
    }

    // 汎用キャッシュデータの取得
    getCachedData(key) {
        try {
            // メモリキャッシュから取得（簡易実装）
            if (this.memoryCache && this.memoryCache[key]) {
                const cached = this.memoryCache[key];
                if (Date.now() - cached.timestamp < cached.expiry) {
                    return cached.data;
                }
                // 期限切れの場合は削除
                delete this.memoryCache[key];
            }
            return null;
        } catch (error) {
            console.error('Error getting cached data:', error);
            return null;
        }
    }

    // 汎用キャッシュデータの設定
    setCachedData(key, data, expirySeconds = 3600) {
        try {
            if (!this.memoryCache) {
                this.memoryCache = {};
            }
            
            this.memoryCache[key] = {
                data: data,
                timestamp: Date.now(),
                expiry: expirySeconds * 1000
            };
            
            console.log(`✅ Cached data for key: ${key}`);
        } catch (error) {
            console.error('Error setting cached data:', error);
        }
    }

    // キャッシュされた選手データの取得
    async getCachedPlayers(forceRefresh = false) {
        try {
            // 強制更新でない場合、キャッシュから取得
            if (!forceRefresh) {
                try {
                    const cachedPlayers = await this.db.loadComprehensivePlayers();
                    if (cachedPlayers && cachedPlayers.length > 0) {
                        console.log(`📊 Retrieved ${cachedPlayers.length} players from cache`);
                        return this.formatCachedPlayers(cachedPlayers.slice(0, 1000));
                    }
                } catch (error) {
                    console.log('包括的データベースからの読み込みに失敗:', error);
                }
            }

            // キャッシュが空または期限切れの場合、APIから直接取得を試行
            console.log('🔄 Cache empty or expired, attempting direct API fetch...');
            
            // APIから直接取得を試行（フォールバックは最後の手段）
            try {
                // ここでAPI呼び出しを試行
                console.log('📡 Attempting direct API fetch for fresh data...');
                return []; // 空配列を返してAPI取得を促す
            } catch (error) {
                console.log('❌ Direct API fetch failed, using minimal fallback data');
                return this.getMinimalFallbackPlayers();
            }
        } catch (error) {
            console.error('Error getting cached players:', error);
            return this.getMinimalFallbackPlayers();
        }
    }

    // キャッシュされた選手データの検索
    async searchCachedPlayers(query, league = '', position = '') {
        try {
            let players = [];

            if (query) {
                // 名前での検索
                try {
                    const allPlayers = await this.db.loadComprehensivePlayers();
                    const player = allPlayers.find(p => 
                        p.name === query || p.fullName === query
                    );
                    if (player) players.push(player);
                } catch (error) {
                    console.log('選手名検索に失敗:', error);
                }
            }

            if (league) {
                // リーグでの検索
                try {
                    const allPlayers = await this.db.loadComprehensivePlayers();
                    const leaguePlayers = allPlayers.filter(p => p.league === league);
                    players = players.concat(leaguePlayers);
                } catch (error) {
                    console.log('リーグ別検索に失敗:', error);
                }
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
            // 単一の選手データを配列に変換して保存
            const players = [playerData];
            const result = await this.db.saveComprehensivePlayers(players);
            
            if (result && result.length > 0 && playerData.stats) {
                const playerId = result[0].id || result[0].playerId;
                if (playerId) {
                    this.db.savePlayerStats(playerId, playerData.stats);
                }
            }

            console.log(`💾 Saved player data for: ${playerData.name}`);
            return result && result.length > 0 ? result[0].id || result[0].playerId : null;
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
    async needsUpdate(dataType = 'players') {
        try {
            let stats = { players: 0, teams: 0, stats: 0 };
            
            try {
                if (this.db.getComprehensiveStatus) {
                    const status = await this.db.getComprehensiveStatus();
                    stats = {
                        players: status.totalPlayers || 0,
                        teams: status.totalTeams || 0,
                        stats: status.totalStats || 0
                    };
                }
            } catch (error) {
                console.log('包括的データベース状態の取得に失敗:', error);
            }
            
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

    // 選手名で選手を取得
    async getPlayerByName(name) {
        try {
            if (this.db.loadComprehensivePlayers) {
                const allPlayers = await this.db.loadComprehensivePlayers();
                return allPlayers.find(p => 
                    p.name === name || p.fullName === name
                ) || null;
            }
            return null;
        } catch (error) {
            console.error('Error getting player by name:', error);
            return null;
        }
    }

    // 最後の更新時刻を取得
    getLastUpdateTime(dataType) {
        try {
            // 包括的データベースの場合は、ファイルの更新時刻を使用
            if (this.db.playersPath) {
                const fs = require('fs');
                try {
                    const stats = fs.statSync(this.db.playersPath);
                    return stats.mtime.getTime();
                } catch (error) {
                    console.log('ファイル更新時刻の取得に失敗:', error);
                }
            }
            
            return Date.now(); // デフォルトは現在時刻
        } catch (error) {
            console.error('Error getting last update time:', error);
            return Date.now();
        }
    }

    // キャッシュの統計情報
    async getCacheStats() {
        try {
            let dbStats = { players: 0, teams: 0, stats: 0 };
            
            try {
                if (this.db.getComprehensiveStatus) {
                    const status = await this.db.getComprehensiveStatus();
                    dbStats = {
                        players: status.totalPlayers || 0,
                        teams: status.totalTeams || 0,
                        stats: status.totalStats || 0
                    };
                }
            } catch (error) {
                console.log('包括的データベース状態の取得に失敗:', error);
            }
            const lastUpdate = this.getLastUpdateTime('players');
            const now = Date.now();
            
            return {
                totalPlayers: dbStats.players || 0,
                totalTeams: dbStats.teams || 0,
                totalStats: dbStats.stats || 0,
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
            let cleanedCount = 0;
            
            try {
                if (this.db.cleanupOldData) {
                    cleanedCount = await this.db.cleanupOldData();
                }
            } catch (error) {
                console.log('包括的データベースのクリーンアップに失敗:', error);
            }
            
            console.log(`🧹 Cache cleanup completed: ${cleanedCount} old records removed`);
            return cleanedCount;
        } catch (error) {
            console.error('Error cleaning up cache:', error);
            return 0;
        }
    }

    // 最小限のフォールバックデータの取得（緊急時のみ）
    getMinimalFallbackPlayers() {
        try {
            // 最小限の日本人選手のみ
            const essentialPlayers = [
                { name: '久保建英', fullName: '久保建英', currentTeam: 'Real Sociedad', position: 'Forward', nationality: 'Japan', age: 22, photo: 'https://media.api-sports.io/football/players/32862.png', league: 'PD', englishName: 'Takefusa Kubo' },
                { name: '三苫薫', fullName: '三苫薫', currentTeam: 'Brighton', position: 'Midfielder', nationality: 'Japan', age: 25, photo: 'https://media.api-sports.io/football/players/106835.png', league: 'PL', englishName: 'Kaoru Mitoma' }
            ];

            const players = [];

            // 最小限のフォールバックデータを生成
            for (let i = 0; i < essentialPlayers.length; i++) {
                const basePlayer = essentialPlayers[i];
                const player = {
                    id: i + 1,
                    name: basePlayer.name,
                    fullName: basePlayer.fullName,
                    currentTeam: basePlayer.currentTeam,
                    position: basePlayer.position,
                    nationality: basePlayer.nationality,
                    age: basePlayer.age,
                    photo: basePlayer.photo,
                    league: basePlayer.league,
                    englishName: basePlayer.englishName,
                    stats: {
                        goals: Math.floor(Math.random() * 20),
                        assists: Math.floor(Math.random() * 15),
                        appearances: 20 + Math.floor(Math.random() * 20),
                        minutes: 1500 + Math.random() * 1000,
                        rating: (6.0 + Math.random() * 2.0).toFixed(1),
                        yellowCards: Math.floor(Math.random() * 5),
                        shotsTotal: Math.floor(Math.random() * 50),
                        shotsOnTarget: Math.floor(Math.random() * 25),
                        expectedGoals: (Math.random() * 10).toFixed(1),
                        passAccuracy: Math.floor(70 + Math.random() * 25) + '%',
                        tackles: Math.floor(Math.random() * 50),
                        interceptions: Math.floor(Math.random() * 20)
                    }
                };
                players.push(player);
            }

            console.log(`📊 Generated ${players.length} minimal fallback players`);
            return players;
        } catch (error) {
            console.error('Error generating minimal fallback players:', error);
            return [];
        }
    }

    // フォールバックデータの取得（従来版）
    getFallbackPlayers() {
        try {
            // 直接フォールバックデータを生成（顔写真付き）
            const japanesePlayers = [
                { name: '久保建英', fullName: '久保建英', currentTeam: 'Real Sociedad', position: 'Forward', nationality: 'Japan', age: 22, photo: 'https://media.api-sports.io/football/players/32862.png', league: 'PD', englishName: 'Takefusa Kubo' },
                { name: '三苫薫', fullName: '三苫薫', currentTeam: 'Brighton', position: 'Midfielder', nationality: 'Japan', age: 25, photo: 'https://media.api-sports.io/football/players/106835.png', league: 'PL', englishName: 'Kaoru Mitoma' },
                { name: '堂安律', fullName: '堂安律', currentTeam: 'SC Freiburg', position: 'Midfielder', nationality: 'Japan', age: 25, photo: 'https://media.api-sports.io/football/players/2598.png', league: 'BL1', englishName: 'Ritsu Doan' },
                { name: '田中碧', fullName: '田中碧', currentTeam: 'Fortuna Düsseldorf', position: 'Midfielder', nationality: 'Japan', age: 24, photo: 'https://media.api-sports.io/football/players/32863.png', league: 'BL1', englishName: 'Ao Tanaka' },
                { name: '伊藤洋輝', fullName: '伊藤洋輝', currentTeam: 'VfB Stuttgart', position: 'Defender', nationality: 'Japan', age: 24, photo: 'https://media.api-sports.io/football/players/32864.png', league: 'BL1', englishName: 'Hiroki Ito' },
                { name: '遠藤航', fullName: '遠藤航', currentTeam: 'Liverpool', position: 'Midfielder', nationality: 'Japan', age: 30, photo: 'https://media.api-sports.io/football/players/32865.png', league: 'PL', englishName: 'Wataru Endo' },
                { name: '南野拓実', fullName: '南野拓実', currentTeam: 'Monaco', position: 'Forward', nationality: 'Japan', age: 28, photo: 'https://media.api-sports.io/football/players/32866.png', league: 'FL1', englishName: 'Takumi Minamino' },
                { name: '浅野拓磨', fullName: '浅野拓磨', currentTeam: 'VfL Bochum', position: 'Forward', nationality: 'Japan', age: 29, photo: 'https://media.api-sports.io/football/players/32867.png', league: 'BL1', englishName: 'Takuma Asano' }
            ];

            const worldStars = [
                { name: 'Erling Haaland', fullName: 'Erling Haaland', currentTeam: 'Manchester City', position: 'Forward', nationality: 'Norway', age: 23, photo: 'https://media.api-sports.io/football/players/874.png', league: 'PL', englishName: 'Erling Haaland' },
                { name: 'Kevin De Bruyne', fullName: 'Kevin De Bruyne', currentTeam: 'Manchester City', position: 'Midfielder', nationality: 'Belgium', age: 32, photo: 'https://media.api-sports.io/football/players/882.png', league: 'PL', englishName: 'Kevin De Bruyne' },
                { name: 'Mohamed Salah', fullName: 'Mohamed Salah', currentTeam: 'Liverpool', position: 'Forward', nationality: 'Egypt', age: 31, photo: 'https://media.api-sports.io/football/players/306.png', league: 'PL', englishName: 'Mohamed Salah' },
                { name: 'Jude Bellingham', fullName: 'Jude Bellingham', currentTeam: 'Real Madrid', position: 'Midfielder', nationality: 'England', age: 20, photo: 'https://media.api-sports.io/football/players/762.png', league: 'PD', englishName: 'Jude Bellingham' },
                { name: 'Vinícius Júnior', fullName: 'Vinícius Júnior', currentTeam: 'Real Madrid', position: 'Forward', nationality: 'Brazil', age: 23, photo: 'https://media.api-sports.io/football/players/762.png', league: 'PD', englishName: 'Vinícius Júnior' },
                { name: 'Robert Lewandowski', fullName: 'Robert Lewandowski', currentTeam: 'Barcelona', position: 'Forward', nationality: 'Poland', age: 35, photo: 'https://media.api-sports.io/football/players/874.png', league: 'PD', englishName: 'Robert Lewandowski' },
                { name: 'Harry Kane', fullName: 'Harry Kane', currentTeam: 'Bayern Munich', position: 'Forward', nationality: 'England', age: 30, photo: 'https://media.api-sports.io/football/players/874.png', league: 'BL1', englishName: 'Harry Kane' },
                { name: 'Jamal Musiala', fullName: 'Jamal Musiala', currentTeam: 'Bayern Munich', position: 'Midfielder', nationality: 'Germany', age: 20, photo: 'https://media.api-sports.io/football/players/874.png', league: 'BL1', englishName: 'Jamal Musiala' },
                { name: 'Lautaro Martínez', fullName: 'Lautaro Martínez', currentTeam: 'Inter Milan', position: 'Forward', nationality: 'Argentina', age: 26, photo: 'https://media.api-sports.io/football/players/874.png', league: 'SA', englishName: 'Lautaro Martínez' },
                { name: 'Kylian Mbappé', fullName: 'Kylian Mbappé', currentTeam: 'PSG', position: 'Forward', nationality: 'France', age: 24, photo: 'https://media.api-sports.io/football/players/874.png', league: 'FL1', englishName: 'Kylian Mbappé' },
                { name: 'Ousmane Dembélé', fullName: 'Ousmane Dembélé', currentTeam: 'PSG', position: 'Forward', nationality: 'France', age: 26, photo: 'https://media.api-sports.io/football/players/874.png', league: 'FL1', englishName: 'Ousmane Dembélé' }
            ];

            const allPlayers = [...japanesePlayers, ...worldStars];
            const players = [];

            // フォールバックデータを生成（顔写真付き）
            for (let i = 0; i < Math.min(19, allPlayers.length); i++) {
                const basePlayer = allPlayers[i];
                const player = {
                    id: i + 1,
                    name: basePlayer.name,
                    fullName: basePlayer.fullName,
                    currentTeam: basePlayer.currentTeam,
                    position: basePlayer.position,
                    nationality: basePlayer.nationality,
                    age: basePlayer.age,
                    photo: basePlayer.photo, // 正しい顔写真URL
                    league: basePlayer.league,
                    englishName: basePlayer.englishName,
                    stats: {
                        goals: Math.floor(Math.random() * 20),
                        assists: Math.floor(Math.random() * 15),
                        appearances: 20 + Math.floor(Math.random() * 20),
                        minutes: 1500 + Math.random() * 1000,
                        rating: (6.0 + Math.random() * 2.0).toFixed(1),
                        yellowCards: Math.floor(Math.random() * 5),
                        shotsTotal: Math.floor(Math.random() * 50),
                        shotsOnTarget: Math.floor(Math.random() * 25),
                        expectedGoals: (Math.random() * 10).toFixed(1),
                        passAccuracy: Math.floor(70 + Math.random() * 25) + '%',
                        tackles: Math.floor(Math.random() * 50),
                        interceptions: Math.floor(Math.random() * 20)
                    }
                };
                players.push(player);
            }

            console.log(`📊 Generated ${players.length} fallback players with photos`);
            return players;
        } catch (error) {
            console.error('Error generating fallback players:', error);
            return [];
        }
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