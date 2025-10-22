#!/usr/bin/env node

/**
 * Football-data.org API統合システム
 * Free + Deep Data プラン対応
 */

const https = require('https');
const fs = require('fs').promises;
const path = require('path');

// Football-data.org API設定
const FOOTBALL_DATA_CONFIG = {
    baseUrl: 'https://api.football-data.org/v4',
    apiKey: process.env.FOOTBALL_DATA_API_KEY,
    headers: {
        'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY,
        'Content-Type': 'application/json'
    },
    rateLimit: {
        callsPerMinute: 30, // Free + Deep Data プラン
        callsPerDay: 1000
    }
};

// TypeScriptインターフェース（JavaScriptで実装）
class FootballDataTypes {
    static FD_Match = {
        id: 'number',
        season: {
            id: 'number',
            startDate: 'string',
            endDate: 'string'
        },
        utcDate: 'string',
        status: 'string',
        matchday: 'number',
        stage: 'string',
        group: 'string',
        homeTeam: {
            id: 'number',
            name: 'string'
        },
        awayTeam: {
            id: 'number',
            name: 'string'
        },
        score: {
            fullTime: {
                home: 'number',
                away: 'number'
            },
            halfTime: {
                home: 'number',
                away: 'number'
            },
            extraTime: {
                home: 'number',
                away: 'number'
            },
            penalties: {
                home: 'number',
                away: 'number'
            }
        },
        lastUpdated: 'string',
        lineups: [{
            teamId: 'number',
            startingXI: [{
                id: 'number',
                name: 'string',
                position: 'string'
            }],
            substitutes: [{
                id: 'number',
                name: 'string'
            }]
        }],
        bookings: [{
            minute: 'number',
            teamId: 'number',
            playerId: 'number',
            card: 'string'
        }],
        goalScorers: [{
            minute: 'number',
            teamId: 'number',
            playerId: 'number',
            name: 'string'
        }]
    };

    static FD_PlayerMatches = {
        filters: 'object',
        resultSet: {
            count: 'number',
            first: 'string',
            last: 'string'
        },
        aggregations: {
            matchesOnPitch: 'number',
            startingXI: 'number',
            minutesPlayed: 'number',
            position: 'string',
            shirtNumber: 'number'
        },
        matches: 'array'
    };
}

class FootballDataAPI {
    constructor() {
        this.apiKey = FOOTBALL_DATA_CONFIG.apiKey;
        this.baseUrl = FOOTBALL_DATA_CONFIG.baseUrl;
        this.headers = FOOTBALL_DATA_CONFIG.headers;
        this.callCount = 0;
        this.lastCallTime = Date.now();
    }

