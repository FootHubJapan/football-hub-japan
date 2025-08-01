const axios = require('axios');
const NodeCache = require('node-cache');

// Cache configuration - native-stats.org style
const cache = new NodeCache({ stdTTL: 1800 }); // 30 minutes cache like native-stats.org

// API client configuration
const apiClient = axios.create({
    baseURL: 'https://v3.football.api-sports.io',
    headers: {
        'x-rapidapi-host': 'v3.football.api-sports.io',
        'x-rapidapi-key': process.env.FOOTBALL_API_KEY || ''
    }
});

class FootballDataService {
    constructor() {
        this.cache = cache;
        this.initializeNativeStatsData();
    }

    // Initialize native-stats.org style data
    initializeNativeStatsData() {
        // Pre-populate cache with native-stats.org style data
        this.cache.set('native_leagues', this.generateNativeStatsLeagues(), 3600);
        this.cache.set('native_teams_all', this.generateNativeStatsTeams(), 1800);
        this.cache.set('native_players_all', this.generateNativeStatsPlayers(), 1800);
    }

    // Native Stats API Methods (native-stats.org style)
    async getNativeStatsPlayers({ league, search, page = 1, limit = 20 }) {
        const cacheKey = `native_players_${league || 'all'}_${search || 'none'}_${page}_${limit}`;
        let data = this.cache.get(cacheKey);
        
        if (!data) {
            try {
                // Simulate native-stats.org data structure
                data = this.generateNativeStatsPlayers({ league, search, page, limit });
                this.cache.set(cacheKey, data, 1800); // 30 minutes cache
            } catch (error) {
                console.error('Native stats players error:', error.message);
                data = this.getFallbackNativeStatsPlayers();
            }
        }
        
        return data;
    }

    async getNativeStatsPlayer(playerId) {
        const cacheKey = `native_player_${playerId}`;
        let data = this.cache.get(cacheKey);
        
        if (!data) {
            try {
                data = this.generateNativeStatsPlayer(playerId);
                this.cache.set(cacheKey, data, 1800);
            } catch (error) {
                console.error('Native stats player error:', error.message);
                data = this.getFallbackNativeStatsPlayer();
            }
        }
        
        return data;
    }

    async getNativeStatsLeagues() {
        const cacheKey = 'native_leagues';
        let data = this.cache.get(cacheKey);
        
        if (!data) {
            try {
                data = this.generateNativeStatsLeagues();
                this.cache.set(cacheKey, data, 3600);
            } catch (error) {
                console.error('Native stats leagues error:', error.message);
                data = this.getFallbackNativeStatsLeagues();
            }
        }
        
        return data;
    }

    async getNativeStatsTeams(league) {
        const cacheKey = `native_teams_${league || 'all'}`;
        let data = this.cache.get(cacheKey);
        
        if (!data) {
            try {
                data = this.generateNativeStatsTeams(league);
                this.cache.set(cacheKey, data, 1800);
            } catch (error) {
                console.error('Native stats teams error:', error.message);
                data = this.getFallbackNativeStatsTeams();
            }
        }
        
        return data;
    }

    async getNativeStatsMatches(playerId, limit = 10) {
        const cacheKey = `native_matches_${playerId}_${limit}`;
        let data = this.cache.get(cacheKey);
        
        if (!data) {
            try {
                data = this.generateNativeStatsMatches(playerId, limit);
                this.cache.set(cacheKey, data, 900); // 15 minutes cache
            } catch (error) {
                console.error('Native stats matches error:', error.message);
                data = this.getFallbackNativeStatsMatches();
            }
        }
        
        return data;
    }

    async getNativeStatsPlayerStats(playerId, season) {
        const cacheKey = `native_stats_${playerId}_${season}`;
        let data = this.cache.get(cacheKey);
        
        if (!data) {
            try {
                data = this.generateNativeStatsPlayerStats(playerId, season);
                this.cache.set(cacheKey, data, 1800);
            } catch (error) {
                console.error('Native stats player stats error:', error.message);
                data = this.getFallbackNativeStatsPlayerStats();
            }
        }
        
        return data;
    }

