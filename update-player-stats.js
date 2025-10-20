#!/usr/bin/env node

/**
 * 選手統計データ更新スクリプト
 * 
 * データベース内の選手データを実際のAPI-Footballのデータで更新します
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const API_KEY = process.env.API_FOOTBALL_KEY || process.env.RAPIDAPI_KEY;
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const DELAY_BETWEEN_REQUESTS = 1500; // 1.5秒（APIレート制限対策）

// APIから選手統計を取得
async function fetchPlayerStats(playerName) {
    try {
        // 主要リーグで検索
        const majorLeagues = [39, 140, 135, 78, 61, 98, 88, 94]; // Premier League, La Liga, Serie A, Bundesliga, Ligue 1, J1 League, Eredivisie, Primeira Liga
        let response = null;
        let data = null;
        
        // 各リーグで検索を試行
        for (const leagueId of majorLeagues) {
            try {
                response = await fetch(
                    `https://v3.football.api-sports.io/players?search=${encodeURIComponent(playerName)}&league=${leagueId}&season=2024`,
                    {
                        headers: {
                            'x-apisports-key': API_KEY
                        }
                    }
                );
                
                if (response.ok) {
                    data = await response.json();
                    if (data.results > 0) {
                        console.log(`   ✅ リーグ${leagueId}で選手を発見`);
                        break;
                    }
                }
                
                // API制限対策
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.log(`   ⚠️ リーグ${leagueId}での検索エラー: ${error.message}`);
            }
        }

        if (!response || !response.ok || !data || data.results === 0) {
            console.log(`   ⚠️ 選手が見つかりません: ${playerName}`);
            return null;
        }

        const players = data.response || [];

        // 最も一致度が高い選手を選択
        let bestMatch = players[0];
        const exactMatch = players.find(p => 
            p.player.name.toLowerCase() === playerName.toLowerCase()
        );

        if (exactMatch) {
            bestMatch = exactMatch;
        }

        const player = bestMatch.player;
        const stats = bestMatch.statistics?.[0] || {};

        return {
            photo: player.photo,
            age: player.age,
            nationality: player.nationality,
            currentTeam: stats.team?.name,
            teamId: stats.team?.id,
            league: stats.league?.name,
            leagueId: stats.league?.id,
            position: stats.games?.position,
            stats: {
                appearances: stats.games?.appearences || 0,
                lineups: stats.games?.lineups || 0,
                minutes: stats.games?.minutes || 0,
                rating: stats.games?.rating || 'N/A',
                goals: stats.goals?.total || 0,
                assists: stats.goals?.assists || 0,
                saves: stats.goals?.saves || 0,
                conceded: stats.goals?.conceded || 0,
                yellowCards: stats.cards?.yellow || 0,
                redCards: stats.cards?.red || 0,
                shotsTotal: stats.shots?.total || 0,
                shotsOnTarget: stats.shots?.on || 0,
                passesTotal: stats.passes?.total || 0,
                passesKey: stats.passes?.key || 0,
                passAccuracy: stats.passes?.accuracy ? `${stats.passes.accuracy}%` : '0%',
                tackles: stats.tackles?.total || 0,
                blocks: stats.tackles?.blocks || 0,
                interceptions: stats.tackles?.interceptions || 0,
                duelsTotal: stats.duels?.total || 0,
                duelsWon: stats.duels?.won || 0,
                dribblesAttempts: stats.dribbles?.attempts || 0,
                dribblesSuccess: stats.dribbles?.success || 0,
                foulsDraw: stats.fouls?.drawn || 0,
                foulsCommitted: stats.fouls?.committed || 0,
                penalty: stats.penalty || {}
            },
            lastUpdated: new Date().toISOString()
        };

    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        return null;
    }
}

// 遅延関数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// メイン処理
async function main() {
    if (!API_KEY) {
        console.error('❌ API_FOOTBALL_KEY または RAPIDAPI_KEY 環境変数が設定されていません');
        process.exit(1);
    }

    console.log('🚀 選手統計データ更新を開始...\n');

    // 既存の選手データを読み込み
    const playersData = JSON.parse(await fs.readFile(PLAYERS_FILE, 'utf8'));
    console.log(`📊 ${playersData.length}名の選手データを読み込みました\n`);

    let updatedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < playersData.length; i++) {
        const player = playersData[i];
        const progress = `[${i + 1}/${playersData.length}]`;

        console.log(`${progress} ${player.name} を更新中...`);

        // APIから最新データを取得
        const apiData = await fetchPlayerStats(player.name);

        if (apiData) {
            // データを更新
            playersData[i] = {
                ...player,
                ...apiData,
                name: player.name, // 元の名前を保持
                fullName: player.fullName || player.name,
                firstName: player.firstName || player.name.split(' ')[0],
                lastName: player.lastName || player.name.split(' ').slice(1).join(' '),
                source: 'api-football-updated'
            };

            console.log(`   ✅ 更新完了: ${apiData.stats.goals}G ${apiData.stats.assists}A ${apiData.stats.appearances}試合`);
            updatedCount++;
        } else {
            console.log(`   ⚠️ スキップ`);
            failedCount++;
        }

        // APIレート制限対策
        if (i < playersData.length - 1) {
            await delay(DELAY_BETWEEN_REQUESTS);
        }
    }

    // 更新されたデータを保存
    await fs.writeFile(PLAYERS_FILE, JSON.stringify(playersData, null, 2));

    console.log('\n' + '='.repeat(50));
    console.log('✅ 更新完了!');
    console.log(`📊 成功: ${updatedCount}名`);
    console.log(`⚠️  失敗: ${failedCount}名`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('='.repeat(50));
}

main().catch(error => {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
});

