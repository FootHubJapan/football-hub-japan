/**
 * 包括的なサッカーAPI連携サービス
 * 98チーム分の選手データ、統計、顔写真を取得・管理
 */

const axios = require('axios');
const DatabaseManager = require('./databaseManager');

class APIService {
    constructor() {
        // API設定
        this.API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || '53cfd1d0c0msh8c8c8c8c8c8c8c8p1c8c8c8jsn8c8c8c8c8c8c';
        this.FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_TOKEN || '8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c';
        
        // データベース管理
        this.dbManager = new DatabaseManager();
        
        // キャッシュ
        this.cache = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30分
        
        // 主要リーグとチームの定義
        this.majorLeagues = {
            'PL': { name: 'Premier League', country: 'England', teams: 20, id: 39 },
            'PD': { name: 'La Liga', country: 'Spain', teams: 20, id: 140 },
            'SA': { name: 'Serie A', country: 'Italy', teams: 20, id: 135 },
            'BL1': { name: 'Bundesliga', country: 'Germany', teams: 18, id: 78 },
            'FL1': { name: 'Ligue 1', country: 'France', teams: 20, id: 61 },
            'NL1': { name: 'Eredivisie', country: 'Netherlands', teams: 18, id: 88 },
            'PPL': { name: 'Primeira Liga', country: 'Portugal', teams: 18, id: 94 },
            'BSA': { name: 'Brasileirão', country: 'Brazil', teams: 20, id: 71 },
            'CL': { name: 'UEFA Champions League', country: 'Europe', teams: 32, id: 2 },
            'EL': { name: 'UEFA Europa League', country: 'Europe', teams: 32, id: 3 },
            'J1': { name: 'J1 League', country: 'Japan', teams: 20, id: 98 },
            'K1': { name: 'K League 1', country: 'South Korea', teams: 12, id: 292 },
            'MLS': { name: 'Major League Soccer', country: 'USA', teams: 29, id: 253 }
        };
        
        console.log('🚀 包括的API連携サービスを初期化中...');
    }

    /**
     * サービスを初期化
     */
    async init() {
        try {
            await this.dbManager.init();
            console.log('✅ 包括的API連携サービスが初期化されました');
        } catch (error) {
            console.error('❌ 包括的API連携サービス初期化エラー:', error);
        }
    }

    /**
     * 包括的な選手データを取得・保存
     */
    async fetchAllComprehensivePlayers() {
        try {
            console.log('🌍 98チーム分の包括的選手データを取得中...');
            
            let allPlayers = [];
            let totalProcessed = 0;
            
            // 主要リーグから順次取得
            for (const [leagueCode, leagueInfo] of Object.entries(this.majorLeagues)) {
                try {
                    console.log(`🏆 ${leagueInfo.name} (${leagueCode}) から選手データを取得中...`);
                    
                    // リーグのチーム一覧を取得
                    const teams = await this.getLeagueTeams(leagueInfo.id, leagueInfo.name);
                    console.log(`   📊 ${teams.length}チームを発見`);
                    
                    // 各チームの選手データを取得
                    for (const team of teams) {
                        try {
                            console.log(`   🏟️ ${team.name} の選手データを取得中...`);
                            
                            const teamPlayers = await this.getTeamComprehensivePlayers(team.id, team.name, leagueCode);
                            
                            if (teamPlayers.length > 0) {
                                // リーグ情報を追加
                                const enrichedPlayers = teamPlayers.map(player => ({
                                    ...player,
                                    league: leagueCode,
                                    leagueName: leagueInfo.name,
                                    leagueId: leagueInfo.id,
                                    country: leagueInfo.country
                                }));
                                
                                allPlayers.push(...enrichedPlayers);
                                totalProcessed += enrichedPlayers.length;
                                
                                console.log(`      ✅ ${enrichedPlayers.length}名の選手データを取得`);
                                
                                // 進捗表示
                                if (totalProcessed % 100 === 0) {
                                    console.log(`📊 進捗: ${totalProcessed}名の選手データを処理済み`);
                                }
                            }
                            
                            // API制限を考慮して少し待機
                            await this.delay(1000);
                            
                        } catch (teamError) {
                            console.error(`   ❌ ${team.name} の選手データ取得エラー:`, teamError.message);
                        }
                    }
                    
                    console.log(`✅ ${leagueInfo.name} 完了: ${allPlayers.length - (totalProcessed - allPlayers.length)}名の選手データ`);
                    
                } catch (leagueError) {
                    console.error(`❌ ${leagueInfo.name} の選手データ取得エラー:`, leagueError.message);
                }
            }
            
            // 重複除去と正規化
            const uniquePlayers = this.removeDuplicates(allPlayers);
            console.log(`🧹 重複除去: ${allPlayers.length} → ${uniquePlayers.length}名`);
            
            // データベースに保存
            await this.dbManager.saveComprehensivePlayers(uniquePlayers);
            
            console.log(`🎉 包括的選手データ取得完了: ${uniquePlayers.length}名`);
            return uniquePlayers;
            
        } catch (error) {
            console.error('❌ 包括的選手データ取得エラー:', error);
            throw error;
        }
    }

