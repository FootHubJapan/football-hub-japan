const express = require('express');
const path = require('path');
const helmet = require('helmet');

// エラーハンドリング付きでデータサービスをインポート
let dataService;
let aiService;
let fotMobDataService;

try {
    console.log('Loading dataService...');
    dataService = require('./dataService');
    console.log('dataService loaded successfully');
} catch (error) {
    console.error('Error loading dataService:', error);
    dataService = null;
}

try {
    console.log('Loading aiService...');
    aiService = require('./ai-service');
    console.log('aiService loaded successfully');
} catch (error) {
    console.error('Error loading aiService:', error);
    aiService = null;
}

try {
    console.log('Loading fotMobDataService...');
    const dataServiceModule = require('./dataService');
    fotMobDataService = dataServiceModule.fotMobDataService;
    console.log('fotMobDataService loaded successfully');
} catch (error) {
    console.error('Error loading fotMobDataService:', error);
    fotMobDataService = null;
}

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

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

// AIウィジェットファイルを提供
app.get('/ai-widget.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ai-widget.js'));
});

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
    // 強化されたデータベースページを直接提供
    res.sendFile(path.join(__dirname, 'public', 'database-new.html'));
});

app.get('/database-new', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'database-new.html'));
});

app.get('/database-fixed', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'database-fixed.html'));
});

app.get('/radar', (req, res) => {
    // 強化されたレーダーチャートページを直接提供
    res.sendFile(path.join(__dirname, 'public', 'radar.html'));
});

// AIエージェントページ
app.get('/ai-agent', (req, res) => {
    // 強化されたAIエージェントページを直接提供
    res.sendFile(path.join(__dirname, 'public', 'ai-agent.html'));
});

// 強化AIエージェントページ
app.get('/ai-agent-enhanced', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ai-agent-enhanced.html'));
});

// 強化データベースページ
app.get('/database-enhanced', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'database-enhanced.html'));
});

// 試合スケジュールページ
app.get('/schedule', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'schedule.html'));
});

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// 強化レーダーチャートページ
app.get('/radar-enhanced', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'radar-enhanced.html'));
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

app.get('/player-detail', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player-detail.html'));
});

// Firebase configuration endpoint
app.get('/api/firebase-config', (req, res) => {
    // Check if Firebase is configured in environment variables
    const firebaseConfig = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID
    };

    const isConfigured = firebaseConfig.apiKey && 
                        firebaseConfig.apiKey !== "AIzaSyBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" &&
                        firebaseConfig.projectId &&
                        firebaseConfig.projectId !== "football-hub-japan";

    res.json({
        isConfigured: isConfigured,
        config: isConfigured ? firebaseConfig : null
    });
});

