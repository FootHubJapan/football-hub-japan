const axios = require('axios');
const fs = require('fs');
const path = require('path');

// APIキーを取得
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || require('dotenv').config().parsed?.API_FOOTBALL_KEY;

if (!API_FOOTBALL_KEY) {
    console.error('❌ API_FOOTBALL_KEY 環境変数が設定されていません');
    process.exit(1);
}

// DatabaseManagerを読み込み
const DatabaseManager = require('./databaseManager');
const dbManager = new DatabaseManager();

// 主要リーグのリスト
const majorLeagues = [
    { id: 39, name: 'Premier League' },
    { id: 140, name: 'La Liga' },
    { id: 135, name: 'Serie A' },
    { id: 78, name: 'Bundesliga' },
    { id: 61, name: 'Ligue 1' },
    { id: 88, name: 'Eredivisie' },
    { id: 203, name: 'Super Lig' },
    { id: 71, name: 'Serie A Brazil' },
    { id: 94, name: 'Liga MX' },
    { id: 235, name: 'Premier League' }, // ロシア
    { id: 106, name: 'Primeira Liga' },
    { id: 144, name: 'J1 League' }
];

// 終了した試合をチェックして選手データを更新
async function checkAndUpdateFinishedMatches() {
    try {
        console.log('🔄 終了した試合をチェック中...');
        
        // 2025/26シーズンのデータを取得
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        // 8月以降は新しいシーズン、7月以前は前シーズン
        const season = (currentMonth >= 8) ? currentYear : currentYear - 1;
        
        let totalUpdated = 0;
        const processedMatches = new Set();
        
        for (const league of majorLeagues) {
            try {
                // 過去72時間以内に終了した試合を取得（試合が終了してからデータが反映されるまでの時間を考慮）
                const threeDaysAgo = new Date();
                threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
                const today = new Date();
                
                console.log(`📊 ${league.name} の終了試合を取得中... (${threeDaysAgo.toISOString().split('T')[0]} ～ ${today.toISOString().split('T')[0]})`);
                
                const response = await axios.get('https://v3.football.api-sports.io/fixtures', {
                    params: {
                        league: league.id,
                        season: season,
                        status: 'FT', // Full Time (終了)
                        from: threeDaysAgo.toISOString().split('T')[0],
                        to: today.toISOString().split('T')[0]
                    },
                    headers: {
                        'x-apisports-key': API_FOOTBALL_KEY
                    },
                    timeout: 30000
                });
                
                const fixtures = response.data?.response || [];
                console.log(`✅ ${league.name}: ${fixtures.length}件の終了試合を検出`);
                
                for (const fixture of fixtures) {
                    const fixtureId = fixture.fixture?.id;
                    if (!fixtureId || processedMatches.has(fixtureId)) {
                        continue; // 既に処理済み
                    }
                    
                    try {
                        await updatePlayersFromMatch(fixture, league);
                        processedMatches.add(fixtureId);
                        totalUpdated++;
                        
                        // APIレート制限対策（Pro Plan: 300 r/m）
                        await new Promise(resolve => setTimeout(resolve, 200));
                    } catch (matchError) {
                        console.error(`❌ 試合 ${fixtureId} の処理エラー:`, matchError.message);
                    }
                }
                
                // APIレート制限対策
                await new Promise(resolve => setTimeout(resolve, 200));
                
            } catch (leagueError) {
                console.error(`❌ ${league.name} の取得エラー:`, leagueError.message);
            }
        }
        
        console.log(`\n✅ 合計 ${totalUpdated} 試合の選手データを更新しました`);
        
    } catch (error) {
        console.error('❌ 試合ベース更新エラー:', error.message);
    }
}

// 試合から選手データを更新
async function updatePlayersFromMatch(fixture, league) {
    try {
        const fixtureId = fixture.fixture?.id;
        const homeTeamId = fixture.teams?.home?.id;
        const awayTeamId = fixture.teams?.away?.id;
        
        if (!fixtureId || !homeTeamId || !awayTeamId) {
            return;
        }
        
        console.log(`\n🔄 試合 ${fixtureId} (${fixture.teams?.home?.name} vs ${fixture.teams?.away?.name}) の選手データを更新中...`);
        
        // 試合詳細を取得（イベント、スタッツなど）
        const fixtureResponse = await axios.get(`https://v3.football.api-sports.io/fixtures`, {
            params: {
                id: fixtureId
            },
            headers: {
                'x-apisports-key': API_FOOTBALL_KEY
            },
            timeout: 30000
        });
        
        const matchData = fixtureResponse.data?.response?.[0];
        if (!matchData) {
            console.log(`⚠️ 試合 ${fixtureId} の詳細データが見つかりません`);
            return;
        }
        
        // 両チームの選手統計を取得
        const [homeStats, awayStats] = await Promise.all([
            getTeamPlayerStats(homeTeamId, league.id, matchData),
            getTeamPlayerStats(awayTeamId, league.id, matchData)
        ]);
        
        // 選手データを更新
        const allPlayers = [...(homeStats || []), ...(awayStats || [])];
        let updatedCount = 0;
        
        for (const playerData of allPlayers) {
            try {
                await updatePlayerStatsFromMatch(playerData, matchData, league);
                updatedCount++;
            } catch (playerError) {
                console.error(`⚠️ 選手 ${playerData.name} の更新エラー:`, playerError.message);
            }
        }
        
        console.log(`✅ 試合 ${fixtureId}: ${updatedCount}名の選手データを更新`);
        
    } catch (error) {
        console.error(`❌ 試合 ${fixture.fixture?.id} の選手更新エラー:`, error.message);
    }
}