    /**
     * リーグのチーム一覧を取得
     */
    async getLeagueTeams(leagueId, leagueName) {
        try {
            // API-Footballからチーム一覧を取得
            const response = await axios.get(`https://v3.football.api-sports.io/teams`, {
                params: {
                    league: leagueId,
                    season: 2024
                },
                headers: {
                    'x-rapidapi-host': 'v3.football.api-sports.io',
                    'x-rapidapi-key': this.API_FOOTBALL_KEY
                }
            });
            
            if (response.data.response && response.data.response.length > 0) {
                return response.data.response.map(team => ({
                    id: team.team.id,
                    name: team.team.name,
                    country: team.team.country,
                    founded: team.team.founded,
                    logo: team.team.logo
                }));
            }
            
            return [];
            
        } catch (error) {
            console.error(`❌ ${leagueName} のチーム一覧取得エラー:`, error.message);
            return [];
        }
    }

    /**
     * チームの包括的選手データを取得
     */
    async getTeamComprehensivePlayers(teamId, teamName, leagueCode) {
        try {
            // API-Footballから選手一覧を取得
            const response = await axios.get(`https://v3.football.api-sports.io/players`, {
                params: {
                    team: teamId,
                    season: 2024
                },
                headers: {
                    'x-rapidapi-host': 'v3.football.api-sports.io',
                    'x-rapidapi-key': this.API_FOOTBALL_KEY
                }
            });
            
            if (response.data.response && response.data.response.length > 0) {
                const players = response.data.response.map(player => this.normalizeComprehensivePlayer(player, teamName, leagueCode));
                
                // 各選手の詳細統計を取得
                for (const player of players) {
                    try {
                        const stats = await this.getPlayerComprehensiveStats(player.id, teamId);
                        if (stats) {
                            player.stats = stats;
                        }
                        
                        // 顔写真URLを取得・保存
                        if (player.photo) {
                            await this.dbManager.savePlayerPhoto(player.id, player.photo);
                        }
                        
                    } catch (statsError) {
                        console.log(`     ⚠️ ${player.name} の統計取得エラー:`, statsError.message);
                    }
                }
                
                return players;
            }
            
            return [];
            
        } catch (error) {
            console.error(`❌ ${teamName} の選手データ取得エラー:`, error.message);
            return [];
        }
    }

    /**
     * 選手の包括的統計を取得
     */
    async getPlayerComprehensiveStats(playerId, teamId) {
        try {
            const response = await axios.get(`https://v3.football.api-sports.io/players`, {
                params: {
                    id: playerId,
                    season: 2024
                },
                headers: {
                    'x-rapidapi-host': 'v3.football.api-sports.io',
                    'x-rapidapi-key': this.API_FOOTBALL_KEY
                }
            });
            
            if (response.data.response && response.data.response.length > 0) {
                const playerData = response.data.response[0];
                return this.normalizeComprehensiveStats(playerData.statistics);
            }
            
            return null;
            
        } catch (error) {
            console.error(`❌ 選手統計取得エラー (${playerId}):`, error.message);
            return null;
        }
    }

    /**
     * 包括的選手データを正規化
     */
    normalizeComprehensivePlayer(playerData, teamName, leagueCode) {
        const player = playerData.player;
        const stats = playerData.statistics?.[0] || {};
        
        return {
            id: player.id,
            name: player.name,
            fullName: player.name,
            firstName: player.firstname || player.name.split(' ')[0],
            lastName: player.lastname || player.name.split(' ').slice(1).join(' '),
            age: player.age,
            dateOfBirth: player.birth?.date,
            nationality: player.nationality,
            height: player.height,
            weight: player.weight,
            position: this.normalizePosition(stats.games?.position || player.position),
            detailedPosition: stats.games?.position || player.position,
            currentTeam: teamName,
            teamId: player.team?.id,
            league: leagueCode,
            photo: player.photo,
            photoUrl: player.photo,
            shirtNumber: stats.games?.number || null,
            preferredFoot: player.foot || null,
            marketValue: null, // API-Footballでは利用不可
            contractUntil: null, // API-Footballでは利用不可
            joinedDate: null, // API-Footballでは利用不可
            stats: this.normalizeComprehensiveStats(stats),
            lastUpdated: new Date().toISOString(),
            source: 'api-football'
        };
    }

