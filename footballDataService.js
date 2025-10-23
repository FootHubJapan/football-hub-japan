class FootballDataService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.football-data.org/v4';
        this.headers = {
            'X-Auth-Token': apiKey,
            'Content-Type': 'application/json'
        };
        
        // レート制限管理
        this.rateLimit = {
            requests: [],
            maxRequests: 8, // 1分間に8リクエスト（安全マージン）
            windowMs: 60000 // 1分間
        };
    }

    // レート制限チェック
    checkRateLimit() {
        const now = Date.now();
        // 1分間のウィンドウを超えたリクエストを削除
        this.rateLimit.requests = this.rateLimit.requests.filter(
            time => now - time < this.rateLimit.windowMs
        );
        
        if (this.rateLimit.requests.length >= this.rateLimit.maxRequests) {
            const oldestRequest = this.rateLimit.requests[0];
            const waitTime = this.rateLimit.windowMs - (now - oldestRequest);
            return waitTime;
        }
        
        return 0;
    }

    // レート制限を記録
    recordRequest() {
        this.rateLimit.requests.push(Date.now());
    }

    // リトライ付きAPI呼び出し
    async makeRequest(url, options = {}) {
        const maxRetries = 3;
        let lastError;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // レート制限チェック
                const waitTime = this.checkRateLimit();
                if (waitTime > 0) {
                    console.log(`⏳ レート制限のため${waitTime}ms待機中...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
                
                const response = await fetch(url, {
                    headers: this.headers,
                    ...options
                });
                
                if (response.status === 429) {
                    // レート制限エラーの場合、待機してリトライ
                    const retryAfter = response.headers.get('Retry-After') || 60;
                    console.log(`⏳ レート制限エラー、${retryAfter}秒後にリトライ...`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    continue;
                }
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                // リクエストを記録
                this.recordRequest();
                
                return response;
            } catch (error) {
                lastError = error;
                if (attempt < maxRetries - 1) {
                    const delay = Math.pow(2, attempt) * 1000; // 指数バックオフ
                    console.log(`🔄 リトライ ${attempt + 1}/${maxRetries}、${delay}ms後に再試行...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw lastError;
    }

    // リーグの選手一覧を取得
    async getLeaguePlayers(competitionId, season = 2024) {
        try {
            const response = await this.makeRequest(`${this.baseUrl}/competitions/${competitionId}/teams?season=${season}`);
            const data = await response.json();
            return data.teams || [];
        } catch (error) {
            console.error('リーグ選手取得エラー:', error);
            return [];
        }
    }

    // チームの詳細選手情報を取得
    async getTeamSquad(teamId) {
        try {
            const response = await this.makeRequest(`${this.baseUrl}/teams/${teamId}`);
            const data = await response.json();
            return data.squad || [];
        } catch (error) {
            console.error('チーム選手取得エラー:', error);
            return [];
        }
    }

    // マッチデータ取得（Football-data.org）
    async getMatches(options = {}) {
        const { league, season = 2024, status } = options;
        
        try {
            console.log(`🔄 Football-data.orgからマッチデータを取得中... league=${league}, season=${season}, status=${status}`);
            
            // API-FootballのリーグIDからFootball-data.orgのコードにマッピング
            const leagueMapping = {
                // API-Football ID -> Football-data.org Code
                '2': 'CL',     // Champions League
                '39': 'PL',    // Premier League
                '140': 'PD',   // La Liga
                '78': 'BL1',   // Bundesliga
                '135': 'SA',   // Serie A
                '61': 'FL1',   // Ligue 1
                '98': null,    // J1 League (未対応)
                
                // 文字コードもサポート
                'CL': 'CL',
                'PL': 'PL',
                'PD': 'PD',
                'BL1': 'BL1',
                'SA': 'SA',
                'FL1': 'FL1'
            };
            
            const competitionCode = leagueMapping[league];
            
            if (!competitionCode) {
                console.log(`⚠️ リーグID ${league} は Football-data.org で未対応`);
                return [];
            }
            
            // Football-data.orgの正しいエンドポイント形式
            const url = `${this.baseUrl}/competitions/${competitionCode}/matches?season=${season}`;
            console.log(`📡 Football-data.org URL: ${url}`);
            
            const response = await this.makeRequest(url);
            const data = await response.json();
            
            if (!data.matches) {
                console.log('⚠️ Football-data.orgから空のレスポンス');
                return [];
            }
            
            const matches = data.matches.map(match => ({
                id: match.id,
                homeTeam: match.homeTeam.name,
                awayTeam: match.awayTeam.name,
                homeScore: match.score?.fullTime?.home,
                awayScore: match.score?.fullTime?.away,
                status: match.status,
                statusLong: match.status,
                elapsed: match.minute,
                venue: match.venue || 'Unknown Venue',
                leagueName: data.competition?.name || 'Unknown League',
                league: data.competition?.name || 'Unknown League',
                leagueId: data.competition?.id,
                country: data.competition?.area?.name,
                round: match.matchday,
                season: season,
                date: match.utcDate,
                timestamp: new Date(match.utcDate).getTime(),
                events: [],
                lineups: {},
                statistics: {}
            }));
            
            console.log(`✅ Football-data.orgから${matches.length}件のマッチを取得`);
            return matches;
        } catch (error) {
            console.error('❌ Football-data.org マッチデータ取得エラー:', error.message);
            return [];
        }
    }

    // リーグの試合スケジュールを取得
    async getLeagueFixtures(competitionId, season = 2024) {
        try {
            const response = await this.makeRequest(`${this.baseUrl}/competitions/${competitionId}/matches?season=${season}`);
            const data = await response.json();
            return data.matches || [];
        } catch (error) {
            console.error('リーグ試合取得エラー:', error);
            return [];
        }
    }

    // リーグの順位表を取得
    async getLeagueStandings(competitionId, season = 2024) {
        try {
            const response = await this.makeRequest(`${this.baseUrl}/competitions/${competitionId}/standings?season=${season}`);
            const data = await response.json();
            return data.standings || [];
        } catch (error) {
            console.error('リーグ順位取得エラー:', error);
            return [];
        }
    }

    // 選手検索
    async searchPlayers(searchTerm) {
        try {
            // football-data.orgでは直接的な選手検索がないため、
            // 主要リーグから検索
            const competitions = [2021, 2014, 2002, 2019, 2015]; // 主要5リーグ
            let allPlayers = [];
            
            for (const compId of competitions) {
                const teams = await this.getLeaguePlayers(compId);
                for (const team of teams) {
                    const squad = await this.getTeamSquad(team.id);
                    const filteredPlayers = squad.filter(player => 
                        player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        player.nationality.toLowerCase().includes(searchTerm.toLowerCase())
                    );
                    allPlayers.push(...filteredPlayers);
                }
            }
            
            return allPlayers;
        } catch (error) {
            console.error('選手検索エラー:', error);
            return [];
        }
    }

    // 試合の詳細情報を取得（ラインナップ、審判、ゴールスコアラーなど）
    async getMatchDetails(matchId) {
        try {
            const response = await this.makeRequest(`${this.baseUrl}/matches/${matchId}`);
            const data = await response.json();
            
            return {
                id: data.id,
                homeTeam: data.homeTeam,
                awayTeam: data.awayTeam,
                score: data.score,
                venue: data.venue,
                referees: data.referees,
                lineups: data.lineups,
                goalScorers: data.goalScorers,
                bookings: data.bookings,
                substitutions: data.substitutions,
                status: data.status,
                date: data.utcDate
            };
        } catch (error) {
            console.error('試合詳細取得エラー:', error);
            return null;
        }
    }

    // 日本人選手を取得
    async getJapanesePlayers() {
        try {
            const competitions = [2021, 2014, 2002, 2019, 2015]; // 主要5リーグ
            let japanesePlayers = [];
            
            for (const compId of competitions) {
                const teams = await this.getLeaguePlayers(compId);
                for (const team of teams) {
                    const squad = await this.getTeamSquad(team.id);
                    const japaneseInTeam = squad.filter(player => 
                        player.nationality === 'Japan' || 
                        player.nationality === 'JPN'
                    );
                    
                    // チーム情報を追加
                    japaneseInTeam.forEach(player => {
                        player.currentTeam = team.name;
                        player.teamId = team.id;
                        player.leagueId = compId;
                        player.photoUrl = team.crest; // チームロゴ
                    });
                    
                    japanesePlayers.push(...japaneseInTeam);
                }
            }
            
            return japanesePlayers;
        } catch (error) {
            console.error('日本人選手取得エラー:', error);
            return [];
        }
    }
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FootballDataService;
}
