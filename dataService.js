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
const MATCHES_FILE = path.join(DATA_DIR, 'matches.json');
const STANDINGS_FILE = path.join(DATA_DIR, 'standings.json');

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

// Queue management for data ingestion
const dataIngestionQueue = {
    tasks: [],
    isProcessing: false,
    maxRetries: 3,
    retryDelay: 5000
};

// Add task to ingestion queue
function addToIngestionQueue(task) {
    dataIngestionQueue.tasks.push({
        ...task,
        retries: 0,
        status: 'pending',
        createdAt: Date.now()
    });
}

// Process ingestion queue
async function processIngestionQueue() {
    if (dataIngestionQueue.isProcessing || dataIngestionQueue.tasks.length === 0) {
        return;
    }

    dataIngestionQueue.isProcessing = true;
    console.log(`Processing ${dataIngestionQueue.tasks.length} tasks in ingestion queue...`);

    while (dataIngestionQueue.tasks.length > 0) {
        const task = dataIngestionQueue.tasks.shift();
        
        try {
            console.log(`Processing task: ${task.type} for ${task.target}`);
            await executeTask(task);
            task.status = 'completed';
            console.log(`Task completed: ${task.type} for ${task.target}`);
        } catch (error) {
            console.error(`Task failed: ${task.type} for ${task.target}:`, error);
            task.retries++;
            
            if (task.retries < dataIngestionQueue.maxRetries) {
                task.status = 'retry';
                // Add back to queue with delay
                setTimeout(() => {
                    dataIngestionQueue.tasks.unshift(task);
                }, dataIngestionQueue.retryDelay * task.retries);
        } else {
                task.status = 'failed';
                console.error(`Task permanently failed after ${task.retries} retries: ${task.type} for ${task.target}`);
            }
        }
    }

    dataIngestionQueue.isProcessing = false;
    console.log('Ingestion queue processing completed');
}

// Execute individual task
async function executeTask(task) {
    switch (task.type) {
        case 'fetchLeague':
            return await fetchLeagueData(task.target);
        case 'fetchTeam':
            return await fetchTeamData(task.target);
        case 'fetchPlayers':
            return await fetchPlayerData(task.target);
        case 'fetchStats':
            return await fetchStatsData(task.target);
        default:
            throw new Error(`Unknown task type: ${task.type}`);
    }
}

// Fetch league data with queue management
async function fetchLeagueData(leagueId) {
    if (!checkRateLimit('footballData')) {
        throw new Error('Rate limit exceeded for football-data');
    }
    
    const response = await apiClient.get(`/competitions/${leagueId}`);
    return response.data;
}

// Fetch team data with queue management
async function fetchTeamData(teamId) {
    if (!checkRateLimit('footballData')) {
        throw new Error('Rate limit exceeded for football-data');
    }
    
    const response = await apiClient.get(`/teams/${teamId}`);
    return response.data;
}

// Fetch player data with queue management
async function fetchPlayerData(teamId) {
    if (!checkRateLimit('footballData')) {
        throw new Error('Rate limit exceeded for football-data');
    }
    
    const response = await apiClient.get(`/teams/${teamId}`);
    return response.data;
}