    // Data generation methods for native-stats.org style
    generateNativeStatsPlayers(params = {}) {
        const { league, search, page = 1, limit = 20 } = params;
        const allPlayers = this.getFallbackNativeStatsPlayers();
        let filteredPlayers = allPlayers;

        // Filter by league (native-stats.org style)
        if (league && league !== 'all') {
            filteredPlayers = filteredPlayers.filter(player => {
                const playerLeague = player.seasons?.['2024-2025']?.leagueId;
                return playerLeague === league;
            });
        }

        // Filter by search (native-stats.org style)
        if (search) {
            const searchLower = search.toLowerCase();
            filteredPlayers = filteredPlayers.filter(player => {
                return player.fullName.toLowerCase().includes(searchLower) ||
                       player.currentTeam.toLowerCase().includes(searchLower) ||
                       player.nationality.toLowerCase().includes(searchLower) ||
                       player.position.toLowerCase().includes(searchLower) ||
                       (player.firstName && player.firstName.toLowerCase().includes(searchLower)) ||
                       (player.lastName && player.lastName.toLowerCase().includes(searchLower));
            });
        }

        // Pagination (native-stats.org style)
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedPlayers = filteredPlayers.slice(startIndex, endIndex);

        return paginatedPlayers;
    }

    generateNativeStatsPlayer(playerId) {
        const players = this.getFallbackNativeStatsPlayers();
        return players.find(player => player.id === playerId) || null;
    }

    generateNativeStatsLeagues() {
        return [
            { id: 'PL', name: 'Premier League', country: 'England', flag: '🇬🇧', teams: 20 },
            { id: 'PD', name: 'La Liga', country: 'Spain', flag: '🇪🇸', teams: 20 },
            { id: 'SA', name: 'Serie A', country: 'Italy', flag: '🇮🇹', teams: 20 },
            { id: 'BL1', name: 'Bundesliga', country: 'Germany', flag: '🇩🇪', teams: 18 },
            { id: 'FL1', name: 'Ligue 1', country: 'France', flag: '🇫🇷', teams: 18 }
        ];
    }

    generateNativeStatsTeams(league) {
        const teams = [
            // Premier League
            { id: '1', name: 'Manchester City FC', league: 'PL', country: 'England', founded: 1880, venue: 'Etihad Stadium' },
            { id: '2', name: 'Arsenal FC', league: 'PL', country: 'England', founded: 1886, venue: 'Emirates Stadium' },
            { id: '3', name: 'Liverpool FC', league: 'PL', country: 'England', founded: 1892, venue: 'Anfield' },
            { id: '4', name: 'Brighton & Hove Albion', league: 'PL', country: 'England', founded: 1901, venue: 'Amex Stadium' },
            { id: '5', name: 'Manchester United FC', league: 'PL', country: 'England', founded: 1878, venue: 'Old Trafford' },
            { id: '6', name: 'Chelsea FC', league: 'PL', country: 'England', founded: 1905, venue: 'Stamford Bridge' },
            
            // La Liga
            { id: '7', name: 'Real Madrid CF', league: 'PD', country: 'Spain', founded: 1902, venue: 'Santiago Bernabéu' },
            { id: '8', name: 'FC Barcelona', league: 'PD', country: 'Spain', founded: 1899, venue: 'Camp Nou' },
            { id: '9', name: 'Atletico Madrid', league: 'PD', country: 'Spain', founded: 1903, venue: 'Metropolitano' },
            { id: '10', name: 'Girona FC', league: 'PD', country: 'Spain', founded: 1930, venue: 'Montilivi' },
            { id: '11', name: 'Real Sociedad', league: 'PD', country: 'Spain', founded: 1909, venue: 'Reale Arena' },
            { id: '12', name: 'Sevilla FC', league: 'PD', country: 'Spain', founded: 1890, venue: 'Ramón Sánchez Pizjuán' },
            
            // Serie A
            { id: '13', name: 'AC Milan', league: 'SA', country: 'Italy', founded: 1899, venue: 'San Siro' },
            { id: '14', name: 'Inter Milan', league: 'SA', country: 'Italy', founded: 1908, venue: 'San Siro' },
            { id: '15', name: 'Juventus FC', league: 'SA', country: 'Italy', founded: 1897, venue: 'Allianz Stadium' },
            { id: '16', name: 'SSC Napoli', league: 'SA', country: 'Italy', founded: 1926, venue: 'Diego Armando Maradona' },
            
            // Bundesliga
            { id: '17', name: 'FC Bayern München', league: 'BL1', country: 'Germany', founded: 1900, venue: 'Allianz Arena' },
            { id: '18', name: 'Borussia Dortmund', league: 'BL1', country: 'Germany', founded: 1909, venue: 'Signal Iduna Park' },
            { id: '19', name: 'RB Leipzig', league: 'BL1', country: 'Germany', founded: 2009, venue: 'Red Bull Arena' },
            { id: '20', name: 'Bayer 04 Leverkusen', league: 'BL1', country: 'Germany', founded: 1904, venue: 'BayArena' },
            
            // Ligue 1
            { id: '21', name: 'Paris Saint-Germain FC', league: 'FL1', country: 'France', founded: 1970, venue: 'Parc des Princes' },
            { id: '22', name: 'AS Monaco FC', league: 'FL1', country: 'France', founded: 1924, venue: 'Stade Louis II' },
            { id: '23', name: 'Olympique de Marseille', league: 'FL1', country: 'France', founded: 1899, venue: 'Orange Vélodrome' },
            { id: '24', name: 'Olympique Lyonnais', league: 'FL1', country: 'France', founded: 1950, venue: 'Groupama Stadium' }
        ];

        if (league && league !== 'all') {
            return teams.filter(team => team.league === league);
        }

        return teams;
    }

