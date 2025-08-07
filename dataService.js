const axios = require('axios');
const NodeCache = require('node-cache');
const fs = require('fs').promises;
const path = require('path');

// Cache configuration - FotMob style persistent cache
const cache = new NodeCache({ stdTTL: 86400 }); // 24 hours cache like FotMob

// Persistent data storage
const DATA_DIR = path.join(__dirname, 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const TEAMS_FILE = path.join(DATA_DIR, 'teams.json');
const LEAGUES_FILE = path.join(DATA_DIR, 'leagues.json');

// Ensure data directory exists
async function ensureDataDirectory() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
}

// Data persistence functions
async function saveDataToFile(filename, data) {
    await ensureDataDirectory();
    await fs.writeFile(filename, JSON.stringify(data, null, 2));
}

async function loadDataFromFile(filename) {
    try {
        await ensureDataDirectory();
        const data = await fs.readFile(filename, 'utf8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

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
                    source: 'football-data'
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

            // 複数のリーグで検索（より柔軟な検索）
            const multiLeagueSearch = async () => {
                try {
                    // 主要リーグでの検索（リーグ指定ありで検索）
                    const majorLeagues = [39, 140, 135, 78, 61]; // J-League, La Liga, Serie A, Bundesliga, Ligue 1
                    const leaguePromises = majorLeagues.map(leagueId => 
                        fetchWithRetry(
                            `/players?search=${encodeURIComponent(query)}&league=${leagueId}&season=2024`,
                            'apiFootball'
                        ).then(response => {
                            console.log(`Multi-league search league ${leagueId} found ${response.data?.response?.length || 0} results`);
                            return response.data?.response || [];
                        })
                        .catch(error => {
                            console.error(`Multi-league search error for league ${leagueId}:`, error);
                            return [];
                        })
                    );

                    const results = await Promise.all(leaguePromises);
                    const flattened = results.flat();
                    console.log(`Multi-league search total found ${flattened.length} results`);
                    return flattened;
                } catch (error) {
                    console.error('Multi-league search error:', error);
                    return [];
                }
            };

            // 部分一致検索（クエリを分割して検索）
            const partialMatchSearch = async () => {
                try {
                    // クエリを分割して部分一致検索
                    const words = query.split(/\s+/).filter(word => word.length > 2);
                    if (words.length === 0) return [];

                    // 主要リーグで部分一致検索
                    const majorLeagues = [39, 140, 135, 78, 61]; // J-League, La Liga, Serie A, Bundesliga, Ligue 1
                    const partialPromises = words.flatMap(word => 
                        majorLeagues.map(leagueId => 
                            fetchWithRetry(
                                `/players?search=${encodeURIComponent(word)}&league=${leagueId}&season=2024`,
                                'apiFootball'
                            ).then(response => {
                                console.log(`Partial search for "${word}" in league ${leagueId} found ${response.data?.response?.length || 0} results`);
                                return response.data?.response || [];
                            })
                            .catch(error => {
                                console.error(`Partial search error for "${word}" in league ${leagueId}:`, error);
                                return [];
                            })
                        )
                    );

                    const results = await Promise.all(partialPromises);
                    const flattened = results.flat();
                    console.log(`Partial match search total found ${flattened.length} results`);
                    return flattened;
                } catch (error) {
                    console.error('Partial match search error:', error);
                    return [];
                }
            };

            // Jリーグ選手を検索（より広範囲）
            const jLeagueSearch = async () => {
                try {
                    // 複数のシーズンで検索
                    const seasons = [2024, 2023, 2022];
                    const leaguePromises = seasons.map(season => 
                        fetchWithRetry(
                            `/players?search=${encodeURIComponent(query)}&league=39&season=${season}`,
                            'apiFootball'
                        ).then(response => {
                            console.log(`J-League search season ${season} found ${response.data?.response?.length || 0} results`);
                            return response.data?.response || [];
                        })
                        .catch(error => {
                            console.error(`J-League search error for season ${season}:`, error);
                            return [];
                        })
                    );

                    const results = await Promise.all(leaguePromises);
                    const flattened = results.flat();
                    console.log(`J-League search total found ${flattened.length} results`);
                    return flattened;
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
            const [multiLeagueResults, jLeagueResults, overseasResults, partialResults] = await Promise.all([
                multiLeagueSearch(),
                jLeagueSearch(),
                overseasSearch(),
                partialMatchSearch()
            ]);

            console.log(`Search results summary: multiLeague=${multiLeagueResults.length}, jLeague=${jLeagueResults.length}, overseas=${overseasResults.length}, partial=${partialResults.length}`);

            // 結果を統合（重複除去）
            const combinedMap = new Map();
            
            [...multiLeagueResults, ...jLeagueResults, ...overseasResults, ...partialResults].forEach(player => {
                const key = `${player.player.name}-${player.player.nationality}`;
                if (!combinedMap.has(key)) {
                    const isJapanese = player.player.nationality === 'JP' || player.player.nationality === 'Japan';
                    combinedMap.set(key, {
                        ...player,
                        source: 'api-football',
                        isJapanese: isJapanese
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

// FotMob-style Data Service
class FotMobDataService {
    constructor() {
        this.cache = cache;
        this.isInitialized = false;
        this.initializationPromise = null;
        this.lastUpdate = null;
        this.updateInterval = 24 * 60 * 60 * 1000; // 24 hours
        this.isInitializing = false;
    }

    // Initialize the service
    async initialize() {
        if (this.isInitialized) {
            return true;
        }

        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        if (this.isInitializing) {
            // Wait for ongoing initialization
            while (this.isInitializing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return this.isInitialized;
        }

        this.isInitializing = true;
        this.initializationPromise = this._initialize();
        
        try {
            await this.initializationPromise;
            this.isInitialized = true;
        } catch (error) {
            console.error('FotMobDataService initialization failed:', error);
            this.isInitialized = false;
        } finally {
            this.isInitializing = false;
        }

        return this.isInitialized;
    }

    async _initialize() {
        console.log('Initializing FotMob-style Data Service...');
        
        try {
            // Load existing data
            await this.loadPersistentData();
            
            // Check if data needs updating
            if (this.shouldUpdateData()) {
                console.log('Data is outdated, updating...');
                await this.updateAllData();
            } else {
                console.log('Data is up to date');
            }

            console.log('FotMob-style Data Service initialized successfully');
            return true;
        } catch (error) {
            console.error('Error during FotMobDataService initialization:', error);
            // Even if initialization fails, we can still serve fallback data
            return false;
        }
    }

    // Check if data should be updated
    shouldUpdateData() {
        if (!this.lastUpdate) return true;
        return Date.now() - this.lastUpdate > this.updateInterval;
    }

    // Load persistent data from files
    async loadPersistentData() {
        try {
            const [players, teams, leagues] = await Promise.all([
                loadDataFromFile(PLAYERS_FILE),
                loadDataFromFile(TEAMS_FILE),
                loadDataFromFile(LEAGUES_FILE)
            ]);

            if (players && players.length > 0) {
                this.cache.set('players', players);
                console.log(`Loaded ${players.length} players from persistent storage`);
            }
            if (teams && teams.length > 0) {
                this.cache.set('teams', teams);
                console.log(`Loaded ${teams.length} teams from persistent storage`);
            }
            if (leagues && leagues.length > 0) {
                this.cache.set('leagues', leagues);
                console.log(`Loaded ${leagues.length} leagues from persistent storage`);
            }
        } catch (error) {
            console.error('Error loading persistent data:', error);
        }
    }

    // Update all data from APIs
    async updateAllData() {
        try {
            console.log('Starting data update...');
            
            // Update leagues
            const leagues = await this.fetchLeagues();
            if (leagues && leagues.length > 0) {
                await saveDataToFile(LEAGUES_FILE, leagues);
                this.cache.set('leagues', leagues);
            }

            // Update teams
            const teams = await this.fetchTeams();
            if (teams && teams.length > 0) {
                await saveDataToFile(TEAMS_FILE, teams);
                this.cache.set('teams', teams);
            }

            // Update players
            const players = await this.fetchPlayers();
            if (players && players.length > 0) {
                await saveDataToFile(PLAYERS_FILE, players);
                this.cache.set('players', players);
            }

            this.lastUpdate = Date.now();
            console.log('Data update completed');
        } catch (error) {
            console.error('Error updating data:', error);
            // Use fallback data if update fails
            await this.loadFallbackData();
        }
    }

    // Load fallback data if no persistent data exists
    async loadFallbackData() {
        console.log('Loading fallback data...');
        
        const fallbackPlayers = this.getFallbackPlayers();
        const fallbackTeams = this.getFallbackTeams();
        const fallbackLeagues = this.getFallbackLeagues();

        this.cache.set('players', fallbackPlayers);
        this.cache.set('teams', fallbackTeams);
        this.cache.set('leagues', fallbackLeagues);

        // Save fallback data to files
        try {
            await saveDataToFile(PLAYERS_FILE, fallbackPlayers);
            await saveDataToFile(TEAMS_FILE, fallbackTeams);
            await saveDataToFile(LEAGUES_FILE, fallbackLeagues);
        } catch (error) {
            console.error('Error saving fallback data:', error);
        }
    }

    // Fetch leagues from APIs
    async fetchLeagues() {
        const leagues = [];
        
        try {
            // Fetch from Football-Data.org
            if (checkRateLimit('footballData')) {
                const response = await apiClient.get('/competitions');
                if (response.data && response.data.competitions) {
                    response.data.competitions.forEach(league => {
                        leagues.push({
                            id: league.id,
                            name: league.name,
                            country: league.area?.name || 'Unknown',
                            code: league.code,
                            type: league.type,
                            emblem: league.emblem,
                            currentSeason: league.currentSeason,
                            source: 'football-data'
                        });
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching leagues from Football-Data.org:', error);
        }

        // Add fallback leagues if no data
        if (leagues.length === 0) {
            leagues.push(...this.getFallbackLeagues());
        }

        return leagues;
    }

    // Fetch teams from APIs
    async fetchTeams() {
        const teams = [];
        const leagueIds = ['PL', 'PD', 'SA', 'BL1', 'FL1']; // Major leagues

        for (const leagueId of leagueIds) {
            try {
                if (checkRateLimit('footballData')) {
                    const response = await apiClient.get(`/competitions/${leagueId}/teams`);
                    if (response.data && response.data.teams) {
                        response.data.teams.forEach(team => {
                            teams.push({
                                id: team.id,
                                name: team.name,
                                shortName: team.shortName,
                                tla: team.tla,
                                crest: team.crest,
                                address: team.address,
                                website: team.website,
                                founded: team.founded,
                                clubColors: team.clubColors,
                                venue: team.venue,
                                leagueId: leagueId,
                                source: 'football-data'
                            });
                        });
                    }
                }
            } catch (error) {
                console.error(`Error fetching teams for league ${leagueId}:`, error);
            }
        }

        // Add fallback teams if no data
        if (teams.length === 0) {
            teams.push(...this.getFallbackTeams());
        }

        return teams;
    }

    // Fetch players from APIs
    async fetchPlayers() {
        const players = [];
        const teams = this.cache.get('teams') || [];

        // Limit to first 10 teams to avoid rate limits
        const teamsToProcess = teams.slice(0, 10);

        for (const team of teamsToProcess) {
            try {
                if (checkRateLimit('footballData')) {
                    // 正しいエンドポイント: /teams/{id} (squadプロパティに選手情報が含まれる)
                    const response = await apiClient.get(`/teams/${team.id}`);
                    if (response.data && response.data.squad && response.data.squad.length > 0) {
                        response.data.squad.forEach(player => {
                            const playerName = player.name || `${player.firstName || ''} ${player.lastName || ''}`.trim();
                            if (playerName) {
                                players.push({
                                    id: player.id,
                                    name: playerName,
                                    firstName: player.firstName,
                                    lastName: player.lastName,
                                    dateOfBirth: player.dateOfBirth,
                                    nationality: player.nationality,
                                    position: player.position,
                                    shirtNumber: player.shirtNumber,
                                    lastUpdated: player.lastUpdated,
                                    teamId: team.id,
                                    teamName: team.name,
                                    leagueId: team.leagueId,
                                    source: 'football-data'
                                });
                            }
                        });
                    }
                }
            } catch (error) {
                console.error(`Error fetching players for team ${team.id}:`, error);
            }
        }

        // Add fallback players if no data
        if (players.length === 0) {
            players.push(...this.getFallbackPlayers());
        }

        return players;
    }

    // Get all players (FotMob style - always available)
    async getAllPlayers(options = {}) {
        try {
            await this.initialize();
            
            let players = this.cache.get('players') || [];
            
            // If no players in cache, load fallback data
            if (players.length === 0) {
                console.log('No players in cache, loading fallback data...');
                await this.loadFallbackData();
                players = this.cache.get('players') || [];
            }
            
            // Apply filters
            if (options.search) {
                const searchLower = options.search.toLowerCase();
                players = players.filter(player => 
                    player.name && player.name.toLowerCase().includes(searchLower) ||
                    player.teamName && player.teamName.toLowerCase().includes(searchLower) ||
                    player.nationality && player.nationality.toLowerCase().includes(searchLower) ||
                    player.position && player.position.toLowerCase().includes(searchLower)
                );
            }

            if (options.league) {
                players = players.filter(player => player.leagueId === options.league);
            }

            if (options.position) {
                players = players.filter(player => player.position === options.position);
            }

            // Apply pagination
            const page = options.page || 1;
            const limit = options.limit || 20;
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;

            return {
                players: players.slice(startIndex, endIndex),
                total: players.length,
                page,
                limit,
                totalPages: Math.ceil(players.length / limit)
            };
        } catch (error) {
            console.error('Error in getAllPlayers:', error);
            // Return fallback data if everything fails
            const fallbackPlayers = this.getFallbackPlayers();
            return {
                players: fallbackPlayers.slice(0, options.limit || 20),
                total: fallbackPlayers.length,
                page: options.page || 1,
                limit: options.limit || 20,
                totalPages: Math.ceil(fallbackPlayers.length / (options.limit || 20))
            };
        }
    }

    // Get player by ID
    async getPlayerById(playerId) {
        await this.initialize();
        
        const players = this.cache.get('players') || [];
        return players.find(player => player.id == playerId);
    }

    // Get all teams
    async getAllTeams(options = {}) {
        await this.initialize();
        
        let teams = this.cache.get('teams') || [];
        
        if (options.league) {
            teams = teams.filter(team => team.leagueId === options.league);
        }

        return teams;
    }

    // Get all leagues
    async getAllLeagues() {
        await this.initialize();
        
        return this.cache.get('leagues') || [];
    }

    // Search players (FotMob style)
    async searchPlayers(query, options = {}) {
        await this.initialize();
        
        const searchResults = await this.getAllPlayers({
            search: query,
            ...options
        });

        return searchResults;
    }

    // Get fallback data
    getFallbackLeagues() {
        return [
            { id: 'PL', name: 'Premier League', country: 'England', code: 'PL', type: 'LEAGUE' },
            { id: 'PD', name: 'La Liga', country: 'Spain', code: 'PD', type: 'LEAGUE' },
            { id: 'SA', name: 'Serie A', country: 'Italy', code: 'SA', type: 'LEAGUE' },
            { id: 'BL1', name: 'Bundesliga', country: 'Germany', code: 'BL1', type: 'LEAGUE' },
            { id: 'FL1', name: 'Ligue 1', country: 'France', code: 'FL1', type: 'LEAGUE' }
        ];
    }

    getFallbackTeams() {
        return [
            { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', leagueId: 'PL' },
            { id: 58, name: 'Aston Villa FC', shortName: 'Aston Villa', tla: 'AVL', leagueId: 'PL' },
            { id: 61, name: 'Chelsea FC', shortName: 'Chelsea', tla: 'CHE', leagueId: 'PL' },
            { id: 64, name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV', leagueId: 'PL' },
            { id: 65, name: 'Manchester City FC', shortName: 'Man City', tla: 'MCI', leagueId: 'PL' }
        ];
    }

    getFallbackPlayers() {
        return [
            {
                id: 1,
                name: 'Erling Haaland',
                firstName: 'Erling',
                lastName: 'Haaland',
                dateOfBirth: '2000-07-21',
                nationality: 'Norway',
                position: 'Forward',
                shirtNumber: 9,
                teamId: 65,
                teamName: 'Manchester City FC',
                leagueId: 'PL',
                source: 'fallback'
            },
            {
                id: 2,
                name: 'Kevin De Bruyne',
                firstName: 'Kevin',
                lastName: 'De Bruyne',
                dateOfBirth: '1991-06-28',
                nationality: 'Belgium',
                position: 'Midfielder',
                shirtNumber: 17,
                teamId: 65,
                teamName: 'Manchester City FC',
                leagueId: 'PL',
                source: 'fallback'
            },
            {
                id: 3,
                name: '久保建英',
                firstName: 'Takefusa',
                lastName: 'Kubo',
                dateOfBirth: '2001-06-04',
                nationality: 'Japan',
                position: 'Midfielder',
                shirtNumber: 14,
                teamId: 201,
                teamName: 'Real Sociedad',
                leagueId: 'PD',
                source: 'fallback'
            },
            {
                id: 4,
                name: '三笘薫',
                firstName: 'Kaoru',
                lastName: 'Mitoma',
                dateOfBirth: '1997-05-20',
                nationality: 'Japan',
                position: 'Forward',
                shirtNumber: 22,
                teamId: 397,
                teamName: 'Brighton & Hove Albion FC',
                leagueId: 'PL',
                source: 'fallback'
            },
            {
                id: 5,
                name: '堂安律',
                firstName: 'Ritsu',
                lastName: 'Doan',
                dateOfBirth: '1998-06-16',
                nationality: 'Japan',
                position: 'Midfielder',
                shirtNumber: 8,
                teamId: 165,
                teamName: 'SC Freiburg',
                leagueId: 'BL1',
                source: 'fallback'
            },
            {
                id: 6,
                name: '田中碧',
                firstName: 'Ao',
                lastName: 'Tanaka',
                dateOfBirth: '1998-09-10',
                nationality: 'Japan',
                position: 'Midfielder',
                shirtNumber: 6,
                teamId: 165,
                teamName: 'SC Freiburg',
                leagueId: 'BL1',
                source: 'fallback'
            },
            {
                id: 7,
                name: '伊藤洋輝',
                firstName: 'Hiroki',
                lastName: 'Ito',
                dateOfBirth: '1999-05-12',
                nationality: 'Japan',
                position: 'Defender',
                shirtNumber: 21,
                teamId: 165,
                teamName: 'VfB Stuttgart',
                leagueId: 'BL1',
                source: 'fallback'
            },
            {
                id: 8,
                name: '遠藤航',
                firstName: 'Wataru',
                lastName: 'Endo',
                dateOfBirth: '1993-02-09',
                nationality: 'Japan',
                position: 'Midfielder',
                shirtNumber: 3,
                teamId: 64,
                teamName: 'Liverpool FC',
                leagueId: 'PL',
                source: 'fallback'
            },
            {
                id: 9,
                name: '南野拓実',
                firstName: 'Takumi',
                lastName: 'Minamino',
                dateOfBirth: '1995-01-16',
                nationality: 'Japan',
                position: 'Forward',
                shirtNumber: 18,
                teamId: 58,
                teamName: 'AS Monaco',
                leagueId: 'FL1',
                source: 'fallback'
            },
            {
                id: 10,
                name: '浅野拓磨',
                firstName: 'Takuma',
                lastName: 'Asano',
                dateOfBirth: '1994-11-10',
                nationality: 'Japan',
                position: 'Forward',
                shirtNumber: 9,
                teamId: 165,
                teamName: 'VfB Stuttgart',
                leagueId: 'BL1',
                source: 'fallback'
            },
            {
                id: 11,
                name: '上田綺世',
                firstName: 'Ayase',
                lastName: 'Ueda',
                dateOfBirth: '1998-08-28',
                nationality: 'Japan',
                position: 'Forward',
                shirtNumber: 11,
                teamId: 165,
                teamName: 'Feyenoord',
                leagueId: 'NL1',
                source: 'fallback'
            },
            {
                id: 12,
                name: '前田大然',
                firstName: 'Daizen',
                lastName: 'Maeda',
                dateOfBirth: '1997-10-20',
                nationality: 'Japan',
                position: 'Forward',
                shirtNumber: 38,
                teamId: 247,
                teamName: 'Celtic FC',
                leagueId: 'SC1',
                source: 'fallback'
            },
            {
                id: 13,
                name: 'Lionel Messi',
                firstName: 'Lionel',
                lastName: 'Messi',
                dateOfBirth: '1987-06-24',
                nationality: 'Argentina',
                position: 'Forward',
                shirtNumber: 10,
                teamId: 197,
                teamName: 'Inter Miami CF',
                leagueId: 'MLS',
                source: 'fallback'
            },
            {
                id: 14,
                name: 'Cristiano Ronaldo',
                firstName: 'Cristiano',
                lastName: 'Ronaldo',
                dateOfBirth: '1985-02-05',
                nationality: 'Portugal',
                position: 'Forward',
                shirtNumber: 7,
                teamId: 211,
                teamName: 'Al Nassr FC',
                leagueId: 'SAU',
                source: 'fallback'
            },
            {
                id: 15,
                name: 'Kylian Mbappé',
                firstName: 'Kylian',
                lastName: 'Mbappé',
                dateOfBirth: '1998-12-20',
                nationality: 'France',
                position: 'Forward',
                shirtNumber: 7,
                teamId: 524,
                teamName: 'Real Madrid CF',
                leagueId: 'PD',
                source: 'fallback'
            }
        ];
    }
}

// Create and export the service instance
const fotMobDataService = new FotMobDataService();

module.exports = {
    fotMobDataService,
    FootballDataService: require('./dataService').FootballDataService
}; 