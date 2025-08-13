const express = require('express');
const path = require('path');
const helmet = require('helmet');
const dataService = require('./dataService');
const aiService = require('./ai-service');
const { fotMobDataService } = require('./dataService');

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

// ===== Football-Data.org Integration =====

// Football-Data.org: 選手一覧を取得
app.get('/api/football-data/players', async (req, res) => {
    try {
        const apiKey = process.env.FOOTBALL_DATA_API_KEY;
        
        if (!apiKey) {
            console.error('FOOTBALL_DATA_API_KEY not configured');
            return res.status(500).json({ error: 'API key not configured' });
        }

        const { team, limit } = req.query;
        let url = 'https://api.football-data.org/v4/teams';
        
        if (team) {
            url += `/${team}/players`;
        } else {
            url = 'https://api.football-data.org/v4/players';
        }
        
        const params = new URLSearchParams();
        if (limit) params.append('limit', limit);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }

        console.log(`Football-Data.org: Fetching players - ${url}`);
        const response = await fetchWithRetry(url, {
            headers: {
                'X-Auth-Token': apiKey
            }
        }, 'footballData');

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Football-Data.org error: ${response.status} - ${errorText}`);
            
            // Return fallback data
            console.log('Returning fallback data for players');
            const fallbackData = {
                count: 0,
                filters: {},
                players: []
            };
            return res.json(fallbackData);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Football-Data.org players error:', error);
        
        // Return fallback data
        const fallbackData = {
            count: 0,
            filters: {},
            players: []
        };
        res.json(fallbackData);
    }
});

// Football-Data.org: 選手詳細を取得
app.get('/api/football-data/players/:id', async (req, res) => {
    try {
        const apiKey = process.env.FOOTBALL_DATA_API_KEY;
        const playerId = req.params.id;
        
        if (!apiKey) {
            console.error('FOOTBALL_DATA_API_KEY not configured');
            return res.status(500).json({ error: 'API key not configured' });
        }

        const url = `https://api.football-data.org/v4/players/${playerId}`;

        console.log(`Football-Data.org: Fetching player details - ${url}`);
        const response = await fetchWithRetry(url, {
            headers: {
                'X-Auth-Token': apiKey
            }
        }, 'footballData');

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Football-Data.org error: ${response.status} - ${errorText}`);
            
            // Return fallback data
            console.log('Returning fallback data for player details');
            const fallbackData = {
                id: playerId,
                name: 'Unknown Player',
                firstName: '',
                lastName: '',
                dateOfBirth: '',
                nationality: '',
                position: '',
                shirtNumber: null,
                lastUpdated: new Date().toISOString()
            };
            return res.json(fallbackData);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Football-Data.org player details error:', error);
        
        // Return fallback data
        const fallbackData = {
            id: req.params.id,
            name: 'Unknown Player',
            firstName: '',
            lastName: '',
            dateOfBirth: '',
            nationality: '',
            position: '',
            shirtNumber: null,
            lastUpdated: new Date().toISOString()
        };
        res.json(fallbackData);
    }
});

// Football-Data.org: 選手統計を取得
app.get('/api/football-data/players/:id/stats', async (req, res) => {
    try {
        const apiKey = process.env.FOOTBALL_DATA_API_KEY;
        const playerId = req.params.id;
        const { season } = req.query;
        
        if (!apiKey) {
            console.error('FOOTBALL_DATA_API_KEY not configured');
            return res.status(500).json({ error: 'API key not configured' });
        }

        let url = `https://api.football-data.org/v4/players/${playerId}/matches`;
        const params = new URLSearchParams();
        if (season) params.append('season', season);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }

        console.log(`Football-Data.org: Fetching player stats - ${url}`);
        const response = await fetchWithRetry(url, {
            headers: {
                'X-Auth-Token': apiKey
            }
        }, 'footballData');

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Football-Data.org error: ${response.status} - ${errorText}`);
            
            // Return fallback data
            console.log('Returning fallback data for player stats');
            const fallbackData = {
                player: {
                    id: playerId,
                    name: 'Unknown Player'
                },
                matches: []
            };
            return res.json(fallbackData);
        }

        const data = await response.json();
        
        // 統計データを計算
        const stats = calculatePlayerStats(data.matches, playerId);
        res.json({
            player: data.player,
            matches: data.matches,
            stats: stats
        });
    } catch (error) {
        console.error('Football-Data.org player stats error:', error);
        
        // Return fallback data
        const fallbackData = {
            player: {
                id: req.params.id,
                name: 'Unknown Player'
            },
            matches: [],
            stats: {
                appearances: 0,
                goals: 0,
                assists: 0,
                yellowCards: 0,
                redCards: 0,
                minutes: 0
            }
        };
        res.json(fallbackData);
    }
});

// 選手統計を計算する関数
function calculatePlayerStats(matches, playerId) {
    let stats = {
        appearances: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        minutes: 0
    };

    matches.forEach(match => {
        // ホームチームの選手
        if (match.homeTeam && match.homeTeam.id) {
            const player = match.homeTeam.players?.find(p => p.id === parseInt(playerId));
            if (player) {
                stats.appearances++;
                stats.goals += player.goals || 0;
                stats.assists += player.assists || 0;
                stats.yellowCards += player.yellowCards || 0;
                stats.redCards += player.redCards || 0;
                stats.minutes += player.minutes || 0;
            }
        }
        
        // アウェイチームの選手
        if (match.awayTeam && match.awayTeam.id) {
            const player = match.awayTeam.players?.find(p => p.id === parseInt(playerId));
            if (player) {
                stats.appearances++;
                stats.goals += player.goals || 0;
                stats.assists += player.assists || 0;
                stats.yellowCards += player.yellowCards || 0;
                stats.redCards += player.redCards || 0;
                stats.minutes += player.minutes || 0;
            }
        }
    });

    return stats;
}

// AIチャットAPIエンドポイント
app.post('/api/ai/chat', async (req, res) => {
    try {
        const { message, context } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'メッセージが必要です' });
        }
        
        console.log('AIチャットリクエスト:', { message, context });
        
        // AI分析を実行
        const response = await aiService.generateSoccerAnalysis(message);
        
        res.json({ response });
        
    } catch (error) {
        console.error('AIチャットエラー:', error);
        res.status(500).json({ 
            error: 'AI応答の生成中にエラーが発生しました',
            details: error.message 
        });
    }
});

// 選手比較分析API
app.post('/api/ai/compare', async (req, res) => {
    try {
        const { player1, player2 } = req.body;
        
        if (!player1 || !player2) {
            return res.status(400).json({ error: '比較する選手名が必要です' });
        }
        
        console.log('選手比較リクエスト:', { player1, player2 });
        
        // 選手比較分析を実行
        const response = await aiService.generatePlayerComparison(player1, player2);
        
        res.json({ response });
        
    } catch (error) {
        console.error('選手比較エラー:', error);
        res.status(500).json({ 
            error: '選手比較分析中にエラーが発生しました',
            details: error.message 
        });
    }
});

// 試合予測API
app.post('/api/ai/predict', async (req, res) => {
    try {
        const { team1, team2, context } = req.body;
        
        if (!team1 || !team2) {
            return res.status(400).json({ error: '対戦チーム名が必要です' });
        }
        
        console.log('試合予測リクエスト:', { team1, team2, context });
        
        // 試合予測を実行
        const response = await aiService.generateMatchPrediction(team1, team2, context);
        
        res.json({ response });
        
    } catch (error) {
        console.error('試合予測エラー:', error);
        res.status(500).json({ 
            error: '試合予測中にエラーが発生しました',
            details: error.message 
        });
    }
});

// 戦術分析API
app.post('/api/ai/tactics', async (req, res) => {
    try {
        const { team, season } = req.body;
        
        if (!team) {
            return res.status(400).json({ error: 'チーム名が必要です' });
        }
        
        console.log('戦術分析リクエスト:', { team, season });
        
        // 戦術分析を実行
        const response = await aiService.generateTacticalAnalysis(team, season);
        
        res.json({ response });
        
    } catch (error) {
        console.error('戦術分析エラー:', error);
        res.status(500).json({ 
            error: '戦術分析中にエラーが発生しました',
            details: error.message 
        });
    }
});

// AIプラン推奨API
app.post('/api/ai/recommend-plan', async (req, res) => {
    try {
        const { player, stats, currentPlans } = req.body;
        
        if (!player || !stats) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // AIによるプラン推奨を生成
        const recommendation = await generatePlanRecommendation(player, stats, currentPlans);
        res.json(recommendation);
    } catch (error) {
        console.error('AI recommendation error:', error);
        res.status(500).json({ error: 'AI recommendation failed' });
    }
});

// 週間試合スケジュールAPI
app.get('/api/fixtures/week', async (req, res) => {
    try {
        const { date } = req.query;
        const targetDate = date ? new Date(date) : new Date();
        
        // 週間の試合を取得
        const weekFixtures = await getWeeklyFixtures(targetDate);
        res.json(weekFixtures);
    } catch (error) {
        console.error('Weekly fixtures error:', error);
        res.status(500).json({ error: 'Failed to fetch weekly fixtures' });
    }
});

// FotMob-style database endpoints
app.get('/api/fotmob/players', async (req, res) => {
    try {
        const { search, league, position, page = 1, limit = 20 } = req.query;
        const result = await fotMobDataService.getAllPlayers({
            search,
            league,
            position,
            page: parseInt(page),
            limit: parseInt(limit)
        });
        res.json(result);
    } catch (error) {
        console.error('Error fetching players:', error);
        // Return fallback data if service fails
        const fallbackPlayers = fotMobDataService.getFallbackPlayers();
        const fallbackResult = {
            players: fallbackPlayers.slice(0, parseInt(req.query.limit) || 20),
            total: fallbackPlayers.length,
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 20,
            totalPages: Math.ceil(fallbackPlayers.length / (parseInt(req.query.limit) || 20))
        };
        res.json(fallbackResult);
    }
});

app.get('/api/fotmob/players/:id', async (req, res) => {
    try {
        const player = await fotMobDataService.getPlayerById(req.params.id);
        if (player) {
            res.json(player);
        } else {
            res.status(404).json({ error: 'Player not found' });
        }
    } catch (error) {
        console.error('Error fetching player:', error);
        res.status(500).json({ error: 'Failed to fetch player' });
    }
});

app.get('/api/fotmob/teams', async (req, res) => {
    try {
        const { league } = req.query;
        const teams = await fotMobDataService.getAllTeams({ league });
        res.json(teams);
    } catch (error) {
        console.error('Error fetching teams:', error);
        // Return fallback teams if service fails
        const fallbackTeams = fotMobDataService.getFallbackTeams();
        res.json(fallbackTeams);
    }
});

app.get('/api/fotmob/leagues', async (req, res) => {
    try {
        const leagues = await fotMobDataService.getAllLeagues();
        res.json(leagues);
    } catch (error) {
        console.error('Error fetching leagues:', error);
        // Return fallback leagues if service fails
        const fallbackLeagues = fotMobDataService.getFallbackLeagues();
        res.json(fallbackLeagues);
    }
});

app.get('/api/fotmob/search', async (req, res) => {
    try {
        const { q, page = 1, limit = 20 } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Search query is required' });
        }
        const result = await fotMobDataService.searchPlayers(q, {
            page: parseInt(page),
            limit: parseInt(limit)
        });
        // サーバー側フォールバック（結果が0件の場合）
        if (!result || !Array.isArray(result.players) || result.players.length === 0) {
            const fallbackPlayers = fotMobDataService.getFallbackPlayers();
            const filteredFallback = fallbackPlayers.filter(p => {
                const key = q.toLowerCase();
                return (
                    (p.name && p.name.toLowerCase().includes(key)) ||
                    (p.fullName && p.fullName.toLowerCase().includes(key)) ||
                    (p.japaneseName && p.japaneseName.toLowerCase().includes(key)) ||
                    (p.englishName && p.englishName.toLowerCase().includes(key)) ||
                    (p.firstName && p.firstName.toLowerCase().includes(key)) ||
                    (p.lastName && p.lastName.toLowerCase().includes(key))
                );
            });
            const start = (parseInt(page) - 1) * parseInt(limit);
            const end = start + parseInt(limit);
            return res.json({
                players: filteredFallback.slice(start, end),
                total: filteredFallback.length,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(filteredFallback.length / parseInt(limit))
            });
        }
        res.json(result);
    } catch (error) {
        console.error('Error searching players:', error);
        res.status(500).json({ error: 'Failed to search players' });
    }
});

app.get('/api/fotmob/standings', async (req, res) => {
    try {
        const rows = fotMobDataService.cache.get('standings') || [];
        res.json(rows);
    } catch (e) {
        console.error('standings endpoint error', e);
        res.json([]);
    }
});

app.get('/api/fotmob/matches', async (req, res) => {
    try {
        const list = fotMobDataService.cache.get('matches') || [];
        res.json(list);
    } catch (e) {
        console.error('matches endpoint error', e);
        res.json([]);
    }
});

// Initialize FotMob data service on startup
app.get('/api/fotmob/init', async (req, res) => {
    try {
        const success = await fotMobDataService.initialize();
        res.json({ 
            status: success ? 'success' : 'partial',
            message: success ? 'FotMob data service initialized' : 'FotMob data service initialized with fallback data',
            lastUpdate: fotMobDataService.lastUpdate
        });
    } catch (error) {
        console.error('Error initializing FotMob service:', error);
        res.status(500).json({ error: 'Failed to initialize service' });
    }
});

// 試合スケジュールAPI
app.get('/api/fixtures', async (req, res) => {
    try {
        const { date, team, league } = req.query;
        let fixtures = [];

        // 日付が指定されている場合
        if (date) {
            const targetDate = new Date(date);
            const dayOfWeek = targetDate.getDay();
            
            // フォールバックデータとして、その日の試合を生成
            fixtures = generateFallbackFixtures(targetDate, team, league);
        } else {
            // 日付が指定されていない場合は今日の試合
            const today = new Date();
            fixtures = generateFallbackFixtures(today, team, league);
        }

        res.json(fixtures);
    } catch (error) {
        console.error('Fixtures error:', error);
        res.status(500).json({ error: 'Failed to fetch fixtures' });
    }
});

// 試合スケジュールAPI（FotMob統合版）
app.get('/api/fotmob/matches', async (req, res) => {
    try {
        const { league, timeRange = 'week' } = req.query;
        console.log('API called with:', { league, timeRange });
        
        let matches = [];

        // 時間範囲に基づいて試合を取得
        switch (timeRange) {
            case 'today':
                console.log('Getting matches for today');
                matches = await getMatchesForDate(new Date(), league);
                break;
            case 'tomorrow':
                console.log('Getting matches for tomorrow');
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                matches = await getMatchesForDate(tomorrow, league);
                break;
            case 'week':
                console.log('Getting matches for this week');
                matches = await getMatchesForWeek(new Date(), league);
                break;
            case 'month':
                console.log('Getting matches for this month');
                matches = await getMatchesForMonth(new Date(), league);
                break;
            default:
                console.log('Getting matches for this week (default)');
                matches = await getMatchesForWeek(new Date(), league);
        }

        console.log('Generated matches count:', matches.length);
        console.log('First few matches:', matches.slice(0, 3));

        res.setHeader('Content-Type', 'application/json');
        res.json({ matches });
    } catch (error) {
        console.error('Error fetching matches:', error);
        // Return fallback matches if service fails
        const fallbackMatches = generateFallbackMatches(league);
        console.log('Returning fallback matches:', fallbackMatches.length);
        res.setHeader('Content-Type', 'application/json');
        res.json({ matches: fallbackMatches });
    }
});

// 特定の日付の試合を取得
async function getMatchesForDate(date, league) {
    try {
        // 実際のAPIから試合を取得する場合はここで実装
        // 現在はフォールバックデータを返す
        return generateFallbackMatchesForDate(date, league);
    } catch (error) {
        console.error('Error getting matches for date:', error);
        return generateFallbackMatchesForDate(date, league);
    }
}

// 週間の試合を取得
async function getMatchesForWeek(date, league) {
    try {
        const matches = [];
        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(date);
            currentDate.setDate(currentDate.getDate() + i);
            const dayMatches = await getMatchesForDate(currentDate, league);
            matches.push(...dayMatches);
        }
        return matches;
    } catch (error) {
        console.error('Error getting matches for week:', error);
        return generateFallbackMatches(league);
    }
}

// 月間の試合を取得
async function getMatchesForMonth(date, league) {
    try {
        const matches = [];
        for (let i = 0; i < 30; i++) {
            const currentDate = new Date(date);
            currentDate.setDate(currentDate.getDate() + i);
            const dayMatches = await getMatchesForDate(currentDate, league);
            matches.push(...dayMatches);
        }
        return matches;
    } catch (error) {
        console.error('Error getting matches for month:', error);
        return generateFallbackMatches(league);
    }
}

// 特定の日付のフォールバック試合データを生成
function generateFallbackMatchesForDate(date, league) {
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
            { homeTeam: '川崎フロンターレ', awayTeam: 'FC東京', homeScore: 0, awayScore: 0, status: 'Scheduled' }
        ]
    };

    // リーグが指定されていない場合は、すべてのリーグから試合を生成
    if (!league || league === '') {
        Object.keys(leagueMatches).forEach(leagueCode => {
            const leagueData = leagueMatches[leagueCode];
            leagueData.forEach((match, index) => {
                const matchTime = new Date(date);
                matchTime.setHours(15 + (index * 2), 0, 0, 0); // 15:00, 17:00, etc.

                matches.push({
                    id: `match_${dateStr}_${leagueCode}_${index}`,
                    league: leagueCode,
                    homeTeam: match.homeTeam,
                    awayTeam: match.awayTeam,
                    homeScore: match.homeScore,
                    awayScore: match.awayScore,
                    date: matchTime.toISOString(),
                    venue: `${match.homeTeam} Stadium`,
                    status: match.status
                });
            });
        });
    } else {
        // 特定のリーグが指定されている場合
        const selectedLeague = league;
        const leagueData = leagueMatches[selectedLeague] || leagueMatches['PL'];

        leagueData.forEach((match, index) => {
            const matchTime = new Date(date);
            matchTime.setHours(15 + (index * 2), 0, 0, 0); // 15:00, 17:00, etc.

            matches.push({
                id: `match_${dateStr}_${index}`,
                league: selectedLeague,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                homeScore: match.homeScore,
                awayScore: match.awayScore,
                date: matchTime.toISOString(),
                venue: `${match.homeTeam} Stadium`,
                status: match.status
            });
        });
    }

    return matches;
}

// フォールバック試合データを生成
function generateFallbackMatches(league = null) {
    const matches = [];
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        const dayMatches = generateFallbackMatchesForDate(date, league);
        matches.push(...dayMatches);
    }
    
    return matches;
}

// 選手プラン管理API
app.post('/api/plans/player', async (req, res) => {
    try {
        const plan = req.body;
        // 実際の実装ではデータベースに保存
        res.json({ 
            success: true, 
            message: '選手プランが作成されました',
            planId: Date.now().toString()
        });
    } catch (error) {
        console.error('Error creating player plan:', error);
        res.status(500).json({ error: 'Failed to create player plan' });
    }
});

app.get('/api/plans/player', async (req, res) => {
    try {
        // 実際の実装ではデータベースから取得
        const plans = [];
        res.json(plans);
    } catch (error) {
        console.error('Error fetching player plans:', error);
        res.status(500).json({ error: 'Failed to fetch player plans' });
    }
});

// 戦術プラン管理API
app.post('/api/plans/tactical', async (req, res) => {
    try {
        const plan = req.body;
        // 実際の実装ではデータベースに保存
        res.json({ 
            success: true, 
            message: '戦術プランが作成されました',
            planId: Date.now().toString()
        });
    } catch (error) {
        console.error('Error creating tactical plan:', error);
        res.status(500).json({ error: 'Failed to create tactical plan' });
    }
});

app.get('/api/plans/tactical', async (req, res) => {
    try {
        // 実際の実装ではデータベースから取得
        const plans = [];
        res.json(plans);
    } catch (error) {
        console.error('Error fetching tactical plans:', error);
        res.status(500).json({ error: 'Failed to fetch tactical plans' });
    }
});

// 選手統計データAPI
app.get('/api/player-stats', async (req, res) => {
    try {
        const { playerId } = req.query;
        
        if (playerId) {
            // 特定の選手の統計データを取得
            const stats = await getPlayerStats(playerId);
            res.json(stats);
        } else {
            // 全選手の統計データを取得
            const allStats = await getAllPlayerStats();
            res.json(allStats);
        }
    } catch (error) {
        console.error('Error fetching player stats:', error);
        res.status(500).json({ error: 'Failed to fetch player stats' });
    }
});

// 選手統計データ取得
async function getPlayerStats(playerId) {
    try {
        // 実際の実装ではデータベースから取得
        // ここではサンプルデータを返す
        const sampleStats = {
            [playerId]: {
                goals: Math.floor(Math.random() * 20) + 5,
                assists: Math.floor(Math.random() * 15) + 3,
                matches: Math.floor(Math.random() * 30) + 10,
                rating: (Math.random() * 3 + 6).toFixed(1),
                minutes: Math.floor(Math.random() * 2000) + 1000,
                passes: Math.floor(Math.random() * 500) + 200,
                tackles: Math.floor(Math.random() * 50) + 20,
                shots: Math.floor(Math.random() * 100) + 30
            }
        };
        
        return sampleStats;
    } catch (error) {
        console.error('Error getting player stats:', error);
        return {};
    }
}

// 全選手統計データ取得
async function getAllPlayerStats() {
    try {
        // 実際の実装ではデータベースから取得
        // ここではサンプルデータを返す
        const allStats = {};
        
        // 主要選手のサンプル統計データ
        const samplePlayers = [
            { id: 1, name: '久保建英' },
            { id: 2, name: '三笘薫' },
            { id: 3, name: '遠藤航' },
            { id: 4, name: '伊東純也' },
            { id: 5, name: '田中碧' }
        ];
        
        samplePlayers.forEach(player => {
            allStats[player.id] = {
                goals: Math.floor(Math.random() * 20) + 5,
                assists: Math.floor(Math.random() * 15) + 3,
                matches: Math.floor(Math.random() * 30) + 10,
                rating: (Math.random() * 3 + 6).toFixed(1),
                minutes: Math.floor(Math.random() * 2000) + 1000,
                passes: Math.floor(Math.random() * 500) + 200,
                tackles: Math.floor(Math.random() * 50) + 20,
                shots: Math.floor(Math.random() * 100) + 30
            };
        });
        
        return allStats;
    } catch (error) {
        console.error('Error getting all player stats:', error);
        return {};
    }
}

// プラン進捗更新API
app.put('/api/plans/:planId/progress', async (req, res) => {
    try {
        const { planId } = req.params;
        const { progress, completed } = req.body;
        
        // 実際の実装ではデータベースを更新
        res.json({ 
            success: true, 
            message: 'プラン進捗が更新されました',
            planId,
            progress,
            completed
        });
    } catch (error) {
        console.error('Error updating plan progress:', error);
        res.status(500).json({ error: 'Failed to update plan progress' });
    }
});

// プラン完了API
app.put('/api/plans/:planId/complete', async (req, res) => {
    try {
        const { planId } = req.params;
        const { completed, completionDate } = req.body;
        
        // 実際の実装ではデータベースを更新
        res.json({ 
            success: true, 
            message: 'プラン完了状態が更新されました',
            planId,
            completed,
            completionDate
        });
    } catch (error) {
        console.error('Error updating plan completion:', error);
        res.status(500).json({ error: 'Failed to update plan completion' });
    }
});

// プラン分析API
app.get('/api/plans/analysis', async (req, res) => {
    try {
        const { period, type } = req.query;
        
        // 実際の実装ではデータベースから分析データを取得
        const analysisData = await getPlanAnalysis(period, type);
        res.json(analysisData);
    } catch (error) {
        console.error('Error fetching plan analysis:', error);
        res.status(500).json({ error: 'Failed to fetch plan analysis' });
    }
});

// プラン分析データ取得
async function getPlanAnalysis(period, type) {
    try {
        // サンプル分析データ
        const analysis = {
            period: period || '1month',
            type: type || 'all',
            totalPlans: Math.floor(Math.random() * 50) + 20,
            completedPlans: Math.floor(Math.random() * 30) + 10,
            successRate: (Math.random() * 40 + 60).toFixed(1),
            averageCompletionTime: Math.floor(Math.random() * 30) + 15,
            topPerformingPlans: [
                { name: 'フィジカル強化プラン', successRate: '85%' },
                { name: '技術向上プラン', successRate: '78%' },
                { name: '戦術理解プラン', successRate: '72%' }
            ]
        };
        
        return analysis;
    } catch (error) {
        console.error('Error getting plan analysis:', error);
        return {};
    }
}

// AIプラン推奨生成
async function generatePlanRecommendation(player, stats, currentPlans) {
    try {
        // 選手の統計と現在のプランを分析して推奨を生成
        let planType = 'technical';
        let reason = '';
        let suggestions = '';

        // 統計に基づく推奨ロジック
        if (stats.goals < 5) {
            planType = 'goal-scoring';
            reason = '得点力の向上が必要です';
            suggestions = 'シュート練習、ポジショニング改善、フィニッシュング技術の向上を重点的に行いましょう';
        } else if (stats.assists < 3) {
            planType = 'playmaking';
            reason = 'プレイメイキング能力の向上が必要です';
            suggestions = 'パス精度向上、視野の拡大、創造性を高める練習を行いましょう';
        } else if (stats.rating < 7.0) {
            planType = 'technical';
            reason = '技術面の向上が必要です';
            suggestions = 'ボールコントロール、ドリブル技術、パス精度の向上を図りましょう';
        } else {
            planType = 'tactical';
            reason = '戦術理解の向上が必要です';
            suggestions = 'チーム戦術の理解、ポジショニング、ゲーム理解力の向上を目指しましょう';
        }

        // 現在のプランとの重複を避ける
        const existingPlanTypes = currentPlans.map(p => p.planType);
        if (existingPlanTypes.includes(planType)) {
            // 代替プランを提案
            const alternatives = ['fitness', 'mental', 'recovery', 'defensive'].filter(t => !existingPlanTypes.includes(t));
            if (alternatives.length > 0) {
                planType = alternatives[0];
                reason = '現在のプランとの重複を避けて、' + getPlanTypeText(planType) + 'を提案します';
                suggestions = 'フィジカル面やメンタル面の強化も重要です';
            }
        }

        return {
            planType: planType,
            reason: reason,
            suggestions: suggestions
        };
    } catch (error) {
        console.error('Plan recommendation error:', error);
        throw error;
    }
}

// 週間試合スケジュール取得
async function getWeeklyFixtures(targetDate) {
    try {
        const weekStart = new Date(targetDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        // 週間の試合データを生成（実際のAPIから取得する場合はここを修正）
        const weekFixtures = [];
        
        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(weekStart);
            currentDate.setDate(currentDate.getDate() + i);
            
            // 各日に1-3試合を生成
            const dailyFixtures = generateFallbackFixtures(currentDate, null, null);
            weekFixtures.push(...dailyFixtures);
        }
        
        return weekFixtures;
    } catch (error) {
        console.error('Weekly fixtures error:', error);
        throw error;
    }
}

// プランタイプテキスト取得
function getPlanTypeText(type) {
    const types = {
        'fitness': 'フィジカル強化',
        'technical': '技術向上',
        'tactical': '戦術理解',
        'mental': 'メンタル強化',
        'recovery': 'リカバリー',
        'goal-scoring': '得点力向上',
        'defensive': '守備力向上',
        'playmaking': 'プレイメイキング'
    };
    return types[type] || type;
}

// 高度なデータ取得エンドポイント（Proプラン用）
const { advancedDataService } = require('./dataService');

// 高度なスタッツ分析用APIエンドポイント
app.get('/api/team-stats', async (req, res) => {
    try {
        const { team, season } = req.query;
        if (!team || !season) {
            return res.status(400).json({ error: 'チームIDとシーズンが必要です' });
        }
        
        // リーグコードを取得（デフォルトはJ1）
        const league = req.query.league || 'J1';
        
        // まずAPI-Football v3から実データを取得
        try {
            const apiFootballStats = await getApiFootballTeamStats(team, season, league);
            if (apiFootballStats) {
                console.log(`API-Football v3からチーム統計を取得しました (リーグ: ${league})`);
                // API-Football v3のデータを優先的に使用
                apiFootballStats.source = 'API-Football v3 Pro';
                return res.json(apiFootballStats);
            }
        } catch (apiFootballError) {
            console.log('API-Football v3からの取得に失敗、football-data.orgを試行:', apiFootballError.message);
        }
        
        // API-Football v3が失敗した場合、football-data.orgを試行
        try {
            const footballDataStats = await getFootballDataTeamStats(team, season, league);
            if (footballDataStats) {
                console.log(`football-data.orgからチーム統計を取得しました (リーグ: ${league})`);
                // football-data.orgのデータを使用
                footballDataStats.source = 'football-data.org Statistic Add-On';
                return res.json(footballDataStats);
            }
        } catch (footballDataError) {
            console.log('football-data.orgからの取得に失敗:', footballDataError.message);
        }
        
        // 両方のAPIが失敗した場合、フォールバックデータを返す
        console.log('両方のAPIが失敗、フォールバックデータを返します');
        const fallbackStats = generateFallbackTeamStats();
        fallbackStats.source = 'フォールバックデータ';
        res.json(fallbackStats);
        
    } catch (error) {
        console.error('Team stats error:', error);
        const fallbackStats = generateFallbackTeamStats();
        res.json(fallbackStats);
    }
});

app.get('/api/player-stats', async (req, res) => {
    try {
        const { player, team, season, league } = req.query;
        if (!player || !team || !season) {
            return res.status(400).json({ error: '選手ID、チームID、シーズンが必要です' });
        }
        
        const leagueCode = league || 'PL';
        
        // API-Football v3から選手統計を取得
        try {
            const playerStats = await getApiFootballPlayerStats(player, team, season, leagueCode);
            if (playerStats) {
                console.log(`API-Football v3から選手統計を取得しました (選手ID: ${player})`);
                playerStats.source = 'API-Football v3 Pro';
                return res.json(playerStats);
            }
        } catch (apiFootballError) {
            console.log('API-Football v3からの選手統計取得に失敗:', apiFootballError.message);
        }
        
        // フォールバックデータを返す
        console.log('選手統計取得失敗、フォールバックデータを返します');
        const fallbackPlayerStats = generateFallbackPlayerStats(player, team);
        fallbackPlayerStats.source = 'フォールバックデータ';
        res.json(fallbackPlayerStats);
        
    } catch (error) {
        console.error('Player stats error:', error);
        const fallbackPlayerStats = generateFallbackPlayerStats(req.query.player, req.query.team);
        fallbackPlayerStats.source = 'フォールバックデータ';
        res.json(fallbackPlayerStats);
    }
});

app.get('/api/comparison', async (req, res) => {
    try {
        const { league, team, player, season } = req.query;
        if (!league || !season) {
            return res.status(400).json({ error: 'リーグとシーズンが必要です' });
        }
        
        // 比較データを生成
        const comparisonData = await generateComparisonData(league, team, player, season);
        res.json(comparisonData);
    } catch (error) {
        console.error('Comparison error:', error);
        res.status(500).json({ error: '比較データの取得に失敗しました' });
    }
});

app.get('/api/live-matches', async (req, res) => {
    try {
        const liveMatches = await advancedDataService.getLiveMatches({ includeStats: true });
        res.json(liveMatches);
    } catch (error) {
        console.error('Live matches error:', error);
        res.status(500).json({ error: 'ライブ試合データの取得に失敗しました' });
    }
});

app.get('/api/predictions', async (req, res) => {
    try {
        const { league, team } = req.query;
        const predictions = await generateMatchPredictions(league, team);
        res.json(predictions);
    } catch (error) {
        console.error('Predictions error:', error);
        res.status(500).json({ error: '予測データの取得に失敗しました' });
    }
});

// ライブ試合データ取得
app.get('/api/advanced/live-matches', async (req, res) => {
    try {
        const options = req.query;
        const liveMatches = await advancedDataService.getLiveMatches(options);
        res.json(liveMatches);
    } catch (error) {
        console.error('Live matches error:', error);
        res.status(500).json({ error: 'ライブ試合データの取得に失敗しました' });
    }
});

// 詳細な試合統計取得
app.get('/api/advanced/match-stats/:matchId', async (req, res) => {
    try {
        const { matchId } = req.params;
        const options = req.query;
        const matchStats = await advancedDataService.getDetailedMatchStats(matchId, options);
        res.json(matchStats);
    } catch (error) {
        console.error('Match stats error:', error);
        res.status(500).json({ error: '試合統計の取得に失敗しました' });
    }
});

// 詳細な選手統計取得
app.get('/api/advanced/player-stats/:playerId/:season', async (req, res) => {
    try {
        const { playerId, season } = req.params;
        const options = req.query;
        const playerStats = await advancedDataService.getDetailedPlayerStats(playerId, season, options);
        res.json(playerStats);
    } catch (error) {
        console.error('Player stats error:', error);
        res.status(500).json({ error: '選手統計の取得に失敗しました' });
    }
});

// 詳細なチーム統計取得
app.get('/api/advanced/team-stats/:teamId/:leagueId/:season', async (req, res) => {
    try {
        const { teamId, leagueId, season } = req.params;
        const options = req.query;
        const teamStats = await advancedDataService.getDetailedTeamStats(teamId, leagueId, season, options);
        res.json(teamStats);
    } catch (error) {
        console.error('Team stats error:', error);
        res.status(500).json({ error: 'チーム統計の取得に失敗しました' });
    }
});

// 試合予測データ取得
app.get('/api/advanced/predictions/:matchId', async (req, res) => {
    try {
        const { matchId } = req.params;
        const options = req.query;
        const predictions = await advancedDataService.getMatchPredictions(matchId, options);
        res.json(predictions);
    } catch (error) {
        console.error('Predictions error:', error);
        res.status(500).json({ error: '予測データの取得に失敗しました' });
    }
});

// 試合オッズ情報取得
app.get('/api/advanced/odds/:matchId', async (req, res) => {
    try {
        const { matchId } = req.params;
        const options = req.query;
        const odds = await advancedDataService.getMatchOdds(matchId, options);
        res.json(odds);
    } catch (error) {
        console.error('Odds error:', error);
        res.status(500).json({ error: 'オッズ情報の取得に失敗しました' });
    }
});

// 比較データ生成関数
async function generateComparisonData(league, team, player, season) {
    try {
        // リーグ全体の統計を取得
        const leagueStats = await getLeagueAverageStats(league, season);
        
        // チーム統計を取得
        let teamStats = null;
        if (team) {
            teamStats = await advancedDataService.getDetailedTeamStats(team, null, season, { includeAdvanced: true });
        }
        
        // 選手統計を取得
        let playerStats = null;
        if (player) {
            playerStats = await advancedDataService.getDetailedPlayerStats(player, season, { includeAdvanced: true });
        }
        
        // 比較データを構築
        const comparison = {
            league: league,
            season: season,
            leagueAverages: leagueStats,
            team: teamStats,
            player: playerStats,
            players: []
        };
        
        // 選手比較データを生成
        if (team && player) {
            const teamPlayers = await getTeamPlayers(team);
            const topPlayers = teamPlayers.slice(0, 6); // 上位6選手
            
            comparison.players = topPlayers.map(p => ({
                id: p.id,
                name: p.name,
                position: p.position,
                stats: [
                    p.stats?.goals || 0,
                    p.stats?.assists || 0,
                    p.stats?.shotAccuracy || 0,
                    p.stats?.passAccuracy || 0,
                    p.stats?.tackles || 0,
                    p.stats?.interceptions || 0
                ]
            }));
        }
        
        return comparison;
    } catch (error) {
        console.error('Comparison data generation error:', error);
        return getFallbackComparisonData();
    }
}

// リーグ平均統計取得
async function getLeagueAverageStats(league, season) {
    try {
        // リーグの全チーム統計を取得して平均を計算
        const teams = await getTeamsByLeague(league);
        let totalStats = {
            goals: 0, assists: 0, shots: 0, possession: 0,
            cleanSheets: 0, expectedGoals: 0
        };
        let teamCount = 0;
        
        for (const team of teams) {
            try {
                const stats = await advancedDataService.getDetailedTeamStats(team.id, null, season, { includeBasic: true });
                if (stats) {
                    totalStats.goals += stats.goals || 0;
                    totalStats.assists += stats.assists || 0;
                    totalStats.shots += stats.shots || 0;
                    totalStats.possession += stats.possession || 0;
                    totalStats.cleanSheets += stats.cleanSheets || 0;
                    totalStats.expectedGoals += stats.expectedGoals || 0;
                    teamCount++;
                }
            } catch (error) {
                console.error(`Team stats error for ${team.id}:`, error);
            }
        }
        
        if (teamCount > 0) {
            return {
                goals: Math.round(totalStats.goals / teamCount),
                assists: Math.round(totalStats.assists / teamCount),
                shots: Math.round(totalStats.shots / teamCount),
                possession: Math.round(totalStats.possession / teamCount),
                cleanSheets: Math.round(totalStats.cleanSheets / teamCount),
                expectedGoals: Math.round((totalStats.expectedGoals / teamCount) * 100) / 100
            };
        }
        
        return getFallbackLeagueAverages();
    } catch (error) {
        console.error('League average stats error:', error);
        return getFallbackLeagueAverages();
    }
}

// リーグ別チーム取得
async function getTeamsByLeague(leagueCode) {
    try {
        const response = await fetch(`https://api.football-data.org/v4/competitions/${leagueCode}/teams`, {
            headers: {
                'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY || ''
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.teams || [];
        }
        
        return getFallbackTeams();
    } catch (error) {
        console.error('Teams by league error:', error);
        return getFallbackTeams();
    }
}

