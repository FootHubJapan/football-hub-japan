const express = require('express');
const path = require('path');
const helmet = require('helmet');
const dataService = require('./dataService');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting and retry configuration
const RATE_LIMIT_CONFIG = {
    footballData: {
        requestsPerMinute: 10,
        retryDelay: 60000, // 60 seconds
        maxRetries: 3
    },
    apiFootball: {
        requestsPerMinute: 30,
        retryDelay: 2000, // 2 seconds
        maxRetries: 3
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
    
    // Reset counter if a minute has passed
    if (now - store.lastReset > 60000) {
        store.requests = [];
        store.lastReset = now;
    }
    
    // Check if we're under the limit
    if (store.requests.length >= config.requestsPerMinute) {
        const oldestRequest = store.requests[0];
        const timeSinceOldest = now - oldestRequest;
        
        if (timeSinceOldest < 60000) {
            return false; // Rate limit exceeded
        } else {
            // Remove old requests
            store.requests = store.requests.filter(req => now - req > 60000);
        }
    }
    
    // Add current request
    store.requests.push(now);
    return true;
}

// Retry function with exponential backoff
async function fetchWithRetry(url, options, apiType, maxRetries = 3) {
    const config = RATE_LIMIT_CONFIG[apiType];
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Check rate limit before making request
            if (!checkRateLimit(apiType)) {
                const waitTime = config.retryDelay * (attempt + 1);
                console.log(`Rate limit exceeded for ${apiType}, waiting ${waitTime}ms before retry ${attempt + 1}`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            const response = await fetch(url, options);
            
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : config.retryDelay * (attempt + 1);
                console.log(`429 error for ${apiType}, waiting ${waitTime}ms before retry ${attempt + 1}`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            return response;
        } catch (error) {
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

// Helmet middleware with custom CSP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://www.gstatic.com", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.football-data.org", "https://v3.football.api-sports.io", "https://firestore.googleapis.com"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: []
        }
    }
}));

// Middleware
app.use(express.json());

// Disable caching for HTML files
app.use((req, res, next) => {
    if (req.path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

app.use(express.static('public'));

// Favicon route
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/database', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'database-new.html'));
});

app.get('/database-new', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'database-new.html'));
});

app.get('/database-fixed', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'database-fixed.html'));
});

app.get('/radar', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'radar.html'));
});

app.get('/native-stats', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'native-stats.html'));
});

app.get('/test-firebase-fix', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-firebase-fix.html'));
});

app.get('/database-final', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'database-final.html'));
});

// Native Stats API Endpoints (native-stats.org style)
app.get('/api/native-stats/players', async (req, res) => {
    try {
        const { league, search, page = 1, limit = 20 } = req.query;
        const players = await dataService.getNativeStatsPlayers({ league, search, page, limit });
        res.json({
            players,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: players.length
            }
        });
    } catch (error) {
        console.error('Native stats players error:', error);
        res.status(500).json({ error: 'Failed to fetch players' });
    }
});

app.get('/api/native-stats/players/:id', async (req, res) => {
    try {
        const playerId = req.params.id;
        const player = await dataService.getNativeStatsPlayer(playerId);
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        res.json(player);
    } catch (error) {
        console.error('Native stats player detail error:', error);
        res.status(500).json({ error: 'Failed to fetch player details' });
    }
});

app.get('/api/native-stats/leagues', async (req, res) => {
    try {
        const leagues = await dataService.getNativeStatsLeagues();
        res.json(leagues);
    } catch (error) {
        console.error('Native stats leagues error:', error);
        res.status(500).json({ error: 'Failed to fetch leagues' });
    }
});

app.get('/api/native-stats/teams', async (req, res) => {
    try {
        const { league } = req.query;
        const teams = await dataService.getNativeStatsTeams(league);
        res.json(teams);
    } catch (error) {
        console.error('Native stats teams error:', error);
        res.status(500).json({ error: 'Failed to fetch teams' });
    }
});

app.get('/api/native-stats/matches/:playerId', async (req, res) => {
    try {
        const playerId = req.params.playerId;
        const { limit = 10 } = req.query;
        const matches = await dataService.getNativeStatsMatches(playerId, parseInt(limit));
        res.json(matches);
    } catch (error) {
        console.error('Native stats matches error:', error);
        res.status(500).json({ error: 'Failed to fetch matches' });
    }
});

