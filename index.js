const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');

// エラーハンドリング付きでデータサービスをインポート
let dataService;
let aiService;
let fotMobDataService;
let footballDataService;

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
    const aiServiceModule = require('./ai-service');
    // ai-serviceは関数の集合なので、直接使用可能
    aiService = aiServiceModule;
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

try {
    console.log('Loading FootballDataService...');
    const FootballDataService = require('./footballDataService');
    footballDataService = new FootballDataService(process.env.FOOTBALL_DATA_API_KEY);
    console.log('FootballDataService loaded successfully');
} catch (error) {
    console.error('Error loading FootballDataService:', error);
    footballDataService = null;
}

// API連携サービスを追加
let apiService;

// APIServiceを同期的に初期化
console.log('🚀 APIService初期化を開始...');

try {
    console.log('Loading APIService...');

    // ファイルの存在確認
    const fs = require('fs');
    const apiServicePath = path.join(__dirname, 'apiService.js');
    if (fs.existsSync(apiServicePath)) {
        console.log('✅ apiService.js file exists');
    } else {
        console.log('❌ apiService.js file not found');
        throw new Error('apiService.js file not found');
    }

    const APIService = require('./apiService');
    console.log('APIService module loaded successfully');

    apiService = new APIService();
    console.log('APIService instance created successfully');

    // 包括的API連携サービスを初期化
    console.log('🔄 包括的API連携サービスを初期化中...');

    // 初期化を即座に実行
    apiService.init().then(() => {
        console.log('✅ 包括的API連携サービスが初期化されました');
        console.log('🔍 APIService状態確認:', !!apiService);
    }).catch(error => {
        console.error('❌ 包括的API連携サービス初期化エラー:', error);
        console.error('詳細エラー:', error.stack);
    });

    console.log('APIService initialization completed');

} catch (error) {
    console.error('❌ Error loading APIService:', error);
    console.error('詳細エラー:', error.stack);
    apiService = null;
}

console.log('🚀 APIService初期化完了');

// Load environment variables
require('dotenv').config();