    /**
     * 包括的統計データを正規化
     */
    normalizeComprehensiveStats(stats) {
        if (!stats) return {};
        
        return {
            appearances: stats.games?.appearences || 0,
            lineups: stats.games?.lineups || 0,
            minutes: stats.games?.minutes || 0,
            number: stats.games?.number || null,
            position: stats.games?.position || null,
            rating: stats.games?.rating || null,
            captain: stats.games?.captain || false,
            goals: stats.goals?.total || 0,
            conceded: stats.goals?.conceded || 0,
            assists: stats.goals?.assists || 0,
            saves: stats.goals?.saves || null,
            shots: stats.shots?.total || 0,
            shotsOnTarget: stats.shots?.on || null,
            passes: stats.passes?.total || 0,
            keyPasses: stats.passes?.key || 0,
            accuracy: stats.passes?.accuracy || null,
            tackles: stats.tackles?.total || 0,
            blocks: stats.tackles?.blocks || null,
            interceptions: stats.tackles?.interceptions || null,
            duels: stats.duels?.total || 0,
            duelsWon: stats.duels?.won || null,
            dribbles: stats.dribbles?.attempts || 0,
            dribblesPast: stats.dribbles?.past || null,
            dribblesSuccess: stats.dribbles?.success || null,
            fouls: stats.fouls?.drawn || 0,
            foulsCommitted: stats.fouls?.committed || 0,
            yellowCards: stats.cards?.yellow || 0,
            redCards: stats.cards?.red || 0,
            penalty: {
                won: stats.penalty?.won || null,
                committed: stats.penalty?.committed || null,
                scored: stats.penalty?.scored || null,
                missed: stats.penalty?.missed || null,
                saved: stats.penalty?.saved || null
            }
        };
    }

    /**
     * ポジションを正規化
     */
    normalizePosition(position) {
        if (!position) return 'Unknown';
        
        const positionMap = {
            'G': 'Goalkeeper',
            'D': 'Defender',
            'M': 'Midfielder',
            'F': 'Forward',
            'GK': 'Goalkeeper',
            'DF': 'Defender',
            'MF': 'Midfielder',
            'FW': 'Forward'
        };
        
        return positionMap[position] || position;
    }

    /**
     * 重複除去
     */
    removeDuplicates(players) {
        const seen = new Set();
        return players.filter(player => {
            if (seen.has(player.id)) {
                return false;
            }
            seen.add(player.id);
            return true;
        });
    }

    /**
     * 遅延処理
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 既存のメソッドも保持
    async searchPlayers(query, leagueId, season) {
        try {
            console.log(`🔍 選手検索: ${query} (リーグ: ${leagueId}, シーズン: ${season})`);
            
            // キャッシュから検索
            const cachedResults = this.getFromCache(`search_${query}_${leagueId}_${season}`);
            if (cachedResults) {
                console.log('📊 キャッシュから検索結果を取得');
                return cachedResults;
            }
            
            // API-Footballから検索
            const response = await axios.get(`https://v3.football.api-sports.io/players`, {
                params: {
                    search: query,
                    league: leagueId,
                    season: season
                },
                headers: {
                    'x-rapidapi-host': 'v3.football.api-sports.io',
                    'x-rapidapi-key': this.API_FOOTBALL_KEY
                }
            });
            
            if (response.data.response && response.data.response.length > 0) {
                const players = response.data.response.map(player => this.normalizeComprehensivePlayer(player, 'Unknown', 'Unknown'));
                
                // キャッシュに保存
                this.setCache(`search_${query}_${leagueId}_${season}`, players);
                
                console.log(`✅ ${players.length}名の選手を検索`);
                return players;
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ 選手検索エラー:', error.message);
            return [];
        }
    }

    async loadPlayersFromFile() {
        return this.dbManager.loadComprehensivePlayers();
    }

    async savePlayersToFile(players) {
        return this.dbManager.saveComprehensivePlayers(players);
    }

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    // 包括的データ取得のエイリアス
    async fetchAndSaveAllPlayers() {
        return this.fetchAllComprehensivePlayers();
    }
}

module.exports = APIService;