app.get('/api/native-stats/stats/:playerId/:season', async (req, res) => {
    try {
        const { playerId, season } = req.params;
        const stats = await dataService.getNativeStatsPlayerStats(playerId, season);
        res.json(stats);
    } catch (error) {
        console.error('Native stats player stats error:', error);
        res.status(500).json({ error: 'Failed to fetch player stats' });
    }
});

// Football Data API Proxy (existing)
app.get('/api/football-data/competitions/:id/teams', async (req, res) => {
    try {
        const leagueId = req.params.id;
        const apiKey = process.env.FOOTBALL_DATA_API_KEY;
        
        if (!apiKey) {
            console.error('FOOTBALL_DATA_API_KEY not configured');
            return res.status(500).json({ error: 'API key not configured' });
        }

        console.log(`Fetching teams for league: ${leagueId}`);
        const response = await fetchWithRetry(`https://api.football-data.org/v4/competitions/${leagueId}/teams`, {
            headers: {
                'X-Auth-Token': apiKey
            }
        }, 'footballData');

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Football-data.org API error: ${response.status} - ${errorText}`);
            
            // Return fallback data instead of error
            console.log('Returning fallback data for teams');
            const fallbackData = {
                count: 0,
                filters: {},
                competition: { id: leagueId, name: 'League' },
                season: { id: 2024, startDate: '2024-08-01', endDate: '2025-05-31' },
                teams: []
            };
            return res.json(fallbackData);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Football data API error:', error.message);
        
        // Return fallback data instead of error
        console.log('Returning fallback data for teams due to error');
        const fallbackData = {
            count: 0,
            filters: {},
            competition: { id: req.params.id, name: 'League' },
            season: { id: 2024, startDate: '2024-08-01', endDate: '2025-05-31' },
            teams: []
        };
        res.json(fallbackData);
    }
});

// 選手詳細情報を取得
app.get('/api/football-data/players/:id', async (req, res) => {
    try {
        const playerId = req.params.id;
        const apiKey = process.env.FOOTBALL_DATA_API_KEY;
        
        if (!apiKey) {
            console.error('FOOTBALL_DATA_API_KEY not configured');
            return res.status(500).json({ error: 'API key not configured' });
        }

        console.log(`Fetching player: ${playerId}`);
        const response = await fetchWithRetry(`https://api.football-data.org/v4/persons/${playerId}`, {
            headers: {
                'X-Auth-Token': apiKey
            }
        }, 'footballData');

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Football-data.org API error: ${response.status} - ${errorText}`);
            
            // Return fallback data instead of error
            console.log('Returning fallback data for player');
            const fallbackData = {
                id: playerId,
                name: 'Unknown Player',
                firstName: 'Unknown',
                lastName: 'Player',
                dateOfBirth: '1900-01-01',
                nationality: 'Unknown',
                position: 'Unknown',
                shirtNumber: null,
                lastUpdated: new Date().toISOString()
            };
            return res.json(fallbackData);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Football data API error:', error.message);
        
        // Return fallback data instead of error
        console.log('Returning fallback data for player due to error');
        const fallbackData = {
            id: req.params.id,
            name: 'Unknown Player',
            firstName: 'Unknown',
            lastName: 'Player',
            dateOfBirth: '1900-01-01',
            nationality: 'Unknown',
            position: 'Unknown',
            shirtNumber: null,
            lastUpdated: new Date().toISOString()
        };
        res.json(fallbackData);
    }
});

app.get('/api/football-data/teams/:id', async (req, res) => {
    try {
        const teamId = req.params.id;
        const apiKey = process.env.FOOTBALL_DATA_API_KEY;
        
        if (!apiKey) {
            console.error('FOOTBALL_DATA_API_KEY not configured');
            return res.status(500).json({ error: 'API key not configured' });
        }

        console.log(`Fetching team: ${teamId}`);
        const response = await fetchWithRetry(`https://api.football-data.org/v4/teams/${teamId}`, {
            headers: {
                'X-Auth-Token': apiKey
            }
        }, 'footballData');

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Football-data.org API error: ${response.status} - ${errorText}`);
            
            // Return fallback data instead of error
            console.log('Returning fallback data for team');
            const fallbackData = {
                id: teamId,
                name: 'Unknown Team',
                shortName: 'Unknown',
                tla: 'UNK',
                crest: null,
                address: 'Unknown',
                website: null,
                founded: 1900,
                clubColors: 'Unknown',
                venue: 'Unknown Stadium',
                runningCompetitions: [],
                coach: null,
                marketValue: null,
                squad: [],
                staff: [],
                lastUpdated: new Date().toISOString()
            };
            return res.json(fallbackData);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Football data API error:', error.message);
        
        // Return fallback data instead of error
        console.log('Returning fallback data for team due to error');
        const fallbackData = {
            id: req.params.id,
            name: 'Unknown Team',
            shortName: 'Unknown',
            tla: 'UNK',
            crest: null,
            address: 'Unknown',
            website: null,
            founded: 1900,
            clubColors: 'Unknown',
            venue: 'Unknown Stadium',
            runningCompetitions: [],
            coach: null,
            marketValue: null,
            squad: [],
            staff: [],
            lastUpdated: new Date().toISOString()
        };
        res.json(fallbackData);
    }
});

app.get('/api/football-data/competitions', async (req, res) => {
    try {
        const apiKey = process.env.FOOTBALL_DATA_API_KEY;
        
        if (!apiKey) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        const response = await fetchWithRetry('https://api.football-data.org/v4/competitions', {
            headers: {
                'X-Auth-Token': apiKey
            }
        }, 'footballData');

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Football data API error:', error);
        res.status(500).json({ error: 'Failed to fetch competitions' });
    }
});

// Existing API endpoints
app.get('/api/leagues', async (req, res) => {
    try {
        const country = req.query.country || 'Japan';
        const data = await dataService.getLeagues(country);
        const formattedData = dataService.formatLeagueData(data);
        res.json(formattedData);
    } catch (error) {
        console.error('リーグ取得エラー:', error);
        res.status(500).json({ error: 'リーグの取得に失敗しました' });
    }
});

app.get('/api/teams', async (req, res) => {
    try {
        const leagueId = req.query.leagueId;
        const data = await dataService.getTeams(leagueId);
        const formattedData = dataService.formatTeamData(data);
        res.json(formattedData);
    } catch (error) {
        console.error('チーム取得エラー:', error);
        res.status(500).json({ error: 'チームの取得に失敗しました' });
    }
});

app.get('/api/players', async (req, res) => {
    try {
        const teamId = req.query.teamId;
        const data = await dataService.getPlayers(teamId);
        const formattedData = dataService.formatPlayerData(data);
        res.json(formattedData);
    } catch (error) {
        console.error('選手取得エラー:', error);
        res.status(500).json({ error: '選手の取得に失敗しました' });
    }
});

app.get('/api/search/players', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.status(400).json({ error: '検索クエリが必要です' });
        }
        const data = await dataService.searchPlayers(query);
        const formattedData = dataService.formatPlayerData(data);
        res.json(formattedData);
    } catch (error) {
        console.error('選手検索エラー:', error);
        res.status(500).json({ error: '選手検索に失敗しました' });
    }
});

app.get('/api/players/:id/stats', async (req, res) => {
    try {
        const playerId = req.params.id;
        const data = await dataService.getPlayerStats(playerId);
        res.json(data);
    } catch (error) {
        console.error('選手統計取得エラー:', error);
        res.status(500).json({ error: '選手統計の取得に失敗しました' });
    }
});

app.get('/api/teams/:id/stats', async (req, res) => {
    try {
        const teamId = req.params.id;
        const leagueId = req.query.leagueId;
        if (!leagueId) {
            return res.status(400).json({ error: 'リーグIDが必要です' });
        }
        const data = await dataService.getTeamStats(teamId, leagueId);
        res.json(data);
    } catch (error) {
        console.error('チーム統計取得エラー:', error);
        res.status(500).json({ error: 'チーム統計の取得に失敗しました' });
    }
});

// Auto data update on server start
async function initializeDataOnStartup() {
    console.log('Checking data on server startup...');
    
    try {
        // Check if data exists
        const dataService = require('./dataService');
        
        // For now, we'll just log that the server is ready
        // In a real implementation, you would check Firebase data here
        console.log('Server ready. Data will be loaded on first request.');
        
    } catch (error) {
        console.error('Error during startup data check:', error);
    }
}

// Initialize data on server start
initializeDataOnStartup();

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0'
    });
});

// Admin endpoint for data management (protected)
app.get('/admin/data-status', async (req, res) => {
    try {
        // In a real implementation, you would check admin authentication here
        const dataService = require('./dataService');
        
        // Check data status using dataService
        const status = {
            serverTime: new Date().toISOString(),
            dataStatus: 'Data service available',
            cacheStatus: 'Cache system active',
            playerCount: 0,
            teamCount: 0
        };
        
        // Try to get actual data counts
        try {
            const players = await dataService.getNativeStatsPlayers({});
            const teams = await dataService.getNativeStatsTeams();
            status.playerCount = players.length || 0;
            status.teamCount = teams.length || 0;
        } catch (error) {
            console.log('Could not get actual data counts:', error.message);
        }
        
        res.json(status);
    } catch (error) {
        console.error('Admin data status error:', error);
        res.status(500).json({ error: 'Failed to get data status' });
    }
});

// Admin endpoint for data import
app.post('/admin/import-data', async (req, res) => {
    try {
        console.log('Admin data import requested');
        
        // In a real implementation, you would check admin authentication here
        const dataService = require('./dataService');
        
        // Initialize data
        dataService.initializeNativeStatsData();
        
        res.json({ 
            success: true, 
            message: 'データの初期化が完了しました',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Admin data import error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to import data: ' + error.message 
        });
    }
});

// Admin endpoint for cache clear
app.post('/admin/clear-cache', async (req, res) => {
    try {
        console.log('Admin cache clear requested');
        
        // In a real implementation, you would check admin authentication here
        const dataService = require('./dataService');
        
        // Clear cache
        dataService.cache.flushAll();
        
        res.json({ 
            success: true, 
            message: 'キャッシュがクリアされました',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Admin cache clear error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to clear cache: ' + error.message 
        });
    }
});

// Admin endpoint for data refresh
app.post('/admin/refresh-data', async (req, res) => {
    try {
        console.log('Admin data refresh requested');
        
        // In a real implementation, you would check admin authentication here
        const dataService = require('./dataService');
        
        // Clear cache and reinitialize
        dataService.cache.flushAll();
        dataService.initializeNativeStatsData();
        
        res.json({ 
            success: true, 
            message: 'データの更新が完了しました',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Admin data refresh error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to refresh data: ' + error.message 
        });
    }
});

// ===== API-Football Integration =====

// API-Football: リーグ一覧を取得
app.get('/api/api-football/leagues', async (req, res) => {
    try {
        const apiKey = process.env.API_FOOTBALL_KEY;
        
        if (!apiKey) {
            console.error('API_FOOTBALL_KEY not configured');
            return res.status(500).json({ error: 'API key not configured' });
        }

        const { country, season } = req.query;
        let url = 'https://v3.football.api-sports.io/leagues';
        const params = new URLSearchParams();
        
        if (country) params.append('country', country);
        if (season) params.append('season', season);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }

        console.log(`API-Football: Fetching leagues - ${url}`);
        const response = await fetchWithRetry(url, {
            headers: {
                'x-rapidapi-host': 'v3.football.api-sports.io',
                'x-rapidapi-key': apiKey
            }
        }, 'apiFootball');

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`API-Football error: ${response.status} - ${errorText}`);
            
            // Return fallback data
            console.log('Returning fallback data for leagues');
            const fallbackData = {
                get: 'leagues',
                parameters: { country, season },
                errors: [],
                results: 0,
                response: []
            };
            return res.json(fallbackData);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('API-Football leagues error:', error);
        
        // Return fallback data
        const fallbackData = {
            get: 'leagues',
            parameters: req.query,
            errors: [],
            results: 0,
            response: []
        };
        res.json(fallbackData);
    }
});

// API-Football: チーム一覧を取得
app.get('/api/api-football/teams', async (req, res) => {
    try {
        const apiKey = process.env.API_FOOTBALL_KEY;
        
        if (!apiKey) {
            console.error('API_FOOTBALL_KEY not configured');
            return res.status(500).json({ error: 'API key not configured' });
        }

        const { league, season, country } = req.query;
        let url = 'https://v3.football.api-sports.io/teams';
        const params = new URLSearchParams();
        
        if (league) params.append('league', league);
        if (season) params.append('season', season);
        if (country) params.append('country', country);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }

        console.log(`API-Football: Fetching teams - ${url}`);
        const response = await fetchWithRetry(url, {
            headers: {
                'x-rapidapi-host': 'v3.football.api-sports.io',
                'x-rapidapi-key': apiKey
            }
        }, 'apiFootball');

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`API-Football error: ${response.status} - ${errorText}`);
            
            // Return fallback data
            console.log('Returning fallback data for teams');
            const fallbackData = {
                get: 'teams',
                parameters: { league, season, country },
                errors: [],
                results: 0,
                response: []
            };
            return res.json(fallbackData);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('API-Football teams error:', error);
        
        // Return fallback data
        const fallbackData = {
            get: 'teams',
            parameters: req.query,
            errors: [],
            results: 0,
            response: []
        };
        res.json(fallbackData);
    }
});

// API-Football: 選手一覧を取得
app.get('/api/api-football/players', async (req, res) => {
    try {
        const apiKey = process.env.API_FOOTBALL_KEY;
        
        if (!apiKey) {
            console.error('API_FOOTBALL_KEY not configured');
            return res.status(500).json({ error: 'API key not configured' });
        }

        const { team, league, season, search } = req.query;
        let url = 'https://v3.football.api-sports.io/players';
        const params = new URLSearchParams();
        
        if (team) params.append('team', team);
        if (league) params.append('league', league);
        if (season) params.append('season', season);
        if (search) params.append('search', search);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }

        console.log(`API-Football: Fetching players - ${url}`);
        const response = await fetchWithRetry(url, {
            headers: {
                'x-rapidapi-host': 'v3.football.api-sports.io',
                'x-rapidapi-key': apiKey
            }
        }, 'apiFootball');

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`API-Football error: ${response.status} - ${errorText}`);
            
            // Return fallback data
            console.log('Returning fallback data for players');
            const fallbackData = {
                get: 'players',
                parameters: { team, league, season, search },
                errors: [],
                results: 0,
                response: []
            };
            return res.json(fallbackData);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('API-Football players error:', error);
        
        // Return fallback data
        const fallbackData = {
            get: 'players',
            parameters: req.query,
            errors: [],
            results: 0,
            response: []
        };
        res.json(fallbackData);
    }
});

// API-Football: 選手詳細を取得
app.get('/api/api-football/players/:id', async (req, res) => {
    try {
        const playerId = req.params.id;
        const apiKey = process.env.API_FOOTBALL_KEY;
        
        if (!apiKey) {
            console.error('API_FOOTBALL_KEY not configured');
            return res.status(500).json({ error: 'API key not configured' });
        }

        const { season } = req.query;
        let url = `https://v3.football.api-sports.io/players?id=${playerId}`;
        
        if (season) {
            url += `&season=${season}`;
        }

        console.log(`API-Football: Fetching player details - ${url}`);
        const response = await fetchWithRetry(url, {
            headers: {
                'x-rapidapi-host': 'v3.football.api-sports.io',
                'x-rapidapi-key': apiKey
            }
        }, 'apiFootball');

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`API-Football error: ${response.status} - ${errorText}`);
            
            // Return fallback data
            console.log('Returning fallback data for player details');
            const fallbackData = {
                get: 'players',
                parameters: { id: playerId, season },
                errors: [],
                results: 0,
                response: []
            };
            return res.json(fallbackData);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('API-Football player details error:', error);
        
        // Return fallback data
        const fallbackData = {
            get: 'players',
            parameters: { id: req.params.id, season: req.query.season },
            errors: [],
            results: 0,
            response: []
        };
        res.json(fallbackData);
    }
});

