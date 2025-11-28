#!/usr/bin/env node

/**
 * 全選手データを最新のAPI-Footballデータで更新するスクリプト
 * 
 * DatabaseManagerから全選手を取得し、API-Footballから最新の統計データを取得して更新します
 */

require('dotenv').config();
const axios = require('axios');
const path = require('path');
const DatabaseManager = require('./databaseManager');

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const DELAY_BETWEEN_REQUESTS = 1200; // 1.2秒（APIレート制限対策）
const MAX_REQUESTS_PER_MINUTE = 30; // API制限

if (!API_FOOTBALL_KEY) {
    console.error('❌ API_FOOTBALL_KEY 環境変数が設定されていません');
    process.exit(1);
}

// 選手統計を正規化
function normalizePlayerStats(stat) {
    if (!stat || !stat.league || !stat.team) {
        return null;
    }
    
    const season = stat.league?.season || 2025;
    const seasonStr = `${season}/${String(season + 1).slice(-2)}`;
    
    return {
        season: seasonStr,
        leagueName: stat.league?.name || 'Unknown',
        league: stat.league?.name || 'Unknown',
        teamName: stat.team?.name || 'Unknown',
        teamId: stat.team?.id || null,
        appearances: stat.games?.appearences || stat.games?.lineups || 0,
        lineups: stat.games?.lineups || 0,
        minutes: stat.games?.minutes || 0,
        rating: stat.games?.rating ? parseFloat(stat.games.rating) : 0,
        goals: stat.goals?.total || 0,
        assists: stat.goals?.assists || 0,
        saves: stat.goals?.saves || 0,
        conceded: stat.goals?.conceded || 0,
        yellowCards: stat.cards?.yellow || 0,
        redCards: stat.cards?.red || 0,
        shotsTotal: stat.shots?.total || 0,
        shotsOnTarget: stat.shots?.on || 0,
        passesTotal: stat.passes?.total || 0,
        passesKey: stat.passes?.key || 0,
        passAccuracy: stat.passes?.accuracy || 0,
        tackles: stat.tackles?.total || 0,
        blocks: stat.tackles?.blocks || 0,
        interceptions: stat.tackles?.interceptions || 0,
        duelsTotal: stat.duels?.total || 0,
        duelsWon: stat.duels?.won || 0,
        dribblesAttempts: stat.dribbles?.attempts || 0,
        dribblesSuccess: stat.dribbles?.success || 0,
        foulsDrawn: stat.fouls?.drawn || 0,
        foulsCommitted: stat.fouls?.committed || 0,
        cleanSheets: stat.goals?.conceded === 0 ? 1 : 0
    };
}

// API-Footballから選手の最新統計を取得
async function fetchLatestPlayerStats(playerId, season = 2025) {
    try {
        const url = `https://v3.football.api-sports.io/players?id=${playerId}&season=${season}`;
        const response = await axios.get(url, {
            headers: {
                'x-apisports-key': API_FOOTBALL_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            },
            timeout: 15000
        });

        if (!response.data || !response.data.response || response.data.response.length === 0) {
            return null;
        }

        const apiData = response.data.response[0];
        const player = apiData.player;
        const statistics = apiData.statistics || [];

        // 統計データを正規化
        const statsArray = [];
        for (const stat of statistics) {
            const normalized = normalizePlayerStats(stat);
            if (normalized) {
                statsArray.push(normalized);
            }
        }

        // 最新のチーム名を取得（最も出場数の多いコンペティションから）
        const mainStats = statsArray.sort((a, b) => (b.appearances || 0) - (a.appearances || 0))[0];
        const latestTeamName = mainStats?.teamName || statistics[0]?.team?.name || 'Unknown';
        const latestLeagueName = mainStats?.leagueName || statistics[0]?.league?.name || 'Unknown';

        return {
            player: {
                id: player.id,
                name: player.name,
                fullName: player.name,
                age: player.age,
                nationality: player.nationality,
                photo: player.photo,
                birth: player.birth
            },
            stats: statsArray,
            currentTeam: latestTeamName,
            league: latestLeagueName,
            teamId: mainStats?.teamId || statistics[0]?.team?.id || null
        };
    } catch (error) {
        if (error.response?.status === 429) {
            console.error('   ⚠️ APIレート制限に達しました');
            throw new Error('RATE_LIMIT');
        }
        console.error(`   ⚠️ APIエラー: ${error.message}`);
        return null;
    }
}