// チームの選手統計を取得
async function getTeamPlayerStats(teamId, leagueId, matchData) {
    try {
        const response = await axios.get(`https://v3.football.api-sports.io/fixtures/players`, {
            params: {
                fixture: matchData.fixture?.id,
                team: teamId
            },
            headers: {
                'x-apisports-key': API_FOOTBALL_KEY
            },
            timeout: 30000
        });
        
        const playersData = response.data?.response?.[0]?.players || [];
        
        return playersData.map(player => ({
            id: player.player?.id,
            name: player.player?.name,
            goals: player.statistics?.[0]?.goals?.total || 0,
            assists: player.statistics?.[0]?.goals?.assists || 0,
            yellowCards: player.statistics?.[0]?.cards?.yellow || 0,
            redCards: player.statistics?.[0]?.cards?.red || 0,
            minutes: player.statistics?.[0]?.games?.minutes || 0
        }));
        
    } catch (error) {
        console.error(`❌ チーム ${teamId} の選手統計取得エラー:`, error.message);
        return [];
    }
}

// 試合データから選手統計を更新
async function updatePlayerStatsFromMatch(playerData, matchData, league) {
    try {
        const playerId = playerData.id;
        const playerName = playerData.name;
        
        if (!playerId || !playerName) {
            return;
        }
        
        // 既存の選手データを取得
        let players = [];
        try {
            players = await dbManager.loadComprehensivePlayers();
        } catch (error) {
            console.error('⚠️ 選手データの読み込みエラー:', error.message);
            return;
        }
        
        // 選手を検索
        let player = players.find(p => 
            p.id === playerId || 
            p.playerId === playerId ||
            String(p.id) === String(playerId) ||
            String(p.playerId) === String(playerId)
        );
        
        if (!player) {
            // 選手が存在しない場合はスキップ（新規選手は別のスクリプトで追加）
            console.log(`⚠️ 選手 ${playerName} (ID: ${playerId}) が見つかりません。スキップします。`);
            return;
        }
        
        const currentYear = new Date().getFullYear();
        const season = '2025/2026';
        
        // statsを配列形式に変換
        if (!Array.isArray(player.stats)) {
            player.stats = [];
        }
        
        // 該当シーズン・リーグの統計を検索
        let seasonStat = player.stats.find(s => 
            (s.season === season || s.season === '2025/26' || s.season === '2025') &&
            (s.leagueName === league.name || s.league === league.name)
        );
        
        if (!seasonStat) {
            // 新しい統計エントリを作成
            seasonStat = {
                season: season,
                leagueName: league.name,
                league: league.name,
                teamName: player.currentTeam || matchData.teams?.home?.name || matchData.teams?.away?.name,
                appearances: 0,
                goals: 0,
                assists: 0,
                yellowCards: 0,
                redCards: 0,
                minutes: 0,
                rating: null
            };
            player.stats.push(seasonStat);
        }
        
        // 試合の統計を追加
        seasonStat.appearances = (seasonStat.appearances || 0) + 1;
        seasonStat.goals = (seasonStat.goals || 0) + (playerData.goals || 0);
        seasonStat.assists = (seasonStat.assists || 0) + (playerData.assists || 0);
        seasonStat.yellowCards = (seasonStat.yellowCards || 0) + (playerData.yellowCards || 0);
        seasonStat.redCards = (seasonStat.redCards || 0) + (playerData.redCards || 0);
        seasonStat.minutes = (seasonStat.minutes || 0) + (playerData.minutes || 0);
        
        // 最終更新日時を更新
        player.lastUpdated = new Date().toISOString();
        
        // データベースに保存
        await dbManager.saveComprehensivePlayers([player]);
        
        console.log(`  ✅ ${playerName}: ${playerData.goals || 0}G ${playerData.assists || 0}A ${playerData.minutes || 0}分`);
        
    } catch (error) {
        console.error(`❌ 選手 ${playerData.name} の統計更新エラー:`, error.message);
    }
}

// メイン処理
async function main() {
    console.log('🚀 終了した試合から選手データを更新開始...\n');
    
    try {
        await checkAndUpdateFinishedMatches();
        console.log('\n✅ 更新処理が完了しました');
    } catch (error) {
        console.error('\n❌ 更新処理エラー:', error.message);
        process.exit(1);
    }
}

// スクリプトが直接実行された場合
if (require.main === module) {
    main();
}

module.exports = { checkAndUpdateFinishedMatches, updatePlayersFromMatch };