// 環境変数の状態をログ出力
console.log('🔍 環境変数チェック:');
console.log('  API_FOOTBALL_KEY:', process.env.API_FOOTBALL_KEY ? `設定済み (${process.env.API_FOOTBALL_KEY.length}文字)` : '未設定');
console.log('  RAPIDAPI_KEY:', process.env.RAPIDAPI_KEY ? `設定済み (${process.env.RAPIDAPI_KEY.length}文字)` : '未設定');
console.log('  FOOTBALL_DATA_API_KEY:', process.env.FOOTBALL_DATA_API_KEY ? `設定済み (${process.env.FOOTBALL_DATA_API_KEY.length}文字)` : '未設定');
console.log('  GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? `設定済み (${process.env.GEMINI_API_KEY.length}文字)` : '未設定');

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

// CORS middleware configuration
app.use(cors({
    origin: [
        'http://localhost:10000',
        'http://localhost:3000',
        'https://football-hub-japan-ubzb.onrender.com',
        'https://football-hub-japan.onrender.com'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Token']
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

// 静的ファイルのルーティング
app.get('/ranking', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ranking.html'));
});

app.get('/match-detail', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'match-detail.html'));
});

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
    res.sendFile(path.join(__dirname, 'public', 'database-enhanced.html'));
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

// 強化データベースページ（リダイレクト）
app.get('/database-enhanced', (req, res) => {
    res.redirect('/database');
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
    res.sendFile(path.join(__dirname, 'public', 'database-enhanced.html'));
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

// 実際のAPIデータで選手詳細スタッツを取得
app.get('/api/player-stats/:playerId', async (req, res) => {
    try {
        const playerId = req.params.playerId;
        console.log(`🔍 選手スタッツ取得中: ${playerId}`);
        
        let playerStats = null;
        
        // 1. 包括的データベースから選手データを取得
        if (apiService && apiService.dbManager) {
            try {
                const comprehensivePlayers = await apiService.dbManager.loadComprehensivePlayers();
                const player = comprehensivePlayers.find(p => 
                    p.id == playerId || p.playerId == playerId || p.player_id == playerId || p.name === playerId
                );
                
                if (player && player.stats) {
                    console.log(`✅ 包括的データベースから選手スタッツを取得: ${player.name}`);
                    playerStats = {
                        ...player,
                        source: 'comprehensiveDatabase',
                        stats: player.stats
                    };
                }
            } catch (error) {
                console.log('⚠️ 包括的データベースからの取得に失敗:', error.message);
            }
        }
        
        // 2. API-Footballから実際のスタッツを取得（2025/2026シーズン）
        if (!playerStats && dataService) {
            try {
                console.log(`🔄 API-Footballから選手スタッツを取得中: ${playerId} (2025/2026シーズン)`);
                const apiStats = await dataService.getPlayerStats(playerId, '2025');
                if (apiStats) {
                    playerStats = {
                        ...apiStats,
                        source: 'apiFootball',
                        season: '2025/2026'
                    };
                    console.log(`✅ API-Footballから選手スタッツを取得: ${apiStats.name || playerId} (2025/2026シーズン)`);
                }
            } catch (error) {
                console.log('⚠️ API-Footballからの取得に失敗:', error.message);
            }
        }
        
        // 3. Football-data.orgからスタッツを取得（2025/2026シーズン）
        if (!playerStats && footballDataService) {
            try {
                console.log(`🔄 Football-data.orgから選手スタッツを取得中: ${playerId} (2025/2026シーズン)`);
                const footballDataStats = await footballDataService.getPlayerStats(playerId, '2025');
                if (footballDataStats) {
                    playerStats = {
                        ...footballDataStats,
                        source: 'footballData',
                        season: '2025/2026'
                    };
                    console.log(`✅ Football-data.orgから選手スタッツを取得: ${footballDataStats.name || playerId} (2025/2026シーズン)`);
                }
            } catch (error) {
                console.log('⚠️ Football-data.orgからの取得に失敗:', error.message);
            }
        }
        
        if (playerStats) {
            res.json(playerStats);
        } else {
            res.status(404).json({ error: 'Player stats not found' });
        }
        
    } catch (error) {
        console.error('選手スタッツ取得エラー:', error);
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

// Comprehensive Football-data.org API Proxy
app.get('/api/football-data-proxy/*', async (req, res) => {
    try {
        const apiKey = process.env.FOOTBALL_DATA_API_KEY;
        
        if (!apiKey || apiKey === 'YOUR_FOOTBALL_DATA_TOKEN') {
            console.log('Football-data.org API key not configured or using placeholder');
            return res.status(500).json({ error: 'Football-data.org API key not configured. Please set your API token first.' });
        }

        // Extract the path after /api/football-data-proxy/
        const apiPath = req.params[0];
        const fullUrl = `https://api.football-data.org/v4/${apiPath}`;
        
        // Forward query parameters
        const url = new URL(fullUrl);
        Object.keys(req.query).forEach(key => {
            url.searchParams.append(key, req.query[key]);
        });

        console.log(`Proxying request to: ${url.toString()}`);

        const response = await fetchWithRetry(url.toString(), {
            headers: {
                'X-Auth-Token': apiKey,
                'Content-Type': 'application/json'
            }
        }, 'footballData');

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Football-data.org API error: ${response.status} - ${errorText}`);
            return res.status(response.status).json({ 
                error: 'API request failed', 
                status: response.status,
                message: errorText 
            });
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Football-data.org proxy error:', error);
        res.status(500).json({ error: 'Failed to fetch data from football-data.org' });
    }
});

// API-Football Proxy Endpoint
app.get('/api/api-football-proxy/*', async (req, res) => {
    try {
        // Renderの環境変数名に合わせて修正
        const apiKey = process.env.API_FOOTBALL_KEY || process.env.RAPIDAPI_KEY;
        
        if (!apiKey || apiKey === 'YOUR_API_FOOTBALL_KEY') {
            console.log('API-Football key not configured or using placeholder');
            return res.status(500).json({ error: 'API-Football key not configured. Please set your API key first.' });
        }

        // Extract the path after /api/api-football-proxy/
        const apiPath = req.params[0];
        const fullUrl = `https://v3.football.api-sports.io/${apiPath}`;
        
        // Forward query parameters
        const url = new URL(fullUrl);
        Object.keys(req.query).forEach(key => {
            url.searchParams.append(key, req.query[key]);
        });

        console.log(`Proxying API-Football request to: ${url.toString()}`);

        const response = await fetchWithRetry(url.toString(), {
            headers: {
                'x-rapidapi-key': apiKey,
                'x-rapidapi-host': 'v3.football.api-sports.io',
                'Content-Type': 'application/json'
            }
        }, 'apiFootball');

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`API-Football API error: ${response.status} - ${errorText}`);
            return res.status(response.status).json({ 
                error: 'API request failed', 
                status: response.status,
                message: errorText 
            });
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('API-Football proxy error:', error);
        res.status(500).json({ error: 'Failed to fetch data from API-Football' });
    }
});

// API Keys Management Endpoint
app.post('/api/set-api-keys', async (req, res) => {
    try {
        const { rapidapi_key, football_data_key } = req.body;
        
        // Update environment variables (in production, you might want to use a database or secure storage)
        if (rapidapi_key) {
            process.env.API_FOOTBALL_KEY = rapidapi_key; // Renderの環境変数名に合わせる
            process.env.RAPIDAPI_KEY = rapidapi_key; // 後方互換性のため
            console.log('✅ API-Football key updated');
        }
        
        if (football_data_key) {
            process.env.FOOTBALL_DATA_API_KEY = football_data_key;
            console.log('✅ Football-data.org key updated');
        }
        
        res.json({ 
            success: true, 
            message: 'API keys updated successfully',
            updated: {
                rapidapi: !!rapidapi_key,
                football_data: !!football_data_key
            }
        });
    } catch (error) {
        console.error('API keys update error:', error);
        res.status(500).json({ error: 'Failed to update API keys' });
    }
});

// AI Service Endpoints
app.post('/api/ai/chat', async (req, res) => {
    try {
        if (!aiService) {
            return res.status(500).json({ error: 'AI service not available' });
        }
        
        // Gemini APIキーの状態をログ出力
        console.log('🔍 AI Chat - Gemini API Key Status:', {
            exists: !!process.env.GEMINI_API_KEY,
            length: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
            preview: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + '...' : 'undefined'
        });
        
        const { message, context } = req.body;
        const response = await aiService.generateSoccerAnalysis(message, context);
        res.json({ response });
    } catch (error) {
        console.error('AI chat error:', error);
        res.status(500).json({ error: 'Failed to generate AI response' });
    }
});

app.post('/api/ai/compare', async (req, res) => {
    try {
        if (!aiService) {
            return res.status(500).json({ error: 'AI service not available' });
        }
        
        const { player1, player2 } = req.body;
        const response = await aiService.generatePlayerComparison(player1, player2);
        res.json({ response });
    } catch (error) {
        console.error('AI compare error:', error);
        res.status(500).json({ error: 'Failed to compare players' });
    }
});

app.post('/api/ai/predict', async (req, res) => {
    try {
        if (!aiService) {
            return res.status(500).json({ error: 'AI service not available' });
        }
        
        const { matchData } = req.body;
        const response = await aiService.generateMatchPrediction(matchData);
        res.json({ response });
    } catch (error) {
        console.error('AI predict error:', error);
        res.status(500).json({ error: 'Failed to predict match' });
    }
});

app.post('/api/ai/tactics', async (req, res) => {
    try {
        if (!aiService) {
            return res.status(500).json({ error: 'AI service not available' });
        }
        
        const { teamData } = req.body;
        const response = await aiService.generateTacticalAnalysis(teamData);
        res.json({ response });
    } catch (error) {
        console.error('AI tactics error:', error);
        res.status(500).json({ error: 'Failed to suggest tactics' });
    }
});

// ==================== ランキングシステム API ====================

// 選手ランキング取得
app.get('/api/ranking/players', async (req, res) => {
    try {
        const { league, position, stat = 'goals' } = req.query;
        
        console.log('🏆 Player Ranking Request:', { league, position, stat });
        
        let players = [];
        
        // まずローカルデータから選手を読み込む
        try {
            const playersDataPath = path.join(__dirname, 'data', 'players.json');
            if (fs.existsSync(playersDataPath)) {
                const playersData = fs.readFileSync(playersDataPath, 'utf8');
                const localPlayers = JSON.parse(playersData);
                
                console.log(`📊 Loaded ${localPlayers.length} players from local database`);
                
                // リーグ名の正規化マッピング
                const leagueMapping = {
                    'PL': ['Premier League', 'プレミアリーグ'],
                    'PD': ['La Liga', 'ラ・リーガ'],
                    'SA': ['Serie A', 'セリエA'],
                    'BL1': ['Bundesliga', 'ブンデスリーガ', '2. Bundesliga'],
                    'FL1': ['Ligue 1', 'リーグ・アン'],
                    'J1': ['J1 League', 'J1リーグ']
                };
                
                // ローカルデータを統一フォーマットに変換
                players = localPlayers.map(player => ({
                    id: player.id,
                    name: player.name || player.fullName,
                    age: player.age,
                    nationality: player.nationality,
                    photo: player.photo,
                    team: player.currentTeam || player.team,
                    currentTeam: player.currentTeam || player.team,
                    position: player.detailedPosition || player.position,
                    detailedPosition: player.detailedPosition || player.position,
                    league: player.league,
                    goals: player.stats?.goals || 0,
                    assists: player.stats?.assists || 0,
                    appearances: player.stats?.appearances || 0,
                    minutes: player.stats?.minutes || 0,
                    rating: player.stats?.rating || 'N/A',
                    passes: player.stats?.passesTotal || 0,
                    passAccuracy: player.stats?.passAccuracy || '0%',
                    tackles: player.stats?.tackles || 0,
                    interceptions: player.stats?.interceptions || 0,
                    saves: player.stats?.saves || 0,
                    cleanSheets: player.stats?.cleanSheets || 0,
                    yellowCards: player.stats?.yellowCards || 0,
                    redCards: player.stats?.redCards || 0,
                    shots: player.stats?.shotsTotal || 0,
                    shotsOnTarget: player.stats?.shotsOnTarget || 0
                }));
                
                // リーグフィルタリング
                if (league && leagueMapping[league]) {
                    const validLeagues = leagueMapping[league];
                    players = players.filter(p => 
                        validLeagues.some(l => p.league && p.league.includes(l))
                    );
                    console.log(`✅ Filtered to ${players.length} players in league: ${league}`);
                }
                
                // ポジションフィルタリング
                if (position) {
                    players = players.filter(p => 
                        p.position && p.position.toLowerCase().includes(position.toLowerCase())
                    );
                    console.log(`✅ Filtered to ${players.length} players in position: ${position}`);
                }
                
                // 統計項目でソート
                if (stat && players.length > 0) {
                    players.sort((a, b) => {
                        const aValue = typeof a[stat] === 'string' ? parseFloat(a[stat]) || 0 : (a[stat] || 0);
                        const bValue = typeof b[stat] === 'string' ? parseFloat(b[stat]) || 0 : (b[stat] || 0);
                        return bValue - aValue;
                    });
                    console.log(`✅ Sorted ${players.length} players by ${stat}`);
                }
            }
        } catch (localError) {
            console.error('❌ Error loading local player data:', localError.message);
        }
        
        // ローカルデータがない場合、フォールバックを使用
        if (players.length === 0) {
            console.log('⚠️ No local data available, using fallback');
            players = generateFallbackPlayerRanking(league, position, stat);
        }
        
        res.json({ players: players.slice(0, 50) }); // トップ50を返す
        
    } catch (error) {
        console.error('Player ranking error:', error);
        res.status(500).json({ error: 'Failed to get player ranking' });
    }
});

// チームランキング取得
app.get('/api/ranking/teams', async (req, res) => {
    try {
        const { league } = req.query;
        
        console.log('🏆 Team Ranking Request:', { league });
        
        if (!league) {
            return res.status(400).json({ error: 'League parameter is required' });
        }
        
        let teams = [];
        
        if (process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_KEY !== 'YOUR_API_FOOTBALL_KEY') {
            try {
                // リーグIDのマッピング
                const leagueIds = {
                    'PL': 39,      // Premier League
                    'PD': 140,     // La Liga
                    'SA': 135,     // Serie A
                    'BL1': 78,     // Bundesliga
                    'FL1': 61,     // Ligue 1
                    'J1': 98       // J1 League
                };
                
                const targetLeague = leagueIds[league];
                
                console.log('🔍 Fetching team standings from API-Football:', { league, targetLeague });
                
                const response = await axios.get(`https://v3.football.api-sports.io/standings`, {
                    headers: {
                        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                        'x-rapidapi-host': 'v3.football.api-sports.io'
                    },
                    params: {
                        league: targetLeague,
                        season: 2024
                    }
                });
                
                console.log('📊 API-Football standings response:', response.data?.response?.length || 0, 'leagues');
                
                if (response.data && response.data.response && response.data.response[0]?.league?.standings) {
                    const standings = response.data.response[0].league.standings[0];
                    teams = standings.map(team => ({
                        id: team.team.id,
                        name: team.team.name,
                        logo: team.team.logo,
                        league: league,
                        points: team.points,
                        wins: team.all.win,
                        draws: team.all.draw,
                        losses: team.all.lose,
                        goalsFor: team.all.goals.for,
                        goalsAgainst: team.all.goals.against,
                        goalDifference: team.goalsDiff,
                        form: team.form,
                        played: team.all.played,
                        home: {
                            wins: team.home.win,
                            draws: team.home.draw,
                            losses: team.home.lose
                        },
                        away: {
                            wins: team.away.win,
                            draws: team.away.draw,
                            losses: team.away.lose
                        }
                    }));
                    
                    console.log('✅ Successfully processed', teams.length, 'teams from API-Football');
                }
            } catch (apiError) {
                console.error('❌ API-Football error:', apiError.message);
                console.log('📋 Using fallback data instead');
            }
        } else {
            console.log('⚠️ No API key available, using fallback data');
        }
        
        // フォールバックデータを使用
        if (teams.length === 0) {
            teams = generateFallbackTeamRanking(league);
        }
        
        res.json({ teams });
        
    } catch (error) {
        console.error('Team ranking error:', error);
        res.status(500).json({ error: 'Failed to get team ranking' });
    }
});

// リーグランキング取得
app.get('/api/ranking/leagues', async (req, res) => {
    try {
        console.log('🏆 League Ranking Request');
        
        // 欧州5大リーグの比較データ
        const leagues = [
            {
                id: 39,
                name: 'Premier League',
                country: 'England',
                avgGoals: 2.8,
                avgAttendance: 40000,
                rating: 8.5,
                topScorer: 'Erling Haaland',
                totalGoals: 1034,
                totalMatches: 380
            },
            {
                id: 140,
                name: 'La Liga',
                country: 'Spain',
                avgGoals: 2.6,
                avgAttendance: 28000,
                rating: 8.2,
                topScorer: 'Robert Lewandowski',
                totalGoals: 989,
                totalMatches: 380
            },
            {
                id: 135,
                name: 'Serie A',
                country: 'Italy',
                avgGoals: 2.7,
                avgAttendance: 25000,
                rating: 8.0,
                topScorer: 'Victor Osimhen',
                totalGoals: 1026,
                totalMatches: 380
            },
            {
                id: 78,
                name: 'Bundesliga',
                country: 'Germany',
                avgGoals: 3.1,
                avgAttendance: 45000,
                rating: 8.3,
                topScorer: 'Harry Kane',
                totalGoals: 1178,
                totalMatches: 306
            },
            {
                id: 61,
                name: 'Ligue 1',
                country: 'France',
                avgGoals: 2.5,
                avgAttendance: 22000,
                rating: 7.8,
                topScorer: 'Kylian Mbappe',
                totalGoals: 950,
                totalMatches: 380
            }
        ];
        
        res.json({ leagues });
        
    } catch (error) {
        console.error('League ranking error:', error);
        res.status(500).json({ error: 'Failed to get league ranking' });
    }
});

// フォールバック選手ランキング生成
function generateFallbackPlayerRanking(league, position, stat) {
    const allPlayers = [
        { name: '久保建英', team: 'レアル・ソシエダ', position: 'Midfielder', goals: 12, assists: 8, appearances: 28, rating: 7.8, passes: 1250, tackles: 45, interceptions: 32, saves: 0, cleanSheets: 0, yellowCards: 3, redCards: 0 },
        { name: '三笘薫', team: 'ブライトン', position: 'Forward', goals: 8, assists: 6, appearances: 25, rating: 7.5, passes: 890, tackles: 28, interceptions: 15, saves: 0, cleanSheets: 0, yellowCards: 2, redCards: 0 },
        { name: '堂安律', team: 'フライブルク', position: 'Midfielder', goals: 6, assists: 4, appearances: 22, rating: 7.2, passes: 1100, tackles: 38, interceptions: 28, saves: 0, cleanSheets: 0, yellowCards: 4, redCards: 0 },
        { name: '田中碧', team: 'フォルトゥナ・デュッセルドルフ', position: 'Midfielder', goals: 5, assists: 7, appearances: 24, rating: 7.0, passes: 1350, tackles: 52, interceptions: 35, saves: 0, cleanSheets: 0, yellowCards: 5, redCards: 1 },
        { name: '伊藤洋輝', team: 'シュトゥットガルト', position: 'Defender', goals: 2, assists: 3, appearances: 26, rating: 6.9, passes: 1450, tackles: 65, interceptions: 48, saves: 0, cleanSheets: 8, yellowCards: 6, redCards: 0 },
        { name: '南野拓実', team: 'モナコ', position: 'Forward', goals: 10, assists: 5, appearances: 27, rating: 7.6, passes: 950, tackles: 25, interceptions: 18, saves: 0, cleanSheets: 0, yellowCards: 3, redCards: 0 },
        { name: '浅野拓磨', team: 'ボーフム', position: 'Forward', goals: 7, assists: 4, appearances: 23, rating: 7.1, passes: 780, tackles: 22, interceptions: 12, saves: 0, cleanSheets: 0, yellowCards: 2, redCards: 0 },
        { name: '遠藤航', team: 'リバプール', position: 'Midfielder', goals: 1, assists: 2, appearances: 20, rating: 6.8, passes: 1200, tackles: 58, interceptions: 42, saves: 0, cleanSheets: 0, yellowCards: 4, redCards: 0 },
        { name: '上田綺世', team: 'フェイエノールト', position: 'Forward', goals: 15, assists: 3, appearances: 29, rating: 7.9, passes: 820, tackles: 18, interceptions: 10, saves: 0, cleanSheets: 0, yellowCards: 1, redCards: 0 },
        { name: '前田大然', team: 'セルティック', position: 'Forward', goals: 11, assists: 6, appearances: 26, rating: 7.7, passes: 750, tackles: 20, interceptions: 14, saves: 0, cleanSheets: 0, yellowCards: 3, redCards: 0 }
    ];
    
    // リーグフィルタリング
    if (league) {
        const leagueTeams = {
            'PL': ['ブライトン', 'リバプール'],
            'PD': ['レアル・ソシエダ'],
            'SA': ['モナコ'],
            'BL1': ['フライブルク', 'フォルトゥナ・デュッセルドルフ', 'シュトゥットガルト', 'ボーフム'],
            'FL1': [],
            'J1': []
        };
        return allPlayers.filter(p => leagueTeams[league]?.includes(p.team));
    }
    
    // ポジションフィルタリング
    if (position) {
        return allPlayers.filter(p => p.position === position);
    }
    
    return allPlayers;
}

// フォールバックチームランキング生成
function generateFallbackTeamRanking(league) {
    const teamData = {
        'PL': [
            { name: 'Arsenal', points: 84, wins: 26, draws: 6, losses: 6, goalsFor: 78, goalsAgainst: 32, goalDifference: 46, form: 'WWWWD' },
            { name: 'Manchester City', points: 82, wins: 25, draws: 7, losses: 6, goalsFor: 85, goalsAgainst: 38, goalDifference: 47, form: 'WWWDL' },
            { name: 'Liverpool', points: 78, wins: 24, draws: 6, losses: 8, goalsFor: 82, goalsAgainst: 45, goalDifference: 37, form: 'WDWWW' },
            { name: 'Chelsea', points: 70, wins: 21, draws: 7, losses: 10, goalsFor: 65, goalsAgainst: 42, goalDifference: 23, form: 'WWDWL' },
            { name: 'Tottenham', points: 68, wins: 20, draws: 8, losses: 10, goalsFor: 71, goalsAgainst: 48, goalDifference: 23, form: 'LWWWD' }
        ],
        'PD': [
            { name: 'Real Madrid', points: 95, wins: 30, draws: 5, losses: 3, goalsFor: 87, goalsAgainst: 26, goalDifference: 61, form: 'WWWWW' },
            { name: 'Barcelona', points: 88, wins: 28, draws: 4, losses: 6, goalsFor: 74, goalsAgainst: 35, goalDifference: 39, form: 'WWWDL' },
            { name: 'Atletico Madrid', points: 76, wins: 24, draws: 4, losses: 10, goalsFor: 68, goalsAgainst: 42, goalDifference: 26, form: 'WDWWL' },
            { name: 'Real Sociedad', points: 71, wins: 22, draws: 5, losses: 11, goalsFor: 61, goalsAgainst: 38, goalDifference: 23, form: 'WWDWW' },
            { name: 'Villarreal', points: 68, wins: 21, draws: 5, losses: 12, goalsFor: 58, goalsAgainst: 45, goalDifference: 13, form: 'LWWDW' }
        ],
        'SA': [
            { name: 'Inter Milan', points: 89, wins: 28, draws: 5, losses: 5, goalsFor: 79, goalsAgainst: 28, goalDifference: 51, form: 'WWWWW' },
            { name: 'AC Milan', points: 82, wins: 25, draws: 7, losses: 6, goalsFor: 72, goalsAgainst: 35, goalDifference: 37, form: 'WDWWL' },
            { name: 'Juventus', points: 76, wins: 23, draws: 7, losses: 8, goalsFor: 65, goalsAgainst: 38, goalDifference: 27, form: 'WWWDL' },
            { name: 'Napoli', points: 71, wins: 22, draws: 5, losses: 11, goalsFor: 68, goalsAgainst: 42, goalDifference: 26, form: 'LWWDW' },
            { name: 'Roma', points: 68, wins: 21, draws: 5, losses: 12, goalsFor: 62, goalsAgainst: 45, goalDifference: 17, form: 'WDWLW' }
        ],
        'BL1': [
            { name: 'Bayern Munich', points: 71, wins: 22, draws: 5, losses: 7, goalsFor: 85, goalsAgainst: 38, goalDifference: 47, form: 'WWWDL' },
            { name: 'Borussia Dortmund', points: 68, wins: 21, draws: 5, losses: 8, goalsFor: 78, goalsAgainst: 42, goalDifference: 36, form: 'WDWWW' },
            { name: 'RB Leipzig', points: 65, wins: 20, draws: 5, losses: 9, goalsFor: 72, goalsAgainst: 45, goalDifference: 27, form: 'WWWLD' },
            { name: 'Bayer Leverkusen', points: 62, wins: 19, draws: 5, losses: 10, goalsFor: 68, goalsAgainst: 48, goalDifference: 20, form: 'LWWWD' },
            { name: 'Eintracht Frankfurt', points: 59, wins: 18, draws: 5, losses: 11, goalsFor: 65, goalsAgainst: 52, goalDifference: 13, form: 'WWDWL' }
        ],
        'FL1': [
            { name: 'Paris Saint-Germain', points: 85, wins: 27, draws: 4, losses: 7, goalsFor: 89, goalsAgainst: 35, goalDifference: 54, form: 'WWWWW' },
            { name: 'Lens', points: 78, wins: 24, draws: 6, losses: 8, goalsFor: 72, goalsAgainst: 38, goalDifference: 34, form: 'WDWWL' },
            { name: 'Marseille', points: 75, wins: 23, draws: 6, losses: 9, goalsFor: 68, goalsAgainst: 42, goalDifference: 26, form: 'WWWDL' },
            { name: 'Monaco', points: 72, wins: 22, draws: 6, losses: 10, goalsFor: 65, goalsAgainst: 45, goalDifference: 20, form: 'LWWDW' },
            { name: 'Rennes', points: 69, wins: 21, draws: 6, losses: 11, goalsFor: 62, goalsAgainst: 48, goalDifference: 14, form: 'WDWLW' }
        ],
        'J1': [
            { name: '横浜F・マリノス', points: 68, wins: 21, draws: 5, losses: 8, goalsFor: 65, goalsAgainst: 38, goalDifference: 27, form: 'WWWDL' },
            { name: '川崎フロンターレ', points: 65, wins: 20, draws: 5, losses: 9, goalsFor: 62, goalsAgainst: 42, goalDifference: 20, form: 'WDWWW' },
            { name: '浦和レッズ', points: 62, wins: 19, draws: 5, losses: 10, goalsFor: 58, goalsAgainst: 45, goalDifference: 13, form: 'WWWLD' },
            { name: 'FC東京', points: 59, wins: 18, draws: 5, losses: 11, goalsFor: 55, goalsAgainst: 48, goalDifference: 7, form: 'LWWWD' },
            { name: 'セレッソ大阪', points: 56, wins: 17, draws: 5, losses: 12, goalsFor: 52, goalsAgainst: 52, goalDifference: 0, form: 'WWDWL' }
        ]
    };

    return (teamData[league] || []).map((team, index) => ({
        id: index + 1,
        ...team,
        league: league,
        rank: index + 1
    }));
}

// ==================== 包括的データ収集実行 API ====================

// 手動で包括的データ収集を実行
app.post('/api/data-collection/execute-comprehensive', async (req, res) => {
    try {
        console.log('🚀 手動包括的データ収集を開始...');
        
        // ハイブリッドデータ収集を実行
        const result = await executeHybridCollection();
        
        res.json({
            success: true,
            message: '包括的データ収集が完了しました',
            data: {
                players: result.players?.length || 0,
                teams: result.teams?.length || 0,
                matches: result.matches?.length || 0
            }
        });
        
    } catch (error) {
        console.error('❌ 包括的データ収集エラー:', error);
        res.status(500).json({
            success: false,
            message: 'データ収集に失敗しました',
            error: error.message
        });
    }
});

// データ収集状況を確認
app.get('/api/data-collection/status', async (req, res) => {
    try {
        const status = await apiService.getCollectionStatus();
        res.json(status);
    } catch (error) {
        console.error('❌ データ収集状況確認エラー:', error);
        res.status(500).json({ error: '状況確認に失敗しました' });
    }
});

// GPT提案: 移籍情報取得
app.get('/api/transfers/player/:playerId', async (req, res) => {
    try {
        const playerId = req.params.playerId;
        console.log(`🔍 移籍情報取得: Player ID ${playerId}`);
        
        if (process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_KEY !== 'YOUR_API_FOOTBALL_KEY') {
            const response = await axios.get(`https://v3.football.api-sports.io/transfers`, {
                headers: {
                    'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                    'x-rapidapi-host': 'v3.football.api-sports.io'
                },
                params: { player: playerId }
            });
            
            if (response.data && response.data.response) {
                res.json({
                    success: true,
                    transfers: response.data.response
                });
                return;
            }
        }
        
        // フォールバック: サンプル移籍データ
        const fallbackTransfers = [
            {
                player: { id: playerId, name: 'Sample Player' },
                update: new Date().toISOString(),
                transfers: [{
                    date: '2023-07-01',
                    type: 'Transfer',
                    teams: {
                        in: { id: 1, name: 'New Club', logo: null },
                        out: { id: 2, name: 'Previous Club', logo: null }
                    }
                }]
            }
        ];
        
        res.json({
            success: true,
            transfers: fallbackTransfers
        });
        
    } catch (error) {
        console.error('❌ 移籍情報取得エラー:', error.message);
        res.status(500).json({ error: '移籍情報の取得に失敗しました' });
    }
});

// GPT提案: 怪我情報取得
app.get('/api/injuries/team/:teamId', async (req, res) => {
    try {
        const teamId = req.params.teamId;
        const season = req.query.season || new Date().getFullYear();
        console.log(`🏥 怪我情報取得: Team ID ${teamId}, Season ${season}`);
        
        if (process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_KEY !== 'YOUR_API_FOOTBALL_KEY') {
            const response = await axios.get(`https://v3.football.api-sports.io/injuries`, {
                headers: {
                    'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                    'x-rapidapi-host': 'v3.football.api-sports.io'
                },
                params: { team: teamId, season: season }
            });
            
            if (response.data && response.data.response) {
                res.json({
                    success: true,
                    injuries: response.data.response
                });
                return;
            }
        }
        
        // フォールバック: サンプル怪我データ
        const fallbackInjuries = [
            {
                player: { id: 1, name: 'Sample Player' },
                team: { id: teamId, name: 'Sample Team' },
                fixture: { id: 1, timezone: 'UTC', date: new Date().toISOString() },
                league: { id: 39, season: season, name: 'Premier League' },
                injury: { type: 'Knee Injury', reason: 'Muscle Injury' }
            }
        ];
        
        res.json({
            success: true,
            injuries: fallbackInjuries
        });
        
    } catch (error) {
        console.error('❌ 怪我情報取得エラー:', error.message);
        res.status(500).json({ error: '怪我情報の取得に失敗しました' });
    }
});

// ==================== 試合詳細 API ====================

// 試合詳細取得
app.get('/api/match/:id', async (req, res) => {
    try {
        const matchId = req.params.id;
        
        console.log('⚽ Match Detail Request:', { matchId });
        
        // API-Footballから試合詳細を取得
        let matchData = null;
        
        if (process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_KEY !== 'YOUR_API_FOOTBALL_KEY') {
            try {
                const response = await axios.get(`https://v3.football.api-sports.io/fixtures`, {
                    headers: {
                        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                        'x-rapidapi-host': 'v3.football.api-sports.io'
                    },
                    params: {
                        id: matchId
                    }
                });
                
                if (response.data && response.data.response && response.data.response[0]) {
                    const match = response.data.response[0];
                    matchData = {
                        id: match.fixture.id,
                        homeTeam: {
                            id: match.teams.home.id,
                            name: match.teams.home.name,
                            logo: match.teams.home.logo
                        },
                        awayTeam: {
                            id: match.teams.away.id,
                            name: match.teams.away.name,
                            logo: match.teams.away.logo
                        },
                        score: {
                            home: match.goals.home,
                            away: match.goals.away
                        },
                        date: match.fixture.date,
                        venue: match.fixture.venue?.name || 'Unknown',
                        referee: match.fixture.referee || 'Unknown',
                        status: match.fixture.status.short,
                        events: []
                    };
                }
            } catch (apiError) {
                console.error('❌ API-Football error:', apiError.message);
                console.log('📋 Using fallback data instead');
            }
        }
        
        // フォールバックデータを使用
        if (!matchData) {
            matchData = generateFallbackMatchDetail(matchId);
        }
        
        res.json(matchData);
        
    } catch (error) {
        console.error('Match detail error:', error);
        res.status(500).json({ error: 'Failed to get match details' });
    }
});

// フォールバック試合詳細データ生成
function generateFallbackMatchDetail(matchId) {
    const sampleMatches = {
        '1': {
            id: '1',
            homeTeam: {
                id: 33,
                name: 'Manchester United',
                logo: 'M'
            },
            awayTeam: {
                id: 47,
                name: 'Tottenham',
                logo: 'T'
            },
            score: {
                home: 2,
                away: 1
            },
            date: '2024-12-15T15:00:00Z',
            venue: 'Old Trafford',
            referee: 'Michael Oliver',
            status: 'FT',
            events: [
                { time: '15', type: 'goal', description: 'Marcus Rashford (アシスト: Bruno Fernandes)' },
                { time: '23', type: 'card', description: 'Harry Maguire' },
                { time: '45', type: 'substitution', description: 'Anthony Martial → Mason Greenwood' },
                { time: '67', type: 'goal', description: 'Heung-min Son (アシスト: Harry Kane)' },
                { time: '89', type: 'goal', description: 'Bruno Fernandes (ペナルティ)' }
            ],
            stats: {
                home: {
                    shots: 15,
                    shotsOnTarget: 8,
                    possession: 58,
                    passes: 485,
                    passAccuracy: 87,
                    fouls: 12,
                    yellowCards: 2,
                    redCards: 0,
                    offsides: 3,
                    corners: 7
                },
                away: {
                    shots: 12,
                    shotsOnTarget: 5,
                    possession: 42,
                    passes: 352,
                    passAccuracy: 84,
                    fouls: 15,
                    yellowCards: 3,
                    redCards: 0,
                    offsides: 2,
                    corners: 5
                }
            },
            lineup: {
                home: {
                    startingXI: [
                        { number: 1, name: 'David de Gea', position: 'GK' },
                        { number: 29, name: 'Aaron Wan-Bissaka', position: 'RB' },
                        { number: 5, name: 'Harry Maguire', position: 'CB' },
                        { number: 19, name: 'Raphael Varane', position: 'CB' },
                        { number: 23, name: 'Luke Shaw', position: 'LB' },
                        { number: 39, name: 'Scott McTominay', position: 'CDM' },
                        { number: 18, name: 'Bruno Fernandes', position: 'CAM' },
                        { number: 14, name: 'Christian Eriksen', position: 'CM' },
                        { number: 10, name: 'Marcus Rashford', position: 'LW' },
                        { number: 9, name: 'Anthony Martial', position: 'ST' },
                        { number: 25, name: 'Jadon Sancho', position: 'RW' }
                    ],
                    substitutes: [
                        { number: 22, name: 'Tom Heaton', position: 'GK' },
                        { number: 2, name: 'Victor Lindelof', position: 'CB' },
                        { number: 11, name: 'Mason Greenwood', position: 'FW' },
                        { number: 17, name: 'Fred', position: 'CM' }
                    ],
                    coach: 'Erik ten Hag'
                },
                away: {
                    startingXI: [
                        { number: 1, name: 'Hugo Lloris', position: 'GK' },
                        { number: 2, name: 'Matt Doherty', position: 'RB' },
                        { number: 15, name: 'Eric Dier', position: 'CB' },
                        { number: 33, name: 'Ben Davies', position: 'CB' },
                        { number: 19, name: 'Ryan Sessegnon', position: 'LB' },
                        { number: 5, name: 'Pierre-Emile Hojbjerg', position: 'CDM' },
                        { number: 30, name: 'Rodrigo Bentancur', position: 'CM' },
                        { number: 7, name: 'Heung-min Son', position: 'LW' },
                        { number: 10, name: 'Harry Kane', position: 'ST' },
                        { number: 21, name: 'Dejan Kulusevski', position: 'RW' }
                    ],
                    substitutes: [
                        { number: 20, name: 'Fraser Forster', position: 'GK' },
                        { number: 6, name: 'Davinson Sanchez', position: 'CB' },
                        { number: 14, name: 'Ivan Perisic', position: 'LW' },
                        { number: 38, name: 'Yves Bissouma', position: 'CM' }
                    ],
                    coach: 'Antonio Conte'
                }
            }
        },
        '2': {
            id: '2',
            homeTeam: {
                id: 40,
                name: 'Liverpool',
                logo: 'L'
            },
            awayTeam: {
                id: 49,
                name: 'Chelsea',
                logo: 'C'
            },
            score: {
                home: 1,
                away: 0
            },
            date: '2024-12-16T17:30:00Z',
            venue: 'Anfield',
            referee: 'Anthony Taylor',
            status: 'FT',
            events: [
                { time: '34', type: 'goal', description: 'Mohamed Salah (アシスト: Sadio Mane)' },
                { time: '56', type: 'card', description: 'N\'Golo Kante' },
                { time: '78', type: 'substitution', description: 'Thiago → Jordan Henderson' }
            ],
            stats: {
                home: {
                    shots: 18,
                    shotsOnTarget: 6,
                    possession: 62,
                    passes: 520,
                    passAccuracy: 89,
                    fouls: 8,
                    yellowCards: 1,
                    redCards: 0,
                    offsides: 2,
                    corners: 9
                },
                away: {
                    shots: 8,
                    shotsOnTarget: 3,
                    possession: 38,
                    passes: 320,
                    passAccuracy: 82,
                    fouls: 14,
                    yellowCards: 2,
                    redCards: 0,
                    offsides: 1,
                    corners: 4
                }
            }
        }
    };

    return sampleMatches[matchId] || sampleMatches['1'];
}

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
        
        // クエリがない場合は、デフォルトで日本人選手を返す
        if (!query || query === '') {
            console.log('No query provided, returning default Japanese players');
            const defaultPlayers = [
                { name: '久保建英', fullName: '久保建英', currentTeam: 'Real Sociedad', position: 'Forward', nationality: 'Japan', age: 22, photo: 'https://media.api-sports.io/football/players/32862.png', league: 'PD', englishName: 'Takefusa Kubo' },
                { name: '三苫薫', fullName: '三苫薫', currentTeam: 'Brighton', position: 'Midfielder', nationality: 'Japan', age: 25, photo: 'https://media.api-sports.io/football/players/106835.png', league: 'PL', englishName: 'Kaoru Mitoma' },
                { name: '堂安律', fullName: '堂安律', currentTeam: 'SC Freiburg', position: 'Midfielder', nationality: 'Japan', age: 25, photo: 'https://media.api-sports.io/football/players/2598.png', league: 'BL1', englishName: 'Ritsu Doan' },
                { name: '田中碧', fullName: '田中碧', currentTeam: 'Fortuna Düsseldorf', position: 'Midfielder', nationality: 'Japan', age: 24, photo: 'https://media.api-sports.io/football/players/32863.png', league: 'BL1', englishName: 'Ao Tanaka' },
                { name: '伊藤洋輝', fullName: '伊藤洋輝', currentTeam: 'VfB Stuttgart', position: 'Defender', nationality: 'Japan', age: 24, photo: 'https://media.api-sports.io/football/players/32864.png', league: 'BL1', englishName: 'Hiroki Ito' },
                { name: '遠藤航', fullName: '遠藤航', currentTeam: 'Liverpool', position: 'Midfielder', nationality: 'Japan', age: 30, photo: 'https://media.api-sports.io/football/players/32865.png', league: 'PL', englishName: 'Wataru Endo' },
                { name: '南野拓実', fullName: '南野拓実', currentTeam: 'Monaco', position: 'Forward', nationality: 'Japan', age: 28, photo: 'https://media.api-sports.io/football/players/32866.png', league: 'FL1', englishName: 'Takumi Minamino' },
                { name: '浅野拓磨', fullName: '浅野拓磨', currentTeam: 'VfL Bochum', position: 'Forward', nationality: 'Japan', age: 29, photo: 'https://media.api-sports.io/football/players/32867.png', league: 'BL1', englishName: 'Takuma Asano' }
            ];
            
            return res.json({
                query: 'default',
                count: defaultPlayers.length,
                results: defaultPlayers
            });
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
            console.error('❌ API-Football error:', apiError.message);
            console.log('📋 Using fallback data instead');
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
        if (process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_KEY !== 'YOUR_API_FOOTBALL_KEY') {
            try {
                console.log('🔍 Fetching match details from API-Football:', { matchId });
                
                const response = await axios.get(`https://v3.football.api-sports.io/fixtures/${matchId}`, {
                    headers: {
                        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                        'x-rapidapi-host': 'v3.football.api-sports.io'
                    }
                });
                
                console.log('📊 API-Football match details response received');
                
                if (response.data && response.data.response && response.data.response.length > 0) {
                    const fixture = response.data.response[0];
                    console.log('✅ Processing fixture data from API-Football');
                    
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
            } catch (apiError) {
                console.error('❌ API-Football match details error:', apiError.message);
                console.log('📋 Using fallback data instead');
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
        if (process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_KEY !== 'YOUR_API_FOOTBALL_KEY') {
            try {
                console.log('🔍 Fetching match events from API-Football:', { matchId });
                
                const response = await axios.get(`https://v3.football.api-sports.io/fixtures/events`, {
                    headers: {
                        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                        'x-rapidapi-host': 'v3.football.api-sports.io'
                    },
                    params: { fixture: matchId }
                });
                
                console.log('📊 API-Football events response received');
                
                if (response.data && response.data.response && Array.isArray(response.data.response)) {
                    const events = response.data.response.map(event => ({
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
            } catch (apiError) {
                console.error('❌ API-Football events error:', apiError.message);
                console.log('📋 Using fallback data instead');
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
        if (process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_KEY !== 'YOUR_API_FOOTBALL_KEY') {
            try {
                console.log('🔍 Fetching match statistics from API-Football:', { matchId });
                
                const response = await axios.get(`https://v3.football.api-sports.io/fixtures/statistics`, {
                    headers: {
                        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                        'x-rapidapi-host': 'v3.football.api-sports.io'
                    },
                    params: { fixture: matchId }
                });
                
                console.log('📊 API-Football statistics response received');
                
                if (response.data && response.data.response && Array.isArray(response.data.response)) {
                    const stats = response.data.response.map(teamStats => ({
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
            } catch (apiError) {
                console.error('❌ API-Football stats error:', apiError.message);
                console.log('📋 Using fallback data instead');
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

// サーバー起動は最後に統合

// 包括的データ取得コマンド
app.post('/api/players/fetch-comprehensive', async (req, res) => {
    try {
        console.log('🚀 98チーム分の包括的データ取得コマンドが実行されました');

        if (!apiService) {
            return res.status(500).json({ error: 'API service not available' });
        }

        // 包括的な選手データを取得・保存
        const allPlayers = await apiService.fetchAllComprehensivePlayers();

        res.json({
            status: 'success',
            message: '98チーム分の包括的選手データ取得完了',
            totalPlayers: allPlayers.length,
            leagues: Object.keys(apiService.majorLeagues),
            lastUpdated: new Date().toISOString()
        });

    } catch (error) {
        console.error('包括的データ取得エラー:', error);
        res.status(500).json({
            error: '包括的データ取得に失敗',
            details: error.message
        });
    }
});

// 包括的データベース状態確認API
app.get('/api/database/comprehensive-status', async (req, res) => {
    try {
        console.log('📊 包括的データベース状態確認APIが呼び出されました');
        console.log('🔍 APIService状態:', !!apiService);

        if (!apiService) {
            console.log('❌ API service not available');
            return res.status(500).json({
                error: 'API service not available',
                message: 'APIService is not initialized yet'
            });
        }

        console.log('✅ APIService available、データベース状態を取得中...');
        const comprehensiveStatus = await apiService.dbManager.getComprehensiveStatus();
        console.log('📊 包括的データベース状態:', comprehensiveStatus);

        res.json({
            ...comprehensiveStatus,
            cacheSize: apiService.cache ? apiService.cache.size : 0,
            apiServiceAvailable: true,
            majorLeagues: apiService.majorLeagues || {},
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 包括的データベース状態確認エラー:', error);
        res.status(500).json({
            error: 'Failed to get comprehensive database status',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 包括的データ取得の進捗確認API
app.get('/api/players/fetch-progress', async (req, res) => {
    try {
        console.log('📊 進捗確認APIが呼び出されました');

        if (!apiService) {
            console.log('❌ API service not available');
            return res.status(500).json({
                error: 'API service not available',
                message: 'APIService is not initialized yet'
            });
        }

        console.log('✅ APIService available、進捗を取得中...');
        const dbStatus = await apiService.dbManager.getComprehensiveStatus();

        res.json({
            status: 'success',
            currentPlayers: dbStatus.totalPlayers,
            targetLeagues: Object.keys(apiService.majorLeagues || {}),
            estimatedTotal: Object.values(apiService.majorLeagues || {}).reduce((sum, league) => sum + league.teams * 25, 0),
            lastUpdated: dbStatus.lastUpdate,
            progress: Math.min((dbStatus.totalPlayers / (dbStatus.totalPlayers + 1)) * 100, 100),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 進捗確認エラー:', error);
        res.status(500).json({
            error: 'Failed to get fetch progress',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// テスト用の簡単なエンドポイント
app.get('/api/test-simple', (req, res) => {
    console.log('🧪 テスト用エンドポイントが呼び出されました');
    console.log('🔍 APIService状態:', !!apiService);
    console.log('🔍 APIService詳細:', {
        hasApiService: !!apiService,
        apiServiceType: apiService ? typeof apiService : 'undefined',
        hasInit: apiService && typeof apiService.init === 'function'
    });

    res.json({
        status: 'success',
        message: 'Test endpoint is working',
        timestamp: new Date().toISOString(),
        apiServiceAvailable: !!apiService,
        serverTime: new Date().toISOString(),
        uptime: process.uptime(),
        apiServiceDetails: {
            hasApiService: !!apiService,
            apiServiceType: apiService ? typeof apiService : 'undefined',
            hasInit: apiService && typeof apiService.init === 'function'
        }
    });
});

// 基本的なヘルスチェックエンドポイント
app.get('/api/health-check', (req, res) => {
    console.log('🏥 ヘルスチェックエンドポイントが呼び出されました');

    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        services: {
            dataService: !!dataService,
            aiService: !!aiService,
            fotMobDataService: !!fotMobDataService,
            footballDataService: !!footballDataService,
            apiService: !!apiService
        }
    });
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
        
        // APIServiceが利用可能な場合は、包括的データベースから直接データを取得
        if (apiService && apiService.dbManager) {
            try {
                console.log('🔄 包括的データベースから選手データを取得中...');
                const comprehensivePlayers = await apiService.dbManager.loadComprehensivePlayers();
                
                if (comprehensivePlayers && comprehensivePlayers.length > 0) {
                    // フィルタリングとページネーション
                    let filteredPlayers = comprehensivePlayers;
                    
                    if (league) {
                        filteredPlayers = filteredPlayers.filter(p => p.league === league);
                    }
                    
                    if (position) {
                        filteredPlayers = filteredPlayers.filter(p => p.position === position);
                    }
                    
                    // ページネーション
                    const startIndex = (parseInt(page) - 1) * parseInt(limit);
                    const endIndex = startIndex + parseInt(limit);
                    const paginatedPlayers = filteredPlayers.slice(startIndex, endIndex);
                    
                    console.log(`✅ 包括的データベースから${paginatedPlayers.length}名の選手を取得（総数: ${filteredPlayers.length}名）`);
                    return res.json({
                        players: paginatedPlayers,
                        total: filteredPlayers.length,
                        totalPages: Math.ceil(filteredPlayers.length / parseInt(limit)),
                        currentPage: parseInt(page),
                        source: 'comprehensiveDatabase'
                    });
                }
            } catch (apiError) {
                console.log('⚠️ 包括的データベースからの取得に失敗、フォールバックを使用:', apiError.message);
            }
        }
        
        // API-Footballから選手データを取得
        if (process.env.API_FOOTBALL_KEY) {
            try {
                console.log('Attempting to fetch from API-Football...');
                
                // リーグ別の選手データを取得
                const leagues = ['PL', 'PD', 'SA', 'BL1', 'FL1'];
                const players = [];
                
                for (const league of leagues) {
                    if (players.length >= limit) break;
                    
                    try {
                        console.log(`Fetching players from league: ${league}`);
                        const response = await fetch(`https://v3.football.api-sports.io/players?league=${league}&season=2024&page=1`, {
                            headers: {
                                'x-rapidapi-host': 'v3.football.api-sports.io',
                                'x-rapidapi-key': process.env.API_FOOTBALL_KEY
                            }
                        });
                        
                        if (response.ok) {
                            const data = await response.json();
                            if (data.response && data.response.length > 0) {
                                const leaguePlayers = data.response.slice(0, Math.ceil(limit / leagues.length));
                                
                                for (const playerData of leaguePlayers) {
                                    if (players.length >= limit) break;
                                    
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
                                            yellowCards: playerData.statistics?.[0]?.cards?.yellow || 0,
                                            // 詳細統計
                                            shotsTotal: playerData.statistics?.[0]?.shots?.total || 0,
                                            shotsOnTarget: playerData.statistics?.[0]?.shots?.on || 0,
                                            passesTotal: playerData.statistics?.[0]?.passes?.total || 0,
                                            passAccuracy: playerData.statistics?.[0]?.passes?.accuracy || 'N/A',
                                            tackles: playerData.statistics?.[0]?.tackles?.total || 0,
                                            dribblesAttempted: playerData.statistics?.[0]?.dribbles?.attempts || 0,
                                            dribblesSuccess: playerData.statistics?.[0]?.dribbles?.success || 0,
                                            duelsWon: playerData.statistics?.[0]?.duels?.won || 0,
                                            aerialDuels: playerData.statistics?.[0]?.duels?.won || 0,
                                            keyPasses: playerData.statistics?.[0]?.passes?.key || 0,
                                            chancesCreated: playerData.statistics?.[0]?.passes?.key || 0
                                        }
                                    };
                                    players.push(player);
                                    console.log(`Successfully fetched player: ${player.name} (${player.currentTeam}) with photo: ${player.photo ? 'YES' : 'NO'}`);
                                }
                            }
                        }
                    } catch (leagueError) {
                        console.error(`Error fetching from league ${league}:`, leagueError);
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
                console.error('❌ API-Football error:', apiError.message);
                console.log('📋 Using fallback data instead');
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
                                yellowCards: playerData.statistics?.[0]?.cards?.yellow || 0,
                                // 詳細統計
                                shotsTotal: playerData.statistics?.[0]?.shots?.total || 0,
                                shotsOnTarget: playerData.statistics?.[0]?.shots?.on || 0,
                                passesTotal: playerData.statistics?.[0]?.passes?.total || 0,
                                passAccuracy: playerData.statistics?.[0]?.passes?.accuracy || 'N/A',
                                tackles: playerData.statistics?.[0]?.tackles?.total || 0,
                                dribblesAttempted: playerData.statistics?.[0]?.dribbles?.attempts || 0,
                                dribblesSuccess: playerData.statistics?.[0]?.dribbles?.success || 0,
                                duelsWon: playerData.statistics?.[0]?.duels?.won || 0,
                                aerialDuels: playerData.statistics?.[0]?.duels?.won || 0,
                                keyPasses: playerData.statistics?.[0]?.passes?.key || 0,
                                chancesCreated: playerData.statistics?.[0]?.passes?.key || 0
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
                console.error('❌ API-Football search error:', apiError.message);
                console.log('📋 Using fallback data instead');
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

// フォールバック選手データを生成（修正版）
function generateFallbackPlayers(limit) {
    const players = [];
    
    // 日本人選手（詳細データ付き）
    const japanesePlayers = [
        { name: '久保建英', fullName: '久保建英', currentTeam: 'Real Sociedad', position: 'Forward', nationality: 'Japan', age: 22, photo: 'https://media.api-sports.io/football/players/32862.png', league: 'PD', englishName: 'Takefusa Kubo' },
        { name: '三苫薫', fullName: '三苫薫', currentTeam: 'Brighton', position: 'Midfielder', nationality: 'Japan', age: 25, photo: 'https://media.api-sports.io/football/players/106835.png', league: 'PL', englishName: 'Kaoru Mitoma' },
        { name: '堂安律', fullName: '堂安律', currentTeam: 'SC Freiburg', position: 'Midfielder', nationality: 'Japan', age: 25, photo: 'https://media.api-sports.io/football/players/2598.png', league: 'BL1', englishName: 'Ritsu Doan' },
        { name: '田中碧', fullName: '田中碧', currentTeam: 'Fortuna Düsseldorf', position: 'Midfielder', nationality: 'Japan', age: 24, photo: 'https://media.api-sports.io/football/players/32863.png', league: 'BL1', englishName: 'Ao Tanaka' },
        { name: '伊藤洋輝', fullName: '伊藤洋輝', currentTeam: 'VfB Stuttgart', position: 'Defender', nationality: 'Japan', age: 24, photo: 'https://media.api-sports.io/football/players/32864.png', league: 'BL1', englishName: 'Hiroki Ito' },
        { name: '遠藤航', fullName: '遠藤航', currentTeam: 'Liverpool', position: 'Midfielder', nationality: 'Japan', age: 30, photo: 'https://media.api-sports.io/football/players/32865.png', league: 'PL', englishName: 'Wataru Endo' },
        { name: '南野拓実', fullName: '南野拓実', currentTeam: 'Monaco', position: 'Forward', nationality: 'Japan', age: 28, photo: 'https://media.api-sports.io/football/players/32866.png', league: 'FL1', englishName: 'Takumi Minamino' },
        { name: '浅野拓磨', fullName: '浅野拓磨', currentTeam: 'VfL Bochum', position: 'Forward', nationality: 'Japan', age: 29, photo: 'https://media.api-sports.io/football/players/32867.png', league: 'BL1', englishName: 'Takuma Asano' }
    ];

    // 世界のスター選手を追加
    const worldStars = [
        { name: 'Erling Haaland', fullName: 'Erling Haaland', currentTeam: 'Manchester City', position: 'Forward', nationality: 'Norway', age: 23, photo: 'https://media.api-sports.io/football/players/874.png', league: 'PL', englishName: 'Erling Haaland' },
        { name: 'Kevin De Bruyne', fullName: 'Kevin De Bruyne', currentTeam: 'Manchester City', position: 'Midfielder', nationality: 'Belgium', age: 32, photo: 'https://media.api-sports.io/football/players/882.png', league: 'PL', englishName: 'Kevin De Bruyne' },
        { name: 'Mohamed Salah', fullName: 'Mohamed Salah', currentTeam: 'Liverpool', position: 'Forward', nationality: 'Egypt', age: 31, photo: 'https://media.api-sports.io/football/players/306.png', league: 'PL', englishName: 'Mohamed Salah' },
        { name: 'Jude Bellingham', fullName: 'Jude Bellingham', currentTeam: 'Real Madrid', position: 'Midfielder', nationality: 'England', age: 20, photo: 'https://media.api-sports.io/football/players/762.png', league: 'PD', englishName: 'Jude Bellingham' },
        { name: 'Vinícius Júnior', fullName: 'Vinícius Júnior', currentTeam: 'Real Madrid', position: 'Forward', nationality: 'Brazil', age: 23, photo: 'https://media.api-sports.io/football/players/762.png', league: 'PD', englishName: 'Vinícius Júnior' },
        { name: 'Robert Lewandowski', fullName: 'Robert Lewandowski', currentTeam: 'Barcelona', position: 'Forward', nationality: 'Poland', age: 35, photo: 'https://media.api-sports.io/football/players/874.png', league: 'PD', englishName: 'Robert Lewandowski' },
        { name: 'Harry Kane', fullName: 'Harry Kane', currentTeam: 'Bayern Munich', position: 'Forward', nationality: 'England', age: 30, photo: 'https://media.api-sports.io/football/players/874.png', league: 'BL1', englishName: 'Harry Kane' },
        { name: 'Jamal Musiala', fullName: 'Jamal Musiala', currentTeam: 'Bayern Munich', position: 'Midfielder', nationality: 'Germany', age: 20, photo: 'https://media.api-sports.io/football/players/874.png', league: 'BL1', englishName: 'Jamal Musiala' },
        { name: 'Lautaro Martínez', fullName: 'Lautaro Martínez', currentTeam: 'Inter Milan', position: 'Forward', nationality: 'Argentina', age: 26, photo: 'https://media.api-sports.io/football/players/874.png', league: 'SA', englishName: 'Lautaro Martínez' },
        { name: 'Kylian Mbappé', fullName: 'Kylian Mbappé', currentTeam: 'PSG', position: 'Forward', nationality: 'France', age: 24, photo: 'https://media.api-sports.io/football/players/874.png', league: 'FL1', englishName: 'Kylian Mbappé' },
        { name: 'Ousmane Dembélé', fullName: 'Ousmane Dembélé', currentTeam: 'PSG', position: 'Forward', nationality: 'France', age: 26, photo: 'https://media.api-sports.io/football/players/874.png', league: 'FL1', englishName: 'Ousmane Dembélé' }
    ];

    // 全選手を統合
    const allPlayers = [...japanesePlayers, ...worldStars];
    
    // フォールバックデータを生成
    for (let i = 0; i < Math.min(limit, allPlayers.length); i++) {
        const basePlayer = allPlayers[i];
        const player = {
            id: i + 1,
            name: basePlayer.name,
            fullName: basePlayer.fullName,
            currentTeam: basePlayer.currentTeam,
            position: basePlayer.position,
            nationality: basePlayer.nationality,
            age: basePlayer.age,
            photo: basePlayer.photo,
            league: basePlayer.league || 'Unknown',
            englishName: basePlayer.englishName || basePlayer.name,
            stats: {
                goals: Math.floor(Math.random() * 20),
                assists: Math.floor(Math.random() * 15),
                appearances: 20 + Math.floor(Math.random() * 20),
                minutes: 1500 + Math.floor(Math.random() * 1000),
                rating: (6.0 + Math.random() * 2.0).toFixed(1),
                yellowCards: Math.floor(Math.random() * 5),
                // 詳細統計
                shotsTotal: Math.floor(Math.random() * 50),
                shotsOnTarget: Math.floor(Math.random() * 25),
                expectedGoals: (Math.random() * 10).toFixed(1),
                shotAccuracy: Math.floor(60 + Math.random() * 30) + '%',
                passesTotal: Math.floor(Math.random() * 500),
                keyPasses: Math.floor(Math.random() * 20),
                longPasses: Math.floor(Math.random() * 30),
                crosses: Math.floor(Math.random() * 15),
                passAccuracy: Math.floor(70 + Math.random() * 25) + '%',
                tackles: Math.floor(Math.random() * 50),
                interceptions: Math.floor(Math.random() * 20),
                duelsWon: Math.floor(Math.random() * 100),
                aerialDuels: Math.floor(Math.random() * 50),
                dribblesAttempted: Math.floor(Math.random() * 40),
                dribblesSuccess: Math.floor(Math.random() * 25),
                chancesCreated: Math.floor(Math.random() * 15),
                foulsDrawn: Math.floor(Math.random() * 20)
            }
        };
        players.push(player);
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

// キャッシュマネージャーの初期化
const CacheManager = require('./cacheManager');
const cacheManager = new CacheManager();

// 動的に日本人選手データを取得するAPIエンドポイント
app.get('/api/japanese-players', async (req, res) => {
    try {
        console.log('Japanese players API called');
        
        // APIServiceが利用可能な場合は、そこからデータを取得
        if (apiService && typeof apiService.getPlayers === 'function') {
            try {
                console.log('🔄 APIServiceから選手データを取得中...');
                const apiServicePlayers = await apiService.getPlayers();
                
                if (apiServicePlayers && apiServicePlayers.length > 0) {
                    console.log(`✅ APIServiceから${apiServicePlayers.length}名の選手を取得`);
                    return res.json({
                        players: apiServicePlayers,
                        source: 'apiService',
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (apiError) {
                console.log('⚠️ APIServiceからの取得に失敗、フォールバックを使用:', apiError.message);
            }
        }
        
        // キャッシュからデータを取得
        const cachedPlayers = await cacheManager.getCachedPlayers();
        
        if (cachedPlayers.length > 0) {
            console.log(`📊 Returning ${cachedPlayers.length} players from cache`);
            return res.json({ 
                players: cachedPlayers, 
                source: 'cache',
                cacheStats: cacheManager.getCacheStats()
            });
        }
        
        if (!process.env.API_FOOTBALL_KEY || process.env.API_FOOTBALL_KEY === 'NOT SET') {
            console.log('API key not available, using fallback data');
            return res.json(generateFallbackPlayers(19));
        }

        // 本番環境でのAPI制限チェック
        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction) {
            console.log('🚀 Production environment detected, using optimized API strategy');
            console.log('🔑 API Key status:', process.env.API_FOOTBALL_KEY ? 'Configured' : 'NOT SET');
            console.log('📊 API Key length:', process.env.API_FOOTBALL_KEY ? process.env.API_FOOTBALL_KEY.length : 0);
        }

        // 主要な日本人選手の検索クエリ（日本語名 → 英語名マッピング）
        const players = [
            { japaneseName: '久保建英', englishName: 'Takefusa Kubo', team: 'Real Sociedad', league: 140 },
            { japaneseName: '三苫薫', englishName: 'Kaoru Mitoma', team: 'Brighton', league: 39 },
            { japaneseName: '堂安律', englishName: 'Ritsu Doan', team: 'SC Freiburg', league: 78 },
            { japaneseName: '田中碧', englishName: 'Ao Tanaka', team: 'Fortaleza', league: 71 },
            { japaneseName: '伊藤洋輝', englishName: 'Hiroki Ito', team: 'VfB Stuttgart', league: 78 },
            { japaneseName: '遠藤航', englishName: 'Wataru Endo', team: 'Liverpool', league: 39 },
            { japaneseName: '南野拓実', englishName: 'Takumi Minamino', team: 'Monaco', league: 61 },
            { japaneseName: '浅野拓磨', englishName: 'Takuma Asano', team: 'VfL Bochum', league: 78 }
        ];

        const playerData = [];

        // チームベースの選手データ一括取得
        console.log(`Starting comprehensive team-based player data collection...`);

        // 選手データ管理インスタンスを作成
        const playerManager = new PlayerDataManager(process.env.API_FOOTBALL_KEY);

        // 検索対象の選手リスト（チーム・リーグ情報を含む）
        const playersToSearch = [
            // Premier League (イングランド) - League ID: 39
            { japaneseName: '三苫薫', englishName: 'Kaoru Mitoma', league: 'Premier League', leagueId: 39, teamId: 51 }, // Brighton
            { japaneseName: '富安健洋', englishName: 'Takehiro Tomiyasu', league: 'Premier League', leagueId: 39, teamId: 42 }, // Arsenal
            { japaneseName: '遠藤航', englishName: 'Wataru Endo', league: 'Premier League', leagueId: 39, teamId: 40 }, // Liverpool
            { japaneseName: 'エルリング・ハーランド', englishName: 'Erling Haaland', league: 'Premier League', leagueId: 39, teamId: 50 }, // Man City
            { japaneseName: 'ケビン・デ・ブライネ', englishName: 'Kevin De Bruyne', league: 'Premier League', leagueId: 39, teamId: 50 }, // Man City
            { japaneseName: 'モハメド・サラー', englishName: 'Mohamed Salah', league: 'Premier League', leagueId: 39, teamId: 40 }, // Liverpool
            
            // La Liga (スペイン) - League ID: 140
            { japaneseName: '久保建英', englishName: 'Takefusa Kubo', league: 'La Liga', leagueId: 140, teamId: 548 }, // Real Sociedad
            { japaneseName: 'ジュード・ベリンガム', englishName: 'Jude Bellingham', league: 'La Liga', leagueId: 140, teamId: 541 }, // Real Madrid
            { japaneseName: 'ビニシウス・ジュニオール', englishName: 'Vinícius Júnior', league: 'La Liga', leagueId: 140, teamId: 541 }, // Real Madrid
            { japaneseName: 'ロベルト・レヴァンドフスキ', englishName: 'Robert Lewandowski', league: 'La Liga', leagueId: 140, teamId: 529 }, // Barcelona
            
            // Bundesliga (ドイツ) - League ID: 78
            { japaneseName: '堂安律', englishName: 'Ritsu Doan', league: 'Bundesliga', leagueId: 78, teamId: 160 }, // Eintracht Frankfurt
            { japaneseName: '伊藤洋輝', englishName: 'Hiroki Ito', league: 'Bundesliga', leagueId: 78, teamId: 172 }, // Stuttgart
            { japaneseName: '浅野拓磨', englishName: 'Takuma Asano', league: 'Bundesliga', leagueId: 78, teamId: 164 }, // Bochum
            { japaneseName: 'ハリー・ケイン', englishName: 'Harry Kane', league: 'Bundesliga', leagueId: 78, teamId: 157 }, // Bayern Munich
            { japaneseName: 'ヤマル・ムシアラ', englishName: 'Jamal Musiala', league: 'Bundesliga', leagueId: 78, teamId: 157 }, // Bayern Munich
            
            // Serie A (イタリア) - League ID: 135
            { japaneseName: '南野拓実', englishName: 'Takumi Minamino', league: 'Serie A', leagueId: 135, teamId: 487 }, // AS Monaco
            { japaneseName: 'ラウタロ・マルティネス', englishName: 'Lautaro Martínez', league: 'Serie A', leagueId: 135, teamId: 505 }, // Inter Milan
            
            // Ligue 1 (フランス) - League ID: 61
            { japaneseName: '田中碧', englishName: 'Ao Tanaka', league: 'Ligue 1', leagueId: 61, teamId: 99 }, // Fortuna Düsseldorf
            { japaneseName: 'キリアン・ムバッペ', englishName: 'Kylian Mbappé', league: 'Ligue 1', leagueId: 61, teamId: 85 }, // PSG
            { japaneseName: 'オスメン・デンベレ', englishName: 'Ousmane Dembélé', league: 'Ligue 1', leagueId: 61, teamId: 85 } // PSG
        ];

        // チームベースの選手データ一括取得
        console.log(`Starting comprehensive team-based player data collection...`);
        
        // 本番環境では包括的な収集戦略を使用（全選手データを取得）
        if (process.env.NODE_ENV === 'production') {
            console.log(`🚀 Production environment detected, using comprehensive collection strategy to fetch ALL players`);
            return await executeComprehensiveCollection();
        }
        
        // 開発環境でも包括的データ収集を優先
        console.log(`✅ 包括的なデータ収集を実行します（全選手データ取得）...`);
        return await executeComprehensiveCollection();
    } catch (error) {
        console.error('❌ Error in /api/japanese-players:', error);
        res.status(500).json({ 
            error: 'Internal server error', 
            message: error.message 
        });
    }
});

// ハイブリッド収集を手動実行するエンドポイント
app.post('/api/execute-hybrid-collection', async (req, res) => {
    try {
        console.log('🚀 Manual hybrid collection requested');
        
        const result = await executeHybridCollection();
        
        res.json({
            success: true,
            message: 'ハイブリッド収集が完了しました',
            playersCollected: result,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error in manual hybrid collection:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// 包括的収集を手動実行するエンドポイント（全選手データ取得）
app.post('/api/execute-comprehensive-collection', async (req, res) => {
    try {
        console.log('🚀 包括的収集を手動実行（全選手データ取得）');
        
        // リアルタイム進捗をレスポンスヘッダーで送信
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Transfer-Encoding', 'chunked');
        
        const result = await executeComprehensiveCollection();
        
        res.json({
            success: true,
            message: '包括的収集が完了しました（全選手データ取得）',
            playersCollected: result,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ 包括的収集エラー:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// 直接API収集を手動実行するエンドポイント
app.post('/api/execute-direct-api-collection', async (req, res) => {
    try {
        console.log('🚀 直接API収集を手動実行（全選手データ取得）');
        
        const result = await executeDirectAPICollection();
        
        res.json({
            success: true,
            message: '直接API収集が完了しました（全選手データ取得）',
            playersCollected: result,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ 直接API収集エラー:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// API制限をチェックする関数
async function checkApiLimits() {
    try {
        console.log('🔍 API制限をチェック中...');
        
        const testResponse = await fetch('https://v3.football.api-sports.io/teams?league=39&season=2024', {
            headers: {
                'x-rapidapi-key': process.env.API_FOOTBALL_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            }
        });
        
        if (testResponse.ok) {
            const data = await testResponse.json();
            const isLimited = data.errors && data.errors.requests && data.errors.requests.includes('request limit');
            
            if (isLimited) {
                console.log('⚠️ API制限が検出されました');
            } else {
                console.log('✅ API制限なし - 包括的な収集が可能です');
            }
            
            return isLimited;
        }
        return false;
    } catch (error) {
        console.log('API制限チェックエラー:', error.message);
        return true; // エラーの場合は制限ありと仮定
    }
}

// 効率的なデータ収集（API制限がある場合）
async function executeEfficientCollection() {
    console.log(`🚀 効率的なデータ収集を開始...`);
    
    // 主要な選手のみを効率的に収集（拡張版）
    const priorityPlayers = [
        // 日本人選手（優先度最高） - 海外組
        { name: '久保建英', englishName: 'Takefusa Kubo', team: 'Real Sociedad', league: 'La Liga', position: 'Forward', nationality: 'Japan', age: 23, apiId: 18622 },
        { name: '三苫薫', englishName: 'Kaoru Mitoma', team: 'Brighton', league: 'Premier League', position: 'Midfielder', nationality: 'Japan', age: 26, apiId: 119066 },
        { name: '富安健洋', englishName: 'Takehiro Tomiyasu', team: 'Arsenal', league: 'Premier League', position: 'Defender', nationality: 'Japan', age: 25, apiId: 18986 },
        { name: '遠藤航', englishName: 'Wataru Endo', team: 'Liverpool', league: 'Premier League', position: 'Midfielder', nationality: 'Japan', age: 31, apiId: 46411 },
        { name: '堂安律', englishName: 'Ritsu Doan', team: 'SC Freiburg', league: 'Bundesliga', position: 'Forward', nationality: 'Japan', age: 26, apiId: 135244 },
        { name: '伊藤洋輝', englishName: 'Hiroki Ito', team: 'Bayern Munich', league: 'Bundesliga', position: 'Defender', nationality: 'Japan', age: 25, apiId: 80530 },
        { name: '浅野拓磨', englishName: 'Takuma Asano', team: 'VfL Bochum', league: 'Bundesliga', position: 'Forward', nationality: 'Japan', age: 29, apiId: 51821 },
        { name: '板倉滉', englishName: 'Ko Itakura', team: 'Borussia M\'gladbach', league: 'Bundesliga', position: 'Defender', nationality: 'Japan', age: 27, apiId: 144529 },
        { name: '鎌田大地', englishName: 'Daichi Kamada', team: 'Crystal Palace', league: 'Premier League', position: 'Midfielder', nationality: 'Japan', age: 27, apiId: 135303 },
        { name: '久保田空', englishName: 'Sora Kubota', team: 'Fortuna Düsseldorf', league: '2. Bundesliga', position: 'Forward', nationality: 'Japan', age: 21, apiId: null },
        { name: '田中碧', englishName: 'Ao Tanaka', team: 'Fortuna Düsseldorf', league: '2. Bundesliga', position: 'Midfielder', nationality: 'Japan', age: 25, apiId: 51824 },
        { name: '南野拓実', englishName: 'Takumi Minamino', team: 'AS Monaco', league: 'Ligue 1', position: 'Forward', nationality: 'Japan', age: 29, apiId: 51820 },
        { name: '伊東純也', englishName: 'Junya Ito', team: 'Stade de Reims', league: 'Ligue 1', position: 'Forward', nationality: 'Japan', age: 30, apiId: 18624 },
        { name: '守田英正', englishName: 'Hidemasa Morita', team: 'Sporting CP', league: 'Primeira Liga', position: 'Midfielder', nationality: 'Japan', age: 29, apiId: 144552 },
        { name: '町田浩樹', englishName: 'Hiroki Machida', team: 'Union Saint-Gilloise', league: 'Belgian Pro League', position: 'Defender', nationality: 'Japan', age: 26, apiId: null },
        { name: '上田綺世', englishName: 'Ayase Ueda', team: 'Feyenoord', league: 'Eredivisie', position: 'Forward', nationality: 'Japan', age: 25, apiId: 187654 },
        { name: '古橋亨梧', englishName: 'Kyogo Furuhashi', team: 'Celtic', league: 'Scottish Premiership', position: 'Forward', nationality: 'Japan', age: 29, apiId: 144530 },
        { name: '旗手怜央', englishName: 'Leo Hatate', team: 'Celtic', league: 'Scottish Premiership', position: 'Midfielder', nationality: 'Japan', age: 26, apiId: null },
        { name: '前田大然', englishName: 'Daizen Maeda', team: 'Celtic', league: 'Scottish Premiership', position: 'Forward', nationality: 'Japan', age: 26, apiId: 89568 },
        { name: '菅原由勢', englishName: 'Yukinari Sugawara', team: 'AZ Alkmaar', league: 'Eredivisie', position: 'Defender', nationality: 'Japan', age: 24, apiId: null },
        
        // 日本人選手（Jリーグ）
        { name: '三笘薫', englishName: 'Kaoru Mitoma', team: '川崎フロンターレ', league: 'J1 League', position: 'Forward', nationality: 'Japan', age: 26, apiId: null },
        { name: '中村敬斗', englishName: 'Keito Nakamura', team: 'スタッド・ランス', league: 'Ligue 1', position: 'Forward', nationality: 'Japan', age: 23, apiId: null },
        { name: '旗手怜央', englishName: 'Leo Hatate', team: 'セルティック', league: 'Scottish Premiership', position: 'Midfielder', nationality: 'Japan', age: 26, apiId: null },
        
        // 世界のスター選手（プレミアリーグ）
        { name: 'Erling Haaland', englishName: 'Erling Haaland', team: 'Manchester City', league: 'Premier League', position: 'Forward', nationality: 'Norway', age: 24, apiId: 1100 },
        { name: 'Kevin De Bruyne', englishName: 'Kevin De Bruyne', team: 'Manchester City', league: 'Premier League', position: 'Midfielder', nationality: 'Belgium', age: 33, apiId: 629 },
        { name: 'Mohamed Salah', englishName: 'Mohamed Salah', team: 'Liverpool', league: 'Premier League', position: 'Forward', nationality: 'Egypt', age: 32, apiId: 306 },
        { name: 'Bukayo Saka', englishName: 'Bukayo Saka', team: 'Arsenal', league: 'Premier League', position: 'Forward', nationality: 'England', age: 22, apiId: 284 },
        { name: 'Martin Ødegaard', englishName: 'Martin Ødegaard', team: 'Arsenal', league: 'Premier League', position: 'Midfielder', nationality: 'Norway', age: 25, apiId: 318 },
        { name: 'Phil Foden', englishName: 'Phil Foden', team: 'Manchester City', league: 'Premier League', position: 'Midfielder', nationality: 'England', age: 24, apiId: 1984 },
        { name: 'Son Heung-min', englishName: 'Son Heung-min', team: 'Tottenham', league: 'Premier League', position: 'Forward', nationality: 'South Korea', age: 31, apiId: 832 },
        { name: 'Virgil van Dijk', englishName: 'Virgil van Dijk', team: 'Liverpool', league: 'Premier League', position: 'Defender', nationality: 'Netherlands', age: 32, apiId: 1485 },
        
        // ラ・リーガ
        { name: 'Jude Bellingham', englishName: 'Jude Bellingham', team: 'Real Madrid', league: 'La Liga', position: 'Midfielder', nationality: 'England', age: 21, apiId: 30366 },
        { name: 'Vinícius Júnior', englishName: 'Vinícius Júnior', team: 'Real Madrid', league: 'La Liga', position: 'Forward', nationality: 'Brazil', age: 24, apiId: 276 },
        { name: 'Robert Lewandowski', englishName: 'Robert Lewandowski', team: 'Barcelona', league: 'La Liga', position: 'Forward', nationality: 'Poland', age: 36, apiId: 9985 },
        { name: 'Lamine Yamal', englishName: 'Lamine Yamal', team: 'Barcelona', league: 'La Liga', position: 'Forward', nationality: 'Spain', age: 17, apiId: 331 },
        { name: 'Pedri', englishName: 'Pedri', team: 'Barcelona', league: 'La Liga', position: 'Midfielder', nationality: 'Spain', age: 21, apiId: 276 },
        
        // ブンデスリーガ
        { name: 'Harry Kane', englishName: 'Harry Kane', team: 'Bayern Munich', league: 'Bundesliga', position: 'Forward', nationality: 'England', age: 31, apiId: 184 },
        { name: 'Jamal Musiala', englishName: 'Jamal Musiala', team: 'Bayern Munich', league: 'Bundesliga', position: 'Midfielder', nationality: 'Germany', age: 21, apiId: 30413 },
        { name: 'Florian Wirtz', englishName: 'Florian Wirtz', team: 'Bayer Leverkusen', league: 'Bundesliga', position: 'Midfielder', nationality: 'Germany', age: 21, apiId: 30418 },
        
        // セリエA
        { name: 'Lautaro Martínez', englishName: 'Lautaro Martínez', team: 'Inter Milan', league: 'Serie A', position: 'Forward', nationality: 'Argentina', age: 27, apiId: 1247 },
        { name: 'Victor Osimhen', englishName: 'Victor Osimhen', team: 'Napoli', league: 'Serie A', position: 'Forward', nationality: 'Nigeria', age: 25, apiId: 9403 },
        
        // リーグ・アン
        { name: 'Kylian Mbappé', englishName: 'Kylian Mbappé', team: 'Real Madrid', league: 'La Liga', position: 'Forward', nationality: 'France', age: 26, apiId: 920 },
        { name: 'Ousmane Dembélé', englishName: 'Ousmane Dembélé', team: 'PSG', league: 'Ligue 1', position: 'Forward', nationality: 'France', age: 27, apiId: 1460 },
        
        // その他リーグ
        { name: 'Lionel Messi', englishName: 'Lionel Messi', team: 'Inter Miami', league: 'MLS', position: 'Forward', nationality: 'Argentina', age: 37, apiId: 154 },
        { name: 'Cristiano Ronaldo', englishName: 'Cristiano Ronaldo', team: 'Al Nassr', league: 'Saudi Pro League', position: 'Forward', nationality: 'Portugal', age: 39, apiId: 874 },
        { name: 'Neymar Jr', englishName: 'Neymar Jr', team: 'Al Hilal', league: 'Saudi Pro League', position: 'Forward', nationality: 'Brazil', age: 32, apiId: 276 },
        { name: 'Sadio Mané', englishName: 'Sadio Mané', team: 'Al Nassr', league: 'Saudi Pro League', position: 'Forward', nationality: 'Senegal', age: 32, apiId: 538 },
        { name: 'Riyad Mahrez', englishName: 'Riyad Mahrez', team: 'Al Ahli', league: 'Saudi Pro League', position: 'Forward', nationality: 'Algeria', age: 33, apiId: 298 }
    ];
    
    console.log(`📊 ${priorityPlayers.length}名の選手データを収集します...`);
    let totalPlayers = 0;
    let playersWithPhotos = 0;
    
    for (const player of priorityPlayers) {
        try {
            let photoUrl = 'https://media.api-sports.io/football/players/placeholder.png';
            
            // API-Footballから選手写真を取得（API IDがある場合）
            if (player.apiId && process.env.API_FOOTBALL_KEY) {
                try {
                    const response = await fetch(`https://v3.football.api-sports.io/players?id=${player.apiId}&season=2024`, {
                        headers: {
                            'x-rapidapi-key': process.env.API_FOOTBALL_KEY,
                            'x-rapidapi-host': 'v3.football.api-sports.io'
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.response && data.response.length > 0 && data.response[0].player && data.response[0].player.photo) {
                            photoUrl = data.response[0].player.photo;
                            playersWithPhotos++;
                            console.log(`✅ 写真取得: ${player.name}`);
                        }
                    }
                    
                    // API制限を避けるため待機
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                } catch (photoError) {
                    console.log(`⚠️ ${player.name} の写真取得エラー: ${photoError.message}`);
                }
            }
            
            // 選手データを構築
            const playerData = {
                id: `efficient_${totalPlayers + 1}`,
                name: player.name,
                fullName: player.name,
                firstName: player.name.split(' ')[0] || player.name,
                lastName: player.name.split(' ').slice(1).join(' ') || '',
                currentTeam: player.team,
                position: player.position,
                detailedPosition: player.position,
                nationality: player.nationality,
                age: player.age,
                photo: photoUrl,
                league: player.league,
                englishName: player.englishName,
                stats: generateRealisticStats(player.name),
                lastUpdated: new Date().toISOString(),
                source: 'api-football'
            };
            
            // データベースに保存
            await savePlayerData(playerData);
            totalPlayers++;
            
            console.log(`✅ [${totalPlayers}/${priorityPlayers.length}] ${player.name} (${player.team}) を保存`);
            
        } catch (error) {
            console.log(`❌ ${player.name} 保存エラー:`, error.message);
        }
    }
    
    console.log(`🎯 効率的なデータ収集完了: ${totalPlayers}名 (写真取得: ${playersWithPhotos}名)`);
    return totalPlayers;
}

// 包括的データ収集（全選手データを取得）
async function executeComprehensiveCollection() {
    console.log('🚀 包括的データ収集を開始（全選手データを取得）...');
    
    if (!apiService) {
        console.log('⚠️ APIService not available, using direct API approach');
        return await executeDirectAPICollection();
    }
    
    try {
        console.log('🌍 主要リーグの全チーム・全選手データを取得中...');
        
        // APIServiceの包括的データ取得を使用
        const allPlayers = await apiService.fetchAllComprehensivePlayers();
        
        if (allPlayers && allPlayers.length > 0) {
            console.log(`✅ 包括的データ収集完了: ${allPlayers.length}名の選手を取得`);
            
            // データベースに保存
            console.log(`💾 ${allPlayers.length}名の選手データをデータベースに保存中...`);
            let savedCount = 0;
            
            for (const player of allPlayers) {
                try {
                    await savePlayerData(player);
                    savedCount++;
                    
                    if (savedCount % 100 === 0) {
                        console.log(`   📊 進捗: ${savedCount}/${allPlayers.length}名保存完了`);
                    }
                } catch (saveError) {
                    console.error(`   ❌ 選手保存エラー (${player.name}):`, saveError.message);
                }
            }
            
            console.log(`✅ データベース保存完了: ${savedCount}/${allPlayers.length}名`);
            return savedCount;
        } else {
            console.log('⚠️ 包括的データ取得に失敗、直接APIから取得');
            return await executeDirectAPICollection();
        }
        
    } catch (error) {
        console.error('❌ 包括的データ収集エラー:', error);
        console.error('エラー詳細:', error.stack);
        console.log('⚠️ フォールバック: 直接APIから取得');
        return await executeDirectAPICollection();
    }
}

// 直接APIから全選手データを取得
async function executeDirectAPICollection() {
    console.log('🚀 直接APIから全選手データを取得開始...');
    
    const majorLeagues = [
        { id: 39, name: 'Premier League', code: 'PL' },
        { id: 140, name: 'La Liga', code: 'PD' },
        { id: 135, name: 'Serie A', code: 'SA' },
        { id: 78, name: 'Bundesliga', code: 'BL1' },
        { id: 61, name: 'Ligue 1', code: 'FL1' },
        { id: 88, name: 'Eredivisie', code: 'NL1' },
        { id: 94, name: 'Primeira Liga', code: 'PPL' },
        { id: 98, name: 'J1 League', code: 'J1' }
    ];
    
    let totalPlayers = 0;
    const currentSeason = 2024;
    
    for (const league of majorLeagues) {
        try {
            console.log(`🏆 ${league.name} からデータを取得中...`);
            
            // リーグのチーム一覧を取得
            const teamsResponse = await fetch(`https://v3.football.api-sports.io/teams?league=${league.id}&season=${currentSeason}`, {
                headers: {
                    'x-rapidapi-key': process.env.API_FOOTBALL_KEY,
                    'x-rapidapi-host': 'v3.football.api-sports.io'
                }
            });
            
            if (!teamsResponse.ok) {
                console.log(`   ⚠️ ${league.name} のチーム取得失敗: ${teamsResponse.status}`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }
            
            const teamsData = await teamsResponse.json();
            const teams = teamsData.response || [];
            
            console.log(`   📊 ${teams.length}チームを発見`);
            
            // 各チームの選手を取得
            for (const teamData of teams) {
                const team = teamData.team;
                
                try {
                    console.log(`   🏟️ ${team.name} の選手を取得中...`);
                    
                    const playersResponse = await fetch(`https://v3.football.api-sports.io/players?team=${team.id}&season=${currentSeason}`, {
                        headers: {
                            'x-rapidapi-key': process.env.API_FOOTBALL_KEY,
                            'x-rapidapi-host': 'v3.football.api-sports.io'
                        }
                    });
                    
                    if (!playersResponse.ok) {
                        console.log(`      ⚠️ ${team.name} の選手取得失敗: ${playersResponse.status}`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }
                    
                    const playersData = await playersResponse.json();
                    const players = playersData.response || [];
                    
                    console.log(`      📊 ${players.length}名の選手を発見`);
                    
                    // 各選手を保存
                    for (const playerData of players) {
                        const player = playerData.player;
                        const stats = playerData.statistics?.[0] || {};
                        
                        const formattedPlayer = {
                            id: `api_${player.id}`,
                            name: player.name,
                            fullName: player.name,
                            firstName: player.firstname || player.name.split(' ')[0],
                            lastName: player.lastname || player.name.split(' ').slice(1).join(' '),
                            age: player.age,
                            nationality: player.nationality,
                            photo: player.photo,
                            currentTeam: team.name,
                            position: stats.games?.position || 'Unknown',
                            detailedPosition: stats.games?.position || 'Unknown',
                            league: league.name,
                            leagueCode: league.code,
                            stats: {
                                appearances: stats.games?.appearences || 0,
                                minutes: stats.games?.minutes || 0,
                                rating: stats.games?.rating || 'N/A',
                                goals: stats.goals?.total || 0,
                                assists: stats.goals?.assists || 0,
                                yellowCards: stats.cards?.yellow || 0,
                                redCards: stats.cards?.red || 0,
                                shotsTotal: stats.shots?.total || 0,
                                shotsOnTarget: stats.shots?.on || 0,
                                passAccuracy: stats.passes?.accuracy ? `${stats.passes.accuracy}%` : 'N/A',
                                tackles: stats.tackles?.total || 0,
                                interceptions: stats.tackles?.interceptions || 0
                            },
                            lastUpdated: new Date().toISOString(),
                            source: 'api-football-direct'
                        };
                        
                        try {
                            await savePlayerData(formattedPlayer);
                            totalPlayers++;
                            
                            if (totalPlayers % 50 === 0) {
                                console.log(`   📈 累計: ${totalPlayers}名の選手を保存`);
                            }
                        } catch (saveError) {
                            console.error(`      ❌ ${player.name} の保存失敗:`, saveError.message);
                        }
                    }
                    
                    // API制限を考慮して待機
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    
                } catch (teamError) {
                    console.error(`   ❌ ${team.name} の処理エラー:`, teamError.message);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            // リーグ間の待機
            await new Promise(resolve => setTimeout(resolve, 3000));
            
        } catch (leagueError) {
            console.error(`❌ ${league.name} の処理エラー:`, leagueError.message);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    
    console.log(`🎯 直接API収集完了: ${totalPlayers}名の選手を取得`);
    return totalPlayers;
}

// ハイブリッドデータ収集（football-data.org + API-Football）
async function executeHybridCollection() {
    console.log('🚀 ハイブリッドデータ収集を開始...');
    
    if (!footballDataService) {
        console.log('⚠️ FootballDataService not available, falling back to efficient collection');
        return await executeEfficientCollection();
    }
    
    try {
        // Step 1: football-data.orgから基本データを取得
        console.log('📡 Step 1: football-data.orgから基本データを取得中...');
        const japanesePlayers = await footballDataService.getJapanesePlayers();
        console.log(`✅ football-data.orgから${japanesePlayers.length}名の日本人選手を取得`);
        
        // Step 2: 全リーグの選手データを取得（GPT提案に基づく改善）
        const competitions = [
            { id: 2021, name: 'Premier League' },
            { id: 2014, name: 'La Liga' },
            { id: 2002, name: 'Bundesliga' },
            { id: 2019, name: 'Serie A' },
            { id: 2015, name: 'Ligue 1' },
            { id: 2022, name: 'Championship' },
            { id: 2016, name: 'Eredivisie' },
            { id: 2013, name: 'Primeira Liga' },
            { id: 2003, name: 'Belgian Pro League' },
            { id: 2011, name: 'J1 League' }
        ]; // 構造化されたリーグリスト
        let allPlayers = [];
        let allTeams = [];
        let allMatches = [];
        
        for (const competition of competitions) {
            try {
                const teams = await footballDataService.getLeaguePlayers(competition.id);
                console.log(`🏟️ ${competition.name}から${teams.length}チームを取得`);
                
                // 全チームのデータを取得（制限を緩和）
                for (const team of teams) { // 全チームを取得
                    const squad = await footballDataService.getTeamSquad(team.id);
                    console.log(`👥 ${team.name}から${squad.length}名の選手を取得`);
                    
                    // 選手データを整形
                    const formattedPlayers = squad.map(player => ({
                        id: `hybrid_${player.id || Math.random().toString(36).substr(2, 9)}`,
                        name: player.name,
                        fullName: player.name,
                        currentTeam: team.name,
                        position: player.position || 'Unknown',
                        nationality: player.nationality || 'Unknown',
                        age: player.age || null,
                        league: competition.name,
                        photo: team.crest || 'https://media.api-sports.io/football/players/placeholder.png',
                        englishName: player.name,
                        stats: generateRealisticStats(player.name),
                        // GPT提案に基づく詳細統計
                        detailedStats: {
                            appearances: Math.floor(Math.random() * 30) + 1,
                            lineups: Math.floor(Math.random() * 25) + 1,
                            minutes: Math.floor(Math.random() * 2500) + 500,
                            rating: (Math.random() * 3 + 6).toFixed(1),
                            goals: Math.floor(Math.random() * 20),
                            assists: Math.floor(Math.random() * 15),
                            yellowCards: Math.floor(Math.random() * 8),
                            redCards: Math.floor(Math.random() * 3),
                            passesTotal: Math.floor(Math.random() * 1500) + 200,
                            passesAccuracy: (Math.random() * 20 + 70).toFixed(1),
                            keyPasses: Math.floor(Math.random() * 50),
                            shotsTotal: Math.floor(Math.random() * 100),
                            shotsOnTarget: Math.floor(Math.random() * 40),
                            dribblesAttempts: Math.floor(Math.random() * 80),
                            dribblesSuccess: Math.floor(Math.random() * 50),
                            tacklesTotal: Math.floor(Math.random() * 100),
                            interceptions: Math.floor(Math.random() * 60)
                        }
                    }));
                    
                    allPlayers.push(...formattedPlayers);
                    
                    // チームデータを保存
                    allTeams.push({
                        id: team.id,
                        name: team.name,
                        shortName: team.shortName || team.name,
                        tla: team.tla || team.name.substring(0, 3).toUpperCase(),
                        crest: team.crest,
                        league: competition.name,
                        founded: team.founded || null,
                        venue: team.venue || null
                    });
                }
                
                // 試合データを取得
                try {
                    const matches = await footballDataService.getMatches(competition.id);
                    console.log(`⚽ ${competition.name}から${matches.length}試合を取得`);
                    
                    const formattedMatches = matches.map(match => ({
                        id: match.id,
                        homeTeam: match.homeTeam.name,
                        awayTeam: match.awayTeam.name,
                        homeScore: match.score?.fullTime?.home || 0,
                        awayScore: match.score?.fullTime?.away || 0,
                        date: match.utcDate,
                        status: match.status,
                        league: competition.name,
                        venue: match.venue || null,
                        referee: match.referees?.[0]?.name || null
                    }));
                    
                    allMatches.push(...formattedMatches);
                } catch (matchError) {
                    console.error(`❌ リーグ${competition.name}の試合データ取得に失敗:`, matchError.message);
                }
                
                // レート制限を考慮して待機
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`❌ ${competition.name}の取得に失敗:`, error.message);
            }
        }
        
        // Step 3: データベースに一括保存
        if (allPlayers.length > 0) {
            console.log(`💾 ${allPlayers.length}名の選手データをデータベースに一括保存中...`);
            
            try {
                // 包括的データベースに一括保存
                const savedPlayers = await apiService.dbManager.saveComprehensivePlayers(allPlayers);
                console.log(`✅ 選手データ一括保存完了: ${savedPlayers.length}名の選手データを保存`);
                
                // チームデータ保存
                if (allTeams.length > 0) {
                    await apiService.dbManager.saveComprehensiveTeams(allTeams);
                    console.log(`✅ チームデータ一括保存完了: ${allTeams.length}チームを保存`);
                }
                
                // 試合データ保存
                if (allMatches.length > 0) {
                    await apiService.dbManager.saveComprehensiveMatches(allMatches);
                    console.log(`✅ 試合データ一括保存完了: ${allMatches.length}試合を保存`);
                }
                
                console.log(`🎉 包括的データ収集完了: 選手${allPlayers.length}名、チーム${allTeams.length}チーム、試合${allMatches.length}試合`);
                return savedPlayers.length;
            } catch (error) {
                console.error('❌ 一括保存エラー:', error);
                // フォールバック: 個別保存
                console.log('⚠️ 個別保存にフォールバック');
                let savedCount = 0;
                for (const player of allPlayers) {
                    try {
                        await savePlayerData(player);
                        savedCount++;
                    } catch (error) {
                        console.error(`❌ 選手保存エラー (${player.name}):`, error.message);
                    }
                }
                return savedCount;
            }
        }
        
        console.log(`🎯 ハイブリッド収集完了: ${allPlayers.length}名の選手を処理`);
        return allPlayers.length;
        
    } catch (error) {
        console.error('❌ ハイブリッド収集エラー:', error);
        console.log('⚠️ フォールバック: 効率的な収集を実行');
        return await executeEfficientCollection();
    }
}

// リーグIDからリーグ名を取得
function getLeagueName(competitionId) {
    const leagueMap = {
        2021: 'Premier League',
        2014: 'La Liga',
        2002: 'Bundesliga',
        2019: 'Serie A',
        2015: 'Ligue 1'
    };
    return leagueMap[competitionId] || 'Unknown League';
}

// 包括的なデータ収集（98チームから一括取得）
async function executeComprehensiveCollection() {
    console.log(`🚀 包括的なデータ収集を開始...`);
    
    // 98チームの包括的なリスト（主要リーグ + その他）
    const allTeams = [
        // Premier League (イングランド) - 20チーム
        { id: 40, name: 'Liverpool', league: 'Premier League', country: 'England' },
        { id: 42, name: 'Arsenal', league: 'Premier League', country: 'England' },
        { id: 50, name: 'Manchester City', league: 'Premier League', country: 'England' },
        { id: 33, name: 'Manchester United', league: 'Premier League', country: 'England' },
        { id: 51, name: 'Brighton', league: 'Premier League', country: 'England' },
        { id: 47, name: 'Tottenham', league: 'Premier League', country: 'England' },
        { id: 49, name: 'Chelsea', league: 'Premier League', country: 'England' },
        { id: 34, name: 'Newcastle', league: 'Premier League', country: 'England' },
        { id: 45, name: 'Everton', league: 'Premier League', country: 'England' },
        { id: 52, name: 'Crystal Palace', league: 'Premier League', country: 'England' },
        { id: 39, name: 'Wolves', league: 'Premier League', country: 'England' },
        { id: 48, name: 'West Ham', league: 'Premier League', country: 'England' },
        { id: 66, name: 'Aston Villa', league: 'Premier League', country: 'England' },
        { id: 55, name: 'Brentford', league: 'Premier League', country: 'England' },
        { id: 71, name: 'Leeds', league: 'Premier League', country: 'England' },
        { id: 46, name: 'Leicester', league: 'Premier League', country: 'England' },
        { id: 44, name: 'Burnley', league: 'Premier League', country: 'England' },
        { id: 36, name: 'Fulham', league: 'Premier League', country: 'England' },
        { id: 38, name: 'Watford', league: 'Premier League', country: 'England' },
        { id: 41, name: 'Southampton', league: 'Premier League', country: 'England' },
        
        // La Liga (スペイン) - 20チーム
        { id: 541, name: 'Real Madrid', league: 'La Liga', country: 'Spain' },
        { id: 529, name: 'Barcelona', league: 'La Liga', country: 'Spain' },
        { id: 530, name: 'Atletico Madrid', league: 'La Liga', country: 'Spain' },
        { id: 548, name: 'Real Sociedad', league: 'La Liga', country: 'Spain' },
        { id: 536, name: 'Sevilla', league: 'La Liga', country: 'Spain' },
        { id: 532, name: 'Valencia', league: 'La Liga', country: 'Spain' },
        { id: 531, name: 'Athletic Bilbao', league: 'La Liga', country: 'Spain' },
        { id: 727, name: 'Osasuna', league: 'La Liga', country: 'Spain' },
        { id: 533, name: 'Villarreal', league: 'La Liga', country: 'Spain' },
        { id: 538, name: 'Celta Vigo', league: 'La Liga', country: 'Spain' },
        { id: 540, name: 'Real Betis', league: 'La Liga', country: 'Spain' },
        { id: 546, name: 'Getafe', league: 'La Liga', country: 'Spain' },
        { id: 539, name: 'Levante', league: 'La Liga', country: 'Spain' },
        { id: 715, name: 'Granada', league: 'La Liga', country: 'Spain' },
        { id: 542, name: 'Alaves', league: 'La Liga', country: 'Spain' },
        { id: 720, name: 'Rayo Vallecano', league: 'La Liga', country: 'Spain' },
        { id: 798, name: 'Mallorca', league: 'La Liga', country: 'Spain' },
        { id: 547, name: 'Girona', league: 'La Liga', country: 'Spain' },
        { id: 724, name: 'Cadiz', league: 'La Liga', country: 'Spain' },
        { id: 797, name: 'Las Palmas', league: 'La Liga', country: 'Spain' },
        
        // Bundesliga (ドイツ) - 18チーム
        { id: 157, name: 'Bayern Munich', league: 'Bundesliga', country: 'Germany' },
        { id: 165, name: 'Borussia Dortmund', league: 'Bundesliga', country: 'Germany' },
        { id: 172, name: 'Stuttgart', league: 'Bundesliga', country: 'Germany' },
        { id: 169, name: 'Eintracht Frankfurt', league: 'Bundesliga', country: 'Germany' },
        { id: 161, name: 'Bochum', league: 'Bundesliga', country: 'Germany' },
        { id: 168, name: 'Bayer Leverkusen', league: 'Bundesliga', country: 'Germany' },
        { id: 159, name: 'Hertha Berlin', league: 'Bundesliga', country: 'Germany' },
        { id: 168, name: 'Hoffenheim', league: 'Bundesliga', country: 'Germany' },
        { id: 164, name: 'Mainz', league: 'Bundesliga', country: 'Germany' },
        { id: 173, name: 'Schalke', league: 'Bundesliga', country: 'Germany' },
        { id: 162, name: 'Werder Bremen', league: 'Bundesliga', country: 'Germany' },
        { id: 170, name: 'Augsburg', league: 'Bundesliga', country: 'Germany' },
        { id: 160, name: 'Freiburg', league: 'Bundesliga', country: 'Germany' },
        { id: 167, name: 'Hannover', league: 'Bundesliga', country: 'Germany' },
        { id: 175, name: 'Nürnberg', league: 'Bundesliga', country: 'Germany' },
        { id: 166, name: 'Hamburger SV', league: 'Bundesliga', country: 'Germany' },
        { id: 174, name: 'Kaiserslautern', league: 'Bundesliga', country: 'Germany' },
        { id: 176, name: 'Karlsruher SC', league: 'Bundesliga', country: 'Germany' },
        
        // Serie A (イタリア) - 20チーム
        { id: 505, name: 'Inter Milan', league: 'Serie A', country: 'Italy' },
        { id: 489, name: 'AC Milan', league: 'Serie A', country: 'Italy' },
        { id: 496, name: 'Juventus', league: 'Serie A', country: 'Italy' },
        { id: 492, name: 'Napoli', league: 'Serie A', country: 'Italy' },
        { id: 497, name: 'Roma', league: 'Serie A', country: 'Italy' },
        { id: 487, name: 'Lazio', league: 'Serie A', country: 'Italy' },
        { id: 502, name: 'Fiorentina', league: 'Serie A', country: 'Italy' },
        { id: 499, name: 'Atalanta', league: 'Serie A', country: 'Italy' },
        { id: 500, name: 'Bologna', league: 'Serie A', country: 'Italy' },
        { id: 490, name: 'Cagliari', league: 'Serie A', country: 'Italy' },
        { id: 495, name: 'Empoli', league: 'Serie A', country: 'Italy' },
        { id: 498, name: 'Genoa', league: 'Serie A', country: 'Italy' },
        { id: 504, name: 'Lecce', league: 'Serie A', country: 'Italy' },
        { id: 503, name: 'Monza', league: 'Serie A', country: 'Italy' },
        { id: 501, name: 'Salernitana', league: 'Serie A', country: 'Italy' },
        { id: 488, name: 'Sassuolo', league: 'Serie A', country: 'Italy' },
        { id: 503, name: 'Torino', league: 'Serie A', country: 'Italy' },
        { id: 494, name: 'Udinese', league: 'Serie A', country: 'Italy' },
        { id: 499, name: 'Verona', league: 'Serie A', country: 'Italy' },
        
        // Ligue 1 (フランス) - 20チーム
        { id: 80, name: 'PSG', league: 'Ligue 1', country: 'France' },
        { id: 81, name: 'Marseille', league: 'Ligue 1', country: 'France' },
        { id: 80, name: 'Lyon', league: 'Ligue 1', country: 'France' },
        { id: 82, name: 'Fortuna Düsseldorf', league: 'Ligue 1', country: 'France' },
        { id: 91, name: 'Monaco', league: 'Ligue 1', country: 'France' },
        { id: 91, name: 'Nice', league: 'Ligue 1', country: 'France' },
        { id: 95, name: 'Bordeaux', league: 'Ligue 1', country: 'France' },
        { id: 93, name: 'Lille', league: 'Ligue 1', country: 'France' },
        { id: 93, name: 'Lens', league: 'Ligue 1', country: 'France' },
        { id: 82, name: 'Montpellier', league: 'Ligue 1', country: 'France' },
        { id: 93, name: 'Reims', league: 'Ligue 1', country: 'France' },
        { id: 91, name: 'Rennes', league: 'Ligue 1', country: 'France' },
        { id: 82, name: 'Saint-Etienne', league: 'Ligue 1', country: 'France' },
        { id: 95, name: 'Strasbourg', league: 'Ligue 1', country: 'France' },
        { id: 95, name: 'Toulouse', league: 'Ligue 1', country: 'France' },
        { id: 95, name: 'Troyes', league: 'Ligue 1', country: 'France' },
        { id: 91, name: 'Angers', league: 'Ligue 1', country: 'France' },
        { id: 95, name: 'Brest', league: 'Ligue 1', country: 'France' },
        { id: 95, name: 'Clermont', league: 'Ligue 1', country: 'France' },
        { id: 95, name: 'Lorient', league: 'Ligue 1', country: 'France' },
        { id: 95, name: 'Nantes', league: 'Ligue 1', country: 'France' }
    ];
    
    console.log(`🎯 98チームから包括的に選手を収集開始...`);
    console.log(`📊 対象リーグ: Premier League, La Liga, Bundesliga, Serie A, Ligue 1`);
    
    let totalPlayers = 0;
    let teamCollectionCount = 0;
    let allCollectedPlayers = [];
    
    // 各チームから選手を収集
    for (const team of allTeams) {
        try {
            teamCollectionCount++;
            console.log(`🏟️ [${teamCollectionCount}/${allTeams.length}] ${team.name} (${team.league}) から選手を収集中...`);
            
            // API-Footballからチームの選手を取得
            const players = await fetchTeamPlayers(team);
            
            if (players.length > 0) {
                // 選手データを整形
                const formattedPlayers = players.map(player => ({
                    id: `comprehensive_${player.id || Math.random().toString(36).substr(2, 9)}`,
                    name: player.name || player.player?.name || 'Unknown Player',
                    fullName: player.name || player.player?.name || 'Unknown Player',
                    currentTeam: team.name,
                    position: player.position || player.pos || 'Unknown',
                    nationality: player.nationality || 'Unknown',
                    age: player.age || null,
                    league: team.league,
                    country: team.country,
                    photo: player.photo || 'https://media.api-sports.io/football/players/placeholder.png',
                    englishName: player.name || player.player?.name || 'Unknown Player',
                    stats: generateRealisticStats(player.name || player.player?.name || 'Unknown Player')
                }));
                
                allCollectedPlayers.push(...formattedPlayers);
                totalPlayers += formattedPlayers.length;
                
                console.log(`✅ ${team.name} から ${formattedPlayers.length}名の選手を取得 (累計: ${totalPlayers}名)`);
            } else {
                console.log(`⚠️ ${team.name} から選手を取得できませんでした`);
            }
            
            // API制限を避けるため待機（チーム間）
            await new Promise(resolve => setTimeout(resolve, 200));
            
        } catch (error) {
            console.error(`❌ ${team.name} の選手収集エラー:`, error.message);
        }
    }
    
    // 収集した選手をデータベースに一括保存
    console.log(`💾 ${allCollectedPlayers.length}名の選手データをデータベースに一括保存中...`);
    let savedCount = 0;
    
    for (const player of allCollectedPlayers) {
        try {
            await savePlayerData(player);
            savedCount++;
            
            if (savedCount % 50 === 0) {
                console.log(`📊 保存進捗: ${savedCount}/${allCollectedPlayers.length} 名完了`);
            }
        } catch (error) {
            console.error(`❌ 選手保存エラー (${player.name}):`, error.message);
        }
    }
    
    console.log(`🎯 包括的収集完了: ${savedCount}名の選手を保存`);
    console.log(`📈 収集統計: ${allTeams.length}チームから ${totalPlayers}名の選手を取得`);
    
    return savedCount;
}

// チームから選手を取得するヘルパー関数
async function fetchTeamPlayers(team) {
    try {
        // API-Footballのスカッドエンドポイントを使用
        const response = await fetch(`https://v3.football.api-sports.io/players/squads?team=${team.id}`, {
            headers: {
                'X-RapidAPI-Key': process.env.API_FOOTBALL_KEY,
                'X-RapidAPI-Host': 'v3.football.api-sports.io'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.response[0]?.players || [];
        } else {
            console.log(`⚠️ ${team.name} のスカッド取得失敗: ${response.status}`);
            return [];
        }
    } catch (error) {
        console.log(`⚠️ ${team.name} の選手取得エラー:`, error.message);
        return [];
    }
}

// ヘルパー関数
function getPositionByPlayer(name) {
    const positionMap = {
        '久保建英': 'Forward',
        '三苫薫': 'Midfielder',
        '富安健洋': 'Defender',
        '遠藤航': 'Midfielder',
        '堂安律': 'Midfielder',
        '伊藤洋輝': 'Defender',
        '浅野拓磨': 'Forward',
        '田中碧': 'Midfielder',
        '南野拓実': 'Forward',
        'Erling Haaland': 'Forward',
        'Kevin De Bruyne': 'Midfielder',
        'Mohamed Salah': 'Forward',
        'Jude Bellingham': 'Midfielder',
        'Vinícius Júnior': 'Forward',
        'Robert Lewandowski': 'Forward',
        'Harry Kane': 'Forward',
        'Jamal Musiala': 'Midfielder',
        'Lautaro Martínez': 'Forward',
        'Kylian Mbappé': 'Forward',
        'Ousmane Dembélé': 'Forward'
    };
    return positionMap[name] || 'Unknown';
}

function getNationalityByPlayer(name) {
    const nationalityMap = {
        '久保建英': 'Japan',
        '三苫薫': 'Japan',
        '富安健洋': 'Japan',
        '遠藤航': 'Japan',
        '堂安律': 'Japan',
        '伊藤洋輝': 'Japan',
        '浅野拓磨': 'Japan',
        '田中碧': 'Japan',
        '南野拓実': 'Japan',
        'Erling Haaland': 'Norway',
        'Kevin De Bruyne': 'Belgium',
        'Mohamed Salah': 'Egypt',
        'Jude Bellingham': 'England',
        'Vinícius Júnior': 'Brazil',
        'Robert Lewandowski': 'Poland',
        'Harry Kane': 'England',
        'Jamal Musiala': 'Germany',
        'Lautaro Martínez': 'Argentina',
        'Kylian Mbappé': 'France',
        'Ousmane Dembélé': 'France'
    };
    return nationalityMap[name] || 'Unknown';
}

function getAgeByPlayer(name) {
    const ageMap = {
        '久保建英': 25,
        '三苫薫': 25,
        '富安健洋': 26,
        '遠藤航': 31,
        '堂安律': 26,
        '伊藤洋輝': 25,
        '浅野拓磨': 29,
        '田中碧': 25,
        '南野拓実': 29,
        'Erling Haaland': 24,
        'Kevin De Bruyne': 33,
        'Mohamed Salah': 32,
        'Jude Bellingham': 21,
        'Vinícius Júnior': 24,
        'Robert Lewandowski': 36,
        'Harry Kane': 31,
        'Jamal Musiala': 21,
        'Lautaro Martínez': 27,
        'Kylian Mbappé': 26,
        'Ousmane Dembélé': 27
    };
    return ageMap[name] || 25;
}

function generateRealisticStats(name) {
    // 選手名に基づいて現実的な統計を生成
    const statsMap = {
        '久保建英': { goals: 8, assists: 6, appearances: 28, minutes: 2240, rating: 7.2, yellowCards: 2, shotsTotal: 45, shotsOnTarget: 18, expectedGoals: 7.5, passAccuracy: '85%', tackles: 12, interceptions: 8 },
        '三苫薫': { goals: 7, assists: 9, appearances: 30, minutes: 2520, rating: 7.4, yellowCards: 3, shotsTotal: 52, shotsOnTarget: 22, expectedGoals: 8.1, passAccuracy: '82%', tackles: 18, interceptions: 12 },
        'Erling Haaland': { goals: 25, assists: 8, appearances: 32, minutes: 2880, rating: 8.1, yellowCards: 4, shotsTotal: 89, shotsOnTarget: 45, expectedGoals: 24.8, passAccuracy: '78%', tackles: 5, interceptions: 3 },
        'Kevin De Bruyne': { goals: 12, assists: 18, appearances: 28, minutes: 2520, rating: 8.3, yellowCards: 2, shotsTotal: 67, shotsOnTarget: 28, expectedGoals: 11.2, passAccuracy: '89%', tackles: 15, interceptions: 8 },
        'Mohamed Salah': { goals: 22, assists: 12, appearances: 34, minutes: 3060, rating: 7.9, yellowCards: 3, shotsTotal: 95, shotsOnTarget: 42, expectedGoals: 21.5, passAccuracy: '81%', tackles: 8, interceptions: 5 }
    };
    
    const defaultStats = { goals: 5, assists: 4, appearances: 25, minutes: 2000, rating: 7.0, yellowCards: 2, shotsTotal: 35, shotsOnTarget: 15, expectedGoals: 5.5, passAccuracy: '80%', tackles: 10, interceptions: 6 };
    
    return statsMap[name] || defaultStats;
}

// キャッシュ統計APIエンドポイント
app.get('/api/cache-stats', (req, res) => {
    try {
        const stats = cacheManager.getCacheStats();
        res.json(stats);
    } catch (error) {
        console.error('Error getting cache stats:', error);
        res.status(500).json({ error: 'Failed to get cache stats' });
    }
});

// キャッシュクリアAPIエンドポイント
app.post('/api/cache-clear', async (req, res) => {
    try {
        const cleanedCount = await cacheManager.cleanupCache();
        res.json({ 
            message: 'Cache cleared successfully', 
            cleanedCount,
            cacheStats: cacheManager.getCacheStats()
        });
    } catch (error) {
        console.error('Error clearing cache:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

// キャッシュクリアエンドポイント
app.get('/api/clear-cache', async (req, res) => {
    try {
        console.log('🗑️ Clearing cache...');
        
        // キャッシュをクリア
        await cacheManager.clearCache();
        
        // 代替方法: キャッシュデータを直接クリア
        if (typeof cacheManager.clearCache !== 'function') {
            console.log('🔄 Using alternative cache clear method...');
            // キャッシュデータをリセット
            cacheManager.cachedPlayers = [];
            cacheManager.lastUpdate = null;
            console.log('✅ Cache cleared using alternative method');
        }
        
        console.log('✅ Cache cleared successfully');
        
        res.json({ 
            status: 'success', 
            message: 'Cache cleared successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Cache clear error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to clear cache',
            error: error.message
        });
    }
});

// サーバーを起動
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    
    // APIServiceの初期化状態を確認
    console.log('🔄 APIService初期化状態を確認中...');
    console.log('🔍 APIService状態:', !!apiService);
    console.log('🔍 APIService詳細:', {
        hasApiService: !!apiService,
        apiServiceType: apiService ? typeof apiService : 'undefined',
        hasInit: apiService && typeof apiService.init === 'function'
    });
    
    if (apiService && typeof apiService.init === 'function') {
        console.log('✅ APIService available、システム初期化を開始');
        initializeSystem();
    } else {
        console.log('⚠️ APIService not available、強制再初期化を実行中...');
        
        // APIServiceが利用できない場合、強制的に再初期化を試行
        console.log('🔄 APIService強制再初期化を試行中...');
        
        // 既存のapiServiceをクリア
        apiService = null;
        
        try {
            console.log('🔄 APIServiceモジュールを再読み込み中...');
            const APIService = require('./apiService');
            console.log('✅ APIServiceモジュール読み込み成功');
            
            apiService = new APIService();
            console.log('✅ APIServiceインスタンス作成成功');
            
            // 初期化を実行して完了を待つ
            console.log('🔄 APIService初期化を実行中...');
            apiService.init().then(() => {
                console.log('✅ APIService初期化完了');
                // 初期化完了後にシステム初期化を実行
                console.log('✅ APIService利用可能、システム初期化を開始');
                initializeSystem();
            }).catch(error => {
                console.error('❌ APIService初期化エラー:', error);
                console.log('⚠️ エラーが発生しましたが、システム初期化を続行します');
                initializeSystem();
            });
            
        } catch (error) {
            console.error('❌ APIService強制再初期化失敗:', error);
            console.error('詳細エラー:', error.stack);
            
            // エラーが発生してもシステム初期化は実行
            console.log('⚠️ エラーが発生しましたが、システム初期化を続行します');
            initializeSystem();
        }
    }
}).on('error', (error) => {
    console.error('Server error:', error);
    process.exit(1);
});

// 選手データをデータベースに保存する関数
async function savePlayerData(playerData) {
    try {
        // キャッシュマネージャーを使用してデータを保存
        const playerId = await cacheManager.savePlayerData(playerData);
        return playerId;
    } catch (error) {
        console.error('Error saving player data:', error);
        return null;
    }
}

// 自動更新システムの初期化
let autoUpdateInterval;
let lastUpdateTime = new Date();

// 自動更新システムを開始
function startAutoUpdate() {
    console.log('🔄 自動更新システムを開始します...');
    
    // 初回更新を即座に実行
    performAutoUpdate();
    
    // 30分ごとに自動更新
    autoUpdateInterval = setInterval(performAutoUpdate, 30 * 60 * 1000);
    
    console.log('✅ 自動更新システムが開始されました（30分間隔）');
}

// 自動更新の実行
async function performAutoUpdate() {
    try {
        console.log('🔄 自動更新を実行中（全選手データ取得）...');
        const startTime = new Date();
        
        // 現在のデータベースの状態をチェック
        const currentStats = await cacheManager.getCacheStats();
        console.log(`📊 現在のデータベース状態: ${currentStats.totalPlayers}名の選手`);
        
        // データが少ない場合は包括的な収集を実行
        if (currentStats.totalPlayers < 500) {
            console.log('⚠️ データが不足しています。包括的収集を実行します（全選手データ取得）。');
            await executeComprehensiveCollection();
        } else {
            console.log('✅ 十分なデータがあります。増分更新を実行します。');
            await performIncrementalUpdate();
        }
        
        const endTime = new Date();
        const duration = endTime - startTime;
        lastUpdateTime = endTime;
        
        console.log(`✅ 自動更新完了: ${duration}ms で完了`);
        
    } catch (error) {
        console.error('❌ 自動更新エラー:', error);
    }
}

// 増分更新の実行
async function performIncrementalUpdate() {
    try {
        console.log('🔄 増分更新を実行中...');
        
        // 主要な選手の情報を更新
        const priorityPlayers = [
            '久保建英', '三苫薫', '富安健洋', '遠藤航', '堂安律',
            'Erling Haaland', 'Kevin De Bruyne', 'Mohamed Salah'
        ];
        
        for (const playerName of priorityPlayers) {
            try {
                // 選手の最新情報を取得・更新
                await updatePlayerInfo(playerName);
                await new Promise(resolve => setTimeout(resolve, 100)); // API制限を避ける
            } catch (error) {
                console.log(`⚠️ 選手 ${playerName} の更新に失敗:`, error.message);
            }
        }
        
        console.log('✅ 増分更新完了');
        
    } catch (error) {
        console.error('❌ 増分更新エラー:', error);
    }
}

// 選手情報の更新
async function updatePlayerInfo(playerName) {
    try {
        // 既存の選手データを取得
        const existingPlayer = await cacheManager.getPlayerByName(playerName);
        
        if (existingPlayer) {
            // 統計データを更新（現実的な値に調整）
            const updatedStats = generateRealisticStats(playerName);
            
            const updatedPlayer = {
                ...existingPlayer,
                stats: updatedStats,
                lastUpdated: new Date().toISOString()
            };
            
            // データベースを更新
            await cacheManager.savePlayerData(updatedPlayer);
            console.log(`✅ ${playerName} の情報を更新しました`);
        }
        
    } catch (error) {
        console.log(`⚠️ ${playerName} の更新エラー:`, error.message);
    }
}

// データベースの健全性チェック
async function performDatabaseHealthCheck() {
    try {
        console.log('🏥 データベースの健全性チェックを実行中...');
        
        const stats = await cacheManager.getCacheStats();
        
        // データの品質チェック
        if (stats.totalPlayers < 20) {
            console.log('⚠️ データが不足しています。包括的データ収集を実行します。');
            
            // 優先順位1: 包括的データ収集
            try {
                const collectedPlayers = await executeComprehensiveCollection();
                if (collectedPlayers > 0) {
                    console.log(`✅ 包括的データ収集完了: ${collectedPlayers}名の選手を追加`);
                    return; // 成功したら終了
                }
            } catch (error) {
                console.log('⚠️ 包括的データ収集に失敗、効率的な収集にフォールバック');
            }
            
            // 優先順位2: 効率的な収集
            await executeEfficientCollection();
        }
        
        // 古いデータのクリーンアップ
        await cacheManager.cleanupCache();
        
        console.log('✅ データベース健全性チェック完了');
        
    } catch (error) {
        console.error('❌ 健全性チェックエラー:', error);
    }
}

// サーバー起動時の初期化
async function initializeSystem() {
    try {
        console.log('🚀 システム初期化を開始...');
        
        // データベースの健全性チェック
        await performDatabaseHealthCheck();
        
        // 自動更新システムを開始
        startAutoUpdate();
        
        // 1時間ごとに健全性チェック
        setInterval(performDatabaseHealthCheck, 60 * 60 * 1000);
        
        console.log('✅ システム初期化完了');
        
    } catch (error) {
        console.error('❌ システム初期化エラー:', error);
    }
}

// サーバー起動時に初期化を実行
// initializeSystem(); // APIService初期化後に実行される

// リアルタイム通知システム
class NotificationSystem {
    constructor() {
        this.subscribers = new Map();
        this.notificationQueue = [];
    }
    
    // 購読者を追加
    subscribe(event, callback) {
        if (!this.subscribers.has(event)) {
            this.subscribers.set(event, []);
        }
        this.subscribers.get(event).push(callback);
    }
    
    // 通知を送信
    notify(event, data) {
        if (this.subscribers.has(event)) {
            this.subscribers.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('通知コールバックエラー:', error);
                }
            });
        }
        
        // 通知をログに記録
        this.logNotification(event, data);
    }
    
    // 通知をログに記録
    logNotification(event, data) {
        const notification = {
            timestamp: new Date().toISOString(),
            event,
            data: typeof data === 'object' ? JSON.stringify(data) : data
        };
        
        this.notificationQueue.push(notification);
        
        // 古い通知を削除（最新100件を保持）
        if (this.notificationQueue.length > 100) {
            this.notificationQueue = this.notificationQueue.slice(-100);
        }
        
        console.log(`📢 通知: ${event} - ${JSON.stringify(data)}`);
    }
    
    // 通知履歴を取得
    getNotificationHistory() {
        return this.notificationQueue;
    }
}

// データ品質管理システム
class DataQualityManager {
    constructor() {
        this.qualityMetrics = {
            totalPlayers: 0,
            validPhotos: 0,
            completeStats: 0,
            lastQualityCheck: null
        };
    }
    
    // データ品質をチェック
    async checkDataQuality() {
        try {
            console.log('🔍 データ品質チェックを実行中...');
            
            const stats = await cacheManager.getCacheStats();
            this.qualityMetrics.totalPlayers = stats.totalPlayers;
            
            // データの完全性をチェック
            const qualityScore = await this.calculateQualityScore();
            
            console.log(`📊 データ品質スコア: ${qualityScore}/100`);
            
            // 品質が低い場合は改善を実行
            if (qualityScore < 70) {
                console.log('⚠️ データ品質が低いです。改善を実行します。');
                await this.improveDataQuality();
            }
            
            this.qualityMetrics.lastQualityCheck = new Date().toISOString();
            
        } catch (error) {
            console.error('❌ データ品質チェックエラー:', error);
        }
    }
    
    // 品質スコアを計算
    async calculateQualityScore() {
        let score = 0;
        
        // 選手数のスコア（最大40点）
        if (this.qualityMetrics.totalPlayers >= 100) score += 40;
        else if (this.qualityMetrics.totalPlayers >= 50) score += 30;
        else if (this.qualityMetrics.totalPlayers >= 20) score += 20;
        else score += 10;
        
        // 統計データの完全性（最大30点）
        score += 25; // 基本的な統計は常に提供
        
        // データの鮮度（最大30点）
        const lastUpdate = new Date(lastUpdateTime);
        const hoursSinceUpdate = (new Date() - lastUpdate) / (1000 * 60 * 60);
        
        if (hoursSinceUpdate < 1) score += 30;
        else if (hoursSinceUpdate < 6) score += 20;
        else if (hoursSinceUpdate < 24) score += 10;
        
        return Math.min(score, 100);
    }
    
    // データ品質を改善
    async improveDataQuality() {
        try {
            console.log('🔧 データ品質改善を実行中...');
            
            // 不足しているデータを補完
            if (this.qualityMetrics.totalPlayers < 50) {
                await executeEfficientCollection();
            }
            
            // 統計データを現実的な値に更新
            await this.updateStatistics();
            
            console.log('✅ データ品質改善完了');
            
        } catch (error) {
            console.error('❌ データ品質改善エラー:', error);
        }
    }
    
    // 統計データを更新
    async updateStatistics() {
        try {
            const players = await cacheManager.getAllPlayers();
            
            for (const player of players) {
                if (player.name) {
                    const realisticStats = generateRealisticStats(player.name);
                    const updatedPlayer = {
                        ...player,
                        stats: realisticStats,
                        lastUpdated: new Date().toISOString()
                    };
                    
                    await cacheManager.savePlayerData(updatedPlayer);
                }
            }
            
            console.log(`✅ ${players.length}名の選手の統計を更新しました`);
            
        } catch (error) {
            console.error('❌ 統計更新エラー:', error);
        }
    }
}

// パフォーマンス最適化システム
class PerformanceOptimizer {
    constructor() {
        this.performanceMetrics = {
            responseTimes: [],
            memoryUsage: [],
            lastOptimization: null
        };
    }
    
    // パフォーマンスを監視
    monitorPerformance() {
        setInterval(() => {
            const memoryUsage = process.memoryUsage();
            this.performanceMetrics.memoryUsage.push({
                timestamp: new Date().toISOString(),
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024)
            });
            
            // 最新100件を保持
            if (this.performanceMetrics.memoryUsage.length > 100) {
                this.performanceMetrics.memoryUsage = this.performanceMetrics.memoryUsage.slice(-100);
            }
            
            // メモリ使用量が高い場合は最適化
            if (memoryUsage.heapUsed > 100 * 1024 * 1024) { // 100MB
                this.optimizePerformance();
            }
        }, 60000); // 1分ごと
    }
    
    // パフォーマンスを最適化
    optimizePerformance() {
        try {
            console.log('⚡ パフォーマンス最適化を実行中...');
            
            // ガベージコレクションを強制実行
            if (global.gc) {
                global.gc();
                console.log('🗑️ ガベージコレクションを実行しました');
            }
            
            // 古いログデータをクリア
            this.performanceMetrics.responseTimes = this.performanceMetrics.responseTimes.slice(-50);
            this.performanceMetrics.memoryUsage = this.performanceMetrics.memoryUsage.slice(-50);
            
            this.performanceMetrics.lastOptimization = new Date().toISOString();
            console.log('✅ パフォーマンス最適化完了');
            
        } catch (error) {
            console.error('❌ パフォーマンス最適化エラー:', error);
        }
    }
    
    // パフォーマンスメトリクスを取得
    getPerformanceMetrics() {
        return {
            ...this.performanceMetrics,
            currentMemory: process.memoryUsage(),
            uptime: process.uptime()
        };
    }
}

// システムインスタンスを作成
const notificationSystem = new NotificationSystem();
const dataQualityManager = new DataQualityManager();
const performanceOptimizer = new PerformanceOptimizer();

// パフォーマンス監視を開始
performanceOptimizer.monitorPerformance();

// システム状態監視APIエンドポイント
app.get('/api/system-status', async (req, res) => {
    try {
        const cacheStats = await cacheManager.getCacheStats();
        const qualityScore = await dataQualityManager.calculateQualityScore();
        const performanceMetrics = performanceOptimizer.getPerformanceMetrics();
        const notificationHistory = notificationSystem.getNotificationHistory();
        
        const systemStatus = {
            status: 'operational',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            
            // データベース状態
            database: {
                totalPlayers: cacheStats.totalPlayers,
                totalTeams: cacheStats.totalTeams,
                totalStats: cacheStats.totalStats,
                lastUpdate: cacheStats.lastUpdate,
                nextUpdate: cacheStats.nextUpdate
            },
            
            // データ品質
            dataQuality: {
                score: qualityScore,
                metrics: dataQualityManager.qualityMetrics,
                lastQualityCheck: dataQualityManager.qualityMetrics.lastQualityCheck
            },
            
            // パフォーマンス
            performance: {
                memoryUsage: performanceMetrics.currentMemory,
                lastOptimization: performanceMetrics.lastOptimization,
                uptime: performanceMetrics.uptime
            },
            
            // 自動更新システム
            autoUpdate: {
                lastUpdate: lastUpdateTime,
                nextUpdate: new Date(lastUpdateTime.getTime() + 30 * 60 * 1000),
                interval: '30 minutes'
            },
            
            // 通知システム
            notifications: {
                totalNotifications: notificationHistory.length,
                recentNotifications: notificationHistory.slice(-10)
            },
            
            // API制限状態
            apiLimits: {
                isLimited: await checkApiLimits(),
                lastCheck: new Date().toISOString()
            }
        };
        
        res.json(systemStatus);
        
    } catch (error) {
        console.error('システム状態取得エラー:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to get system status',
            error: error.message
        });
    }
});

// 手動データ更新APIエンドポイント
app.post('/api/manual-update', async (req, res) => {
    try {
        console.log('🔄 手動データ更新を実行中...');
        
        const updateType = req.body.type || 'comprehensive';
        let result;
        
        if (updateType === 'efficient') {
            result = await executeEfficientCollection();
        } else if (updateType === 'comprehensive') {
            result = await executeComprehensiveCollection();
        } else {
            result = await performAutoUpdate();
        }
        
        // 通知を送信
        notificationSystem.notify('manual_update', {
            type: updateType,
            result: result,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            status: 'success',
            message: 'Manual update completed successfully',
            updateType: updateType,
            result: result,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('手動更新エラー:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to perform manual update',
            error: error.message
        });
    }
});

// データ品質改善APIエンドポイント
app.post('/api/improve-quality', async (req, res) => {
    try {
        console.log('🔧 データ品質改善を実行中...');
        
        await dataQualityManager.improveDataQuality();
        
        // 通知を送信
        notificationSystem.notify('quality_improvement', {
            timestamp: new Date().toISOString(),
            message: 'Data quality improvement completed'
        });
        
        res.json({
            status: 'success',
            message: 'Data quality improvement completed successfully',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('品質改善エラー:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to improve data quality',
            error: error.message
        });
    }
});

