const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

// APIキーを取得
let API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
if (!API_FOOTBALL_KEY || API_FOOTBALL_KEY.length < 30) {
    try {
        const envContent = fs.readFileSync('.env', 'utf8');
        const match = envContent.match(/API_FOOTBALL_KEY=(.+)/);
        if (match) {
            API_FOOTBALL_KEY = match[1].trim();
        }
    } catch (err) {
        console.error('❌ .envファイルの読み込みエラー:', err.message);
        process.exit(1);
    }
}

if (!API_FOOTBALL_KEY || API_FOOTBALL_KEY.length < 30) {
    console.error('❌ APIキーが正しく設定されていません');
    process.exit(1);
}

console.log('✅ APIキーを読み込みました\n');

// 選手データを正規化
function normalizePlayerStats(stat) {
    try {
        const games = stat.games || {};
        const goals = stat.goals || {};
        const cards = stat.cards || {};
        const shots = stat.shots || {};
        const passes = stat.passes || {};
        const tackles = stat.tackles || {};
        const duels = stat.duels || {};
        const dribbles = stat.dribbles || {};
        const fouls = stat.fouls || {};
        const penalty = stat.penalty || {};

        return {
            appearances: games.appearences || 0,
            lineups: games.lineups || 0,
            minutes: games.minutes || 0,
            rating: games.rating ? parseFloat(games.rating) : null,
            goals: goals.total || 0,
            assists: goals.assists || 0,
            saves: goals.saves || 0,
            conceded: goals.conceded || 0,
            yellowCards: cards.yellow || 0,
            redCards: cards.red || 0,
            shotsTotal: shots.total || 0,
            shotsOnTarget: shots.on || 0,
            passesTotal: passes.total || 0,
            passesKey: passes.key || 0,
            passAccuracy: passes.accuracy || null,
            tackles: tackles.total || 0,
            blocks: tackles.blocks || 0,
            interceptions: tackles.interceptions || 0,
            duelsTotal: duels.total || 0,
            duelsWon: duels.won || 0,
            dribblesAttempts: dribbles.attempts || 0,
            dribblesSuccess: dribbles.success || 0,
            foulsDraw: fouls.drawn || 0,
            foulsCommitted: fouls.committed || 0,
            penalty: {
                won: penalty.won || null,
                commited: penalty.committed || null,
                scored: penalty.scored || 0,
                missed: penalty.missed || 0,
                saved: penalty.saved || null
            },
            season: "2025/2026",
            leagueName: stat.league?.name || 'Unknown',
            leagueId: stat.league?.id || null,
            teamName: stat.team?.name || null,
            teamId: stat.team?.id || null,
            source: "api-football-2025",
            lastUpdated: new Date().toISOString()
        };
    } catch (error) {
        console.error('❌ 統計データの正規化エラー:', error.message);
        return null;
    }
}

// Modricを更新
async function updateModric() {
    try {
        const playerId = 754; // ModricのplayerId
        console.log(`🚀 Modric (ID: ${playerId}) を更新中...\n`);

        // 2025年シーズンのデータを取得
        const url = `https://v3.football.api-sports.io/players?season=2025&id=${playerId}`;
        const response = await axios.get(url, {
            headers: {
                'x-apisports-key': API_FOOTBALL_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            },
            timeout: 15000
        });

        if (!response.data || !response.data.response || response.data.response.length === 0) {
            console.log('❌ Modricのデータを取得できませんでした');
            return;
        }

        const apiData = response.data.response[0];
        const player = apiData.player;

        // 選手データを読み込み
        let playersData = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
        let players = Array.isArray(playersData) ? playersData : (playersData.players || []);

        // 選手を検索
        let playerIndex = players.findIndex(p => 
            p.playerId === playerId || p.playerId === String(playerId) || p.playerId === Number(playerId) ||
            p.id === `api_${playerId}`
        );

        // 統計データを処理
        const statsArray = [];
        if (apiData.statistics && Array.isArray(apiData.statistics)) {
            for (const stat of apiData.statistics) {
                const normalized = normalizePlayerStats(stat);
                if (normalized) {
                    statsArray.push(normalized);
                }
            }
        }

        // 最新のチーム名を取得
        const mainStats = statsArray.sort((a, b) => (b.appearances || 0) - (a.appearances || 0))[0];
        const latestTeamName = mainStats?.teamName || apiData.statistics[0]?.team?.name || 'AC Milan';
        const latestLeagueName = mainStats?.leagueName || apiData.statistics[0]?.league?.name || 'Serie A';

        console.log(`  📊 チーム: ${latestTeamName}`);
        console.log(`  📊 リーグ: ${latestLeagueName}`);
        console.log(`  📊 2025/26統計: ${statsArray.length}コンペティション`);

        if (playerIndex === -1) {
            // 新規追加
            const newPlayer = {
                id: `api_${playerId}`,
                playerId: playerId,
                name: player.name,
                fullName: player.firstname + ' ' + player.lastname,
                firstName: player.firstname,
                lastName: player.lastname,
                age: player.age,
                nationality: player.nationality,
                photo: player.photo,
                currentTeam: latestTeamName,
                teamId: mainStats?.teamId || apiData.statistics[0]?.team?.id || 489,
                position: player.position,
                league: latestLeagueName,
                stats: statsArray,
                careerStats: [],
                lastUpdated: new Date().toISOString()
            };
            players.push(newPlayer);
            console.log(`  ✅ Modricを新規追加しました`);
        } else {
            // 既存選手を更新
            const playerObj = players[playerIndex];
            playerObj.name = player.name;
            playerObj.fullName = player.firstname + ' ' + player.lastname;
            playerObj.firstName = player.firstname;
            playerObj.lastName = player.lastname;
            playerObj.age = player.age;
            playerObj.nationality = player.nationality;
            playerObj.photo = player.photo;
            playerObj.currentTeam = latestTeamName;
            playerObj.teamId = mainStats?.teamId || apiData.statistics[0]?.team?.id || 489;
            playerObj.position = player.position;
            playerObj.league = latestLeagueName;
            
            // 2025年統計を更新
            if (!Array.isArray(playerObj.stats)) {
                playerObj.stats = [];
            }
            playerObj.stats = playerObj.stats.filter(s => s.season !== '2025/2026' && s.season !== '2025/26' && s.season !== '2025');
            playerObj.stats.push(...statsArray);
            
            playerObj.lastUpdated = new Date().toISOString();
            console.log(`  ✅ Modricを更新しました`);
        }

        // データを保存
        const outputData = Array.isArray(playersData) ? players : { players: players };
        fs.writeFileSync(PLAYERS_FILE, JSON.stringify(outputData, null, 2));
        console.log(`\n✅ データを保存しました`);

    } catch (error) {
        console.error('❌ エラー:', error.message);
        if (error.response) {
            console.error(`   ステータス: ${error.response.status}`);
            if (error.response.data?.errors) {
                console.error(`   エラー詳細:`, error.response.data.errors);
            }
        }
    }
}

updateModric();