// Fetch stats data with queue management
async function fetchStatsData(matchId) {
    if (!checkRateLimit('footballData')) {
        throw new Error('Rate limit exceeded for football-data');
    }
    
    const response = await apiClient.get(`/matches/${matchId}`);
    return response.data;
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
            { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', leagueId: 'PL' },
            { id: 58, name: 'Aston Villa FC', shortName: 'Aston Villa', tla: 'AVL', leagueId: 'PL' },
            { id: 61, name: 'Chelsea FC', shortName: 'Chelsea', tla: 'CHE', leagueId: 'PL' },
            { id: 64, name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV', leagueId: 'PL' },
            { id: 65, name: 'Manchester City FC', shortName: 'Man City', tla: 'MCI', leagueId: 'PL' }
        ];
    }

    getFallbackJLeagueTeams() {
        return [
            // J1リーグ
            { id: 1001, name: '浦和レッズ', shortName: '浦和', tla: 'URA', leagueId: 'J1' },
            { id: 1002, name: '横浜F・マリノス', shortName: '横浜FM', tla: 'YFM', leagueId: 'J1' },
            { id: 1003, name: '川崎フロンターレ', shortName: '川崎', tla: 'KAW', leagueId: 'J1' },
            { id: 1004, name: 'FC東京', shortName: 'FC東京', tla: 'FCT', leagueId: 'J1' },
            { id: 1005, name: '鹿島アントラーズ', shortName: '鹿島', tla: 'KAS', leagueId: 'J1' },
            { id: 1006, name: 'サンフレッチェ広島', shortName: '広島', tla: 'SAN', leagueId: 'J1' },
            { id: 1007, name: 'セレッソ大阪', shortName: 'C大阪', tla: 'CER', leagueId: 'J1' },
            { id: 1008, name: 'ガンバ大阪', shortName: 'G大阪', tla: 'GAM', leagueId: 'J1' },
            { id: 1009, name: '名古屋グランパス', shortName: '名古屋', tla: 'NAG', leagueId: 'J1' },
            { id: 1010, name: 'ヴィッセル神戸', shortName: '神戸', tla: 'VIS', leagueId: 'J1' },
            { id: 1011, name: '柏レイソル', shortName: '柏', tla: 'KAS', leagueId: 'J1' },
            { id: 1012, name: '清水エスパルス', shortName: '清水', tla: 'SHI', leagueId: 'J1' },
            { id: 1013, name: '湘南ベルマーレ', shortName: '湘南', tla: 'SHO', leagueId: 'J1' },
            { id: 1014, name: '北海道コンサドーレ札幌', shortName: '札幌', tla: 'CON', leagueId: 'J1' },
            { id: 1015, name: 'ベガルタ仙台', shortName: '仙台', tla: 'VEG', leagueId: 'J1' },
            { id: 1016, name: 'ジュビロ磐田', shortName: '磐田', tla: 'JUB', leagueId: 'J1' },
            { id: 1017, name: '大分トリニータ', shortName: '大分', tla: 'OIT', leagueId: 'J1' },
            { id: 1018, name: '徳島ヴォルティス', shortName: '徳島', tla: 'TOK', leagueId: 'J1' },
            { id: 1019, name: 'アビスパ福岡', shortName: '福岡', tla: 'AVI', leagueId: 'J1' },
            { id: 1020, name: 'サガン鳥栖', shortName: '鳥栖', tla: 'SAG', leagueId: 'J1' },
            
            // J2リーグ
            { id: 2001, name: '京都サンガF.C.', shortName: '京都', tla: 'KYO', leagueId: 'J2' },
            { id: 2002, name: 'ファジアーノ岡山', shortName: '岡山', tla: 'FAJ', leagueId: 'J2' },
            { id: 2003, name: 'FC町田ゼルビア', shortName: '町田', tla: 'MAC', leagueId: 'J2' },
            { id: 2004, name: 'レノファ山口FC', shortName: '山口', tla: 'REN', leagueId: 'J2' },
            { id: 2005, name: 'FC琉球', shortName: '琉球', tla: 'RYK', leagueId: 'J2' },
            
            // J3リーグ
            { id: 3001, name: 'FC今治', shortName: '今治', tla: 'IMA', leagueId: 'J3' },
            { id: 3002, name: 'SC相模原', shortName: '相模原', tla: 'SAG', leagueId: 'J3' },
            { id: 3003, name: 'FC岐阜', shortName: '岐阜', tla: 'GIF', leagueId: 'J3' }
        ];
    }

    getFallbackPlayers() {
        return [
            {
                player: { id: 1, name: 'Erling Haaland', firstname: 'Erling', lastname: 'Haaland', age: 22, nationality: 'Norway', position: 'Forward', shirtNumber: 9, teamId: 65, teamName: 'Manchester City FC', leagueId: 'PL', source: 'fallback' },
                statistics: [{ games: { position: 'Forward', rating: '9.0' }, goals: { total: 20 }, assists: { total: 5 }, team: { name: 'Manchester City FC' } }]
            },
            {
                player: { id: 2, name: 'Kevin De Bruyne', firstname: 'Kevin', lastname: 'De Bruyne', age: 30, nationality: 'Belgium', position: 'Midfielder', shirtNumber: 17, teamId: 65, teamName: 'Manchester City FC', leagueId: 'PL', source: 'fallback' },
                statistics: [{ games: { position: 'Midfielder', rating: '8.5' }, goals: { total: 15 }, assists: { total: 10 }, team: { name: 'Manchester City FC' } }]
            },
            {
                player: { id: 3, name: 'Takefusa Kubo', firstname: 'Takefusa', lastname: 'Kubo', age: 21, nationality: 'Japan', position: 'Midfielder', shirtNumber: 14, teamId: 201, teamName: 'Real Sociedad', currentTeam: 'Real Sociedad', leagueId: 'PD', source: 'fallback' },
                statistics: [{ games: { position: 'Midfielder', rating: '7.5' }, goals: { total: 5 }, assists: { total: 5 }, team: { name: 'Real Sociedad' } }]
            },
            {
                player: { id: 4, name: 'Kaoru Mitoma', firstname: 'Kaoru', lastname: 'Mitoma', age: 26, nationality: 'Japan', position: 'Forward', shirtNumber: 22, teamId: 397, teamName: 'Brighton & Hove Albion FC', currentTeam: 'Brighton & Hove Albion FC', leagueId: 'PL', source: 'fallback' },
                statistics: [{ games: { position: 'Forward', rating: '7.8' }, goals: { total: 12 }, assists: { total: 5 }, team: { name: 'Brighton & Hove Albion FC' } }]
            },
            {
                player: { id: 5, name: 'Ritsu Doan', firstname: 'Ritsu', lastname: 'Doan', age: 24, nationality: 'Japan', position: 'Forward', shirtNumber: 8, teamId: 165, teamName: 'SC Freiburg', currentTeam: 'SC Freiburg', leagueId: 'BL1', source: 'fallback' },
                statistics: [{ games: { position: 'Forward', rating: '7.2' }, goals: { total: 7 }, assists: { total: 3 }, team: { name: 'SC Freiburg' } }]
            },
            {
                player: { id: 6, name: 'Ao Tanaka', firstname: 'Ao', lastname: 'Tanaka', age: 23, nationality: 'Japan', position: 'Midfielder', shirtNumber: 6, teamId: 165, teamName: 'SC Freiburg', currentTeam: 'SC Freiburg', leagueId: 'BL1', source: 'fallback' },
                statistics: [{ games: { position: 'Midfielder', rating: '7.0' }, goals: { total: 4 }, assists: { total: 3 }, team: { name: 'SC Freiburg' } }]
            },
            {
                player: { id: 7, name: 'Hiroki Ito', firstname: 'Hiroki', lastname: 'Ito', age: 22, nationality: 'Japan', position: 'Defender', shirtNumber: 21, teamId: 165, teamName: 'VfB Stuttgart', currentTeam: 'VfB Stuttgart', leagueId: 'BL1', source: 'fallback' },
                statistics: [{ games: { position: 'Defender', rating: '7.0' }, goals: { total: 1 }, assists: { total: 1 }, team: { name: 'VfB Stuttgart' } }]
            },
            {
                player: { id: 8, name: 'Wataru Endo', firstname: 'Wataru', lastname: 'Endo', age: 28, nationality: 'Japan', position: 'Midfielder', shirtNumber: 3, teamId: 64, teamName: 'Liverpool FC', currentTeam: 'Liverpool FC', leagueId: 'PL', source: 'fallback' },
                statistics: [{ games: { position: 'Midfielder', rating: '7.0' }, goals: { total: 5 }, assists: { total: 3 }, team: { name: 'Liverpool FC' } }]
            },
            {
                player: { id: 9, name: 'Takumi Minamino', firstname: 'Takumi', lastname: 'Minamino', age: 28, nationality: 'Japan', position: 'Forward', shirtNumber: 18, teamId: 58, teamName: 'AS Monaco', currentTeam: 'AS Monaco', leagueId: 'FL1', source: 'fallback' },
                statistics: [{ games: { position: 'Forward', rating: '7.0' }, goals: { total: 6 }, assists: { total: 3 }, team: { name: 'AS Monaco' } }]
            },
            {
                player: { id: 10, name: 'Takuma Asano', firstname: 'Takuma', lastname: 'Asano', age: 27, nationality: 'Japan', position: 'Forward', shirtNumber: 9, teamId: 165, teamName: 'VfB Stuttgart', currentTeam: 'VfB Stuttgart', leagueId: 'BL1', source: 'fallback' },
                statistics: [{ games: { position: 'Forward', rating: '7.0' }, goals: { total: 6 }, assists: { total: 2 }, team: { name: 'VfB Stuttgart' } }]
            },
            {
                player: { id: 11, name: 'Ayase Ueda', firstname: 'Ayase', lastname: 'Ueda', age: 25, nationality: 'Japan', position: 'Forward', shirtNumber: 11, teamId: 165, teamName: 'Feyenoord', currentTeam: 'Feyenoord', leagueId: 'NL1', source: 'fallback' },
                statistics: [{ games: { position: 'Forward', rating: '7.0' }, goals: { total: 5 }, assists: { total: 2 }, team: { name: 'Feyenoord' } }]
            },
            {
                player: { id: 12, name: 'Daizen Maeda', firstname: 'Daizen', lastname: 'Maeda', age: 24, nationality: 'Japan', position: 'Forward', shirtNumber: 38, teamId: 247, teamName: 'Celtic FC', currentTeam: 'Celtic FC', leagueId: 'SC1', source: 'fallback' },
                statistics: [{ games: { position: 'Forward', rating: '7.0' }, goals: { total: 5 }, assists: { total: 2 }, team: { name: 'Celtic FC' } }]
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

    // Fetch league standings (Football-Data.org)
    async fetchStandings() {
        const standingsRows = [];
        const leagueIds = ['PL', 'PD', 'SA', 'BL1', 'FL1'];
        for (const leagueId of leagueIds) {
            try {
                if (checkRateLimit('footballData')) {
                    const response = await apiClient.get(`/competitions/${leagueId}/standings`);
                    const tables = response.data?.standings || [];
                    tables.forEach(table => {
                        table.table?.forEach(row => {
                            standingsRows.push({
                                leagueId,
                                position: row.position,
                                teamId: row.team.id,
                                teamName: row.team.name,
                                playedGames: row.playedGames,
                                won: row.won,
                                draw: row.draw,
                                lost: row.lost,
                                points: row.points,
                                goalsFor: row.goalsFor,
                                goalsAgainst: row.goalsAgainst,
                                goalDifference: row.goalDifference,
                                updated: response.data?.season?.endDate || null,
                                source: 'football-data'
                            });
                        });
                    });
                }
            } catch (error) {
                console.error(`Error fetching standings for ${leagueId}:`, error.message);
            }
        }
        return standingsRows;
    }

    // Fetch recent matches for major leagues (Football-Data.org)
    async fetchRecentMatches() {
        const matches = [];
        const leagueIds = ['PL', 'PD', 'SA', 'BL1', 'FL1'];
        const dateTo = new Date();
        const dateFrom = new Date();
        dateFrom.setDate(dateTo.getDate() - 7);
        const fromStr = dateFrom.toISOString().split('T')[0];
        const toStr = dateTo.toISOString().split('T')[0];
        for (const leagueId of leagueIds) {
            try {
                if (checkRateLimit('footballData')) {
                    const response = await apiClient.get(`/competitions/${leagueId}/matches`, {
                        params: { dateFrom: fromStr, dateTo: toStr }
                    });
                    const list = response.data?.matches || [];
                    list.forEach(m => {
                        matches.push({
                            id: m.id,
                            utcDate: m.utcDate,
                            status: m.status,
                            matchday: m.matchday,
                            stage: m.stage,
                            group: m.group,
                            homeTeamId: m.homeTeam?.id,
                            homeTeam: m.homeTeam?.name,
                            awayTeamId: m.awayTeam?.id,
                            awayTeam: m.awayTeam?.name,
                            score: m.score,
                            competition: leagueId,
                            source: 'football-data'
                        });
                    });
                }
            } catch (error) {
                console.error(`Error fetching matches for ${leagueId}:`, error.message);
            }
        }
        return matches;
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
                console.log('Data is outdated, starting phased update...');
                await this.phasedDataIngestion();
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

            const [matches, standings] = await Promise.all([
                loadDataFromFile(MATCHES_FILE),
                loadDataFromFile(STANDINGS_FILE)
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
            if (matches && matches.length > 0) {
                this.cache.set('matches', matches);
                console.log(`Loaded ${matches.length} matches from persistent storage`);
            }
            if (standings && standings.length > 0) {
                this.cache.set('standings', standings);
                console.log(`Loaded ${standings.length} standings rows from persistent storage`);
            }
        } catch (error) {
            console.error('Error loading persistent data:', error);
        }
    }

    // Update all data from APIs
    async updateAllData() {
        try {
            console.log('Starting data update...');
            
            // Phase 1: Update leagues
            console.log('Phase 1: Updating leagues...');
            const leagues = await this.fetchLeagues();
            if (leagues && leagues.length > 0) {
                await saveDataToFile(LEAGUES_FILE, leagues);
                this.cache.set('leagues', leagues);
                console.log(`Updated ${leagues.length} leagues`);
            }

            // Phase 2: Update teams (with queue management)
            console.log('Phase 2: Updating teams...');
            const teams = await this.fetchTeams();
            if (teams && teams.length > 0) {
                await saveDataToFile(TEAMS_FILE, teams);
                this.cache.set('teams', teams);
                console.log(`Updated ${teams.length} teams`);
            }

            // Phase 3: Update players (with queue management)
            console.log('Phase 3: Updating players...');
            const players = await this.fetchPlayers();
            if (players && players.length > 0) {
                await saveDataToFile(PLAYERS_FILE, players);
                this.cache.set('players', players);
                console.log(`Updated ${players.length} players`);
            }

            // Phase 4: Update standings (optional best effort)
            console.log('Phase 4: Updating standings...');
            if (typeof this.fetchStandings === 'function') {
                const standings = await this.fetchStandings();
                if (standings && standings.length > 0) {
                    await saveDataToFile(STANDINGS_FILE, standings);
                    this.cache.set('standings', standings);
                    console.log(`Updated ${standings.length} standings rows`);
                }
            } else {
                console.warn('fetchStandings is not defined; skipping standings update');
            }

            // Phase 5: Update recent matches (best effort)
            console.log('Phase 5: Updating recent matches...');
            if (typeof this.fetchRecentMatches === 'function') {
                const matches = await this.fetchRecentMatches();
                if (matches && matches.length > 0) {
                    await saveDataToFile(MATCHES_FILE, matches);
                    this.cache.set('matches', matches);
                    console.log(`Updated ${matches.length} recent matches`);
                }
            } else {
                console.warn('fetchRecentMatches is not defined; skipping matches update');
            }

            this.lastUpdate = Date.now();
            console.log('Data update completed successfully');
        } catch (error) {
            console.error('Error updating data:', error);
            // Use fallback data if update fails
            await this.loadFallbackData();
        }
    }

    // Phased data ingestion for large datasets
    async phasedDataIngestion() {
        console.log('Starting phased data ingestion...');
        
        try {
            // Phase 1: League ingestion
            await this.ingestLeagues();
            
            // Phase 2: Team ingestion (with rate limiting)
            await this.ingestTeams();
            
            // Phase 3: Player ingestion (with rate limiting)
            await this.ingestPlayers();
            
            // Phase 4: Statistics ingestion (with rate limiting)
            await this.ingestStatistics();
            
            console.log('Phased data ingestion completed');
        } catch (error) {
            console.error('Error in phased data ingestion:', error);
        }
    }

    // Ingest leagues
    async ingestLeagues() {
        console.log('Ingesting leagues...');
        const leagues = await this.fetchLeagues();
        if (leagues && leagues.length > 0) {
            await saveDataToFile(LEAGUES_FILE, leagues);
            this.cache.set('leagues', leagues);
            console.log(`Ingested ${leagues.length} leagues`);
        }
    }

    // Ingest teams with rate limiting
    async ingestTeams() {
        console.log('Ingesting teams...');
        const teams = await this.fetchTeams();
        if (teams && teams.length > 0) {
            await saveDataToFile(TEAMS_FILE, teams);
            this.cache.set('teams', teams);
            console.log(`Ingested ${teams.length} teams`);
        }
    }

    // Ingest players with rate limiting
    async ingestPlayers() {
        console.log('Ingesting players...');
        const players = await this.fetchPlayers();
        if (players && players.length > 0) {
            await saveDataToFile(PLAYERS_FILE, players);
            this.cache.set('players', players);
            console.log(`Ingested ${players.length} players`);
        }
    }

    // Ingest statistics with rate limiting
    async ingestStatistics() {
        console.log('Ingesting statistics...');
        
        try {
            // Update standings
            if (typeof this.fetchStandings === 'function') {
                const standings = await this.fetchStandings();
                if (standings && standings.length > 0) {
                    await saveDataToFile(STANDINGS_FILE, standings);
                    this.cache.set('standings', standings);
                    console.log(`Ingested ${standings.length} standings rows`);
                }
            }
            
            // Update recent matches
            if (typeof this.fetchRecentMatches === 'function') {
                const matches = await this.fetchRecentMatches();
                if (matches && matches.length > 0) {
                    await saveDataToFile(MATCHES_FILE, matches);
                    this.cache.set('matches', matches);
                    console.log(`Ingested ${matches.length} recent matches`);
                }
            }
        } catch (error) {
            console.error('Error ingesting statistics:', error);
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
        // 正しいリーグIDを使用（Jリーグは実際のIDに変更）
        const leagueIds = ['PL', 'PD', 'SA', 'BL1', 'FL1']; // Major leagues only

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

        // Jリーグのチームをフォールバックデータから追加
        const jLeagueTeams = this.getFallbackJLeagueTeams();
        teams.push(...jLeagueTeams);

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

        // Process more teams for better coverage (increased from 60 to 200)
        const teamsToProcess = teams.slice(0, 200);

        console.log(`Processing ${teamsToProcess.length} teams for player data...`);

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

        console.log(`Fetched ${players.length} players from ${teamsToProcess.length} teams`);

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
                players = players.filter(player => {
                    // 名前での検索（日本語名、英語名、フルネーム）
                    const nameMatch = player.name && player.name.toLowerCase().includes(searchLower) ||
                                     player.fullName && player.fullName.toLowerCase().includes(searchLower) ||
                                     player.japaneseName && player.japaneseName.toLowerCase().includes(searchLower) ||
                                     player.englishName && player.englishName.toLowerCase().includes(searchLower) ||
                                     player.firstName && player.firstName.toLowerCase().includes(searchLower) ||
                                     player.lastName && player.lastName.toLowerCase().includes(searchLower);
                    
                    // チーム名での検索
                    const teamMatch = player.teamName && player.teamName.toLowerCase().includes(searchLower) ||
                                     player.currentTeam && player.currentTeam.toLowerCase().includes(searchLower);
                    
                    // 国籍での検索
                    const nationalityMatch = player.nationality && player.nationality.toLowerCase().includes(searchLower);
                    
                    // ポジションでの検索
                    const positionMatch = player.position && player.position.toLowerCase().includes(searchLower);
                    
                    return nameMatch || teamMatch || nationalityMatch || positionMatch;
                });
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

    getFallbackJLeagueTeams() {
        return [
            // J1リーグ
            { id: 1001, name: '浦和レッズ', shortName: '浦和', tla: 'URA', leagueId: 'J1' },
            { id: 1002, name: '横浜F・マリノス', shortName: '横浜FM', tla: 'YFM', leagueId: 'J1' },
            { id: 1003, name: '川崎フロンターレ', shortName: '川崎', tla: 'KAW', leagueId: 'J1' },
            { id: 1004, name: 'FC東京', shortName: 'FC東京', tla: 'FCT', leagueId: 'J1' },
            { id: 1005, name: '鹿島アントラーズ', shortName: '鹿島', tla: 'KAS', leagueId: 'J1' },
            { id: 1006, name: 'サンフレッチェ広島', shortName: '広島', tla: 'SAN', leagueId: 'J1' },
            { id: 1007, name: 'セレッソ大阪', shortName: 'C大阪', tla: 'CER', leagueId: 'J1' },
            { id: 1008, name: 'ガンバ大阪', shortName: 'G大阪', tla: 'GAM', leagueId: 'J1' },
            { id: 1009, name: '名古屋グランパス', shortName: '名古屋', tla: 'NAG', leagueId: 'J1' },
            { id: 1010, name: 'ヴィッセル神戸', shortName: '神戸', tla: 'VIS', leagueId: 'J1' },
            { id: 1011, name: '柏レイソル', shortName: '柏', tla: 'KAS', leagueId: 'J1' },
            { id: 1012, name: '清水エスパルス', shortName: '清水', tla: 'SHI', leagueId: 'J1' },
            { id: 1013, name: '湘南ベルマーレ', shortName: '湘南', tla: 'SHO', leagueId: 'J1' },
            { id: 1014, name: '北海道コンサドーレ札幌', shortName: '札幌', tla: 'CON', leagueId: 'J1' },
            { id: 1015, name: 'ベガルタ仙台', shortName: '仙台', tla: 'VEG', leagueId: 'J1' },
            { id: 1016, name: 'ジュビロ磐田', shortName: '磐田', tla: 'JUB', leagueId: 'J1' },
            { id: 1017, name: '大分トリニータ', shortName: '大分', tla: 'OIT', leagueId: 'J1' },
            { id: 1018, name: '徳島ヴォルティス', shortName: '徳島', tla: 'TOK', leagueId: 'J1' },
            { id: 1019, name: 'アビスパ福岡', shortName: '福岡', tla: 'AVI', leagueId: 'J1' },
            { id: 1020, name: 'サガン鳥栖', shortName: '鳥栖', tla: 'SAG', leagueId: 'J1' },
            
            // J2リーグ
            { id: 2001, name: '京都サンガF.C.', shortName: '京都', tla: 'KYO', leagueId: 'J2' },
            { id: 2002, name: 'ファジアーノ岡山', shortName: '岡山', tla: 'FAJ', leagueId: 'J2' },
            { id: 2003, name: 'FC町田ゼルビア', shortName: '町田', tla: 'MAC', leagueId: 'J2' },
            { id: 2004, name: 'レノファ山口FC', shortName: '山口', tla: 'REN', leagueId: 'J2' },
            { id: 2005, name: 'FC琉球', shortName: '琉球', tla: 'RYK', leagueId: 'J2' },
            
            // J3リーグ
            { id: 3001, name: 'FC今治', shortName: '今治', tla: 'IMA', leagueId: 'J3' },
            { id: 3002, name: 'SC相模原', shortName: '相模原', tla: 'SAG', leagueId: 'J3' },
            { id: 3003, name: 'FC岐阜', shortName: '岐阜', tla: 'GIF', leagueId: 'J3' }
        ];
    }

    getFallbackPlayers() {
        return [
            {
                player: { id: 1, name: 'Erling Haaland', firstname: 'Erling', lastname: 'Haaland', age: 22, nationality: 'Norway', position: 'Forward', shirtNumber: 9, teamId: 65, teamName: 'Manchester City FC', leagueId: 'PL', source: 'fallback' },
                statistics: [{ games: { position: 'Forward', rating: '9.0' }, goals: { total: 20 }, assists: { total: 5 }, team: { name: 'Manchester City FC' } }]
            },
            {
                player: { id: 2, name: 'Kevin De Bruyne', firstname: 'Kevin', lastname: 'De Bruyne', age: 30, nationality: 'Belgium', position: 'Midfielder', shirtNumber: 17, teamId: 65, teamName: 'Manchester City FC', leagueId: 'PL', source: 'fallback' },
                statistics: [{ games: { position: 'Midfielder', rating: '8.5' }, goals: { total: 15 }, assists: { total: 10 }, team: { name: 'Manchester City FC' } }]
            },
            {
                player: { id: 3, name: 'Takefusa Kubo', firstname: 'Takefusa', lastname: 'Kubo', age: 21, nationality: 'Japan', position: 'Midfielder', shirtNumber: 14, teamId: 201, teamName: 'Real Sociedad', currentTeam: 'Real Sociedad', leagueId: 'PD', source: 'fallback' },
                statistics: [{ games: { position: 'Midfielder', rating: '7.5' }, goals: { total: 5 }, assists: { total: 5 }, team: { name: 'Real Sociedad' } }]
            },
            {
                player: { id: 4, name: 'Kaoru Mitoma', firstname: 'Kaoru', lastname: 'Mitoma', age: 26, nationality: 'Japan', position: 'Forward', shirtNumber: 22, teamId: 397, teamName: 'Brighton & Hove Albion FC', currentTeam: 'Brighton & Hove Albion FC', leagueId: 'PL', source: 'fallback' },
                statistics: [{ games: { position: 'Forward', rating: '7.8' }, goals: { total: 12 }, assists: { total: 5 }, team: { name: 'Brighton & Hove Albion FC' } }]
            },
            {
                player: { id: 5, name: 'Ritsu Doan', firstname: 'Ritsu', lastname: 'Doan', age: 24, nationality: 'Japan', position: 'Forward', shirtNumber: 8, teamId: 165, teamName: 'SC Freiburg', currentTeam: 'SC Freiburg', leagueId: 'BL1', source: 'fallback' },
                statistics: [{ games: { position: 'Forward', rating: '7.2' }, goals: { total: 7 }, assists: { total: 3 }, team: { name: 'SC Freiburg' } }]
            },
            {
                player: { id: 6, name: 'Ao Tanaka', firstname: 'Ao', lastname: 'Tanaka', age: 23, nationality: 'Japan', position: 'Midfielder', shirtNumber: 6, teamId: 165, teamName: 'SC Freiburg', currentTeam: 'SC Freiburg', leagueId: 'BL1', source: 'fallback' },
                statistics: [{ games: { position: 'Midfielder', rating: '7.0' }, goals: { total: 4 }, assists: { total: 3 }, team: { name: 'SC Freiburg' } }]
            },
            {
                player: { id: 7, name: 'Hiroki Ito', firstname: 'Hiroki', lastname: 'Ito', age: 22, nationality: 'Japan', position: 'Defender', shirtNumber: 21, teamId: 165, teamName: 'VfB Stuttgart', currentTeam: 'VfB Stuttgart', leagueId: 'BL1', source: 'fallback' },
                statistics: [{ games: { position: 'Defender', rating: '7.0' }, goals: { total: 1 }, assists: { total: 1 }, team: { name: 'VfB Stuttgart' } }]
            },
            {
                player: { id: 8, name: 'Wataru Endo', firstname: 'Wataru', lastname: 'Endo', age: 28, nationality: 'Japan', position: 'Midfielder', shirtNumber: 3, teamId: 64, teamName: 'Liverpool FC', currentTeam: 'Liverpool FC', leagueId: 'PL', source: 'fallback' },
                statistics: [{ games: { position: 'Midfielder', rating: '7.0' }, goals: { total: 5 }, assists: { total: 3 }, team: { name: 'Liverpool FC' } }]
            },
            {
                player: { id: 9, name: 'Takumi Minamino', firstname: 'Takumi', lastname: 'Minamino', age: 28, nationality: 'Japan', position: 'Forward', shirtNumber: 18, teamId: 58, teamName: 'AS Monaco', currentTeam: 'AS Monaco', leagueId: 'FL1', source: 'fallback' },
                statistics: [{ games: { position: 'Forward', rating: '7.0' }, goals: { total: 6 }, assists: { total: 3 }, team: { name: 'AS Monaco' } }]
            },
            {
                player: { id: 10, name: 'Takuma Asano', firstname: 'Takuma', lastname: 'Asano', age: 27, nationality: 'Japan', position: 'Forward', shirtNumber: 9, teamId: 165, teamName: 'VfB Stuttgart', currentTeam: 'VfB Stuttgart', leagueId: 'BL1', source: 'fallback' },
                statistics: [{ games: { position: 'Forward', rating: '7.0' }, goals: { total: 6 }, assists: { total: 2 }, team: { name: 'VfB Stuttgart' } }]
            },
            {
                player: { id: 11, name: 'Ayase Ueda', firstname: 'Ayase', lastname: 'Ueda', age: 25, nationality: 'Japan', position: 'Forward', shirtNumber: 11, teamId: 165, teamName: 'Feyenoord', currentTeam: 'Feyenoord', leagueId: 'NL1', source: 'fallback' },
                statistics: [{ games: { position: 'Forward', rating: '7.0' }, goals: { total: 5 }, assists: { total: 2 }, team: { name: 'Feyenoord' } }]
            },
            {
                player: { id: 12, name: 'Daizen Maeda', firstname: 'Daizen', lastname: 'Maeda', age: 24, nationality: 'Japan', position: 'Forward', shirtNumber: 38, teamId: 247, teamName: 'Celtic FC', currentTeam: 'Celtic FC', leagueId: 'SC1', source: 'fallback' },
                statistics: [{ games: { position: 'Forward', rating: '7.0' }, goals: { total: 5 }, assists: { total: 2 }, team: { name: 'Celtic FC' } }]
            }
        ];
    }
}

// Advanced Data Service for Pro Plans
class AdvancedDataService {
    constructor() {
        this.apiFootballClient = createApiFootballClient();
        this.footballDataClient = apiClient;
        this.cache = cache;
    }

    // マッチデータ取得（API-Football v3）
    async getMatches(options = {}) {
        const { league, season = 2025, status, from, to } = options;
        const cacheKey = `matches_${league || 'all'}_${season}_${status || 'all'}_${from || ''}_${to || ''}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            console.log(`✅ キャッシュからマッチデータを返却: ${cached.length}件`);
            return cached;
        }

        try {
            console.log(`🔄 API-Footballからマッチデータを取得中... league=${league}, season=${season}, status=${status}`);
            
            const params = { season };
            if (league) params.league = league;
            if (status) params.status = status;
            if (from) params.from = from;
            if (to) params.to = to;

            const response = await this.apiFootballClient.get('/fixtures', { params });

            if (!response.data || !response.data.response) {
                console.log('⚠️ API-Footballから空のレスポンス');
                return [];
            }

            const matches = response.data.response.map(match => ({
                id: match.fixture.id,
                homeTeam: match.teams.home.name,
                awayTeam: match.teams.away.name,
                homeScore: match.goals.home,
                awayScore: match.goals.away,
                status: match.fixture.status.short,
                statusLong: match.fixture.status.long,
                elapsed: match.fixture.status.elapsed,
                venue: match.fixture.venue?.name || 'Unknown Venue',
                leagueName: match.league.name,
                league: match.league.name,
                leagueId: match.league.id,
                country: match.league.country,
                round: match.league.round,
                season: match.league.season,
                date: match.fixture.date,
                timestamp: match.fixture.timestamp,
                events: match.events || [],
                lineups: match.lineups || {},
                statistics: match.statistics || {}
            }));

            console.log(`✅ API-Footballから${matches.length}件のマッチを取得`);
            this.cache.set(cacheKey, matches, 300); // 5分キャッシュ
            return matches;
        } catch (error) {
            console.error('❌ API-Football マッチデータ取得エラー:', error.message);
            throw error;
        }
    }

    // ライブ試合データ取得（API-Football v3 Pro）
    async getLiveMatches(options = {}) {
        const cacheKey = `live_matches_${JSON.stringify(options)}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.apiFootballClient.get('/fixtures', {
                params: {
                    live: 'all',
                    ...options
                }
            });

            const liveMatches = response.data.response.map(match => ({
                id: match.fixture.id,
                homeTeam: match.teams.home.name,
                awayTeam: match.teams.away.name,
                homeScore: match.goals.home,
                awayScore: match.goals.away,
                status: match.fixture.status.short,
                elapsed: match.fixture.status.elapsed,
                venue: match.fixture.venue?.name,
                league: match.league.name,
                country: match.league.country,
                round: match.league.round,
                date: match.fixture.date,
                events: match.events || [],
                lineups: match.lineups || {},
                statistics: match.statistics || {},
                odds: match.odds || {}
            }));

            this.cache.set(cacheKey, liveMatches, 30); // 30秒キャッシュ
            return liveMatches;
        } catch (error) {
            console.error('Error fetching live matches:', error);
            return this.getFallbackLiveMatches();
        }
    }

    // 詳細な試合統計取得（football-data.org Deep Data）
    async getDetailedMatchStats(matchId, options = {}) {
        const cacheKey = `match_stats_${matchId}_${JSON.stringify(options)}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.footballDataClient.get(`/matches/${matchId}`, {
                params: {
                    ...options
                }
            });

            const match = response.data;
            const detailedStats = {
                id: match.id,
                homeTeam: match.homeTeam.name,
                awayTeam: match.awayTeam.name,
                score: match.score,
                status: match.status,
                date: match.utcDate,
                competition: match.competition.name,
                season: match.season.currentMatchday,
                venue: match.venue,
                referees: match.referees,
                odds: match.odds,
                // 詳細統計
                statistics: {
                    possession: match.statistics?.possession,
                    shots: match.statistics?.shots,
                    shotsOnTarget: match.statistics?.shotsOnTarget,
                    corners: match.statistics?.corners,
                    fouls: match.statistics?.fouls,
                    yellowCards: match.statistics?.yellowCards,
                    redCards: match.statistics?.redCards,
                    offsides: match.statistics?.offsides,
                    saves: match.statistics?.saves,
                    freeKicks: match.statistics?.freeKicks,
                    goalKicks: match.statistics?.goalKicks,
                    throwIns: match.statistics?.throwIns
                },
                // イベント詳細
                events: match.events?.map(event => ({
                    id: event.id,
                    minute: event.minute,
                    type: event.type,
                    player: event.player?.name,
                    team: event.team?.name,
                    detail: event.detail,
                    position: event.position
                })) || [],
                // ラインアップ
                lineups: {
                    home: {
                        formation: match.homeTeam.formation,
                        starting: match.homeTeam.lineups?.starting || [],
                        substitutes: match.homeTeam.lineups?.substitutes || [],
                        coach: match.homeTeam.coach?.name
                    },
                    away: {
                        formation: match.awayTeam.formation,
                        starting: match.awayTeam.lineups?.starting || [],
                        substitutes: match.awayTeam.lineups?.substitutes || [],
                        coach: match.awayTeam.coach?.name
                    }
                }
            };

            this.cache.set(cacheKey, detailedStats, 300); // 5分キャッシュ
            return detailedStats;
        } catch (error) {
            console.error('Error fetching detailed match stats:', error);
            return this.getFallbackDetailedMatchStats(matchId);
        }
    }

    // 選手の詳細パフォーマンス統計（API-Football v3 Pro）
    async getDetailedPlayerStats(playerId, season, options = {}) {
        const cacheKey = `player_stats_${playerId}_${season}_${JSON.stringify(options)}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.apiFootballClient.get(`/players`, {
                params: {
                    id: playerId,
                    season: season,
                    ...options
                }
            });

            const player = response.data.response[0];
            const detailedStats = {
                id: player.player.id,
                name: player.player.name,
                age: player.player.age,
                nationality: player.player.nationality,
                height: player.player.height,
                weight: player.player.weight,
                photo: player.player.photo,
                team: {
                    id: player.statistics[0].team.id,
                    name: player.statistics[0].team.name,
                    logo: player.statistics[0].team.logo
                },
                league: {
                    id: player.statistics[0].league.id,
                    name: player.statistics[0].league.name,
                    country: player.statistics[0].league.country,
                    logo: player.statistics[0].league.logo
                },
                season: player.statistics[0].league.season,
                // 詳細統計
                statistics: {
                    games: player.statistics[0].games,
                    goals: player.statistics[0].goals,
                    assists: player.statistics[0].assists,
                    shots: player.statistics[0].shots,
                    shotsOnTarget: player.statistics[0].shots.on,
                    passes: player.statistics[0].passes,
                    keyPasses: player.statistics[0].passes.key,
                    accuracy: player.statistics[0].passes.accuracy,
                    tackles: player.statistics[0].tackles,
                    blocks: player.statistics[0].tackles.blocks,
                    interceptions: player.statistics[0].tackles.interceptions,
                    duels: player.statistics[0].duels,
                    duelsWon: player.statistics[0].duels.won,
                    dribbles: player.statistics[0].dribbles,
                    dribblesWon: player.statistics[0].dribbles.success,
                    fouls: player.statistics[0].fouls,
                    cards: {
                        yellow: player.statistics[0].cards.yellow,
                        red: player.statistics[0].cards.red
                    },
                    rating: player.statistics[0].games.rating,
                    minutes: player.statistics[0].games.minutes,
                    position: player.statistics[0].games.position
                }
            };

            this.cache.set(cacheKey, detailedStats, 3600); // 1時間キャッシュ
            return detailedStats;
        } catch (error) {
            console.error('Error fetching detailed player stats:', error);
            return this.getFallbackDetailedPlayerStats(playerId, season);
        }
    }

    // チームの詳細統計（football-data.org Deep Data）
    async getDetailedTeamStats(teamId, leagueId, season, options = {}) {
        const cacheKey = `team_stats_${teamId}_${leagueId}_${season}_${JSON.stringify(options)}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.footballDataClient.get(`/teams/${teamId}`, {
                params: {
                    ...options
                }
            });

            const team = response.data;
            const detailedStats = {
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
                // リーグ別統計
                leagueStats: team.runningCompetitions?.map(comp => ({
                    id: comp.id,
                    name: comp.name,
                    type: comp.type,
                    emblem: comp.emblem,
                    currentSeason: comp.currentSeason
                })) || [],
                // 選手一覧
                players: team.squad?.map(player => ({
                    id: player.id,
                    name: player.name,
                    firstName: player.firstName,
                    lastName: player.lastName,
                    dateOfBirth: player.dateOfBirth,
                    nationality: player.nationality,
                    position: player.position,
                    shirtNumber: player.shirtNumber,
                    lastUpdated: player.lastUpdated
                })) || [],
                // 試合結果
                matches: team.matches || []
            };

            this.cache.set(cacheKey, detailedStats, 3600); // 1時間キャッシュ
            return detailedStats;
        } catch (error) {
            console.error('Error fetching detailed team stats:', error);
            return this.getFallbackDetailedTeamStats(teamId, leagueId, season);
        }
    }

    // 予測データ取得（API-Football v3 Pro）
    async getMatchPredictions(matchId, options = {}) {
        const cacheKey = `predictions_${matchId}_${JSON.stringify(options)}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.apiFootballClient.get(`/predictions`, {
                params: {
                    fixture: matchId,
                    ...options
                }
            });

            const predictions = response.data.response[0];
            const predictionData = {
                matchId: matchId,
                homeTeam: predictions.teams.home.name,
                awayTeam: predictions.teams.away.name,
                // 予測結果
                predictions: {
                    winner: predictions.predictions.winner,
                    winOrDraw: predictions.predictions.win_or_draw,
                    underOver: predictions.predictions.under_over,
                    goals: predictions.predictions.goals,
                    advice: predictions.predictions.advice,
                    percent: predictions.predictions.percent
                },
                // 比較統計
                comparison: {
                    form: predictions.comparison.form,
                    att: predictions.comparison.att,
                    def: predictions.comparison.def,
                    poissonDistribution: predictions.comparison.poisson_distribution,
                    h2h: predictions.comparison.h2h,
                    goals: predictions.comparison.goals,
                    total: predictions.comparison.total
                },
                // 詳細分析
                analysis: {
                    home: predictions.analysis.home,
                    away: predictions.analysis.away
                }
            };

            this.cache.set(cacheKey, predictionData, 1800); // 30分キャッシュ
            return predictionData;
        } catch (error) {
            console.error('Error fetching match predictions:', error);
            return this.getFallbackMatchPredictions(matchId);
        }
    }

    // オッズ情報取得（API-Football v3 Pro）
    async getMatchOdds(matchId, options = {}) {
        const cacheKey = `odds_${matchId}_${JSON.stringify(options)}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.apiFootballClient.get(`/odds`, {
                params: {
                    fixture: matchId,
                    ...options
                }
            });

            const odds = response.data.response[0];
            const oddsData = {
                matchId: matchId,
                homeTeam: odds.teams.home.name,
                awayTeam: odds.teams.away.name,
                league: odds.league.name,
                season: odds.league.season,
                date: odds.fixture.date,
                // ブックメーカー別オッズ
                bookmakers: odds.bookmakers?.map(bookmaker => ({
                    id: bookmaker.id,
                    name: bookmaker.name,
                    bets: bookmaker.bets?.map(bet => ({
                        id: bet.id,
                        name: bet.name,
                        values: bet.values?.map(value => ({
                            value: value.value,
                            odd: value.odd
                        })) || []
                    })) || []
                })) || []
            };

            this.cache.set(cacheKey, oddsData, 1800); // 30分キャッシュ
            return oddsData;
        } catch (error) {
            console.error('Error fetching match odds:', error);
            return this.getFallbackMatchOdds(matchId);
        }
    }

    // フォールバックデータ
    getFallbackLiveMatches() {
        return [
            {
                id: 1,
                homeTeam: '日本代表',
                awayTeam: 'ブラジル代表',
                homeScore: 2,
                awayScore: 1,
                status: '2H',
                elapsed: 75,
                venue: '国立競技場',
                league: '国際親善試合',
                country: '日本',
                events: [],
                lineups: {},
                statistics: {},
                odds: {}
            }
        ];
    }

    getFallbackDetailedMatchStats(matchId) {
        return {
            id: matchId,
            homeTeam: '日本代表',
            awayTeam: 'ブラジル代表',
            score: { fullTime: { home: 2, away: 1 } },
            status: 'FINISHED',
            date: new Date().toISOString(),
            competition: '国際親善試合',
            statistics: {
                possession: { home: 55, away: 45 },
                shots: { home: 12, away: 8 },
                shotsOnTarget: { home: 6, away: 4 },
                corners: { home: 7, away: 5 },
                fouls: { home: 8, away: 12 },
                yellowCards: { home: 2, away: 3 },
                redCards: { home: 0, away: 0 },
                offsides: { home: 3, away: 2 },
                saves: { home: 3, away: 5 },
                freeKicks: { home: 15, away: 18 },
                goalKicks: { home: 4, away: 6 },
                throwIns: { home: 22, away: 19 }
            },
            events: [],
            lineups: {}
        };
    }

    getFallbackDetailedPlayerStats(playerId, season) {
        return {
            id: playerId,
            name: 'サンプル選手',
            age: 25,
            nationality: '日本',
            height: 175,
            weight: 70,
            team: { id: 1, name: 'サンプルチーム' },
            statistics: {
                games: { appearences: 30, lineups: 25, minutes: 2250 },
                goals: { total: 15, conceded: 0, assists: 8, saves: null },
                shots: { total: 45, on: 25 },
                passes: { total: 1200, key: 45, accuracy: 85 },
                tackles: { total: 25, blocks: 8, interceptions: 15 },
                duels: { total: 180, won: 120 },
                dribbles: { attempts: 60, success: 35, past: null },
                fouls: { drawn: 25, committed: 15 },
                cards: { yellow: 3, red: 0 },
                rating: 7.5,
                minutes: 2250,
                position: 'FW'
            }
        };
    }

    getFallbackDetailedTeamStats(teamId, leagueId, season) {
        return {
            id: teamId,
            name: 'サンプルチーム',
            shortName: 'SAMPLE',
            founded: 1990,
            clubColors: 'Blue / White',
            venue: 'サンプルスタジアム',
            leagueStats: [],
            players: [],
            matches: []
        };
    }

    getFallbackMatchPredictions(matchId) {
        return {
            matchId: matchId,
            homeTeam: 'サンプルホーム',
            awayTeam: 'サンプルアウェイ',
            predictions: {
                winner: 'home',
                winOrDraw: 'home',
                underOver: 'over',
                goals: '2-3',
                advice: 'ホームチームの勝利を予想',
                percent: 65
            },
            comparison: {},
            analysis: {}
        };
    }

    getFallbackMatchOdds(matchId) {
        return {
            matchId: matchId,
            homeTeam: 'サンプルホーム',
            awayTeam: 'サンプルアウェイ',
            league: 'サンプルリーグ',
            season: 2024,
            date: new Date().toISOString(),
            bookmakers: []
        };
    }
}

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

// Create and export the service instance
const fotMobDataService = new FotMobDataService();
const advancedDataService = new AdvancedDataService();

module.exports = {
    fotMobDataService,
    advancedDataService,
    FootballDataService,
    FotMobDataService,
    AdvancedDataService
}; 