// API設定状況確認エンドポイント
app.get('/api/config/status', (req, res) => {
    const config = {
        apiFootball: {
            configured: !!(process.env.API_FOOTBALL_KEY && process.env.API_FOOTBALL_KEY !== 'your-api-football-key-here'),
            keyLength: process.env.API_FOOTBALL_KEY ? process.env.API_FOOTBALL_KEY.length : 0
        },
        footballData: {
            configured: !!((process.env.FOOTBALL_DATA_API_KEY && process.env.FOOTBALL_DATA_API_KEY !== 'your-football-data-api-key-here') || 
                          (process.env.FOOTBALL_DATA_KEY && process.env.FOOTBALL_DATA_KEY !== 'your-football-data-api-key-here')),
            keyLength: (process.env.FOOTBALL_DATA_API_KEY || process.env.FOOTBALL_DATA_KEY) ? 
                      (process.env.FOOTBALL_DATA_API_KEY || process.env.FOOTBALL_DATA_KEY).length : 0
        },
        environment: process.env.NODE_ENV || 'development'
    };
    
    res.json(config);
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

// 統合選手検索API
app.get('/api/search/players', async (req, res) => {
    try {
        const { query, limit = 10 } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: '検索クエリが必要です' });
        }
        
        const cacheKey = `search_${query}_${limit}`;
        
        // キャッシュから取得を試行
        const cachedResult = getFromCache(cacheKey, 'players');
        if (cachedResult) {
            return res.json(cachedResult);
        }

        console.log(`Searching for players: ${query}`);
        
        const results = [];
        const seenPlayers = new Set();

        // API-Footballから検索
        try {
            const apiFootballKey = process.env.API_FOOTBALL_KEY;
            if (apiFootballKey && apiFootballKey !== 'your-api-football-key-here') {
                // 日本語名を英語名に変換
                const playerMappings = {
                    '久保建英': 'Takefusa Kubo',
                    '三笘薫': 'Kaoru Mitoma',
                    '堂安律': 'Ritsu Doan',
                    '田中碧': 'Ao Tanaka',
                    '伊藤洋輝': 'Hiroki Ito',
                    '遠藤航': 'Wataru Endo',
                    '南野拓実': 'Takumi Minamino',
                    '浅野拓磨': 'Takuma Asano',
                    '上田綺世': 'Ayase Ueda',
                    '前田大然': 'Daizen Maeda',
                    'ハーランド': 'Erling Haaland',
                    'メッシ': 'Lionel Messi',
                    'ロナウド': 'Cristiano Ronaldo'
                };

                // 検索クエリを決定（日本語名の場合は英語名に変換）
                const searchQuery = playerMappings[query] || query;
                
                // API-Footballの検索（複数シーズンから検索）
                const seasons = [2023, 2024, 2025];
                let foundPlayers = false;
                
                for (const season of seasons) {
                    if (results.length >= limit || foundPlayers) break;
                    
                    try {
                        const url = `https://v3.football.api-sports.io/players?search=${encodeURIComponent(searchQuery)}&season=${season}`;
                        console.log(`API-Football: Searching players for season ${season} - ${url}`);
                
        const response = await fetchWithRetry(url, {
            headers: {
                                'x-apisports-key': apiFootballKey
            }
        }, 'apiFootball');

                if (response.ok) {
        const data = await response.json();
                            console.log(`API-Football response for season ${season}:`, data);
                    if (data.response && data.response.length > 0) {
                                foundPlayers = true;
                        data.response.forEach(player => {
                            const playerName = player.player?.name || 'Unknown Player';
                            const playerKey = playerName.toLowerCase();
                            
                            if (!seenPlayers.has(playerKey)) {
                                seenPlayers.add(playerKey);
                                results.push({
                                    id: player.player?.id || `api-football-${Date.now()}`,
                                    name: playerName,
                                    fullName: player.player?.name || playerName,
                                    currentTeam: player.statistics?.[0]?.team?.name || 'Unknown Team',
                                    position: player.statistics?.[0]?.games?.position || player.player?.position || 'Unknown',
                                    nationality: player.player?.nationality || 'Unknown',
                                    age: player.player?.age || 'N/A',
                                    height: player.player?.height || 'N/A',
                                    weight: player.player?.weight || 'N/A',
                                    source: 'api-football',
                                            season: season,
                                    stats: {
                                        goals: player.statistics?.[0]?.goals?.total || 0,
                                        assists: player.statistics?.[0]?.goals?.assists || 0,
                                        appearances: player.statistics?.[0]?.games?.appearences || 0,
                                        minutes: player.statistics?.[0]?.games?.minutes || 0,
                                        rating: player.statistics?.[0]?.games?.rating || 'N/A',
                                        yellowCards: player.statistics?.[0]?.cards?.yellow || 0,
                                        redCards: player.statistics?.[0]?.cards?.red || 0
                                    }
                                });
                            }
                        });
                            } else {
                                console.log(`API-Football: No players found for query "${searchQuery}" in season ${season}`);
                            }
                        } else {
                            console.log(`API-Football response not ok for season ${season}: ${response.status} ${response.statusText}`);
                            const errorText = await response.text();
                            console.log(`API-Football error response for season ${season}:`, errorText);
                        }
                    } catch (error) {
                        console.error(`API-Football search error for season ${season}:`, error);
                    }
                }
            } else {
                console.log('API-Football key not configured');
            }
    } catch (error) {
            console.error('API-Football search error:', error);
        }

        // Football-Data.orgから検索
        try {
            const footballDataKey = process.env.FOOTBALL_DATA_API_KEY || process.env.FOOTBALL_DATA_KEY;
            if (footballDataKey && footballDataKey !== 'your-football-data-api-key-here') {
                // レート制限を考慮して、より効率的な検索を実装
                const leagues = ['PL', 'PD', 'SA', 'BL1', 'FL1'];
                const seasons = [2023, 2024, 2025];
                let searchCompleted = false;
                
                for (const league of leagues) {
                    if (results.length >= limit || searchCompleted) break;
                    
                    for (const season of seasons) {
                        if (results.length >= limit || searchCompleted) break;
                        
                        try {
                            // レート制限をチェック
                            if (!checkRateLimit('footballData')) {
                                console.log('Rate limit reached for Football-Data.org, skipping remaining searches');
                                searchCompleted = true;
                                break;
                            }
                            
                            const url = `https://api.football-data.org/v4/competitions/${league}/teams?season=${season}`;
                            console.log(`Football-Data.org: Searching teams in ${league} for season ${season}`);
                        
        const response = await fetchWithRetry(url, {
            headers: {
                                'X-Auth-Token': footballDataKey
                            }
                        }, 'footballData');

                        if (response.ok) {
        const data = await response.json();
                                console.log(`Football-Data.org teams response for ${league} season ${season}:`, data);
                                
                                // チーム数が多すぎる場合は最初の数チームのみ処理
                                const teamsToProcess = data.teams ? data.teams.slice(0, 3) : [];
                                
                                for (const team of teamsToProcess) {
                                    if (results.length >= limit || searchCompleted) break;
                                    
                                    try {
                                        // レート制限を再チェック
                                        if (!checkRateLimit('footballData')) {
                                            console.log('Rate limit reached during team search, stopping');
                                            searchCompleted = true;
                                            break;
                                        }
                                        
                                        // 正しいエンドポイント: /teams/{id} (squadプロパティに選手情報が含まれる)
                                        const playersUrl = `https://api.football-data.org/v4/teams/${team.id}`;
                                    const playersResponse = await fetchWithRetry(playersUrl, {
            headers: {
                                            'X-Auth-Token': footballDataKey
                                        }
                                    }, 'footballData');

                                    if (playersResponse.ok) {
                                        const playersData = await playersResponse.json();
                                            console.log(`Football-Data.org players response for team ${team.id} season ${season}:`, playersData);
                                        
                                            if (playersData.squad && playersData.squad.length > 0) {
                                                playersData.squad.forEach(player => {
                                                    const playerName = player.name || 'Unknown Player';
                                            const playerKey = playerName.toLowerCase();
                                            
                                                    if (!seenPlayers.has(playerKey)) {
                                                seenPlayers.add(playerKey);
                                                results.push({
                                                    id: player.id || `football-data-${Date.now()}`,
                                                    name: playerName,
                                                            fullName: player.name || playerName,
                                                            currentTeam: team.name || 'Unknown Team',
                                                    position: player.position || 'Unknown',
                                                    nationality: player.nationality || 'Unknown',
                                                            age: player.age || 'N/A',
                                                            height: player.height || 'N/A',
                                                            weight: player.weight || 'N/A',
                                                    source: 'football-data',
                                                            season: season,
                                                    stats: {
                                                                goals: 0, // Football-Data.org APIでは統計データが別途必要
                                                        assists: 0,
                                                        appearances: 0,
                                                        minutes: 0,
                                                        rating: 'N/A',
                                                        yellowCards: 0,
                                                        redCards: 0
                                                    }
                                                });
                                            }
                                        });
                                            }
                                        } else {
                                            console.log(`Football-Data.org players response not ok for team ${team.id} season ${season}: ${playersResponse.status}`);
                                    }
    } catch (error) {
                                        console.error(`Error fetching players for team ${team.id} season ${season}:`, error);
                                }
                            }
                            } else {
                                console.log(`Football-Data.org teams response not ok for ${league} season ${season}: ${response.status}`);
                        }
            } catch (error) {
                            console.error(`Error fetching teams for league ${league} season ${season}:`, error);
                    }
                }
                }
            } else {
                console.log('Football-Data.org key not configured');
            }
            } catch (error) {
            console.error('Football-Data.org search error:', error);
        }

        // 結果をソート（名前の類似度で）
        results.sort((a, b) => {
            const aScore = calculateSimilarity(query.toLowerCase(), a.name.toLowerCase());
            const bScore = calculateSimilarity(query.toLowerCase(), b.name.toLowerCase());
            return bScore - aScore;
        });

        const finalResults = results.slice(0, limit);
        
        // キャッシュに保存
        setCache(cacheKey, finalResults, 'players');

        res.json({
            query: query,
            count: finalResults.length,
            results: finalResults
        });
        
    } catch (error) {
        console.error('Unified player search error:', error);
        res.status(500).json({ 
            error: 'Search failed', 
            message: error.message 
        });
    }
});

// 年齢計算関数
function calculateAge(dateOfBirth) {
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
}

// 文字列類似度計算関数
function calculateSimilarity(query, target) {
    if (target.includes(query)) return 100;
    if (query.includes(target)) return 80;
    
    // 簡単な類似度計算
    let score = 0;
    const queryWords = query.split(' ');
    const targetWords = target.split(' ');
    
    queryWords.forEach(qWord => {
        targetWords.forEach(tWord => {
            if (tWord.startsWith(qWord) || qWord.startsWith(tWord)) {
                score += 50;
            } else if (tWord.includes(qWord) || qWord.includes(tWord)) {
                score += 30;
            }
        });
    });
    
    return score;
}

// データキャッシュ
const dataCache = {
    players: new Map(),
    teams: new Map(),
    leagues: new Map(),
    lastUpdate: new Map(),
    cacheExpiry: 30 * 60 * 1000 // 30分
};

// キャッシュからデータを取得
function getFromCache(cacheKey, dataType) {
    const cache = dataCache[dataType];
    const lastUpdate = dataCache.lastUpdate.get(cacheKey);
    
    if (cache.has(cacheKey) && lastUpdate) {
        const now = Date.now();
        if (now - lastUpdate < dataCache.cacheExpiry) {
            console.log(`Cache hit for ${cacheKey} (${dataType})`);
            return cache.get(cacheKey);
        } else {
            console.log(`Cache expired for ${cacheKey} (${dataType})`);
            cache.delete(cacheKey);
            dataCache.lastUpdate.delete(cacheKey);
        }
    }
    
                    return null;
                }

// データをキャッシュに保存
function setCache(cacheKey, data, dataType) {
    const cache = dataCache[dataType];
    cache.set(cacheKey, data);
    dataCache.lastUpdate.set(cacheKey, Date.now());
    console.log(`Cached ${cacheKey} (${dataType})`);
}

// キャッシュをクリア
function clearCache(dataType = null) {
    if (dataType) {
        dataCache[dataType].clear();
        console.log(`Cleared ${dataType} cache`);
    } else {
        Object.keys(dataCache).forEach(key => {
            if (key !== 'lastUpdate') {
                dataCache[key].clear();
            }
        });
        dataCache.lastUpdate.clear();
        console.log('Cleared all caches');
    }
}

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

