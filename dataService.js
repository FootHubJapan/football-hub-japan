const axios = require('axios');
const NodeCache = require('node-cache');

// キャッシュ設定（1時間）
const cache = new NodeCache({ stdTTL: 3600 });

// API-Football設定
const API_KEY = process.env.FOOTBALL_API_KEY || 'your-api-key-here';
const API_BASE_URL = 'https://v3.football.api-sports.io';

// APIクライアント設定
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'x-rapidapi-host': 'v3.football.api-sports.io',
        'x-rapidapi-key': API_KEY
    }
});

class FootballDataService {
    constructor() {
        this.cache = cache;
    }

    // リーグ一覧を取得
    async getLeagues(country = 'Japan') {
        const cacheKey = `leagues_${country}`;
        let data = this.cache.get(cacheKey);
        
        if (!data) {
            try {
                const response = await apiClient.get('/leagues', {
                    params: { country: country }
                });
                data = response.data.response;
                this.cache.set(cacheKey, data);
            } catch (error) {
                console.error('リーグデータ取得エラー:', error.message);
                data = this.getFallbackLeagues();
            }
        }
        
        return data;
    }

    // チーム一覧を取得
    async getTeams(leagueId) {
        const cacheKey = `teams_${leagueId}`;
        let data = this.cache.get(cacheKey);
        
        if (!data) {
            try {
                const response = await apiClient.get('/teams', {
                    params: { league: leagueId, season: 2024 }
                });
                data = response.data.response;
                this.cache.set(cacheKey, data);
            } catch (error) {
                console.error('チームデータ取得エラー:', error.message);
                data = this.getFallbackTeams();
            }
        }
        
        return data;
    }

    // 選手一覧を取得
    async getPlayers(teamId) {
        const cacheKey = `players_${teamId}`;
        let data = this.cache.get(cacheKey);
        
        if (!data) {
            try {
                const response = await apiClient.get('/players', {
                    params: { team: teamId, season: 2024 }
                });
                data = response.data.response;
                this.cache.set(cacheKey, data);
            } catch (error) {
                console.error('選手データ取得エラー:', error.message);
                data = this.getFallbackPlayers();
            }
        }
        
        return data;
    }

    // 選手統計を取得
    async getPlayerStats(playerId) {
        const cacheKey = `player_stats_${playerId}`;
        let data = this.cache.get(cacheKey);
        
        if (!data) {
            try {
                const response = await apiClient.get('/players', {
                    params: { id: playerId, season: 2024 }
                });
                data = response.data.response[0];
                this.cache.set(cacheKey, data);
            } catch (error) {
                console.error('選手統計取得エラー:', error.message);
                data = this.getFallbackPlayerStats();
            }
        }
        
        return data;
    }

    // チーム統計を取得
    async getTeamStats(teamId, leagueId) {
        const cacheKey = `team_stats_${teamId}_${leagueId}`;
        let data = this.cache.get(cacheKey);
        
        if (!data) {
            try {
                const response = await apiClient.get('/teams/statistics', {
                    params: { team: teamId, league: leagueId, season: 2024 }
                });
                data = response.data.response;
                this.cache.set(cacheKey, data);
            } catch (error) {
                console.error('チーム統計取得エラー:', error.message);
                data = this.getFallbackTeamStats();
            }
        }
        
        return data;
    }

    // 検索機能
    async searchPlayers(query) {
        const cacheKey = `search_players_${query}`;
        let data = this.cache.get(cacheKey);
        
        if (!data) {
            try {
                const response = await apiClient.get('/players', {
                    params: { search: query }
                });
                data = response.data.response;
                this.cache.set(cacheKey, data);
            } catch (error) {
                console.error('選手検索エラー:', error.message);
                data = this.getFallbackSearchResults(query);
            }
        }
        
        return data;
    }

    // フォールバックデータ（APIが利用できない場合）
    getFallbackLeagues() {
        return [
            {
                league: {
                    id: 1,
                    name: "J1リーグ",
                    type: "League",
                    logo: "https://media.api-sports.io/football/leagues/1.png"
                },
                country: {
                    name: "日本",
                    code: "JP",
                    flag: "https://media.api-sports.io/flags/jp.svg"
                }
            },
            {
                league: {
                    id: 2,
                    name: "J2リーグ",
                    type: "League",
                    logo: "https://media.api-sports.io/football/leagues/2.png"
                },
                country: {
                    name: "日本",
                    code: "JP",
                    flag: "https://media.api-sports.io/flags/jp.svg"
                }
            }
        ];
    }

    getFallbackTeams() {
        return [
            {
                team: {
                    id: 1,
                    name: "浦和レッズ",
                    code: "URA",
                    country: "日本",
                    founded: 1950,
                    national: false,
                    logo: "https://media.api-sports.io/football/teams/1.png"
                },
                venue: {
                    id: 1,
                    name: "埼玉スタジアム2002",
                    city: "さいたま市"
                }
            },
            {
                team: {
                    id: 2,
                    name: "横浜F・マリノス",
                    code: "YFM",
                    country: "日本",
                    founded: 1972,
                    national: false,
                    logo: "https://media.api-sports.io/football/teams/2.png"
                },
                venue: {
                    id: 2,
                    name: "日産スタジアム",
                    city: "横浜市"
                }
            }
        ];
    }

