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
        res.json(result);
    } catch (error) {
        console.error('Error searching players:', error);
        res.status(500).json({ error: 'Failed to search players' });
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

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});