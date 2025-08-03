const axios = require('axios');
const NodeCache = require('node-cache');

// Cache configuration - native-stats.org style
const cache = new NodeCache({ stdTTL: 1800 }); // 30 minutes cache like native-stats.org

// API client configuration
const apiClient = axios.create({
    baseURL: 'https://api.football-data.org/v4',
    headers: {
        'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY || ''
    }
});

// API-Football client configuration
function createApiFootballClient() {
    const apiKey = process.env.API_FOOTBALL_KEY || '';
    console.log('Creating API-Football client with key:', apiKey ? `${apiKey.substring(0, 8)}...` : 'NOT SET');
    return axios.create({
        baseURL: 'https://v3.football.api-sports.io',
        headers: {
            'x-rapidapi-host': 'v3.football.api-sports.io',
            'x-rapidapi-key': apiKey
        }
    });
}

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
    footballData: {
        requestsPerMinute: parseInt(process.env.FOOTBALL_DATA_RATE_LIMIT) || 10,
        retryDelay: 60000
    },
    apiFootball: {
        requestsPerMinute: parseInt(process.env.API_FOOTBALL_RATE_LIMIT) || 30,
        retryDelay: 2000
    }
};

// Rate limiting storage
const rateLimitStore = {
    footballData: { requests: [], lastReset: Date.now() },
    apiFootball: { requests: [], lastReset: Date.now() }
};

// Rate limiting function
function checkRateLimit(apiType) {
    const config = RATE_LIMIT_CONFIG[apiType];
    const store = rateLimitStore[apiType];
    const now = Date.now();
    
    if (now - store.lastReset > 60000) {
        store.requests = [];
        store.lastReset = now;
    }
    
    if (store.requests.length >= config.requestsPerMinute) {
        const oldestRequest = store.requests[0];
        const timeSinceOldest = now - oldestRequest;
        
        if (timeSinceOldest < 60000) {
            return false;
        } else {
            store.requests = store.requests.filter(req => now - req > 60000);
        }
    }
    
    store.requests.push(now);
    return true;
}