// 試合スケジュールAPI（API-Football統合版）
app.get('/api/fotmob/matches', async (req, res) => {
    try {
        const { league, timeRange = 'week' } = req.query;
        console.log('API called with:', { league, timeRange });
        
        let matches = [];

        // API-Footballから実際の試合データを取得
        try {
            matches = await getMatchesFromAPIFootball(league, timeRange);
            console.log('API-Football matches count:', matches.length);
        } catch (apiError) {
            console.error('API-Football error:', apiError);
            // API-Footballが失敗した場合はフォールバックデータを使用
            matches = generateFallbackMatches(league, timeRange);
            console.log('Using fallback matches:', matches.length);
        }

        // API-Footballからデータが取得できない場合は、Football-data.orgを試す
        if (matches.length === 0) {
            try {
                console.log('Trying Football-data.org as backup...');
                const footballDataMatches = await getMatchesFromFootballData(league, timeRange);
                if (footballDataMatches.length > 0) {
                    matches = footballDataMatches;
                    console.log('Football-data.org matches count:', matches.length);
                }
            } catch (footballDataError) {
                console.error('Football-data.org error:', footballDataError);
            }
        }

        // どちらのAPIからもデータが取得できない場合は、フォールバックデータを使用
        if (matches.length === 0) {
            console.log('No data from APIs, using fallback data');
            matches = generateFallbackMatches(league, timeRange);
            console.log('Fallback matches count:', matches.length);
        }

        console.log('Final matches count:', matches.length);
        console.log('First few matches:', matches.slice(0, 3));

        res.setHeader('Content-Type', 'application/json');
        res.json({ matches });
    } catch (error) {
        console.error('Error fetching matches:', error);
        // Return fallback matches if service fails
        const fallbackMatches = generateFallbackMatches(league, timeRange);
        console.log('Returning fallback matches:', fallbackMatches.length);
        res.setHeader('Content-Type', 'application/json');
        res.json({ matches: fallbackMatches });
    }
});