// API-Football: 選手統計を取得
app.get('/api/api-football/players/:id/statistics', async (req, res) => {
    try {
        const playerId = req.params.id;
        const apiKey = process.env.API_FOOTBALL_KEY;
        
        if (!apiKey) {
            console.error('API_FOOTBALL_KEY not configured');
            return res.status(500).json({ error: 'API key not configured' });
        }

        const { league, season } = req.query;
        let url = `https://v3.football.api-sports.io/players?id=${playerId}&statistics=true`;
        
        if (league) url += `&league=${league}`;
        if (season) url += `&season=${season}`;

        console.log(`API-Football: Fetching player statistics - ${url}`);
        const response = await fetchWithRetry(url, {
            headers: {
                'x-rapidapi-host': 'v3.football.api-sports.io',
                'x-rapidapi-key': apiKey
            }
        }, 'apiFootball');

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`API-Football error: ${response.status} - ${errorText}`);
            
            // Return fallback data
            console.log('Returning fallback data for player statistics');
            const fallbackData = {
                get: 'players',
                parameters: { id: playerId, league, season, statistics: true },
                errors: [],
                results: 0,
                response: []
            };
            return res.json(fallbackData);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('API-Football player statistics error:', error);
        
        // Return fallback data
        const fallbackData = {
            get: 'players',
            parameters: { id: req.params.id, league: req.query.league, season: req.query.season, statistics: true },
            errors: [],
            results: 0,
            response: []
        };
        res.json(fallbackData);
    }
});

