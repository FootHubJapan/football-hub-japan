#!/usr/bin/env node

/**
 * 全選手の最新情報をAPI-Footballから取得して更新
 * チーム、統計、ポジションなどを最新の情報に更新
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

// .envファイルから環境変数を読み込む（既存の環境変数を上書き）
require('dotenv').config({ override: true });

// .envファイルを直接読み込む（フォールバック）
let API_KEY = process.env.API_FOOTBALL_KEY;
if (!API_KEY || API_KEY.length < 30) {
    try {
        const fsSync = require('fs');
        const envContent = fsSync.readFileSync(path.join(__dirname, '.env'), 'utf8');
        const match = envContent.match(/API_FOOTBALL_KEY=(.+)/);
        if (match && match[1]) {
            API_KEY = match[1].trim();
        }
    } catch (err) {
        // .envファイルが読めない場合はフォールバック値を使用
    }
}

// 最終的なフォールバック値
API_KEY = API_KEY || '53cfd1d0230dfe92a2d99f81ca0fab88';
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

// API呼び出し間隔（ミリ秒）- レート制限対策
const API_DELAY = 350;

// バッチ処理サイズ（一度に処理する選手数）
const BATCH_SIZE = 100;
// バッチ間の待機時間（秒）
const BATCH_DELAY = 60;

async function fetchPlayerLatestInfo(playerId) {
    const headers = { 'x-apisports-key': API_KEY };
    
    // まず2024シーズンを試す（データがより充実している可能性が高い）
    const seasons = [2024, 2025];
    
    for (const season of seasons) {
        try {
            const url = `https://v3.football.api-sports.io/players?id=${playerId}&season=${season}`;
            const response = await axios.get(url, { headers, timeout: 10000 });
            const data = response.data;
            
            if (data.response && data.response.length > 0) {
                return data.response[0];
            }
        } catch (error) {
            if (error.response && error.response.status === 429) {
                // レート制限エラー
                console.error(`  ⚠️ Rate limit exceeded for player ${playerId}, waiting...`);
                await new Promise(resolve => setTimeout(resolve, 60000)); // 60秒待機
                return null;
            }
            // 404エラーなどは次のシーズンを試す
            if (error.response && error.response.status === 404) {
                continue;
            }
            // その他のエラーはログに記録して続行
            if (season === seasons[seasons.length - 1]) {
                // 最後のシーズンでも失敗した場合のみエラーを記録
                console.error(`  ⚠️ Error fetching player ${playerId}:`, error.message);
            }
        }
    }
    
    return null;
}

function updatePlayerFromApiData(existingPlayer, apiData) {
    const playerInfo = apiData.player;
    const statistics = apiData.statistics || [];
    
    // 最も関連性の高いリーグの統計を取得（リーグ戦のみ）
    // 主要5大リーグ + MLS + サウジを優先、なければ最初の統計を使用
    const mainLeagueStats = statistics.find(s => {
        const leagueId = s.league?.id;
        // 主要5大リーグ + MLS + サウジ
        return [39, 140, 135, 78, 61, 253, 307].includes(leagueId);
    }) || statistics[0];
    
    // 統計データがない場合でも、基本情報とチーム情報は更新する
    // 最新のチーム情報を取得（統計データから、または最初の統計から）
    const latestTeam = mainLeagueStats?.team || (statistics.length > 0 ? statistics[0]?.team : null);
    const latestLeague = mainLeagueStats?.league || (statistics.length > 0 ? statistics[0]?.league : null);
    
    // 新しい選手データを構築
    const updatedPlayer = {
        ...(existingPlayer || {}),
        playerId: playerInfo.id,
        name: playerInfo.name,
        fullName: (playerInfo.firstname || '') + ' ' + (playerInfo.lastname || ''),
        firstName: playerInfo.firstname || existingPlayer?.firstName || '',
        lastName: playerInfo.lastname || existingPlayer?.lastName || '',
        age: playerInfo.age || existingPlayer?.age || null,
        nationality: playerInfo.nationality || existingPlayer?.nationality || 'Unknown',
        height: playerInfo.height || existingPlayer?.height || null,
        weight: playerInfo.weight || existingPlayer?.weight || null,
        photo: playerInfo.photo || existingPlayer?.photo || null,
        // 最新のチーム情報を更新（統計データがあれば優先、なければ既存データを保持）
        currentTeam: latestTeam?.name || existingPlayer?.currentTeam || 'Unknown',
        teamId: latestTeam?.id || existingPlayer?.teamId || null,
        teamLogo: latestTeam?.logo || existingPlayer?.teamLogo || null,
        league: latestLeague?.name || existingPlayer?.league || 'Unknown',
        leagueId: latestLeague?.id || existingPlayer?.leagueId || null,
        leagueLogo: latestLeague?.logo || existingPlayer?.leagueLogo || null,
        position: mainLeagueStats?.games?.position || existingPlayer?.position || 'Unknown',
        season: '2025/2026',
        lastUpdated: new Date().toISOString(),
    };
    
    // stats の更新（統計データがある場合のみ）
    let statsData = null;
    if (mainLeagueStats) {
        statsData = {
            appearances: mainLeagueStats.games?.appearences || 0,
            lineups: mainLeagueStats.games?.lineups || 0,
            minutes: mainLeagueStats.games?.minutes || 0,
            rating: mainLeagueStats.games?.rating || null,
            goals: mainLeagueStats.goals?.total || 0,
            assists: mainLeagueStats.goals?.assists || 0,
            saves: mainLeagueStats.goals?.saves || 0,
            conceded: mainLeagueStats.goals?.conceded || 0,
            passes: mainLeagueStats.passes?.total || 0,
            keyPasses: mainLeagueStats.passes?.key || 0,
            accuracy: mainLeagueStats.passes?.accuracy || 0,
            tackles: mainLeagueStats.tackles?.total || 0,
            blocks: mainLeagueStats.tackles?.blocks || 0,
            interceptions: mainLeagueStats.tackles?.interceptions || 0,
            duelsTotal: mainLeagueStats.duels?.total || 0,
            duelsWon: mainLeagueStats.duels?.won || 0,
            dribblesAttempts: mainLeagueStats.dribbles?.attempts || 0,
            dribblesSuccess: mainLeagueStats.dribbles?.success || 0,
            foulsDrawn: mainLeagueStats.fouls?.drawn || 0,
            foulsCommitted: mainLeagueStats.fouls?.committed || 0,
            cardsYellow: mainLeagueStats.cards?.yellow || 0,
            cardsRed: mainLeagueStats.cards?.red || 0,
            penaltyWon: mainLeagueStats.penalty?.won || 0,
            penaltyCommitted: mainLeagueStats.penalty?.committed || 0,
            penaltyScored: mainLeagueStats.penalty?.scored || 0,
            penaltyMissed: mainLeagueStats.penalty?.missed || 0,
            penaltySaved: mainLeagueStats.penalty?.saved || 0,
        };
    }
    
    // stats の更新（統計データがある場合のみ更新）
    if (statsData) {
        // 既存のstatsが配列の場合はその構造を保持、オブジェクトの場合は更新
        if (existingPlayer?.stats && Array.isArray(existingPlayer.stats)) {
            // 配列の場合は2025/26シーズンのエントリを更新または追加
            const seasonIndex = existingPlayer.stats.findIndex(s => 
                s.season === '2025/26' || s.season === '2025/2026'
            );
            const seasonEntry = {
                season: '2025/26',
                leagueName: updatedPlayer.league,
                league: updatedPlayer.league,
                leagueId: updatedPlayer.leagueId,
                teamName: updatedPlayer.currentTeam,
                teamId: updatedPlayer.teamId,
                ...statsData,
            };
            if (seasonIndex >= 0) {
                existingPlayer.stats[seasonIndex] = seasonEntry;
            } else {
                existingPlayer.stats.unshift(seasonEntry);
            }
            updatedPlayer.stats = existingPlayer.stats;
        } else {
            // オブジェクトの場合は直接更新
            updatedPlayer.stats = statsData;
        }
        
        // careerStats と既存のデータは保持
        updatedPlayer.careerStats = existingPlayer?.careerStats || [];
        
        // 2025/26シーズンのcareerStatsを更新
        if (updatedPlayer.careerStats && Array.isArray(updatedPlayer.careerStats)) {
            const season2526Index = updatedPlayer.careerStats.findIndex(s => 
                (s.season === '2025/2026' || s.season === '2025/26') && s.leagueId === updatedPlayer.leagueId
            );
            
            const seasonEntry = {
                season: '2025/2026',
                leagueName: updatedPlayer.league,
                leagueId: updatedPlayer.leagueId,
                teamName: updatedPlayer.currentTeam,
                teamId: updatedPlayer.teamId,
                matches: statsData.appearances,
                appearances: statsData.appearances,
                goals: statsData.goals,
                assists: statsData.assists,
                minutes: statsData.minutes,
                rating: statsData.rating,
                source: 'api-football-latest',
            lastUpdated: new Date().toISOString(),
            };
            
            if (season2526Index >= 0) {
                updatedPlayer.careerStats[season2526Index] = seasonEntry;
            } else {
                updatedPlayer.careerStats.unshift(seasonEntry);
            }
        }
    } else {
        // 統計データがない場合は既存のstatsを保持
        updatedPlayer.stats = existingPlayer?.stats || {};
        updatedPlayer.careerStats = existingPlayer?.careerStats || [];
    }
    
    return updatedPlayer;
}

async function main() {
    console.log('🚀 全選手の最新情報をAPI-Footballから取得中...\n');
    
    // データ読み込み
    const data = await fs.readFile(PLAYERS_FILE, 'utf8');
    const players = JSON.parse(data);
    const playerMap = new Map(players.map(p => [p.playerId, p]));
    
    console.log(`📊 現在のデータベース: ${players.length}名の選手\n`);
    
    // playerIdが有効な選手のみをフィルタリング
    const playersToUpdate = players.filter(p => p.playerId && typeof p.playerId === 'number');
    console.log(`🔄 更新対象: ${playersToUpdate.length}名の選手\n`);

        let updatedCount = 0;
    let errorCount = 0;
        let skippedCount = 0;
    let teamChangedCount = 0;
    
    // バッチ処理で全選手を更新
    const totalBatches = Math.ceil(playersToUpdate.length / BATCH_SIZE);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * BATCH_SIZE;
        const endIndex = Math.min(startIndex + BATCH_SIZE, playersToUpdate.length);
        const batch = playersToUpdate.slice(startIndex, endIndex);
        
        console.log(`\n📦 バッチ ${batchIndex + 1}/${totalBatches} (${startIndex + 1}-${endIndex} / ${playersToUpdate.length})`);
        
        for (const player of batch) {
            try {
                const playerId = player.playerId;
                const playerName = player.name || `ID: ${playerId}`;
                
                // 進捗表示（10人ごと）
                const processed = updatedCount + errorCount + skippedCount;
                if (processed % 10 === 0 && processed > 0) {
                    process.stdout.write(`\r  処理中: ${processed}/${playersToUpdate.length} (更新: ${updatedCount}, エラー: ${errorCount}, スキップ: ${skippedCount})`);
                }
                
                const apiData = await fetchPlayerLatestInfo(playerId);
                
                if (apiData) {
                    const existingPlayer = playerMap.get(playerId);
                    const updatedPlayer = updatePlayerFromApiData(existingPlayer, apiData);
                    
                    if (!updatedPlayer) {
                        // updatePlayerFromApiDataがnullを返した場合
                        skippedCount++;
                        if (processed % 50 === 0) {
                            console.log(`\n  ⚠️ ${playerName} (ID: ${playerId}) の更新データが生成できませんでした`);
                        }
                    } else {
                        // 更新された選手データを保存
                        const prevTeam = existingPlayer?.currentTeam || 'N/A';
                        const newTeam = updatedPlayer.currentTeam;
                        const teamChanged = prevTeam !== newTeam && prevTeam !== 'N/A' && prevTeam !== 'Unknown';
                        
                        if (teamChanged) {
                            teamChangedCount++;
                            // チーム変更があった場合はログ出力
                            if (processed % 50 === 0) {
                                console.log(`\n  🔄 ${playerName}: ${prevTeam} → ${newTeam}`);
                            }
                        }
                        
                        // プレイヤーマップを更新
                        if (existingPlayer) {
                            Object.assign(existingPlayer, updatedPlayer);
                        } else {
                            players.push(updatedPlayer);
                            playerMap.set(playerId, updatedPlayer);
                        }
                        
                        updatedCount++;
                        // 最初の10人は詳細ログを出力
                        if (updatedCount <= 10) {
                            console.log(`\n  ✅ ${playerName} (ID: ${playerId}) を更新: ${newTeam}`);
                        }
                    }
                } else {
                    // APIからデータが取得できなかった場合
                    skippedCount++;
                    // スキップ理由をログ出力（50人ごと）
                    if (skippedCount % 50 === 0 && skippedCount > 0) {
                        console.log(`\n  ⚠️ ${playerName} (ID: ${playerId}) のデータが取得できませんでした`);
                    }
                }
                
                // API呼び出し間隔
                await new Promise(resolve => setTimeout(resolve, API_DELAY));

            } catch (error) {
                console.error(`\n  ❌ Player ID ${player.playerId} の更新エラー:`, error.message);
                errorCount++;
            }
        }
        
        // バッチ間の待機（最後のバッチ以外）
        if (batchIndex < totalBatches - 1) {
            console.log(`\n⏳ ${BATCH_DELAY}秒待機中... (レート制限対策)`);
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY * 1000));
        }
        
        // 中間保存（バッチごと）
        await fs.writeFile(PLAYERS_FILE, JSON.stringify(players, null, 2), 'utf8');
        const comprehensiveFile = path.join(__dirname, 'data', 'comprehensive-players.json');
        await fs.writeFile(comprehensiveFile, JSON.stringify(players, null, 2), 'utf8');
        console.log(`\n💾 中間保存完了`);
    }
    
    // 最終保存
    await fs.writeFile(PLAYERS_FILE, JSON.stringify(players, null, 2), 'utf8');
    const comprehensiveFile = path.join(__dirname, 'data', 'comprehensive-players.json');
    await fs.writeFile(comprehensiveFile, JSON.stringify(players, null, 2), 'utf8');
    
    console.log(`\n\n✨ 完了！`);
    console.log(`   更新: ${updatedCount}名`);
    console.log(`   エラー: ${errorCount}件`);
    console.log(`   スキップ: ${skippedCount}名`);
    console.log(`   チーム変更: ${teamChangedCount}名`);
    console.log(`   総選手数: ${players.length}名`);
    console.log(`\n📝 players.json と comprehensive-players.json を更新しました`);
}

main().catch(console.error);