// API-Footballから試合データを取得
async function getMatchesFromAPIFootball(league, timeRange) {
    const matches = [];
    
    try {
        // リーグIDのマッピング
        const leagueMapping = {
            'PL': 39,    // Premier League
            'PD': 140,   // La Liga
            'SA': 135,   // Serie A
            'BL1': 78,   // Bundesliga
            'FL1': 61,   // Ligue 1
            'J1': 98     // J1 League (API-Football)
        };

        // 時間範囲の設定
        let fromDate, toDate;
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 0-indexed
        
        // シーズンの決定（8月以降は新しいシーズン）
        let season = currentMonth >= 8 ? currentYear : currentYear - 1;
        
        // J1リーグの場合は2024-25シーズンを使用
        if (league === 'J1') {
            season = 2024;
            console.log(`J1 League: Using season ${season}`);
            
            // J1リーグの場合は、より広い日付範囲で試合を取得
            if (timeRange === 'week') {
                const weekStart = new Date(today);
                weekStart.setDate(today.getDate() - 7); // 1週間前から
                fromDate = weekStart.toISOString().split('T')[0];
            } else if (timeRange === 'month') {
                const monthStart = new Date(today);
                monthStart.setMonth(today.getMonth() - 1); // 1ヶ月前から
                fromDate = monthStart.toISOString().split('T')[0];
            }
        }
        
        switch (timeRange) {
            case 'today':
                fromDate = toDate = today.toISOString().split('T')[0];
                break;
            case 'tomorrow':
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                fromDate = toDate = tomorrow.toISOString().split('T')[0];
                break;
            case 'week':
                fromDate = today.toISOString().split('T')[0];
                const weekLater = new Date(today);
                weekLater.setDate(today.getDate() + 7);
                toDate = weekLater.toISOString().split('T')[0];
                break;
            case 'lastweek':
                const lastWeekStart = new Date(today);
                lastWeekStart.setDate(today.getDate() - 7);
                fromDate = lastWeekStart.toISOString().split('T')[0];
                toDate = today.toISOString().split('T')[0];
                break;
            case 'month':
                fromDate = today.toISOString().split('T')[0];
                const monthLater = new Date(today);
                monthLater.setMonth(today.getMonth() + 1);
                toDate = monthLater.toISOString().split('T')[0];
                break;
            default:
                fromDate = today.toISOString().split('T')[0];
                const defaultLater = new Date(today);
                defaultLater.setDate(today.getDate() + 7);
                toDate = defaultLater.toISOString().split('T')[0];
        }

        console.log('Date range:', { fromDate, toDate, season });

        // 特定のリーグが指定されている場合
        if (league && leagueMapping[league]) {
            const leagueId = leagueMapping[league];
            console.log(`Fetching matches for league ${league} (ID: ${leagueId})`);
            
            // API-Footballからリーグ別の試合を取得
            const response = await fetch(`https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${season}&from=${fromDate}&to=${toDate}`, {
                headers: {
                    'x-rapidapi-host': 'v3.football.api-sports.io',
                    'x-rapidapi-key': process.env.API_FOOTBALL_KEY || '53cfd1d0'
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('API-Football response:', data);
                
                if (data.response && Array.isArray(data.response)) {
                    data.response.forEach(fixture => {
                        matches.push({
                            id: fixture.fixture.id,
                            league: league,
                            homeTeam: fixture.teams.home.name,
                            awayTeam: fixture.teams.away.name,
                            homeScore: fixture.goals.home,
                            awayScore: fixture.goals.away,
                            date: fixture.fixture.date,
                            venue: fixture.fixture.venue?.name || 'Unknown',
                            status: fixture.fixture.status.short,
                            statusLong: fixture.fixture.status.long
                        });
                    });
                }
            }
        } else {
            // リーグが指定されていない場合は、主要リーグから試合を取得
            console.log('No specific league, fetching from major leagues');
            
            for (const [leagueCode, leagueId] of Object.entries(leagueMapping)) {
                if (leagueCode !== 'J1') { // J1は別途処理
                    try {
                        const response = await fetch(`https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${season}&from=${fromDate}&to=${toDate}`, {
                            headers: {
                                'x-rapidapi-host': 'v3.football.api-sports.io',
                                'x-rapidapi-key': process.env.API_FOOTBALL_KEY || '53cfd1d0'
                            }
                        });

                        if (response.ok) {
                            const data = await response.json();
                            if (data.response && Array.isArray(data.response)) {
                                data.response.slice(0, 2).forEach(fixture => { // 各リーグから最大2試合
                                    matches.push({
                                        id: fixture.fixture.id,
                                        league: leagueCode,
                                        homeTeam: fixture.teams.home.name,
                                        awayTeam: fixture.teams.away.name,
                                        homeScore: fixture.goals.home,
                                        awayScore: fixture.goals.away,
                                        date: fixture.fixture.date,
                                        venue: fixture.fixture.venue?.name || 'Unknown',
                                        status: fixture.fixture.status.short,
                                        statusLong: fixture.fixture.status.long
                                    });
                                });
                            }
                        }
                    } catch (error) {
                        console.error(`Error fetching ${leagueCode}:`, error);
                    }
                }
            }
            
            // J1リーグの試合をフォールバックデータから追加
            if (!league || league === 'J1') {
                console.log('Adding J1 League matches from fallback data');
                const j1Matches = generateFallbackMatchesForDate(today, 'J1');
                matches.push(...j1Matches);
            }
        }

        console.log(`Total API-Football matches: ${matches.length}`);
        return matches;
        
    } catch (error) {
        console.error('Error in getMatchesFromAPIFootball:', error);
        throw error;
    }
}

// Football-data.orgから試合データを取得（バックアップ）
async function getMatchesFromFootballData(league, timeRange) {
    const matches = [];
    
    try {
        if (!process.env.FOOTBALL_DATA_API_KEY) {
            console.log('Football-data.org API key not configured');
            return matches;
        }

        // リーグIDのマッピング（Football-data.org用）
        const leagueMapping = {
            'PL': 2021,  // Premier League
            'PD': 2014,  // La Liga
            'SA': 2019,  // Serie A
            'BL1': 2002, // Bundesliga
            'FL1': 2015, // Ligue 1
        };

        // 時間範囲の設定
        let fromDate, toDate;
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;
        const season = currentMonth >= 8 ? currentYear : currentYear - 1;
        
        // J1リーグの場合は2024-25シーズンを使用
        if (league === 'J1') {
            season = 2024;
        }
        
        switch (timeRange) {
            case 'today':
                fromDate = toDate = today.toISOString().split('T')[0];
                break;
            case 'tomorrow':
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                fromDate = toDate = tomorrow.toISOString().split('T')[0];
                break;
            case 'week':
                fromDate = today.toISOString().split('T')[0];
                const weekLater = new Date(today);
                weekLater.setDate(today.getDate() + 7);
                toDate = weekLater.toISOString().split('T')[0];
                break;
            case 'lastweek':
                const lastWeekStart = new Date(today);
                lastWeekStart.setDate(today.getDate() - 7);
                fromDate = lastWeekStart.toISOString().split('T')[0];
                toDate = today.toISOString().split('T')[0];
                break;
            case 'month':
                fromDate = today.toISOString().split('T')[0];
                const monthLater = new Date(today);
                monthLater.setMonth(today.getMonth() + 1);
                toDate = monthLater.toISOString().split('T')[0];
                break;
            default:
                fromDate = today.toISOString().split('T')[0];
                const defaultLater = new Date(today);
                defaultLater.setDate(today.getDate() + 7);
                toDate = defaultLater.toISOString().split('T')[0];
        }

        console.log('Football-data.org date range:', { fromDate, toDate, season });

        // 特定のリーグが指定されている場合
        if (league && leagueMapping[league]) {
            const leagueId = leagueMapping[league];
            console.log(`Fetching from Football-data.org for league ${league} (ID: ${leagueId})`);
            
            const response = await fetch(`https://api.football-data.org/v4/competitions/${leagueId}/matches?dateFrom=${fromDate}&dateTo=${toDate}`, {
                headers: {
                    'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Football-data.org response:', data);
                
                if (data.matches && Array.isArray(data.matches)) {
                    data.matches.forEach(match => {
                        matches.push({
                            id: match.id,
                            league: league,
                            homeTeam: match.homeTeam.name,
                            awayTeam: match.awayTeam.name,
                            homeScore: match.score.fullTime.home,
                            awayScore: match.score.fullTime.away,
                            date: match.utcDate,
                            venue: match.venue || 'Unknown',
                            status: match.status,
                            statusLong: match.status
                        });
                    });
                }
            }
        } else if (!league) {
            // リーグが指定されていない場合は、主要リーグから試合を取得
            console.log('Fetching from Football-data.org for all major leagues');
            
            for (const [leagueCode, leagueId] of Object.entries(leagueMapping)) {
                try {
                    const response = await fetch(`https://api.football-data.org/v4/competitions/${leagueId}/matches?dateFrom=${fromDate}&dateTo=${toDate}`, {
                        headers: {
                            'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.matches && Array.isArray(data.matches)) {
                            data.matches.slice(0, 2).forEach(match => {
                                matches.push({
                                    id: match.id,
                                    league: leagueCode,
                                    homeTeam: match.homeTeam.name,
                                    awayTeam: match.awayTeam.name,
                                    homeScore: match.score.fullTime.home,
                                    awayScore: match.score.fullTime.away,
                                    date: match.utcDate,
                                    venue: match.venue || 'Unknown',
                                    status: match.status,
                                    statusLong: match.status
                                });
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching ${leagueCode} from Football-data.org:`, error);
                }
            }
        }

        console.log(`Total Football-data.org matches: ${matches.length}`);
        return matches;
        
    } catch (error) {
        console.error('Error in getMatchesFromFootballData:', error);
        return matches;
    }
}

// 特定の日付のフォールバック試合データを生成
function generateFallbackMatchesForDate(date, league) {
    console.log('generateFallbackMatchesForDate called with:', { date, league });
    
    const matches = [];
    const dateStr = date.toISOString().split('T')[0];
    
    // リーグ別の試合データを生成
    const leagueMatches = {
        'PL': [
            { homeTeam: 'Manchester City', awayTeam: 'Arsenal', homeScore: 2, awayScore: 1, status: 'Finished' },
            { homeTeam: 'Liverpool', awayTeam: 'Chelsea', homeScore: 3, awayScore: 2, status: 'Scheduled' }
        ],
        'PD': [
            { homeTeam: 'Real Madrid', awayTeam: 'Barcelona', homeScore: 1, awayScore: 1, status: 'Finished' },
            { homeTeam: 'Atletico Madrid', awayTeam: 'Sevilla', homeScore: 2, awayScore: 0, status: 'Scheduled' }
        ],
        'SA': [
            { homeTeam: 'AC Milan', awayTeam: 'Inter Milan', homeScore: 0, awayScore: 2, status: 'Finished' },
            { homeTeam: 'Juventus', awayTeam: 'Napoli', homeScore: 1, awayScore: 1, status: 'Scheduled' }
        ],
        'BL1': [
            { homeTeam: 'Bayern Munich', awayTeam: 'Borussia Dortmund', homeScore: 4, awayScore: 0, status: 'Finished' },
            { homeTeam: 'RB Leipzig', awayTeam: 'Bayer Leverkusen', homeScore: 2, awayScore: 2, status: 'Scheduled' }
        ],
        'FL1': [
            { homeTeam: 'Paris Saint-Germain', awayTeam: 'AS Monaco', homeScore: 3, awayScore: 1, status: 'Finished' },
            { homeTeam: 'Olympique Marseille', awayTeam: 'Olympique Lyon', homeScore: 1, awayScore: 0, status: 'Scheduled' }
        ],
        'J1': [
            { homeTeam: '浦和レッズ', awayTeam: '横浜F・マリノス', homeScore: 2, awayScore: 1, status: 'Finished' },
            { homeTeam: '川崎フロンターレ', awayTeam: 'FC東京', homeScore: 0, awayScore: 0, status: 'Scheduled' },
            { homeTeam: 'アルビレックス新潟', awayTeam: '川崎フロンターレ', homeScore: null, awayScore: null, status: 'Scheduled' },
            { homeTeam: '鹿島アントラーズ', awayTeam: '名古屋グランパス', homeScore: 1, awayScore: 1, status: 'Finished' },
            { homeTeam: 'セレッソ大阪', awayTeam: 'ガンバ大阪', homeScore: null, awayScore: null, status: 'Scheduled' }
        ]
    };

    console.log('Available leagues:', Object.keys(leagueMatches));
    console.log('League parameter:', league, 'Type:', typeof league);

    // リーグが指定されていない場合は、すべてのリーグから試合を生成
    if (!league || league === '') {
        console.log('No league specified, generating matches for all leagues');
        Object.keys(leagueMatches).forEach(leagueCode => {
            const leagueData = leagueMatches[leagueCode];
            console.log(`Processing league ${leagueCode} with ${leagueData.length} matches`);
            
            leagueData.forEach((match, index) => {
                const matchTime = new Date(date);
                matchTime.setHours(15 + (index * 2), 0, 0, 0); // 15:00, 17:00, etc.

                const matchData = {
                    id: `match_${dateStr}_${leagueCode}_${index}`,
                    league: leagueCode,
                    homeTeam: match.homeTeam,
                    awayTeam: match.awayTeam,
                    homeScore: match.homeScore,
                    awayScore: match.awayScore,
                    date: matchTime.toISOString(),
                    venue: `${match.homeTeam} Stadium`,
                    status: match.status
                };
                
                matches.push(matchData);
                console.log(`Added match: ${matchData.homeTeam} vs ${matchData.awayTeam}`);
            });
        });
    } else {
        // 特定のリーグが指定されている場合
        console.log(`League specified: ${league}, generating matches for ${league}`);
        const selectedLeague = league;
        const leagueData = leagueMatches[selectedLeague] || leagueMatches['PL'];
        console.log(`Using league data for ${selectedLeague}:`, leagueData);

        leagueData.forEach((match, index) => {
            const matchTime = new Date(date);
            matchTime.setHours(15 + (index * 2), 0, 0, 0); // 15:00, 17:00, etc.

            const matchData = {
                id: `match_${dateStr}_${index}`,
                league: selectedLeague,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                homeScore: match.homeScore,
                awayScore: match.awayScore,
                date: matchTime.toISOString(),
                venue: `${match.homeTeam} Stadium`,
                status: match.status
            };
            
            matches.push(matchData);
            console.log(`Added match: ${matchData.homeTeam} vs ${matchData.awayTeam}`);
        });
    }

    console.log(`Total matches generated: ${matches.length}`);
    return matches;
}

// フォールバック試合データを生成
function generateFallbackMatches(league = null, timeRange = 'week') {
    console.log('generateFallbackMatches called with league:', league, 'timeRange:', timeRange);
    
    const matches = [];
    const today = new Date();
    
    let startDate, endDate;
    
    switch (timeRange) {
        case 'today':
            startDate = endDate = today;
            break;
        case 'tomorrow':
            startDate = endDate = new Date(today);
            startDate.setDate(today.getDate() + 1);
            break;
        case 'week':
            startDate = today;
            endDate = new Date(today);
            endDate.setDate(today.getDate() + 7);
            break;
        case 'lastweek':
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
            endDate = today;
            break;
        case 'month':
            startDate = today;
            endDate = new Date(today);
            endDate.setMonth(today.getMonth() + 1);
            break;
        default:
            startDate = today;
            endDate = new Date(today);
            endDate.setDate(today.getDate() + 7);
    }
    
    // 日付範囲内の各日について試合データを生成
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        console.log(`Processing date:`, currentDate.toISOString().split('T')[0]);
        
        const dayMatches = generateFallbackMatchesForDate(currentDate, league);
        console.log(`Got ${dayMatches.length} matches for date`);
        
        matches.push(...dayMatches);
        
        // 次の日へ
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log(`Total fallback matches generated: ${matches.length}`);
    return matches;
}

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

// 試合詳細データを取得するエンドポイント
app.get('/api/match/:id/details', async (req, res) => {
    try {
        const matchId = req.params.id;
        const { league } = req.query;
        
        console.log(`Fetching match details for ID: ${matchId}, League: ${league}`);
        
        let matchDetails = null;
        
        // API-Footballから試合詳細を取得
        if (process.env.API_FOOTBALL_KEY) {
            try {
                const response = await fetch(`https://v3.football.api-sports.io/fixtures?id=${matchId}`, {
                    headers: {
                        'x-rapidapi-host': 'v3.football.api-sports.io',
                        'x-rapidapi-key': process.env.API_FOOTBALL_KEY
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('API-Football match details response:', data);
                    
                    if (data.response && data.response.length > 0) {
                        const fixture = data.response[0];
                        console.log('Processing fixture data:', fixture);
                        
                        // 統計データの処理
                        let stats = null;
                        if (fixture.statistics && Array.isArray(fixture.statistics)) {
                            console.log('Processing statistics:', fixture.statistics);
                            stats = {
                                possession: {
                                    home: 0,
                                    away: 0
                                },
                                shots: {
                                    home: 0,
                                    away: 0
                                },
                                shotsOnTarget: {
                                    home: 0,
                                    away: 0
                                },
                                corners: {
                                    home: 0,
                                    away: 0
                                },
                                fouls: {
                                    home: 0,
                                    away: 0
                                }
                            };
                            
                            fixture.statistics.forEach(teamStats => {
                                if (teamStats.team && teamStats.statistics) {
                                    const isHome = teamStats.team.id === fixture.teams.home.id;
                                    const teamKey = isHome ? 'home' : 'away';
                                    
                                    teamStats.statistics.forEach(stat => {
                                        switch (stat.type) {
                                            case 'Ball Possession':
                                                stats.possession[teamKey] = parseInt(stat.value) || 0;
                                                break;
                                            case 'Total Shots':
                                                stats.shots[teamKey] = parseInt(stat.value) || 0;
                                                break;
                                            case 'Shots on Goal':
                                                stats.shotsOnTarget[teamKey] = parseInt(stat.value) || 0;
                                                break;
                                            case 'Corner Kicks':
                                                stats.corners[teamKey] = parseInt(stat.value) || 0;
                                                break;
                                            case 'Fouls':
                                                stats.fouls[teamKey] = parseInt(stat.value) || 0;
                                                break;
                                        }
                                    });
                                }
                            });
                        }
                        
                        // イベントデータの処理
                        let events = [];
                        if (fixture.events && Array.isArray(fixture.events)) {
                            console.log('Processing events:', fixture.events);
                            events = fixture.events.map(event => ({
                                time: event.time?.elapsed || 0,
                                type: event.type || 'Unknown',
                                detail: event.detail || 'Unknown',
                                team: event.team?.name || 'Unknown',
                                player: event.player?.name || 'Unknown',
                                assist: event.assist?.name || null
                            }));
                        }
                        
                        // ラインアップデータの処理
                        let lineups = null;
                        if (fixture.lineups && Array.isArray(fixture.lineups)) {
                            console.log('Processing lineups:', fixture.lineups);
                            lineups = {
                                home: null,
                                away: null
                            };
                            
                            fixture.lineups.forEach(lineup => {
                                if (lineup.team && lineup.startXI) {
                                    const isHome = lineup.team.id === fixture.teams.home.id;
                                    const teamKey = isHome ? 'home' : 'away';
                                    
                                    lineups[teamKey] = {
                                        formation: lineup.formation || 'Unknown',
                                        startXI: lineup.startXI.map(player => {
                                            // API-Footballの正しいデータ構造に対応
                                            const playerName = player.player?.name || player.name || 'Unknown';
                                            const playerPosition = player.player?.pos || player.pos || 'Unknown';
                                            const playerNumber = player.player?.number || player.number || 0;
                                            
                                            console.log(`  Processing player:`, {
                                                playerObject: player,
                                                playerKeys: Object.keys(player),
                                                playerName: playerName,
                                                playerPosition: playerPosition,
                                                playerNumber: playerNumber
                                            });
                                            
                                            return {
                                                name: playerName,
                                                number: playerNumber,
                                                position: playerPosition
                                            };
                                        }),
                                        substitutes: lineup.substitutes ? lineup.substitutes.map(player => {
                                            // API-Footballの正しいデータ構造に対応
                                            const playerName = player.player?.name || player.name || 'Unknown';
                                            const playerPosition = player.player?.pos || player.pos || 'Unknown';
                                            const playerNumber = player.player?.number || player.number || 0;
                                            
                                            return {
                                                name: playerName,
                                                number: playerNumber,
                                                position: playerPosition
                                            };
                                        }) : [],
                                        coach: lineup.coach?.name || 'Unknown'
                                    };
                                }
                            });
                        }
                        
                        matchDetails = {
                            id: fixture.fixture.id,
                            league: league || 'Unknown',
                            homeTeam: fixture.teams.home.name,
                            awayTeam: fixture.teams.away.name,
                            homeScore: fixture.goals.home,
                            awayScore: fixture.goals.away,
                            date: fixture.fixture.date,
                            venue: fixture.fixture.venue?.name || 'Unknown',
                            status: fixture.fixture.status.short,
                            statusLong: fixture.fixture.status.long,
                            referee: fixture.fixture.referee || 'Unknown',
                            stats: stats,
                            events: events,
                            lineups: lineups
                        };
                        
                        console.log('Processed match details:', matchDetails);
                    }
                }
            } catch (apiError) {
                console.error('API-Football match details error:', apiError);
            }
        }
        
        // データが見つからない場合はフォールバックデータを生成
        if (!matchDetails) {
            console.log('Generating fallback match details');
            matchDetails = generateFallbackMatchDetails(matchId, league);
        }
        
        res.setHeader('Content-Type', 'application/json');
        res.json({ success: true, data: matchDetails });
        
    } catch (error) {
        console.error('Error fetching match details:', error);
        res.status(500).json({ success: false, error: '試合詳細の取得に失敗しました' });
    }
});

// 試合イベントを取得するエンドポイント
app.get('/api/match/:id/events', async (req, res) => {
    try {
        const matchId = req.params.id;
        console.log(`Fetching match events for ID: ${matchId}`);
        
        // API-Footballから試合イベントを取得
        if (process.env.API_FOOTBALL_KEY) {
            try {
                const response = await fetch(`https://v3.football.api-sports.io/fixtures/events?fixture=${matchId}`, {
                    headers: {
                        'x-rapidapi-host': 'v3.football.api-sports.io',
                        'x-rapidapi-key': process.env.API_FOOTBALL_KEY
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('API-Football events response:', data);
                    
                    if (data.response && Array.isArray(data.response)) {
                        const events = data.response.map(event => ({
                            time: event.time.elapsed,
                            type: event.type,
                            detail: event.detail,
                            team: event.team.name,
                            player: event.player.name,
                            assist: event.assist?.name || null,
                            comments: event.comments || null
                        }));
                        
                        res.setHeader('Content-Type', 'application/json');
                        res.json({ success: true, data: events });
                        return;
                    }
                }
            } catch (apiError) {
                console.error('API-Football events error:', apiError);
            }
        }
        
        // フォールバックイベントデータ
        const fallbackEvents = generateFallbackMatchEvents(matchId);
        res.setHeader('Content-Type', 'application/json');
        res.json({ success: true, data: fallbackEvents });
        
    } catch (error) {
        console.error('Error fetching match events:', error);
        res.status(500).json({ success: false, error: '試合イベントの取得に失敗しました' });
    }
});

// 試合統計を取得するエンドポイント
app.get('/api/match/:id/stats', async (req, res) => {
    try {
        const matchId = req.params.id;
        console.log(`Fetching match stats for ID: ${matchId}`);
        
        // API-Footballから試合統計を取得
        if (process.env.API_FOOTBALL_KEY) {
            try {
                const response = await fetch(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${matchId}`, {
                    headers: {
                        'x-rapidapi-host': 'v3.football.api-sports.io',
                        'x-rapidapi-key': process.env.API_FOOTBALL_KEY
                    }
                });
                
                if (response.ok) {
        const data = await response.json();
                    console.log('API-Football stats response:', data);
                    
                    if (data.response && Array.isArray(data.response)) {
                        const stats = data.response.map(teamStats => ({
                            team: teamStats.team.name,
                            statistics: teamStats.statistics.map(stat => ({
                                type: stat.type,
                                value: stat.value
                            }))
                        }));
                        
                        res.setHeader('Content-Type', 'application/json');
                        res.json({ success: true, data: stats });
                        return;
                    }
                }
            } catch (apiError) {
                console.error('API-Football stats error:', apiError);
            }
        }
        
        // フォールバック統計データ
        const fallbackStats = generateFallbackMatchStats(matchId);
        res.setHeader('Content-Type', 'application/json');
        res.json({ success: true, data: fallbackStats });
        
    } catch (error) {
        console.error('Error fetching match stats:', error);
        res.status(500).json({ success: false, error: '試合統計の取得に失敗しました' });
    }
});

// フォールバック試合詳細データを生成
function generateFallbackMatchDetails(matchId, league) {
    const today = new Date();
    const homeTeam = getRandomTeam(league);
    const awayTeam = getRandomTeam(league);
    
    // より現実的なスコア生成
    const homeScore = Math.floor(Math.random() * 4);
    const awayScore = Math.floor(Math.random() * 4);
    
    // ボール支配率の合計が100%になるように調整
    const homePossession = Math.floor(Math.random() * 30) + 35;
    const awayPossession = 100 - homePossession;
    
    return {
        id: matchId,
        league: league || 'Unknown',
        homeTeam: homeTeam,
        awayTeam: awayTeam,
        homeScore: homeScore,
        awayScore: awayScore,
        date: today.toISOString(),
        venue: `${homeTeam} Stadium`,
        status: 'Finished',
        statusLong: 'Match Finished',
        referee: 'Referee Name',
        stats: {
            possession: {
                home: homePossession,
                away: awayPossession
            },
            shots: {
                home: Math.floor(Math.random() * 10) + 5,
                away: Math.floor(Math.random() * 10) + 5
            },
            shotsOnTarget: {
                home: Math.floor(Math.random() * 8) + 3,
                away: Math.floor(Math.random() * 8) + 3
            },
            corners: {
                home: Math.floor(Math.random() * 8) + 2,
                away: Math.floor(Math.random() * 8) + 2
            },
            fouls: {
                home: Math.floor(Math.random() * 10) + 5,
                away: Math.floor(Math.random() * 10) + 5
            }
        },
        events: generateFallbackMatchEvents(matchId, homeTeam, awayTeam, homeScore, awayScore),
        lineups: generateFallbackLineups(homeTeam, awayTeam)
    };
}

// フォールバック試合イベントを生成（より現実的に）
function generateFallbackMatchEvents(matchId, homeTeam, awayTeam, homeScore, awayScore) {
    const events = [];
    const totalGoals = homeScore + awayScore;
    
    // ゴールイベントを生成
    for (let i = 0; i < totalGoals; i++) {
        const time = Math.floor(Math.random() * 90) + 1;
        const isHomeGoal = i < homeScore;
        const isHomeTeam = isHomeGoal;
        
        // 得点者名を生成
        const scorerNames = isHomeTeam ? 
            ['Mohamed Salah', 'Darwin Núñez', 'Diogo Jota', 'Cody Gakpo', 'Harvey Elliott'] :
            ['Dominic Solanke', 'Philip Billing', 'Ryan Christie', 'Marcus Tavernier', 'Dango Ouattara'];
        
        const scorerName = scorerNames[i % scorerNames.length];
        
        // アシスト名を生成
        const assistNames = isHomeTeam ?
            ['Trent Alexander-Arnold', 'Andy Robertson', 'Thiago Alcântara', 'Jordan Henderson', 'Fabinho'] :
            ['Jaidon Anthony', 'Adam Smith', 'Lewis Cook', 'Jefferson Lerma', 'Junior Stanislas'];
        
        const assistName = assistNames[i % assistNames.length];
        
        events.push({
            time: { elapsed: time },
            type: 'Goal',
            detail: 'Normal Goal',
            team: isHomeTeam ? 'home' : 'away',
            player: { name: scorerName, displayName: scorerName },
            assist: { name: assistName, displayName: assistName }
        });
    }
    
    // カードイベントを生成
    const cardCount = Math.floor(Math.random() * 6) + 2;
    for (let i = 0; i < cardCount; i++) {
        const time = Math.floor(Math.random() * 90) + 1;
        const team = Math.random() > 0.5 ? homeTeam : awayTeam;
        const cardType = Math.random() > 0.7 ? 'Red Card' : 'Yellow Card';
        
        events.push({
            time: { elapsed: time },
            type: 'Card',
            detail: cardType,
            team: Math.random() > 0.5 ? 'home' : 'away',
            player: { name: `${team} Player ${Math.floor(Math.random() * 11) + 1}` }
        });
    }
    
    // 交代イベントを生成
    const subCount = Math.floor(Math.random() * 4) + 3;
    for (let i = 0; i < subCount; i++) {
        const time = Math.floor(Math.random() * 60) + 30;
        const team = Math.random() > 0.5 ? homeTeam : awayTeam;
        
        events.push({
            time: { elapsed: time },
            type: 'Subst',
            detail: 'Substitution',
            team: Math.random() > 0.5 ? 'home' : 'away',
            player: { name: `${team} Player ${Math.floor(Math.random() * 11) + 1}` }
        });
    }
    
    return events.sort((a, b) => a.time.elapsed - b.time.elapsed);
}

// フォールバック試合統計を生成
function generateFallbackMatchStats(matchId) {基本情報
試合統計
試合イベント
ラインアップ
    return [
        {
            team: 'Home Team',
            statistics: [
                { type: 'Ball Possession', value: '55%' },
                { type: 'Total Shots', value: '12' },
                { type: 'Shots on Goal', value: '6' },
                { type: 'Corner Kicks', value: '7' },
                { type: 'Fouls', value: '8' }
            ]
        },
        {
            team: 'Away Team',
            statistics: [
                { type: 'Ball Possession', value: '45%' },
                { type: 'Total Shots', value: '8' },
                { type: 'Shots on Goal', value: '4' },
                { type: 'Corner Kicks', value: '5' },
                { type: 'Fouls', value: '10' }
            ]
        }
    ];
}

// フォールバックラインアップを生成
function generateFallbackLineups(homeTeam, awayTeam) {
    const generatePlayers = (teamName) => {
        const players = [];
        const positions = ['GK', 'DF', 'MF', 'FW'];
        
        for (let i = 0; i < 11; i++) {
            const position = positions[Math.floor(i / 3)];
            players.push({
                name: `${teamName} Player ${i + 1}`,
                number: i + 1,
                position: position
            });
        }
        
        return players;
    };
    
    return {
        home: {
            formation: '4-3-3',
            startXI: generatePlayers(homeTeam).slice(0, 11),
            substitutes: generatePlayers(homeTeam).slice(11, 16),
            coach: `${homeTeam} Coach`
        },
        away: {
            formation: '4-4-2',
            startXI: generatePlayers(awayTeam).slice(0, 11),
            substitutes: generatePlayers(awayTeam).slice(11, 16),
            coach: `${awayTeam} Coach`
        }
    };
}

// ランダムチーム名を取得
function getRandomTeam(league) {
    const teams = {
        'PL': ['Arsenal', 'Chelsea', 'Liverpool', 'Manchester United', 'Manchester City'],
        'PD': ['Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla', 'Valencia'],
        'SA': ['Juventus', 'AC Milan', 'Inter Milan', 'Napoli', 'Roma'],
        'BL1': ['Bayern Munich', 'Borussia Dortmund', 'RB Leipzig', 'Bayer Leverkusen'],
        'FL1': ['PSG', 'Marseille', 'Lyon', 'Monaco', 'Nice'],
        'J1': ['浦和レッズ', '横浜F・マリノス', '川崎フロンターレ', 'FC東京', '鹿島アントラーズ']
    };
    
    const leagueTeams = teams[league] || teams['PL'];
    return leagueTeams[Math.floor(Math.random() * leagueTeams.length)];
}

// サーバー起動処理

// グローバルエラーハンドラー
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
}).on('error', (error) => {
    console.error('Server error:', error);
    process.exit(1);
});

// データベース用のFotMob APIエンドポイント
app.get('/api/fotmob/init', async (req, res) => {
    try {
        res.json({ 
            status: 'success', 
            message: 'FotMob service initialized',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('FotMob init error:', error);
        res.status(500).json({ error: '初期化に失敗しました' });
    }
});

app.get('/api/fotmob/players', async (req, res) => {
    try {
        const { page = 1, limit = 20, league, position } = req.query;
        console.log('Players API called with:', { page, limit, league, position });
        
        // API-Footballから選手データを取得
        if (process.env.API_FOOTBALL_KEY) {
            try {
                console.log('Attempting to fetch from API-Football...');
                
                // 有名選手のIDリスト（API-Footballで利用可能）
                const famousPlayerIds = [882, 184, 276, 874, 874, 874, 874, 874, 874, 874]; // Bruno Fernandes, Haaland, Varane, etc.
                
                const players = [];
                for (let i = 0; i < Math.min(limit, famousPlayerIds.length); i++) {
                    const playerId = famousPlayerIds[i];
                    try {
                        const response = await fetch(`https://v3.football.api-sports.io/players?id=${playerId}`, {
                            headers: {
                                'x-rapidapi-host': 'v3.football.api-sports.io',
                                'x-rapidapi-key': process.env.API_FOOTBALL_KEY
                            }
                        });
                        
                        if (response.ok) {
                            const data = await response.json();
                            if (data.response && data.response.length > 0) {
                                const playerData = data.response[0];
                                const player = {
                                    id: playerData.player.id,
                                    name: playerData.player.name,
                                    fullName: playerData.player.name,
                                    currentTeam: playerData.statistics?.[0]?.team?.name || 'Unknown Team',
                                    position: playerData.statistics?.[0]?.games?.position || 'Unknown',
                                    nationality: playerData.player.nationality || 'Unknown',
                                    age: playerData.player.age || 25,
                                    photo: playerData.player.photo || null,
                                    stats: {
                                        goals: playerData.statistics?.[0]?.goals?.total || 0,
                                        assists: playerData.statistics?.[0]?.goals?.assists || 0,
                                        appearances: playerData.statistics?.[0]?.games?.appearences || 0,
                                        minutes: playerData.statistics?.[0]?.games?.minutes || 0,
                                        rating: playerData.statistics?.[0]?.games?.rating || '6.0',
                                        yellowCards: playerData.statistics?.[0]?.cards?.yellow || 0
                                    }
                                };
                                players.push(player);
                                console.log(`Successfully fetched player: ${player.name} with photo: ${player.photo}`);
                            }
                        }
                    } catch (playerError) {
                        console.error(`Error fetching player ${playerId}:`, playerError);
                    }
                }
                
                if (players.length > 0) {
                    console.log(`Successfully fetched ${players.length} players from API-Football`);
                    res.json({
                        players: players,
                        total: 1000,
                        totalPages: Math.ceil(1000 / parseInt(limit)),
                        currentPage: parseInt(page)
                    });
                    return;
                }
            } catch (apiError) {
                console.error('API-Football error:', apiError);
            }
        }
        
        // API-Footballで取得できない場合、フォールバックデータを使用
        console.log('Using fallback data');
        const fallbackPlayers = generateFallbackPlayers(parseInt(limit));
        
        res.json({
            players: fallbackPlayers,
            total: 1000,
            totalPages: Math.ceil(1000 / parseInt(limit)),
            currentPage: parseInt(page)
        });
    } catch (error) {
        console.error('Players API error:', error);
        res.status(500).json({ error: '選手データの取得に失敗しました' });
    }
});

app.get('/api/fotmob/teams', async (req, res) => {
    try {
        const fallbackTeams = generateFallbackTeams();
        res.json(fallbackTeams);
    } catch (error) {
        console.error('Teams API error:', error);
        res.status(500).json({ error: 'チームデータの取得に失敗しました' });
    }
});

app.get('/api/fotmob/leagues', async (req, res) => {
    try {
        const fallbackLeagues = generateFallbackLeagues();
        res.json(fallbackLeagues);
    } catch (error) {
        console.error('Leagues API error:', error);
        res.status(500).json({ error: 'リーグデータの取得に失敗しました' });
    }
});

app.get('/api/fotmob/search', async (req, res) => {
    try {
        const { q, league, position, limit = 20 } = req.query;
        console.log('Search API called with:', { q, league, position, limit });
        
        // API-Footballから選手検索
        if (process.env.API_FOOTBALL_KEY && q) {
            try {
                console.log('Attempting to search from API-Football...');
                
                const response = await fetch(`https://v3.football.api-sports.io/players?search=${encodeURIComponent(q)}`, {
                    headers: {
                        'x-rapidapi-host': 'v3.football.api-sports.io',
                        'x-rapidapi-key': process.env.API_FOOTBALL_KEY
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.response && data.response.length > 0) {
                        const players = data.response.slice(0, limit).map(playerData => ({
                            id: playerData.player.id,
                            name: playerData.player.name,
                            fullName: playerData.player.name,
                            currentTeam: playerData.statistics?.[0]?.team?.name || 'Unknown Team',
                            position: playerData.statistics?.[0]?.games?.position || 'Unknown',
                            nationality: playerData.player.nationality || 'Unknown',
                            age: playerData.player.age || 25,
                            photo: playerData.player.photo || null,
                            stats: {
                                goals: playerData.statistics?.[0]?.goals?.total || 0,
                                assists: playerData.statistics?.[0]?.goals?.assists || 0,
                                appearances: playerData.statistics?.[0]?.games?.appearences || 0,
                                minutes: playerData.statistics?.[0]?.games?.minutes || 0,
                                rating: playerData.statistics?.[0]?.games?.rating || '6.0',
                                yellowCards: playerData.statistics?.[0]?.cards?.yellow || 0
                            }
                        }));
                        
                        console.log(`Successfully searched ${players.length} players from API-Football`);
                        res.json({
                            players: players,
                            total: players.length,
                            query: q
                        });
                        return;
                    }
                }
            } catch (apiError) {
                console.error('API-Football search error:', apiError);
            }
        }
        
        // API-Footballで検索できない場合、フォールバックデータを使用
        console.log('Using fallback search data');
        const searchResults = generateFallbackSearchResults(q, parseInt(limit));
        
        res.json({
            players: searchResults,
            total: searchResults.length,
            query: q
        });
    } catch (error) {
        console.error('Search API error:', error);
        res.status(500).json({ error: '検索に失敗しました' });
    }
});

// フォールバック選手データを生成
function generateFallbackPlayers(limit) {
    const players = [];
    const names = [
        '久保建英', '三笘薫', '堂安律', '田中碧', '伊藤洋輝', '遠藤航', '南野拓実', '浅野拓磨', '上田綺世', '前田大然',
        '孫興慜', '金玟哉', '李剛仁', '黄喜燦', '久保裕也', '原口元気', '柴崎岳', '酒井宏樹', '吉田麻也', '長友佑都'
    ];
    const teams = ['レアル・ソシエダード', 'ブライトン', 'フライブルク', 'フォルタレーザ', 'シュトゥットガルト', 'リバプール', 'モナコ', 'ボーフム', 'フエンラブラド', 'セルティック'];
    const positions = ['Forward', 'Midfielder', 'Defender', 'Goalkeeper'];
    const nationalities = ['Japan', 'South Korea', 'Germany', 'Brazil', 'England', 'France', 'Spain', 'Italy'];
    
    for (let i = 0; i < limit; i++) {
        players.push({
            id: i + 1,
            name: names[i % names.length],
            fullName: names[i % names.length],
            currentTeam: teams[i % teams.length],
            position: positions[i % positions.length],
            nationality: nationalities[i % nationalities.length],
            age: 20 + (i % 15),
            photo: `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiBmaWxsPSIjMzMzMzMzIi8+Cjx0ZXh0IHg9IjMwIiB5PSIzNSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjI0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPj88L3RleHQ+Cjwvc3ZnPg==`,
            stats: {
                goals: Math.floor(Math.random() * 20),
                assists: Math.floor(Math.random() * 15),
                appearances: 20 + Math.floor(Math.random() * 20),
                minutes: 1500 + Math.floor(Math.random() * 1000),
                rating: (6.0 + Math.random() * 2.0).toFixed(1),
                yellowCards: Math.floor(Math.random() * 5)
            }
        });
    }
    
    return players;
}

// フォールバックチームデータを生成
function generateFallbackTeams() {
    return [
        { id: 1, name: '浦和レッズ', league: 'J1', country: 'Japan' },
        { id: 2, name: '横浜F・マリノス', league: 'J1', country: 'Japan' },
        { id: 3, name: '川崎フロンターレ', league: 'J1', country: 'Japan' },
        { id: 4, name: 'FC東京', league: 'J1', country: 'Japan' },
        { id: 5, name: '鹿島アントラーズ', league: 'J1', country: 'Japan' },
        { id: 6, name: 'Arsenal', league: 'PL', country: 'England' },
        { id: 7, name: 'Chelsea', league: 'PL', country: 'England' },
        { id: 8, name: 'Liverpool', league: 'PL', country: 'England' },
        { id: 9, name: 'Manchester United', league: 'PL', country: 'England' },
        { id: 10, name: 'Manchester City', league: 'PL', country: 'England' }
    ];
}

// フォールバックリーグデータを生成
function generateFallbackLeagues() {
    return [
        { id: 'J1', name: 'J1リーグ', country: 'Japan', level: 1 },
        { id: 'PL', name: 'Premier League', country: 'England', level: 1 },
        { id: 'PD', name: 'La Liga', country: 'Spain', level: 1 },
        { id: 'SA', name: 'Serie A', country: 'Italy', level: 1 },
        { id: 'BL1', name: 'Bundesliga', country: 'Germany', level: 1 },
        { id: 'FL1', name: 'Ligue 1', country: 'France', level: 1 }
    ];
}

// フォールバック検索結果を生成
function generateFallbackSearchResults(query, limit) {
    const allPlayers = generateFallbackPlayers(100);
    
    if (!query) return allPlayers.slice(0, limit);
    
    const filteredPlayers = allPlayers.filter(player => 
        player.name.toLowerCase().includes(query.toLowerCase()) ||
        player.currentTeam.toLowerCase().includes(query.toLowerCase()) ||
        player.position.toLowerCase().includes(query.toLowerCase())
    );
    
    return filteredPlayers.slice(0, limit);
}