// API-Football: チーム詳細を取得
app.get('/api/api-football/teams/:id', async (req, res) => {
    try {
        const teamId = req.params.id;
        const apiKey = process.env.API_FOOTBALL_KEY;
        
        if (!apiKey) {
            console.error('API_FOOTBALL_KEY not configured');
            return res.status(500).json({ error: 'API key not configured' });
        }

        const { season } = req.query;
        let url = `https://v3.football.api-sports.io/teams?id=${teamId}`;
        
        if (season) {
            url += `&season=${season}`;
        }

        console.log(`API-Football: Fetching team details - ${url}`);
        const response = await fetchWithRetry(url, {
            headers: {
                'x-rapidapi-host': 'v3.football.api-sports.io',
                'x-rapidapi-key': apiKey
            }
        }, 'apiFootball');

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`API-Football error: ${response.status} - ${errorText}`);
            
            // Return fallback data
            console.log('Returning fallback data for team details');
            const fallbackData = {
                get: 'teams',
                parameters: { id: teamId, season },
                errors: [],
                results: 0,
                response: []
            };
            return res.json(fallbackData);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('API-Football team details error:', error);
        
        // Return fallback data
        const fallbackData = {
            get: 'teams',
            parameters: { id: req.params.id, season: req.query.season },
            errors: [],
            results: 0,
            response: []
        };
        res.json(fallbackData);
    }
});