    generateNativeStatsMatches(playerId, limit) {
        const matches = [];
        const teams = this.generateNativeStatsTeams();
        
        // Get player team name directly from fallback data to avoid circular reference
        const playerTeamMap = {
            '1': 'Girona FC',
            '2': 'Real Sociedad',
            '3': 'Brighton & Hove Albion',
            '4': 'Manchester City FC',
            '5': 'Manchester City FC'
        };
        const playerTeam = playerTeamMap[playerId] || 'Unknown Team';
        
        for (let i = 0; i < limit; i++) {
            const date = new Date();
            date.setDate(date.getDate() - (i * 7));
            
            const isHome = Math.random() > 0.5;
            const opponent = teams[Math.floor(Math.random() * teams.length)].name;
            const homeGoals = Math.floor(Math.random() * 4);
            const awayGoals = Math.floor(Math.random() * 4);
            
            matches.push({
                id: `match_${playerId}_${i}`,
                date: date.toISOString().split('T')[0],
                time: `${Math.floor(Math.random() * 24)}:${Math.random() > 0.5 ? '00' : '30'}`,
                homeTeam: isHome ? playerTeam : opponent,
                awayTeam: isHome ? opponent : playerTeam,
                score: `${homeGoals}:${awayGoals}`,
                odds: `${(Math.random() * 2 + 1).toFixed(2)} / ${(Math.random() * 2 + 2).toFixed(2)} / ${(Math.random() * 2 + 2).toFixed(2)}`,
                result: homeGoals > awayGoals ? 'W' : homeGoals < awayGoals ? 'L' : 'D',
                venue: isHome ? 'Home' : 'Away',
                competition: 'League Match',
                season: '2024-2025'
            });
        }
        
        return matches.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    generateNativeStatsPlayerStats(playerId, season) {
        const player = this.generateNativeStatsPlayer(playerId);
        if (!player) return null;

        return {
            season,
            team: player.currentTeam,
            league: player.seasons?.[season]?.league || 'Unknown League',
            matchesPlayed: Math.floor(Math.random() * 30) + 10,
            stats: {
                goals: Math.floor(Math.random() * 15),
                assists: Math.floor(Math.random() * 10),
                appearances: Math.floor(Math.random() * 30) + 10,
                minutes: Math.floor(Math.random() * 2700) + 900,
                passAccuracy: Math.floor(Math.random() * 20) + 75,
                dribbleSuccess: Math.floor(Math.random() * 30) + 60,
                shots: Math.floor(Math.random() * 40),
                shotsOnTarget: Math.floor(Math.random() * 20),
                keyPasses: Math.floor(Math.random() * 25),
                tackles: Math.floor(Math.random() * 35),
                interceptions: Math.floor(Math.random() * 25),
                clearances: Math.floor(Math.random() * 40),
                blocks: Math.floor(Math.random() * 15),
                rating: (Math.random() * 1.5 + 6.5).toFixed(1),
                yellowCards: Math.floor(Math.random() * 8),
                redCards: Math.floor(Math.random() * 2),
                foulsCommitted: Math.floor(Math.random() * 20),
                foulsDrawn: Math.floor(Math.random() * 15),
                offsides: Math.floor(Math.random() * 10),
                saves: Math.floor(Math.random() * 50),
                cleanSheets: Math.floor(Math.random() * 10)
            }
        };
    }

    // Fallback data methods for native-stats.org style
    getFallbackNativeStatsPlayers() {
        return [
            {
                id: '1',
                fullName: 'Juan Carlos',
                firstName: 'Juan',
                lastName: 'Carlos',
                position: 'Goalkeeper',
                birthday: '1988-01-20',
                nationality: 'Spain',
                currentTeam: 'Girona FC',
                team: 'Girona FC',
                contract: { start: '2019-07', end: '2025-06' },
                marketValue: '5.2',
                preferredFoot: 'Right',
                height: '185cm',
                weight: '78kg',
                matches: [], // Empty array to avoid circular reference
                seasons: {
                    '2024-2025': {
                        team: 'Girona FC',
                        teamId: '10',
                        league: 'La Liga',
                        leagueId: 'PD',
                        matchesPlayed: 25,
                        stats: {
                            goals: 0,
                            assists: 0,
                            appearances: 25,
                            minutes: 2250,
                            passAccuracy: 85,
                            dribbleSuccess: 0,
                            shots: 0,
                            shotsOnTarget: 0,
                            keyPasses: 0,
                            tackles: 0,
                            interceptions: 0,
                            clearances: 0,
                            blocks: 0,
                            rating: 7.2,
                            yellowCards: 2,
                            redCards: 0,
                            saves: 78,
                            cleanSheets: 8
                        }
                    }
                }
            },
            {
                id: '2',
                fullName: 'Takefusa Kubo',
                firstName: 'Takefusa',
                lastName: 'Kubo',
                position: 'Right Winger',
                birthday: '2001-06-04',
                nationality: 'Japan',
                currentTeam: 'Real Sociedad',
                team: 'Real Sociedad',
                contract: { start: '2022-07', end: '2027-06' },
                marketValue: '25.0',
                preferredFoot: 'Left',
                height: '173cm',
                weight: '67kg',
                matches: [], // Empty array to avoid circular reference
                seasons: {
                    '2024-2025': {
                        team: 'Real Sociedad',
                        teamId: '11',
                        league: 'La Liga',
                        leagueId: 'PD',
                        matchesPlayed: 28,
                        stats: {
                            goals: 8,
                            assists: 12,
                            appearances: 28,
                            minutes: 2520,
                            passAccuracy: 82,
                            dribbleSuccess: 68,
                            shots: 45,
                            shotsOnTarget: 18,
                            keyPasses: 35,
                            tackles: 12,
                            interceptions: 8,
                            clearances: 2,
                            blocks: 1,
                            rating: 7.5,
                            yellowCards: 4,
                            redCards: 0,
                            foulsCommitted: 15,
                            foulsDrawn: 22,
                            offsides: 3
                        }
                    }
                }
            },
            {
                id: '3',
                fullName: 'Kaoru Mitoma',
                firstName: 'Kaoru',
                lastName: 'Mitoma',
                position: 'Left Winger',
                birthday: '1997-05-20',
                nationality: 'Japan',
                currentTeam: 'Brighton & Hove Albion',
                team: 'Brighton & Hove Albion',
                contract: { start: '2022-08', end: '2027-06' },
                marketValue: '30.0',
                preferredFoot: 'Right',
                height: '178cm',
                weight: '72kg',
                matches: [], // Empty array to avoid circular reference
                seasons: {
                    '2024-2025': {
                        team: 'Brighton & Hove Albion',
                        teamId: '4',
                        league: 'Premier League',
                        leagueId: 'PL',
                        matchesPlayed: 26,
                        stats: {
                            goals: 6,
                            assists: 8,
                            appearances: 26,
                            minutes: 2340,
                            passAccuracy: 78,
                            dribbleSuccess: 72,
                            shots: 38,
                            shotsOnTarget: 15,
                            keyPasses: 42,
                            tackles: 18,
                            interceptions: 12,
                            clearances: 3,
                            blocks: 2,
                            rating: 7.3,
                            yellowCards: 3,
                            redCards: 0,
                            foulsCommitted: 12,
                            foulsDrawn: 18,
                            offsides: 2
                        }
                    }
                }
            },
            {
                id: '4',
                fullName: 'Erling Haaland',
                firstName: 'Erling',
                lastName: 'Haaland',
                position: 'Centre-Forward',
                birthday: '2000-07-21',
                nationality: 'Norway',
                currentTeam: 'Manchester City FC',
                team: 'Manchester City FC',
                contract: { start: '2022-07', end: '2027-06' },
                marketValue: '180.0',
                preferredFoot: 'Left',
                height: '194cm',
                weight: '88kg',
                matches: [], // Empty array to avoid circular reference
                seasons: {
                    '2024-2025': {
                        team: 'Manchester City FC',
                        teamId: '1',
                        league: 'Premier League',
                        leagueId: 'PL',
                        matchesPlayed: 30,
                        stats: {
                            goals: 18,
                            assists: 5,
                            appearances: 30,
                            minutes: 2700,
                            passAccuracy: 75,
                            dribbleSuccess: 45,
                            shots: 89,
                            shotsOnTarget: 42,
                            keyPasses: 28,
                            tackles: 8,
                            interceptions: 5,
                            clearances: 12,
                            blocks: 3,
                            rating: 7.8,
                            yellowCards: 2,
                            redCards: 0,
                            foulsCommitted: 18,
                            foulsDrawn: 25,
                            offsides: 8
                        }
                    }
                }
            },
            {
                id: '5',
                fullName: 'Kevin De Bruyne',
                firstName: 'Kevin',
                lastName: 'De Bruyne',
                position: 'Attacking Midfielder',
                birthday: '1991-06-28',
                nationality: 'Belgium',
                currentTeam: 'Manchester City FC',
                team: 'Manchester City FC',
                contract: { start: '2015-08', end: '2025-06' },
                marketValue: '45.0',
                preferredFoot: 'Right',
                height: '181cm',
                weight: '76kg',
                matches: [], // Empty array to avoid circular reference
                seasons: {
                    '2024-2025': {
                        team: 'Manchester City FC',
                        teamId: '1',
                        league: 'Premier League',
                        leagueId: 'PL',
                        matchesPlayed: 25,
                        stats: {
                            goals: 4,
                            assists: 15,
                            appearances: 25,
                            minutes: 2250,
                            passAccuracy: 88,
                            dribbleSuccess: 65,
                            shots: 35,
                            shotsOnTarget: 12,
                            keyPasses: 85,
                            tackles: 25,
                            interceptions: 15,
                            clearances: 8,
                            blocks: 5,
                            rating: 8.1,
                            yellowCards: 3,
                            redCards: 0,
                            foulsCommitted: 20,
                            foulsDrawn: 35,
                            offsides: 1
                        }
                    }
                }
            }
        ];
    }

    getFallbackNativeStatsPlayer() {
        return this.getFallbackNativeStatsPlayers()[0];
    }

    getFallbackNativeStatsLeagues() {
        return this.generateNativeStatsLeagues();
    }

    getFallbackNativeStatsTeams() {
        return this.generateNativeStatsTeams();
    }

    getFallbackNativeStatsMatches() {
        return this.generateNativeStatsMatches('1', 10);
    }

    getFallbackNativeStatsPlayerStats() {
        return this.generateNativeStatsPlayerStats('1', '2024-2025');
    }

    // Existing API-Football methods
    async getLeagues(country) {
        const cacheKey = `leagues_${country}`;
        let data = this.cache.get(cacheKey);
        
        if (!data) {
            try {
                const response = await apiClient.get('/leagues', {
                    params: { country }
                });
                data = response.data.response;
                this.cache.set(cacheKey, data);
            } catch (error) {
                console.error('リーグ取得エラー:', error.message);
                data = this.getFallbackLeagues();
            }
        }
        
        return data;
    }

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
                console.error('チーム取得エラー:', error.message);
                data = this.getFallbackTeams();
            }
        }
        
        return data;
    }

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
                console.error('選手取得エラー:', error.message);
                data = this.getFallbackPlayers();
            }
        }
        
        return data;
    }

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

    async searchPlayers(query) {
        const cacheKey = `search_players_${query}`;
        let data = this.cache.get(cacheKey);
        
        if (!data) {
            try {
                const response = await apiClient.get('/players', {
                    params: { search: query, season: 2024 }
                });
                data = response.data.response;
                this.cache.set(cacheKey, data, 1800); // 30 minutes cache for search results
            } catch (error) {
                console.error('選手検索エラー:', error.message);
                data = this.getFallbackSearchResults();
            }
        }
        
        return data;
    }

    // Data formatting methods
    formatLeagueData(data) {
        return data.map(league => ({
            id: league.league.id,
            name: league.league.name,
            country: league.country.name,
            logo: league.league.logo,
            flag: league.country.flag
        }));
    }

    formatTeamData(data) {
        return data.map(team => ({
            id: team.team.id,
            name: team.team.name,
            logo: team.team.logo,
            founded: team.team.founded,
            country: team.team.country
        }));
    }

    formatPlayerData(data) {
        return data.map(player => ({
            id: player.player.id,
            name: player.player.name,
            firstName: player.player.firstname,
            lastName: player.player.lastname,
            age: player.player.age,
            position: player.statistics[0]?.games?.position || 'Unknown',
            nationality: player.player.nationality,
            team: player.statistics[0]?.team?.name || 'Unknown',
            league: player.statistics[0]?.league?.name || 'Unknown'
        }));
    }

    // Fallback data methods
    getFallbackLeagues() {
        return [
            { league: { id: 1, name: 'J1リーグ', logo: null }, country: { name: '日本', flag: null } },
            { league: { id: 2, name: 'プレミアリーグ', logo: null }, country: { name: 'イングランド', flag: null } },
            { league: { id: 3, name: 'ラ・リーガ', logo: null }, country: { name: 'スペイン', flag: null } }
        ];
    }

    getFallbackTeams() {
        return [
            { team: { id: 1, name: '浦和レッズ', logo: null, founded: 1950, country: '日本' } },
            { team: { id: 2, name: '横浜F・マリノス', logo: null, founded: 1972, country: '日本' } },
            { team: { id: 3, name: '川崎フロンターレ', logo: null, founded: 1955, country: '日本' } }
        ];
    }

    getFallbackPlayers() {
        return [
            {
                player: { id: 1, name: '久保建英', firstname: '久保', lastname: '建英', age: 22, nationality: '日本' },
                statistics: [{ games: { position: 'MF' }, team: { name: 'レアル・ソシエダード' }, league: { name: 'ラ・リーガ' } }]
            },
            {
                player: { id: 2, name: '三笘薫', firstname: '三笘', lastname: '薫', age: 26, nationality: '日本' },
                statistics: [{ games: { position: 'FW' }, team: { name: 'ブライトン' }, league: { name: 'プレミアリーグ' } }]
            }
        ];
    }

    getFallbackPlayerStats() {
        return {
            player: { id: 1, name: '久保建英' },
            statistics: [{
                games: { position: 'MF', rating: '7.5' },
                goals: { total: 8 },
                assists: { total: 12 },
                team: { name: 'レアル・ソシエダード' }
            }]
        };
    }

    getFallbackTeamStats() {
        return {
            league: { name: 'J1リーグ' },
            team: { name: '浦和レッズ' },
            form: 'WWDLW',
            fixtures: { played: { total: 30 }, wins: { total: 20 }, draws: { total: 5 }, loses: { total: 5 } },
            goals: { for: { total: 45 }, against: { total: 25 } }
        };
    }

    getFallbackSearchResults() {
        return this.getFallbackPlayers();
    }
}

module.exports = new FootballDataService(); 