// チーム選手取得
async function getTeamPlayers(teamId) {
    try {
        const response = await fetch(`https://api.football-data.org/v4/teams/${teamId}`, {
            headers: {
                'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY || ''
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.squad || [];
        }
        
        return getFallbackPlayers();
    } catch (error) {
        console.error('Team players error:', error);
        return getFallbackPlayers();
    }
}

// 試合予測生成
async function generateMatchPredictions(league, team) {
    try {
        // 今後の試合を取得
        const upcomingMatches = await getUpcomingMatches(league, team);
        
        // 予測データを生成
        const predictions = upcomingMatches.map(match => {
            const homeStrength = calculateTeamStrength(match.homeTeam);
            const awayStrength = calculateTeamStrength(match.awayTeam);
            const prediction = predictMatchResult(homeStrength, awayStrength);
            
            return {
                id: match.id,
                homeTeam: match.homeTeam.name,
                awayTeam: match.awayTeam.name,
                league: match.competition.name,
                date: match.utcDate,
                predictedResult: prediction.result,
                confidence: prediction.confidence,
                homeWinProb: prediction.homeWinProb,
                drawProb: prediction.drawProb,
                awayWinProb: prediction.awayWinProb
            };
        });
        
        return predictions;
    } catch (error) {
        console.error('Match predictions error:', error);
        return getFallbackPredictions();
    }
}

// 今後の試合取得
async function getUpcomingMatches(league, team) {
    try {
        let url = `https://api.football-data.org/v4/competitions/${league}/matches?status=SCHEDULED&limit=10`;
        if (team) {
            url += `&team=${team}`;
        }
        
        const response = await fetch(url, {
            headers: {
                'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY || ''
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.matches || [];
        }
        
        return getFallbackUpcomingMatches();
    } catch (error) {
        console.error('Upcoming matches error:', error);
        return getFallbackUpcomingMatches();
    }
}

// チーム強度計算
function calculateTeamStrength(team) {
    // シンプルな強度計算（実際の実装ではより複雑なアルゴリズムを使用）
    const baseStrength = 50;
    const formBonus = Math.random() * 20 - 10; // -10 to +10
    const homeBonus = Math.random() * 15; // 0 to +15
    
    return Math.max(0, Math.min(100, baseStrength + formBonus + homeBonus));
}

// 試合結果予測
function predictMatchResult(homeStrength, awayStrength) {
    const totalStrength = homeStrength + awayStrength;
    const homeWinProb = (homeStrength / totalStrength) * 0.6; // ホーム有利
    const awayWinProb = (awayStrength / totalStrength) * 0.3;
    const drawProb = 1 - homeWinProb - awayWinProb;
    
    let result, confidence;
    if (homeWinProb > 0.5) {
        result = 'ホーム勝利';
        confidence = Math.round(homeWinProb * 100);
    } else if (awayWinProb > 0.4) {
        result = 'アウェイ勝利';
        confidence = Math.round(awayWinProb * 100);
    } else {
        result = '引き分け';
        confidence = Math.round(drawProb * 100);
    }
    
    return {
        result,
        confidence,
        homeWinProb: Math.round(homeWinProb * 100),
        drawProb: Math.round(drawProb * 100),
        awayWinProb: Math.round(awayWinProb * 100)
    };
}

// API-Football v3からチーム統計を取得
async function getApiFootballTeamStats(teamId, season, leagueCode = 'J1') {
    try {
        const apiKey = process.env.API_FOOTBALL_KEY;
        console.log('🔑 API-Football v3 キー確認:', apiKey ? `${apiKey.substring(0, 8)}...` : '未設定');
        
        if (!apiKey) {
            throw new Error('API_FOOTBALL_KEYが設定されていません');
        }
        
        // チームIDを数値に変換（J1リーグのチームIDは文字列の場合がある）
        const numericTeamId = parseInt(teamId);
        if (isNaN(numericTeamId)) {
            throw new Error('無効なチームIDです');
        }
        
        // リーグコードに応じてリーグIDを設定
        const leagueIds = {
            'J1': 98,      // J1リーグ（権限確認が必要）
            'PL': 39,      // プレミアリーグ（確実に利用可能）
            'BL1': 78,     // ブンデスリーガ
            'SA': 135,     // セリエA
            'PD': 140,     // ラ・リーガ
            'FL1': 61      // リーグ・アン
        };
        
        // デフォルトをプレミアリーグに変更（権限確認のため）
        const leagueId = leagueIds[leagueCode] || 39;
        const url = `https://v3.football.api-sports.io/teams/statistics?team=${numericTeamId}&league=${leagueId}&season=${season}`;
        console.log('🌐 API-Football v3 URL:', url);
        
        const response = await fetch(url, {
            headers: {
                'x-rapidapi-host': 'v3.football.api-sports.io',
                'x-rapidapi-key': apiKey
            }
        });
        
        console.log('📡 API-Football v3 レスポンス:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.log('❌ API-Football v3 エラーレスポンス:', errorData);
            
            if (response.status === 403) {
                throw new Error(`API-Football v3 権限エラー: ${errorData.message || 'リーグへのアクセス権限がありません'}`);
            }
            
            throw new Error(`API-Football v3 エラー: ${response.status} - ${errorData.message || response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📊 API-Football v3 データ:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
        
        if (data.response && data.response.length > 0) {
            const stats = data.response[0];
            return {
                goals: stats.goals?.for?.total || 0,
                shotAccuracy: stats.shots?.on?.total ? Math.round((stats.shots.on.total / stats.shots.total) * 100) : 0,
                possession: stats.passes?.accuracy || 0,
                cleanSheets: stats.clean_sheet?.total || 0,
                expectedGoals: stats.goals?.for?.expected?.total || 0,
                predictionAccuracy: 75, // デフォルト値
                performance: {
                    dates: ['8月', '9月', '10月', '11月', '12月'],
                    goals: [5, 8, 12, 15, 18],
                    assists: [3, 6, 9, 11, 14]
                },
                source: 'API-Football v3'
            };
        }
        
        return null;
    } catch (error) {
        console.error('API-Football v3 エラー:', error);
        return null;
    }
}

// API-Football v3から選手統計を取得
async function getApiFootballPlayerStats(playerId, teamId, season, leagueCode = 'PL') {
    try {
        const apiKey = process.env.API_FOOTBALL_KEY;
        console.log('🔑 API-Football v3 選手統計キー確認:', apiKey ? `${apiKey.substring(0, 8)}...` : '未設定');
        
        if (!apiKey) {
            throw new Error('API_FOOTBALL_KEYが設定されていません');
        }
        
        // リーグコードに応じてリーグIDを設定
        const leagueIds = {
            'J1': 98,      // J1リーグ
            'PL': 39,      // プレミアリーグ
            'BL1': 78,     // ブンデスリーガ
            'SA': 135,     // セリエA
            'PD': 140,     // ラ・リーガ
            'FL1': 61      // リーグ・アン
        };
        
        const leagueId = leagueIds[leagueCode] || 39;
        const url = `https://v3.football.api-sports.io/players?id=${playerId}&league=${leagueId}&season=${season}`;
        console.log('🌐 API-Football v3 選手統計URL:', url);
        
        const response = await fetch(url, {
            headers: {
                'x-rapidapi-host': 'v3.football.api-sports.io',
                'x-rapidapi-key': apiKey
            }
        });
        
        console.log('📡 API-Football v3 選手統計レスポンス:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.log('❌ API-Football v3 選手統計エラーレスポンス:', errorData);
            
            if (response.status === 403) {
                throw new Error(`API-Football v3 権限エラー: ${errorData.message || 'リーグへのアクセス権限がありません'}`);
            }
            
            throw new Error(`API-Football v3 選手統計エラー: ${response.status} - ${errorData.message || response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📊 API-Football v3 選手統計データ:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
        
        if (data.response && data.response.length > 0) {
            const playerData = data.response[0];
            const stats = playerData.statistics[0];
            
            return {
                id: playerData.player.id,
                name: playerData.player.name,
                age: playerData.player.age,
                nationality: playerData.player.nationality,
                height: playerData.player.height,
                weight: playerData.player.weight,
                position: stats.games?.position || 'Unknown',
                team: stats.team?.name || 'Unknown',
                league: stats.league?.name || 'Unknown',
                season: stats.league?.season || season,
                games: {
                    appearances: stats.games?.appearences || 0,
                    lineups: stats.games?.lineups || 0,
                    minutes: stats.games?.minutes || 0,
                    number: stats.games?.number || 0,
                    rating: stats.games?.rating || '0.0',
                    captain: stats.games?.captain || false
                },
                goals: {
                    total: stats.goals?.total || 0,
                    assists: stats.goals?.assists || 0,
                    conceded: stats.goals?.conceded || 0
                },
                shots: {
                    total: stats.shots?.total || 0,
                    on: stats.shots?.on || 0
                },
                passes: {
                    total: stats.passes?.total || 0,
                    key: stats.passes?.key || 0,
                    accuracy: stats.passes?.accuracy || '0%'
                },
                tackles: {
                    total: stats.tackles?.total || 0,
                    blocks: stats.tackles?.blocks || 0,
                    interceptions: stats.tackles?.interceptions || 0
                },
                duels: {
                    total: stats.duels?.total || 0,
                    won: stats.duels?.won || 0
                },
                dribbles: {
                    attempts: stats.dribbles?.attempts || 0,
                    success: stats.dribbles?.success || 0
                },
                fouls: {
                    drawn: stats.fouls?.drawn || 0,
                    committed: stats.fouls?.committed || 0
                },
                cards: {
                    yellow: stats.cards?.yellow || 0,
                    red: stats.cards?.red || 0
                },
                penalty: {
                    won: stats.penalty?.won || 0,
                    scored: stats.penalty?.scored || 0,
                    missed: stats.penalty?.missed || 0
                },
                source: 'API-Football v3 Pro'
            };
        }
        
        return null;
    } catch (error) {
        console.error('API-Football v3 選手統計エラー:', error);
        return null;
    }
}

// football-data.orgからチーム統計を取得
async function getFootballDataTeamStats(teamId, season, leagueCode = 'J1') {
    try {
        const apiKey = process.env.FOOTBALL_DATA_API_KEY;
        console.log('🔑 football-data.org キー確認:', apiKey ? `${apiKey.substring(0, 8)}...` : '未設定');
        
        if (!apiKey) {
            throw new Error('FOOTBALL_DATA_API_KEYが設定されていません');
        }
        
        // リーグコードに応じてリーグIDを設定
        const leagueIds = {
            'J1': 2152,    // J1リーグ
            'PL': 2021,    // プレミアリーグ
            'BL1': 2002,   // ブンデスリーガ
            'SA': 2019,    // セリエA
            'PD': 2014,    // ラ・リーガ
            'FL1': 2015    // リーグ・アン
        };
        
        const leagueId = leagueIds[leagueCode] || 2152; // デフォルトはJ1リーグ
        console.log('🌐 football-data.org リーグID:', leagueId);
        
        // リーグの順位表から統計を取得（これが正しい方法）
        const standingsUrl = `https://api.football-data.org/v4/competitions/${leagueId}/standings`;
        console.log('🌐 football-data.org Standings URL:', standingsUrl);
        
        // シーズンの統一（2024 → 2025）
        const unifiedSeason = season === '2024' ? '2025' : season;
        console.log(`📅 シーズン統一: ${season} → ${unifiedSeason}`);
        
        // チームIDマッピング（API-Football v3 → football-data.org）
        const teamIdMapping = {
            // プレミアリーグ
            50: 65,   // マンチェスター・シティ
            42: 57,   // アーセナル
            40: 64,   // リバプール
            33: 66,   // マンチェスター・ユナイテッド
            49: 61,   // チェルシー
            47: 73,   // トッテナム
            34: 67,   // ニューカッスル・ユナイテッド
            48: 563,  // ウェストハム・ユナイテッド
            51: 397,  // ブライトン・アンド・ホーヴ・アルビオン
            66: 58    // アストン・ヴィラ
        };
        
        // チームIDを変換
        const mappedTeamId = teamIdMapping[parseInt(teamId)] || teamId;
        console.log(`🔍 チームID変換: ${teamId} → ${mappedTeamId}`);
        const standingsResponse = await fetch(standingsUrl, {
            headers: {
                'X-Auth-Token': apiKey
            }
        });
        
        console.log('📡 football-data.org Standings レスポンス:', standingsResponse.status, standingsResponse.statusText);
        
        if (standingsResponse.ok) {
            const standingsData = await standingsResponse.json();
            console.log('📊 football-data.org Standings データ:', JSON.stringify(standingsData, null, 2).substring(0, 500) + '...');
            
            console.log('🔍 チームID検索:', teamId, 'vs', standingsData.standings[0]?.table?.map(t => t.team.id));
            
            const teamStanding = standingsData.standings[0].table.find(t => t.team.id === parseInt(mappedTeamId));
            console.log(`🎯 見つかったチーム (ID: ${mappedTeamId}):`, teamStanding ? teamStanding.team.name : '見つかりません');
            
            if (teamStanding) {
                console.log('📈 チーム統計:', {
                    goals: teamStanding.goalsFor,
                    cleanSheets: teamStanding.cleanSheets,
                    wins: teamStanding.won,
                    draws: teamStanding.draw,
                    losses: teamStanding.lost
                });
                
                return {
                    goals: teamStanding.goalsFor || 0,
                    shotAccuracy: 65, // デフォルト値（Standings APIには含まれていない）
                    possession: 52, // デフォルト値（Standings APIには含まれていない）
                    cleanSheets: teamStanding.cleanSheets || 0,
                    expectedGoals: 1.2, // デフォルト値（Standings APIには含まれていない）
                    predictionAccuracy: 70, // デフォルト値
                    performance: {
                        dates: ['8月', '9月', '10月', '11月', '12月'],
                        goals: [5, 8, 12, 15, 18],
                        assists: [3, 6, 9, 11, 14]
                    },
                    source: 'football-data.org'
                };
            }
        }
        
        return null;
    } catch (error) {
        console.error('football-data.org エラー:', error);
        return null;
    }
}

// フォールバックチーム統計を生成
function generateFallbackTeamStats() {
    return {
        goals: Math.floor(Math.random() * 50) + 30,
        shotAccuracy: Math.floor(Math.random() * 30) + 60,
        possession: Math.floor(Math.random() * 20) + 45,
        cleanSheets: Math.floor(Math.random() * 10) + 5,
        expectedGoals: Math.random() * 2 + 1,
        predictionAccuracy: Math.floor(Math.random() * 20) + 70,
        performance: {
            dates: ['8月', '9月', '10月', '11月', '12月'],
            goals: [5, 8, 12, 15, 18],
            assists: [3, 6, 9, 11, 14]
        },
        source: 'フォールバックデータ'
    };
}

// フォールバック選手統計生成
function generateFallbackPlayerStats(playerId, teamId) {
    const positions = ['FW', 'MF', 'DF', 'GK'];
    const position = positions[Math.floor(Math.random() * positions.length)];
    
    return {
        id: playerId,
        name: `選手${playerId}`,
        age: Math.floor(Math.random() * 15) + 20,
        nationality: 'Unknown',
        height: `${Math.floor(Math.random() * 20) + 170} cm`,
        weight: `${Math.floor(Math.random() * 20) + 70} kg`,
        position: position,
        team: `チーム${teamId}`,
        league: 'Unknown',
        season: 2024,
        games: {
            appearances: Math.floor(Math.random() * 30) + 10,
            lineups: Math.floor(Math.random() * 25) + 8,
            minutes: Math.floor(Math.random() * 2000) + 500,
            number: Math.floor(Math.random() * 99) + 1,
            rating: (Math.random() * 3 + 6).toFixed(2),
            captain: Math.random() > 0.8
        },
        goals: {
            total: Math.floor(Math.random() * 20) + 5,
            assists: Math.floor(Math.random() * 15) + 3,
            conceded: position === 'GK' ? Math.floor(Math.random() * 30) + 20 : 0
        },
        shots: {
            total: Math.floor(Math.random() * 50) + 20,
            on: Math.floor(Math.random() * 30) + 15
        },
        passes: {
            total: Math.floor(Math.random() * 500) + 200,
            key: Math.floor(Math.random() * 30) + 10,
            accuracy: `${Math.floor(Math.random() * 20) + 75}%`
        },
        tackles: {
            total: Math.floor(Math.random() * 40) + 20,
            blocks: Math.floor(Math.random() * 15) + 5,
            interceptions: Math.floor(Math.random() * 25) + 10
        },
        duels: {
            total: Math.floor(Math.random() * 100) + 50,
            won: Math.floor(Math.random() * 60) + 30
        },
        dribbles: {
            attempts: Math.floor(Math.random() * 30) + 15,
            success: Math.floor(Math.random() * 20) + 10
        },
        fouls: {
            drawn: Math.floor(Math.random() * 15) + 5,
            committed: Math.floor(Math.random() * 10) + 3
        },
        cards: {
            yellow: Math.floor(Math.random() * 8) + 2,
            red: Math.floor(Math.random() * 3) + 0
        },
        penalty: {
            won: Math.floor(Math.random() * 5) + 1,
            scored: Math.floor(Math.random() * 4) + 1,
            missed: Math.floor(Math.random() * 2) + 0
        },
        source: 'フォールバックデータ'
    };
}

// フォールバックデータ
function getFallbackComparisonData() {
    return {
        league: 'J1',
        season: '2024',
        leagueAverages: getFallbackLeagueAverages(),
        team: null,
        player: null,
        players: []
    };
}

function getFallbackLeagueAverages() {
    return {
        goals: 45,
        assists: 35,
        shots: 12,
        possession: 52,
        cleanSheets: 8,
        expectedGoals: 1.2
    };
}

function getFallbackTeams() {
    return [
        { id: 1, name: '鹿島アントラーズ' },
        { id: 2, name: '浦和レッズ' },
        { id: 3, name: 'FC東京' }
    ];
}

function getFallbackPlayers() {
    return [
        { id: 1, name: '選手A', position: 'FW', stats: { goals: 15, assists: 8, shotAccuracy: 65, passAccuracy: 78, tackles: 12, interceptions: 5 } },
        { id: 2, name: '選手B', position: 'MF', stats: { goals: 8, assists: 15, shotAccuracy: 45, passAccuracy: 85, tackles: 25, interceptions: 18 } }
    ];
}

function getFallbackUpcomingMatches() {
    return [
        {
            id: 1,
            homeTeam: { name: '鹿島アントラーズ' },
            awayTeam: { name: '浦和レッズ' },
            competition: { name: 'J1リーグ' },
            utcDate: new Date().toISOString()
        }
    ];
}

function getFallbackPredictions() {
    return [
        {
            id: 1,
            homeTeam: '鹿島アントラーズ',
            awayTeam: '浦和レッズ',
            league: 'J1リーグ',
            date: new Date().toISOString(),
            predictedResult: 'ホーム勝利',
            confidence: 65,
            homeWinProb: 65,
            drawProb: 20,
            awayWinProb: 15
        }
    ];
}

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

app.get('/plans', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'plans.html'));
});

app.get('/schedule', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'schedule.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});