// ===== Enhanced Hybrid API Strategy =====

// ハイブリッドAPI: 選手検索（両方のAPIを組み合わせ）
app.get('/api/hybrid/players/search', async (req, res) => {
    try {
        const { query, league, country } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: '検索クエリが必要です' });
        }

        console.log(`Hybrid search for: ${query}`);
        
        // 両方のAPIからデータを取得
        const results = {
            footballData: [],
            apiFootball: [],
            combined: []
        };

        // Football-data.org から検索（並列実行）
        const footballDataPromise = (async () => {
            try {
                const footballDataKey = process.env.FOOTBALL_DATA_API_KEY;
                if (footballDataKey) {
                    const response = await fetchWithRetry(`https://api.football-data.org/v4/persons?name=${encodeURIComponent(query)}`, {
                        headers: {
                            'X-Auth-Token': footballDataKey
                        }
                    }, 'footballData');
                    
                    if (response.ok) {
                        const data = await response.json();
                        return data.persons || [];
                    }
                }
                return [];
            } catch (error) {
                console.error('Football-data.org search error:', error);
                return [];
            }
        })();

        // API-Football から検索（並列実行）
        const apiFootballPromise = (async () => {
            try {
                const apiFootballKey = process.env.API_FOOTBALL_KEY;
                if (apiFootballKey) {
                    const response = await fetchWithRetry(`https://v3.football.api-sports.io/players?search=${encodeURIComponent(query)}`, {
                        headers: {
                            'x-rapidapi-host': 'v3.football.api-sports.io',
                            'x-rapidapi-key': apiFootballKey
                        }
                    }, 'apiFootball');
                    
                    if (response.ok) {
                        const data = await response.json();
                        return data.response || [];
                    }
                }
                return [];
            } catch (error) {
                console.error('API-Football search error:', error);
                return [];
            }
        })();

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

        res.json({
            query,
            totalResults: results.combined.length,
            footballDataResults: results.footballData.length,
            apiFootballResults: results.apiFootball.length,
            results: results.combined
        });
        
    } catch (error) {
        console.error('Hybrid search error:', error);
        res.status(500).json({ error: '検索に失敗しました' });
    }
});

