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

// 主要チームのID
const MAJOR_TEAMS = [
    { id: 541, name: 'Real Madrid', leagueId: 140 },
    { id: 33, name: 'Manchester United', leagueId: 39 },
    { id: 529, name: 'Barcelona', leagueId: 140 },
    { id: 50, name: 'Manchester City', leagueId: 39 },
    { id: 40, name: 'Liverpool', leagueId: 39 }
];

// データベースの選手を読み込み
let playersData = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
let players = Array.isArray(playersData) ? playersData : (playersData.players || []);

// スカッドを取得してデータベースと比較
async function checkTeamSquad(teamId, teamName, leagueId) {
    try {
        console.log(`\n📊 ${teamName} (ID: ${teamId}) を確認中...`);
        
        // API-Footballからスカッドを取得
        const response = await axios.get(`https://v3.football.api-sports.io/players/squads?team=${teamId}`, {
            headers: {
                'x-apisports-key': API_FOOTBALL_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            },
            timeout: 15000
        });

        if (!response.data.response || response.data.response.length === 0) {
            console.log(`  ⚠️ APIからスカッドを取得できませんでした`);
            return;
        }

        const squad = response.data.response[0];
        const apiPlayers = squad.players || [];
        console.log(`  📋 APIスカッド: ${apiPlayers.length}名`);

        // データベースから該当チームの選手を取得
        const dbPlayers = players.filter(p => 
            p.teamId === teamId || 
            p.currentTeam?.toLowerCase().includes(teamName.toLowerCase()) ||
            (p.currentTeam && teamName.toLowerCase().includes(p.currentTeam.toLowerCase()))
        );
        console.log(`  📋 データベース: ${dbPlayers.length}名`);

        // APIにあってデータベースにない選手を特定
        const missingPlayers = [];
        apiPlayers.forEach(apiPlayer => {
            const found = dbPlayers.find(dbPlayer => 
                dbPlayer.playerId === apiPlayer.id ||
                dbPlayer.id === `api_${apiPlayer.id}` ||
                (dbPlayer.name && dbPlayer.name.toLowerCase() === apiPlayer.name.toLowerCase())
            );
            
            if (!found) {
                missingPlayers.push({
                    id: apiPlayer.id,
                    name: apiPlayer.name,
                    position: apiPlayer.position,
                    number: apiPlayer.number
                });
            }
        });

        if (missingPlayers.length > 0) {
            console.log(`  ⚠️ データベースにない選手: ${missingPlayers.length}名`);
            console.log(`  主な選手:`);
            missingPlayers.slice(0, 10).forEach(p => {
                console.log(`    - ${p.name} (ID: ${p.id}, ${p.position})`);
            });
            if (missingPlayers.length > 10) {
                console.log(`    ... 他 ${missingPlayers.length - 10}名`);
            }
        } else {
            console.log(`  ✅ 全選手がデータベースに存在します`);
        }

        // データベースにあってAPIにない選手（移籍した可能性）
        const extraPlayers = [];
        dbPlayers.forEach(dbPlayer => {
            const dbPlayerId = dbPlayer.playerId || (dbPlayer.id && typeof dbPlayer.id === 'string' ? dbPlayer.id.replace('api_', '') : null);
            const found = apiPlayers.find(apiPlayer => 
                apiPlayer.id === dbPlayer.playerId ||
                (dbPlayerId && apiPlayer.id === parseInt(dbPlayerId)) ||
                (dbPlayer.name && apiPlayer.name.toLowerCase() === dbPlayer.name.toLowerCase())
            );
            
            if (!found) {
                extraPlayers.push({
                    name: dbPlayer.name,
                    playerId: dbPlayer.playerId,
                    currentTeam: dbPlayer.currentTeam
                });
            }
        });

        if (extraPlayers.length > 0) {
            console.log(`  ℹ️ データベースにのみ存在（移籍の可能性）: ${extraPlayers.length}名`);
        }

        return {
            teamName,
            apiCount: apiPlayers.length,
            dbCount: dbPlayers.length,
            missingCount: missingPlayers.length,
            missingPlayers: missingPlayers.slice(0, 20) // 最初の20名のみ
        };

    } catch (error) {
        console.error(`  ❌ エラー:`, error.message);
        if (error.response) {
            console.error(`     ステータス: ${error.response.status}`);
            if (error.response.data?.errors) {
                console.error(`     エラー詳細:`, error.response.data.errors);
            }
        }
        return null;
    }
}

// メイン処理
async function main() {
    console.log('🚀 主要チームのスカッド確認開始...\n');

    const results = [];
    
    for (const team of MAJOR_TEAMS) {
        // API制限を避けるため、1秒待機
        await new Promise(resolve => setTimeout(resolve, 1200));
        
        const result = await checkTeamSquad(team.id, team.name, team.leagueId);
        if (result) {
            results.push(result);
        }
    }

    // サマリー
    console.log('\n' + '='.repeat(60));
    console.log('📊 サマリー');
    console.log('='.repeat(60));
    
    results.forEach(result => {
        console.log(`\n${result.teamName}:`);
        console.log(`  APIスカッド: ${result.apiCount}名`);
        console.log(`  データベース: ${result.dbCount}名`);
        console.log(`  不足: ${result.missingCount}名`);
        
        if (result.missingPlayers.length > 0) {
            console.log(`  主な不足選手:`);
            result.missingPlayers.forEach(p => {
                console.log(`    - ${p.name} (ID: ${p.id})`);
            });
        }
    });

    const totalMissing = results.reduce((sum, r) => sum + r.missingCount, 0);
    console.log(`\n合計不足選手数: ${totalMissing}名`);
}

main();