    getFallbackPlayers() {
        return [
            {
                player: {
                    id: 1,
                    name: "久保建英",
                    firstname: "久保",
                    lastname: "建英",
                    age: 22,
                    nationality: "日本",
                    height: "173cm",
                    weight: "67kg",
                    injured: false,
                    photo: "https://media.api-sports.io/football/players/1.png"
                },
                statistics: [{
                    team: {
                        id: 1,
                        name: "レアル・ソシエダード",
                        logo: "https://media.api-sports.io/football/teams/1.png"
                    },
                    league: {
                        id: 1,
                        name: "ラ・リーガ",
                        country: "スペイン",
                        logo: "https://media.api-sports.io/football/leagues/1.png"
                    },
                    games: {
                        appearences: 28,
                        lineups: 25,
                        minutes: 2240,
                        position: "Midfielder"
                    },
                    goals: {
                        total: 8,
                        conceded: 0,
                        assists: 12,
                        saves: null
                    },
                    shots: {
                        total: 45,
                        on: 25
                    },
                    passes: {
                        total: 1250,
                        key: 45,
                        accuracy: 87
                    },
                    tackles: {
                        total: 35,
                        blocks: 5,
                        interceptions: 25
                    },
                    duels: {
                        total: 180,
                        won: 120
                    },
                    dribbles: {
                        attempts: 95,
                        success: 68,
                        past: null
                    },
                    fouls: {
                        drawn: 25,
                        committed: 15
                    },
                    cards: {
                        yellow: 3,
                        red: 0
                    },
                    penalty: {
                        won: 2,
                        commited: 0,
                        scored: 1,
                        missed: 0,
                        saved: null
                    }
                }]
            }
        ];
    }

    getFallbackPlayerStats() {
        return {
            player: {
                id: 1,
                name: "久保建英",
                age: 22,
                nationality: "日本"
            },
            statistics: [{
                team: { name: "レアル・ソシエダード" },
                league: { name: "ラ・リーガ" },
                games: { appearences: 28, minutes: 2240 },
                goals: { total: 8, assists: 12 },
                passes: { accuracy: 87 },
                dribbles: { success: 68 }
            }]
        };
    }

    getFallbackTeamStats() {
        return {
            league: { name: "J1リーグ" },
            team: { name: "浦和レッズ" },
            form: "WWDWL",
            fixtures: {
                played: { home: 15, away: 15, total: 30 },
                wins: { home: 10, away: 10, total: 20 },
                draws: { home: 3, away: 2, total: 5 },
                loses: { home: 2, away: 3, total: 5 }
            },
            goals: {
                for: { total: { home: 25, away: 20, total: 45 } },
                against: { total: { home: 10, away: 15, total: 25 } }
            },
            clean_sheets: { home: 8, away: 6, total: 14 },
            failed_to_score: { home: 2, away: 3, total: 5 }
        };
    }

    getFallbackSearchResults(query) {
        const players = this.getFallbackPlayers();
        return players.filter(player => 
            player.player.name.toLowerCase().includes(query.toLowerCase())
        );
    }

    // データを整形してフロントエンド用に変換
    formatPlayerData(rawData) {
        if (!rawData || !rawData.length) return [];
        
        return rawData.map(item => {
            const player = item.player;
            const stats = item.statistics && item.statistics[0];
            
            return {
                id: player.id,
                name: player.name,
                firstname: player.firstname,
                lastname: player.lastname,
                age: player.age,
                nationality: player.nationality,
                height: player.height,
                weight: player.weight,
                photo: player.photo,
                team: stats ? stats.team.name : 'Unknown',
                league: stats ? stats.league.name : 'Unknown',
                position: stats ? stats.games.position : 'Unknown',
                stats: {
                    appearances: stats ? stats.games.appearences : 0,
                    minutes: stats ? stats.games.minutes : 0,
                    goals: stats ? stats.goals.total : 0,
                    assists: stats ? stats.goals.assists : 0,
                    passAccuracy: stats ? stats.passes.accuracy : 0,
                    dribbleSuccess: stats ? stats.dribbles.success : 0
                }
            };
        });
    }

    formatTeamData(rawData) {
        if (!rawData || !rawData.length) return [];
        
        return rawData.map(item => {
            const team = item.team;
            const venue = item.venue;
            
            return {
                id: team.id,
                name: team.name,
                code: team.code,
                country: team.country,
                founded: team.founded,
                logo: team.logo,
                venue: venue ? {
                    name: venue.name,
                    city: venue.city
                } : null
            };
        });
    }

    formatLeagueData(rawData) {
        if (!rawData || !rawData.length) return [];
        
        return rawData.map(item => {
            const league = item.league;
            const country = item.country;
            
            return {
                id: league.id,
                name: league.name,
                type: league.type,
                logo: league.logo,
                country: {
                    name: country.name,
                    code: country.code,
                    flag: country.flag
                }
            };
        });
    }
}

module.exports = new FootballDataService(); 