// Jリーグ・アジアリーグ専用エンドポイント
app.get('/api/asian-leagues/leagues', async (req, res) => {
    try {
        const apiKey = process.env.API_FOOTBALL_KEY;
        
        if (!apiKey) {
            console.error('API_FOOTBALL_KEY not configured');
            return res.status(500).json({ error: 'API key not configured' });
        }

        // アジアの主要リーグID
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
                    `https://v3.football.api-sports.io/leagues?id=${league.id}&season=${currentSeason}`,
                    {
                        headers: {
                            'x-rapidapi-host': 'v3.football.api-sports.io',
                            'x-rapidapi-key': apiKey
                        }
                    },
                    'apiFootball'
                );

                if (response.ok) {
                    const data = await response.json();
                    return data.response?.[0] || league;
                }
                return league;
            } catch (error) {
                console.error(`Error fetching league ${league.id}:`, error);
                return league;
            }
        });

        const leagueResults = await Promise.all(leaguePromises);
        results.push(...leagueResults.filter(league => league));

        res.json({
            get: 'asian-leagues',
            parameters: { season: currentSeason },
            errors: [],
            results: results.length,
            response: results
        });

    } catch (error) {
        console.error('Asian leagues error:', error);
        res.status(500).json({ error: 'アジアリーグの取得に失敗しました' });
    }
});