// Retry function with exponential backoff
async function fetchWithRetry(url, apiType, maxRetries = 3) {
    const config = RATE_LIMIT_CONFIG[apiType];
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (!checkRateLimit(apiType)) {
                const waitTime = config.retryDelay * (attempt + 1);
                console.log(`Rate limit exceeded for ${apiType}, waiting ${waitTime}ms before retry ${attempt + 1}`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            const client = apiType === 'apiFootball' ? createApiFootballClient() : apiClient;
            console.log(`Making ${apiType} request to: ${url}`);
            const response = await client.get(url);
            console.log(`${apiType} response status: ${response.status}`);
            
            if (response.status === 429) {
                const retryAfter = response.headers['retry-after'];
                const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : config.retryDelay * (attempt + 1);
                console.log(`429 error for ${apiType}, waiting ${waitTime}ms before retry ${attempt + 1}`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            return response;
        } catch (error) {
            console.error(`${apiType} request error:`, error.message);
            if (error.response) {
                console.error(`${apiType} response status:`, error.response.status);
                console.error(`${apiType} response data:`, error.response.data);
            }
            if (attempt === maxRetries) {
                throw error;
            }
            const waitTime = config.retryDelay * Math.pow(2, attempt);
            console.log(`Request failed for ${apiType}, waiting ${waitTime}ms before retry ${attempt + 1}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
    
    throw new Error(`Max retries exceeded for ${apiType}`);
}

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

    // ===== Hybrid API Methods =====

    // ハイブリッド選手検索（両方のAPIを組み合わせ）
    async hybridSearchPlayers(query, options = {}) {
        const { league, country, includeOverseas = true } = options;
        const cacheKey = `hybrid_search_${query}_${league || 'all'}_${country || 'all'}_${includeOverseas}`;
        
        let data = this.cache.get(cacheKey);
        if (data) {
            return data;
        }

        const results = {
            footballData: [],
            apiFootball: [],
            combined: []
        };

        try {
            // Football-data.org から検索（並列実行）
            const footballDataPromise = this.searchFootballDataPlayers(query, league, country);
            
            // API-Football から検索（並列実行）
            const apiFootballPromise = this.searchApiFootballPlayers(query, league, country, includeOverseas);

            // 両方のAPIから並列でデータを取得
            const [footballDataResults, apiFootballResults] = await Promise.all([
                footballDataPromise,
                apiFootballPromise
            ]);

            results.footballData = footballDataResults;
            results.apiFootball = apiFootballResults;

            // 結果を統合（重複を除去）
            const combinedMap = new Map();
            
            // Football-data.org の結果を追加
            results.footballData.forEach(player => {
                const key = `${player.name}-${player.nationality}`;
                combinedMap.set(key, {
                    ...player,
                    source: 'football-data.org'
                });
            });
            
            // API-Football の結果を追加（重複しない場合のみ）
            results.apiFootball.forEach(player => {
                const key = `${player.player.name}-${player.player.nationality}`;
                if (!combinedMap.has(key)) {
                    combinedMap.set(key, {
                        ...player,
                        source: 'api-football'
                    });
                }
            });
            
            results.combined = Array.from(combinedMap.values());

            // キャッシュに保存（15分）
            this.cache.set(cacheKey, results, 900);
            
            return results;
        } catch (error) {
            console.error('Hybrid search error:', error);
            return results;
        }
    }

    // Football-data.org 選手検索
    async searchFootballDataPlayers(query, league, country) {
        try {
            if (!process.env.FOOTBALL_DATA_API_KEY) {
                return [];
            }

            const response = await fetchWithRetry(
                `/persons?name=${encodeURIComponent(query)}`,
                'footballData'
            );

            if (response.data && response.data.persons) {
                return response.data.persons;
            }
            return [];
        } catch (error) {
            console.error('Football-data.org search error:', error);
            return [];
        }
    }

    // API-Football 選手検索
    async searchApiFootballPlayers(query, league, country, includeOverseas) {
        try {
            if (!process.env.API_FOOTBALL_KEY) {
                return [];
            }

            let url = `/players?search=${encodeURIComponent(query)}`;
            if (league) url += `&league=${league}`;
            if (country) url += `&country=${country}`;

            const response = await fetchWithRetry(
                url,
                'apiFootball'
            );

            if (response.data && response.data.response) {
                return response.data.response;
            }
            return [];
        } catch (error) {
            console.error('API-Football search error:', error);
            return [];
        }
    }

    // Jリーグ・アジアリーグ取得
    async getAsianLeagues() {
        const cacheKey = 'asian_leagues';
        let data = this.cache.get(cacheKey);
        
        if (data) {
            return data;
        }

        try {
            if (!process.env.API_FOOTBALL_KEY) {
                return this.getFallbackAsianLeagues();
            }

            const asianLeagues = [
                { id: 39, name: 'J1 League', country: 'Japan' },
                { id: 40, name: 'J2 League', country: 'Japan' },
                { id: 41, name: 'J3 League', country: 'Japan' },
                { id: 42, name: 'K League 1', country: 'South Korea' },
                { id: 43, name: 'K League 2', country: 'South Korea' },
                { id: 44, name: 'Chinese Super League', country: 'China' },
                { id: 45, name: 'A-League', country: 'Australia' },
                { id: 46, name: 'Thai League 1', country: 'Thailand' },
                { id: 47, name: 'V.League 1', country: 'Vietnam' },
                { id: 48, name: 'Singapore Premier League', country: 'Singapore' }
            ];

            const currentSeason = new Date().getFullYear();
            const results = [];

            // 並列でリーグ情報を取得
            const leaguePromises = asianLeagues.map(async (league) => {
                try {
                                    const response = await fetchWithRetry(
                    `/leagues?id=${league.id}&season=${currentSeason}`,
                    'apiFootball'
                );

                    if (response.data && response.data.response && response.data.response[0]) {
                        return response.data.response[0];
                    }
                    return league;
                } catch (error) {
                    console.error(`Error fetching league ${league.id}:`, error);
                    return league;
                }
            });

            const leagueResults = await Promise.all(leaguePromises);
            results.push(...leagueResults.filter(league => league));

            // キャッシュに保存（1時間）
            this.cache.set(cacheKey, results, 3600);
            
            return results;
        } catch (error) {
            console.error('Asian leagues error:', error);
            return this.getFallbackAsianLeagues();
        }
    }

    // 日本語選手検索
    async searchJapanesePlayers(query, options = {}) {
        console.log('searchJapanesePlayers called with:', { query, options });
        const { league, includeOverseas = true } = options;
        const cacheKey = `japanese_players_${query}_${league || 'all'}_${includeOverseas}`;
        
        console.log('Cache key:', cacheKey);
        let data = this.cache.get(cacheKey);
        if (data) {
            console.log('Returning cached data');
            return data;
        }

        try {
            if (!process.env.API_FOOTBALL_KEY) {
                return this.getFallbackJapanesePlayers();
            }

            const results = [];

            // Jリーグ選手を検索
            const jLeagueSearch = async () => {
                try {
                                    const response = await fetchWithRetry(
                    `/players?search=${encodeURIComponent(query)}&league=39&season=2024`,
                    'apiFootball'
                );

                    if (response.data && response.data.response) {
                        return response.data.response;
                    }
                    return [];
                } catch (error) {
                    console.error('J-League search error:', error);
                    return [];
                }
            };

            // 海外の日本語選手を検索（オプション）
            const overseasSearch = async () => {
                if (!includeOverseas) return [];
                
                try {
                                    const response = await fetchWithRetry(
                    `/players?search=${encodeURIComponent(query)}&nationality=JP`,
                    'apiFootball'
                );

                    if (response.data && response.data.response) {
                        return response.data.response;
                    }
                    return [];
                } catch (error) {
                    console.error('Overseas Japanese player search error:', error);
                    return [];
                }
            };

            // 並列で検索実行
            const [jLeagueResults, overseasResults] = await Promise.all([
                jLeagueSearch(),
                overseasSearch()
            ]);

            // 結果を統合（重複除去）
            const combinedMap = new Map();
            
            [...jLeagueResults, ...overseasResults].forEach(player => {
                const key = `${player.player.name}-${player.player.nationality}`;
                if (!combinedMap.has(key)) {
                    combinedMap.set(key, {
                        ...player,
                        source: 'api-football',
                        isJapanese: player.player.nationality === 'JP'
                    });
                }
            });

            results.push(...Array.from(combinedMap.values()));

            // キャッシュに保存（15分）
            this.cache.set(cacheKey, results, 900);
            
            return results;
        } catch (error) {
            console.error('Japanese players search error:', error);
            return this.getFallbackJapanesePlayers();
        }
    }

    // 詳細選手統計取得
    async getDetailedPlayerStats(playerId, options = {}) {
        const { season, league } = options;
        const cacheKey = `detailed_stats_${playerId}_${season || 'current'}_${league || 'all'}`;
        
        let data = this.cache.get(cacheKey);
        if (data) {
            return data;
        }

        try {
            if (!process.env.API_FOOTBALL_KEY) {
                return this.getFallbackDetailedPlayerStats();
            }

            // 選手の基本情報と統計を並列で取得
            const [playerInfo, playerStats] = await Promise.all([
                // 選手基本情報
                (async () => {
                    try {
                                            const response = await fetchWithRetry(
                        `/players?id=${playerId}`,
                        'apiFootball'
                    );

                        if (response.data && response.data.response && response.data.response[0]) {
                            return response.data.response[0];
                        }
                        return null;
                    } catch (error) {
                        console.error('Player info error:', error);
                        return null;
                    }
                })(),
                
                // 選手統計
                (async () => {
                    try {
                        let url = `/players?id=${playerId}&statistics=true`;
                        if (season) url += `&season=${season}`;
                        if (league) url += `&league=${league}`;

                                            const response = await fetchWithRetry(
                        url,
                        'apiFootball'
                    );

                        if (response.data && response.data.response && response.data.response[0]) {
                            return response.data.response[0];
                        }
                        return null;
                    } catch (error) {
                        console.error('Player stats error:', error);
                        return null;
                    }
                })()
            ]);

            const result = {
                player: playerInfo,
                statistics: playerStats,
                season: season || 'current',
                league: league || 'all'
            };

            // キャッシュに保存（30分）
            this.cache.set(cacheKey, result, 1800);
            
            return result;
        } catch (error) {
            console.error('Detailed player stats error:', error);
            return this.getFallbackDetailedPlayerStats();
        }
    }

    // Fallback methods for new features
    getFallbackAsianLeagues() {
        return [
            { id: 39, name: 'J1 League', country: 'Japan', logo: null },
            { id: 40, name: 'J2 League', country: 'Japan', logo: null },
            { id: 42, name: 'K League 1', country: 'South Korea', logo: null },
            { id: 44, name: 'Chinese Super League', country: 'China', logo: null },
            { id: 45, name: 'A-League', country: 'Australia', logo: null }
        ];
    }

    getFallbackJapanesePlayers() {
        return [
            {
                player: { id: 1, name: '久保建英', nationality: 'JP' },
                statistics: [{ team: { name: 'レアル・ソシエダード' } }],
                source: 'api-football',
                isJapanese: true
            },
            {
                player: { id: 2, name: '三笘薫', nationality: 'JP' },
                statistics: [{ team: { name: 'ブライトン' } }],
                source: 'api-football',
                isJapanese: true
            }
        ];
    }

    getFallbackDetailedPlayerStats() {
        return {
            player: {
                id: 1,
                name: '久保建英',
                nationality: 'JP',
                age: 22,
                height: '173',
                weight: '67'
            },
            statistics: {
                games: { position: 'MF', rating: '7.5' },
                goals: { total: 8 },
                assists: { total: 12 }
            },
            season: 'current',
            league: 'all'
        };
    }
}

module.exports = new FootballDataService(); 