// 選手データを更新
async function updatePlayer(player, dbManager, requestCount) {
    try {
        // playerIdを取得
        let playerId = player.playerId || player.id;
        
        // api_形式のIDを処理
        if (typeof playerId === 'string' && playerId.startsWith('api_')) {
            playerId = playerId.replace('api_', '');
        }
        
        // 数値に変換
        playerId = parseInt(playerId, 10);
        
        if (!playerId || isNaN(playerId)) {
            return { updated: false, reason: 'INVALID_ID' };
        }

        // APIレート制限チェック
        if (requestCount.current >= MAX_REQUESTS_PER_MINUTE) {
            console.log('⏳ API制限に達しました。1分待機...');
            await new Promise(resolve => setTimeout(resolve, 60000));
            requestCount.current = 0;
        }

        // 最新統計を取得
        const latestData = await fetchLatestPlayerStats(playerId, 2025);
        requestCount.current++;

        if (!latestData || !latestData.stats || latestData.stats.length === 0) {
            return { updated: false, reason: 'NO_DATA' };
        }

        // 既存のstatsを取得
        let existingStats = [];
        if (Array.isArray(player.stats)) {
            existingStats = player.stats;
        } else if (player.stats) {
            existingStats = [player.stats];
        }

        // 2025/2026シーズンの統計を更新（既存のものを削除してから追加）
        existingStats = existingStats.filter(s => {
            const statSeason = String(s.season || '');
            return !statSeason.includes('2025') && !statSeason.includes('2026');
        });

        // 新しい統計を追加
        existingStats.push(...latestData.stats);

        // 選手データを更新
        const updatedPlayer = {
            ...player,
            id: playerId,
            playerId: playerId,
            name: latestData.player.name || player.name,
            fullName: latestData.player.fullName || player.fullName || player.name,
            age: latestData.player.age || player.age,
            nationality: latestData.player.nationality || player.nationality,
            photo: latestData.player.photo || player.photo,
            currentTeam: latestData.currentTeam || player.currentTeam,
            league: latestData.league || player.league,
            teamId: latestData.teamId || player.teamId,
            stats: existingStats,
            lastUpdated: new Date().toISOString(),
            source: 'api-football-latest'
        };

        // データベースに保存
        await dbManager.saveComprehensivePlayer(updatedPlayer);

        return { 
            updated: true, 
            goals: latestData.stats.reduce((sum, s) => sum + (s.goals || 0), 0),
            assists: latestData.stats.reduce((sum, s) => sum + (s.assists || 0), 0),
            appearances: latestData.stats.reduce((sum, s) => sum + (s.appearances || 0), 0)
        };
    } catch (error) {
        if (error.message === 'RATE_LIMIT') {
            throw error; // 上位に伝播
        }
        console.error(`   ❌ 更新エラー: ${error.message}`);
        return { updated: false, reason: 'ERROR', error: error.message };
    }
}

// メイン処理
async function main() {
    console.log('🚀 全選手データを最新のAPI-Footballデータで更新開始...\n');

    const dbManager = new DatabaseManager();
    
    try {
        // 全選手を取得
        console.log('📊 データベースから全選手を読み込み中...');
        const allPlayers = await dbManager.loadComprehensivePlayers();
        console.log(`✅ ${allPlayers.length}名の選手データを読み込みました\n`);

        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        const requestCount = { current: 0 };

        // 各選手を更新
        for (let i = 0; i < allPlayers.length; i++) {
            const player = allPlayers[i];
            const progress = `[${i + 1}/${allPlayers.length}]`;

            // 進捗表示（50名ごと）
            if ((i + 1) % 50 === 0) {
                console.log(`\n📊 進捗: ${progress} (更新: ${updatedCount}名, スキップ: ${skippedCount}名, エラー: ${errorCount}名)`);
            }

            try {
                const result = await updatePlayer(player, dbManager, requestCount);

                if (result.updated) {
                    updatedCount++;
                    if ((i + 1) % 10 === 0) {
                        console.log(`${progress} ✅ ${player.name || 'Unknown'}: ${result.goals}G ${result.assists}A ${result.appearances}試合`);
                    }
                } else {
                    skippedCount++;
                    if (result.reason === 'INVALID_ID') {
                        if ((i + 1) % 100 === 0) {
                            console.log(`${progress} ⚠️ ${player.name || 'Unknown'}: 無効なID`);
                        }
                    } else if (result.reason === 'NO_DATA') {
                        if ((i + 1) % 100 === 0) {
                            console.log(`${progress} ⚠️ ${player.name || 'Unknown'}: データなし`);
                        }
                    }
                }

                // APIレート制限対策
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));

            } catch (error) {
                if (error.message === 'RATE_LIMIT') {
                    console.log('\n⏳ APIレート制限に達しました。1分待機...');
                    await new Promise(resolve => setTimeout(resolve, 60000));
                    requestCount.current = 0;
                    i--; // リトライ
                    continue;
                }
                errorCount++;
                console.error(`${progress} ❌ ${player.name || 'Unknown'}: ${error.message}`);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ 更新完了!');
        console.log(`📊 成功: ${updatedCount}名`);
        console.log(`⚠️ スキップ: ${skippedCount}名`);
        console.log(`❌ エラー: ${errorCount}名`);
        console.log('='.repeat(60));

    } catch (error) {
        console.error('❌ 致命的エラー:', error);
        process.exit(1);
    }
}

// スクリプト実行
if (require.main === module) {
    main().catch(error => {
        console.error('❌ 実行エラー:', error);
        process.exit(1);
    });
}

module.exports = { updatePlayer, fetchLatestPlayerStats };