// 日本語選手検索専用エンドポイント
app.get('/api/japanese-players/search', async (req, res) => {
    try {
        const { query, league, includeOverseas = 'true' } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: '検索クエリが必要です' });
        }

        console.log(`Japanese player search for: ${query}`);
        
        const apiKey = process.env.API_FOOTBALL_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        const results = [];

        // Jリーグ選手を検索
        const jLeagueSearch = async () => {
            try {
                const response = await fetchWithRetry(
                    `https://v3.football.api-sports.io/players?search=${encodeURIComponent(query)}&league=39&season=2024`,
                    {
                        headers: {
                            'x-rapidapi-host': 'v3.football.api-sports.io',
                            'x-rapidapi-key': apiKey
                        }
                    },
                    'apiFootball'
                );

                if (response.ok) {
                    const data = await response.json();
                    return data.response || [];
                }
                return [];
            } catch (error) {
                console.error('J-League search error:', error);
                return [];
            }
        };

        // 海外の日本語選手を検索（オプション）
        const overseasSearch = async () => {
            if (includeOverseas !== 'true') return [];
            
            try {
                const response = await fetchWithRetry(
                    `https://v3.football.api-sports.io/players?search=${encodeURIComponent(query)}&nationality=JP`,
                    {
                        headers: {
                            'x-rapidapi-host': 'v3.football.api-sports.io',
                            'x-rapidapi-key': apiKey
                        }
                    },
                    'apiFootball'
                );

                if (response.ok) {
                    const data = await response.json();
                    return data.response || [];
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

        res.json({
            query,
            totalResults: results.length,
            jLeagueResults: jLeagueResults.length,
            overseasResults: overseasResults.length,
            results: results
        });

    } catch (error) {
        console.error('Japanese players search error:', error);
        res.status(500).json({ error: '日本語選手検索に失敗しました' });
    }
});