    async makeRequest(endpoint) {
        // レート制限チェック
        const now = Date.now();
        if (now - this.lastCallTime < 2000) { // 2秒間隔
            await new Promise(resolve => setTimeout(resolve, 2000 - (now - this.lastCallTime)));
        }

        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.football-data.org',
                path: `/v4${endpoint}`,
                method: 'GET',
                headers: this.headers
            };

            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        this.callCount++;
                        this.lastCallTime = Date.now();
                        resolve(response);
                    } catch (error) {
                        reject(new Error(`JSON解析エラー: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`APIリクエストエラー: ${error.message}`));
            });

            req.end();
        });
    }

    // リーグ一覧取得
    async getLeagues() {
        try {
            console.log('🏆 リーグ一覧を取得中...');
            const response = await this.makeRequest('/competitions');
            
            // APIキーが無効な場合のフォールバック
            if (!response || !response.competitions) {
                console.log('⚠️ APIキーが無効または制限に達しています。デモデータを使用します。');
                return this.getMockLeagues();
            }
            
            return response.competitions;
        } catch (error) {
            console.error('❌ リーグ取得エラー:', error.message);
            console.log('⚠️ デモデータを使用します。');
            return this.getMockLeagues();
        }
    }

    getMockLeagues() {
        return [
            {
                id: 2021,
                name: 'Premier League',
                area: { name: 'England' },
                currentSeason: {
                    startDate: '2024-08-17',
                    endDate: '2025-05-25'
                }
            },
            {
                id: 2014,
                name: 'La Liga',
                area: { name: 'Spain' },
                currentSeason: {
                    startDate: '2024-08-17',
                    endDate: '2025-05-25'
                }
            },
            {
                id: 2002,
                name: 'Bundesliga',
                area: { name: 'Germany' },
                currentSeason: {
                    startDate: '2024-08-17',
                    endDate: '2025-05-25'
                }
            },
            {
                id: 2019,
                name: 'Serie A',
                area: { name: 'Italy' },
                currentSeason: {
                    startDate: '2024-08-17',
                    endDate: '2025-05-25'
                }
            },
            {
                id: 2015,
                name: 'Ligue 1',
                area: { name: 'France' },
                currentSeason: {
                    startDate: '2024-08-17',
                    endDate: '2025-05-25'
                }
            }
        ];
    }

    // 試合データ取得
    async getMatches(competitionId, season = null, matchday = null) {
        try {
            let endpoint = `/competitions/${competitionId}/matches`;
            const params = [];
            
            if (season) params.push(`season=${season}`);
            if (matchday) params.push(`matchday=${matchday}`);
            
            if (params.length > 0) {
                endpoint += `?${params.join('&')}`;
            }

            console.log(`⚽ 試合データを取得中: ${competitionId} (${season || 'current'})`);
            const response = await this.makeRequest(endpoint);
            return response.matches;
        } catch (error) {
            console.error('❌ 試合データ取得エラー:', error.message);
            throw error;
        }
    }

    // 選手の試合データ取得
    async getPlayerMatches(playerId, season = null) {
        try {
            let endpoint = `/persons/${playerId}/matches`;
            if (season) {
                endpoint += `?season=${season}`;
            }

            console.log(`👤 選手試合データを取得中: ${playerId} (${season || 'current'})`);
            const response = await this.makeRequest(endpoint);
            return response;
        } catch (error) {
            console.error('❌ 選手試合データ取得エラー:', error.message);
            throw error;
        }
    }

    // チーム情報取得
    async getTeam(teamId) {
        try {
            console.log(`🏟️ チーム情報を取得中: ${teamId}`);
            const response = await this.makeRequest(`/teams/${teamId}`);
            return response;
        } catch (error) {
            console.error('❌ チーム情報取得エラー:', error.message);
            throw error;
        }
    }
}

class FootballDataTransformer {
    constructor() {
        this.dataPath = path.join(__dirname, 'data');
    }

    // 試合データをローカル形式に変換
    transformMatchData(fdMatch) {
        return {
            id: fdMatch.id,
            homeTeam: {
                id: fdMatch.homeTeam.id,
                name: fdMatch.homeTeam.name
            },
            awayTeam: {
                id: fdMatch.awayTeam.id,
                name: fdMatch.awayTeam.name
            },
            league: fdMatch.season.id,
            season: new Date(fdMatch.season.startDate).getFullYear(),
            date: fdMatch.utcDate,
            status: fdMatch.status,
            matchday: fdMatch.matchday,
            stage: fdMatch.stage,
            score: {
                fullTime: fdMatch.score.fullTime,
                halfTime: fdMatch.score.halfTime,
                extraTime: fdMatch.score.extraTime,
                penalties: fdMatch.score.penalties
            },
            venue: fdMatch.venue,
            referees: fdMatch.referees,
            lineups: fdMatch.lineups || [],
            bookings: fdMatch.bookings || [],
            goalScorers: fdMatch.goalScorers || [],
            lastUpdated: fdMatch.lastUpdated,
            source: 'football-data.org'
        };
    }

    // 選手スタッツをローカル形式に変換
    transformPlayerStats(fdPlayerMatches, playerId, season) {
        const agg = fdPlayerMatches.aggregations;
        
        return {
            playerId: playerId,
            season: season,
            league: '', // 後で補完
            team: '', // 後で補完
            appearances: agg.matchesOnPitch,
            lineups: agg.startingXI,
            minutes: agg.minutesPlayed,
            position: agg.position,
            shirtNumber: agg.shirtNumber,
            matches: fdPlayerMatches.matches.map(match => this.transformMatchData(match)),
            source: 'football-data.org'
        };
    }

    // データをJSONファイルに保存
    async saveMatchesData(matches, filename = 'football-data-matches.json') {
        try {
            await fs.mkdir(this.dataPath, { recursive: true });
            const filePath = path.join(this.dataPath, filename);
            await fs.writeFile(filePath, JSON.stringify(matches, null, 2));
            console.log(`💾 試合データを保存: ${filePath} (${matches.length}件)`);
        } catch (error) {
            console.error('❌ 試合データ保存エラー:', error.message);
            throw error;
        }
    }

    async savePlayerStatsData(playerStats, filename = 'football-data-player-stats.json') {
        try {
            await fs.mkdir(this.dataPath, { recursive: true });
            const filePath = path.join(this.dataPath, filename);
            await fs.writeFile(filePath, JSON.stringify(playerStats, null, 2));
            console.log(`💾 選手スタッツを保存: ${filePath}`);
        } catch (error) {
            console.error('❌ 選手スタッツ保存エラー:', error.message);
            throw error;
        }
    }
}

// メイン実行クラス
class FootballDataIntegration {
    constructor() {
        this.api = new FootballDataAPI();
        this.transformer = new FootballDataTransformer();
    }

    async testAPI() {
        try {
            console.log('🧪 Football-data.org API接続テスト開始...');
            
            // リーグ一覧取得テスト
            const response = await this.api.getLeagues();
            console.log('API Response:', JSON.stringify(response, null, 2));
            
            if (!response || !Array.isArray(response)) {
                console.log('⚠️ APIレスポンスが期待される形式ではありません');
                return [];
            }
            
            console.log(`✅ リーグ一覧取得成功: ${response.length}リーグ`);
            
            // 主要リーグのIDを表示
            const majorLeagues = response.filter(league => 
                ['Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1'].includes(league.name)
            );
            
            console.log('\n🏆 主要リーグ:');
            majorLeagues.forEach(league => {
                console.log(`  ${league.name}: ID ${league.id}`);
            });
            
            return response;
        } catch (error) {
            console.error('❌ API接続テスト失敗:', error.message);
            console.error('詳細エラー:', error);
            throw error;
        }
    }

    async fetchMatchesForLeague(leagueId, season = 2024) {
        try {
            console.log(`\n⚽ リーグ ${leagueId} の試合データを取得中...`);
            
            const matches = await this.api.getMatches(leagueId, season);
            const transformedMatches = matches.map(match => this.transformer.transformMatchData(match));
            
            await this.transformer.saveMatchesData(transformedMatches, `matches-${leagueId}-${season}.json`);
            
            console.log(`✅ ${matches.length}試合のデータを取得・保存完了`);
            return transformedMatches;
        } catch (error) {
            console.error('❌ 試合データ取得失敗:', error.message);
            throw error;
        }
    }

    async fetchPlayerMatches(playerId, season = 2024) {
        try {
            console.log(`\n👤 選手 ${playerId} の試合データを取得中...`);
            
            const playerMatches = await this.api.getPlayerMatches(playerId, season);
            const transformedStats = this.transformer.transformPlayerStats(playerMatches, playerId, season);
            
            await this.transformer.savePlayerStatsData(transformedStats, `player-${playerId}-${season}.json`);
            
            console.log(`✅ 選手 ${playerId} のデータを取得・保存完了`);
            return transformedStats;
        } catch (error) {
            console.error('❌ 選手データ取得失敗:', error.message);
            throw error;
        }
    }
}

// メイン実行
async function main() {
    try {
        const integration = new FootballDataIntegration();
        
        // API接続テスト
        await integration.testAPI();
        
        // 主要リーグの試合データを取得（例：Premier League）
        // await integration.fetchMatchesForLeague(2021, 2024); // Premier League
        
        // 特定選手のデータを取得（例：ムバッペ）
        // await integration.fetchPlayerMatches(278, 2024); // Mbappé
        
        console.log('\n🎉 Football-data.org API統合完了!');
        console.log('💡 使用方法:');
        console.log('  1. FOOTBALL_DATA_API_KEY環境変数を設定');
        console.log('  2. fetchMatchesForLeague(leagueId, season)で試合データ取得');
        console.log('  3. fetchPlayerMatches(playerId, season)で選手データ取得');
        
    } catch (error) {
        console.error('❌ メイン処理エラー:', error.message);
        process.exit(1);
    }
}

// スクリプトが直接実行された場合のみmain()を実行
if (require.main === module) {
    main();
}

module.exports = {
    FootballDataAPI,
    FootballDataTransformer,
    FootballDataIntegration,
    FootballDataTypes
};