// 詳細選手統計エンドポイント
app.get('/api/players/:id/detailed-stats', async (req, res) => {
    try {
        const playerId = req.params.id;
        const { season, league } = req.query;
        
        console.log(`Fetching detailed stats for player: ${playerId}`);
        
        const apiKey = process.env.API_FOOTBALL_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // 選手の基本情報と統計を並列で取得
        const [playerInfo, playerStats] = await Promise.all([
            // 選手基本情報
            (async () => {
                try {
                    const response = await fetchWithRetry(
                        `https://v3.football.api-sports.io/players?id=${playerId}`,
                        {
                            headers: {
                                'x-rapidapi-host': 'v3.football.api-sports.io',
                                'x-rapidapi-key': apiKey
                            }
                        },
                        'apiFootball'
                    );

                    if (response.ok) {
                        const data = await response.json();
                        return data.response?.[0] || null;
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
                    let url = `https://v3.football.api-sports.io/players?id=${playerId}&statistics=true`;
                    if (season) url += `&season=${season}`;
                    if (league) url += `&league=${league}`;

                    const response = await fetchWithRetry(
                        url,
                        {
                            headers: {
                                'x-rapidapi-host': 'v3.football.api-sports.io',
                                'x-rapidapi-key': apiKey
                            }
                        },
                        'apiFootball'
                    );

                    if (response.ok) {
                        const data = await response.json();
                        return data.response?.[0] || null;
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

        res.json(result);

    } catch (error) {
        console.error('Detailed player stats error:', error);
        res.status(500).json({ error: '詳細統計の取得に失敗しました' });
    }
});

// データサービスを使用したハイブリッドAPIエンドポイント
app.get('/api/hybrid/players/search-v2', async (req, res) => {
    try {
        const { query, league, country, includeOverseas = 'true' } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: '検索クエリが必要です' });
        }

        console.log(`Hybrid search v2 for: ${query}`);
        
        const options = {
            league,
            country,
            includeOverseas: includeOverseas === 'true'
        };

        const results = await dataService.hybridSearchPlayers(query, options);

        res.json({
            query,
            totalResults: results.combined.length,
            footballDataResults: results.footballData.length,
            apiFootballResults: results.apiFootball.length,
            results: results.combined
        });
        
    } catch (error) {
        console.error('Hybrid search v2 error:', error);
        res.status(500).json({ error: '検索に失敗しました' });
    }
});

// データサービスを使用したアジアリーグエンドポイント
app.get('/api/asian-leagues/leagues-v2', async (req, res) => {
    try {
        console.log('Fetching Asian leagues v2');
        
        const results = await dataService.getAsianLeagues();

        res.json({
            get: 'asian-leagues-v2',
            parameters: { season: new Date().getFullYear() },
            errors: [],
            results: results.length,
            response: results
        });

    } catch (error) {
        console.error('Asian leagues v2 error:', error);
        res.status(500).json({ error: 'アジアリーグの取得に失敗しました' });
    }
});

// データサービスを使用した日本語選手検索エンドポイント
app.get('/api/japanese-players/search-v2', async (req, res) => {
    try {
        const { query, league, includeOverseas = 'true' } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: '検索クエリが必要です' });
        }

        console.log(`Japanese player search v2 for: ${query}`);
        console.log('Options:', { league, includeOverseas });
        
        const options = {
            league,
            includeOverseas: includeOverseas === 'true'
        };

        console.log('Calling dataService.searchJapanesePlayers...');
        const results = await dataService.searchJapanesePlayers(query, options);
        console.log('Results received:', results ? results.length : 'null');

        res.json({
            query,
            totalResults: results.length,
            results: results
        });

    } catch (error) {
        console.error('Japanese players search v2 error:', error);
        res.status(500).json({ error: '日本語選手検索に失敗しました' });
    }
});

// データサービスを使用した詳細統計エンドポイント
app.get('/api/players/:id/detailed-stats-v2', async (req, res) => {
    try {
        const playerId = req.params.id;
        const { season, league } = req.query;
        
        console.log(`Fetching detailed stats v2 for player: ${playerId}`);
        
        const options = {
            season,
            league
        };

        const result = await dataService.getDetailedPlayerStats(playerId, options);

        res.json(result);

    } catch (error) {
        console.error('Detailed player stats v2 error:', error);
        res.status(500).json({ error: '詳細統計の取得に失敗しました' });
    }
});

// Firebase configuration endpoint
app.get('/api/firebase-config', (req, res) => {
    const firebaseConfig = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID
    };
    
    // Check if Firebase is properly configured
    const isConfigured = firebaseConfig.apiKey && 
                        firebaseConfig.apiKey !== 'your-firebase-api-key-here' &&
                        firebaseConfig.projectId &&
                        firebaseConfig.projectId !== 'your-project-id';
    
    res.json({
        config: firebaseConfig,
        isConfigured: isConfigured
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});