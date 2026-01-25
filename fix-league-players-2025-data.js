#!/usr/bin/env node

/**
 * 指定されたリーグの選手の2025/26シーズンデータをAPIから取得して修正するスクリプト
 * 使用方法: node fix-league-players-2025-data.js <リーグ名> [開始位置] [バッチサイズ]
 * 例: node fix-league-players-2025-data.js "Premier League" 0 100
 */

require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
// 環境変数から直接読み込む（dotenvの問題を回避）
const API_KEY = process.env.API_FOOTBALL_KEY || '53cfd1d0230dfe92a2d99f81ca0fab88';
const REQUEST_DELAY = 200;

// リーグ名のマッピング（APIとデータベースで異なる場合）
const LEAGUE_MAPPING = {
    'Premier League': ['Premier League'],
    'Serie A': ['Serie A'],
    'Bundesliga': ['Bundesliga'],
    'Ligue 1': ['Ligue 1', 'Ligue1'],
    'La Liga': ['La Liga', 'LaLiga']
};

async function fetchWithDelay(url) {
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
    try {
        const response = await axios.get(url, {
            headers: { 'x-apisports-key': API_KEY }
        });
        if (response.data.errors && Object.keys(response.data.errors).length > 0) {
            return null;
        }
        return response.data;
    } catch (error) {
        if (error.response?.status === 429) {
            console.warn('⏳ APIレート制限に達しました。60秒待機...');
            await new Promise(resolve => setTimeout(resolve, 60000));
            return null;
        }
        return null;
    }
}

async function updatePlayer2025Data(player, targetLeague) {
    const playerId = player.playerId || player.apiFootballId || player.id;
    if (!playerId) return { updated: false, reason: 'No playerId' };
    
    if (!player.careerStats || !Array.isArray(player.careerStats)) {
        return { updated: false, reason: 'No careerStats' };
    }
    
    // APIから2025年のデータを取得
    try {
        const data2025 = await fetchWithDelay(`https://v3.football.api-sports.io/players?season=2025&id=${playerId}`);
        if (!data2025 || !data2025.response || data2025.response.length === 0) {
            return { updated: false, reason: 'No API data for 2025' };
        }
        
        const apiStats2025 = data2025.response[0].statistics || [];
        if (apiStats2025.length === 0) {
            return { updated: false, reason: 'No statistics in API response' };
        }
        
        // 指定されたリーグのデータのみを抽出
        const leagueVariants = LEAGUE_MAPPING[targetLeague] || [targetLeague];
        const leagueStats = apiStats2025.filter(stat => 
            leagueVariants.some(variant => 
                stat.league?.name === variant || stat.league?.name?.includes(variant)
            )
        );
        
        if (leagueStats.length === 0) {
            return { updated: false, reason: `No ${targetLeague} data in API response` };
        }
        
        // 既存の2025/2026シーズンの該当リーグデータを削除
        const leagueNamesToRemove = leagueVariants;
        player.careerStats = player.careerStats.filter(cs => 
            !((cs.season === '2025/2026' || cs.season === '2025/26') && 
              leagueNamesToRemove.some(ln => 
                  cs.leagueName === ln || cs.league === ln
              ))
        );
        
        // APIから取得した2025年のリーグデータを追加
        const changes = [];
        leagueStats.forEach(apiStat => {
            const leagueName = apiStat.league?.name || targetLeague;
            const teamName = apiStat.team?.name || 'Unknown';
            const matches = apiStat.games?.appearences || 0;
            const goals = apiStat.goals?.total ?? 0;
            const assists = apiStat.goals?.assists ?? 0;
            const rating = apiStat.games?.rating ? parseFloat(apiStat.games.rating) : null;
            const minutes = apiStat.games?.minutes || 0;
            
            player.careerStats.push({
                season: '2025/2026',
                leagueName: leagueName,
                leagueId: apiStat.league?.id || null,
                teamName: teamName,
                teamId: apiStat.team?.id || null,
                matches: matches,
                appearances: matches,
                goals: goals,
                assists: assists,
                rating: rating,
                minutes: minutes,
                source: 'api-football-2025-updated',
                lastUpdated: new Date().toISOString()
            });
            
            changes.push({
                league: leagueName,
                team: teamName,
                matches: matches,
                goals: goals,
                assists: assists
            });
        });
        
        // stats配列も更新
        if (!player.stats || !Array.isArray(player.stats)) {
            player.stats = [];
        }
        
        // 既存の2025/2026シーズンの該当リーグstatsを削除
        player.stats = player.stats.filter(s => 
            !((s.season === '2025/2026' || s.season === '2025/26') && 
              leagueNamesToRemove.some(ln => 
                  s.leagueName === ln || s.league === ln
              ))
        );
        
        // APIから取得した2025年のリーグデータをstatsに追加
        leagueStats.forEach(apiStat => {
            const games = apiStat.games || {};
            const goals = apiStat.goals || {};
            const cards = apiStat.cards || {};
            const shots = apiStat.shots || {};
            const passes = apiStat.passes || {};
            const tackles = apiStat.tackles || {};
            const duels = apiStat.duels || {};
            const dribbles = apiStat.dribbles || {};
            const fouls = apiStat.fouls || {};
            const penalty = apiStat.penalty || {};
            
            player.stats.push({
                season: '2025/2026',
                leagueName: apiStat.league?.name || targetLeague,
                leagueId: apiStat.league?.id || null,
                teamName: apiStat.team?.name || null,
                teamId: apiStat.team?.id || null,
                appearances: games.appearences || 0,
                lineups: games.lineups || 0,
                minutes: games.minutes || 0,
                goals: goals.total ?? 0,
                assists: goals.assists ?? 0,
                yellowCards: cards.yellow || 0,
                redCards: cards.red || 0,
                rating: games.rating ? parseFloat(games.rating) : null,
                shotsTotal: shots.total || 0,
                shotsOnTarget: shots.on || 0,
                passesTotal: passes.total || 0,
                passesKey: passes.key || 0,
                passesAccuracy: passes.accuracy || null,
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
                source: 'api-football-2025-updated',
                lastUpdated: new Date().toISOString()
            });
        });
        
        return { updated: true, changes, playerName: player.name };
    } catch (error) {
        return { updated: false, reason: `Error: ${error.message}` };
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('❌ 使用方法: node fix-league-players-2025-data.js <リーグ名> [開始位置] [バッチサイズ]');
        console.error('例: node fix-league-players-2025-data.js "Premier League" 0 100');
        process.exit(1);
    }
    
    const targetLeague = args[0];
    const startIndex = args[1] ? parseInt(args[1]) : 0;
    const batchSize = args[2] ? parseInt(args[2]) : 100;
    const endIndex = Math.min(startIndex + batchSize, 999999);
    
    console.log(`🚀 ${targetLeague}の選手の2025/26シーズンデータをAPIから取得して修正開始...\n`);
    console.log(`📊 チェック範囲: ${startIndex}〜${endIndex}名\n`);
    
    // データ読み込み
    const data = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
    const players = Array.isArray(data) ? data : (data.players || []);
    
    // 指定されたリーグの2025/2026シーズンデータがある選手をフィルタリング
    const leagueVariants = LEAGUE_MAPPING[targetLeague] || [targetLeague];
    const playersWith2025League = players.filter(p => {
        if (!p.careerStats || !Array.isArray(p.careerStats)) return false;
        return p.careerStats.some(cs => 
            (cs.season === '2025/2026' || cs.season === '2025/26') &&
            leagueVariants.some(ln => 
                cs.leagueName === ln || cs.league === ln
            )
        );
    });
    
    console.log(`📊 ${targetLeague}の2025/2026シーズンデータがある選手: ${playersWith2025League.length}名\n`);
    
    const playersToCheck = playersWith2025League.slice(startIndex, endIndex);
    
    let updatedCount = 0;
    const updatedPlayers = [];
    let errorCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < playersToCheck.length; i++) {
        const player = playersToCheck[i];
        const playerId = player.playerId || player.apiFootballId || player.id;
        
        if ((i + 1) % 10 === 0) {
            console.log(`進捗: [${i + 1}/${playersToCheck.length}] (更新: ${updatedCount}名, スキップ: ${skippedCount}名)`);
        }
        
        try {
            const result = await updatePlayer2025Data(player, targetLeague);
            
            if (result.updated) {
                updatedCount++;
                updatedPlayers.push(result);
                
                if (updatedCount <= 20) {
                    console.log(`✅ ${player.name}: ${result.changes.length}件の${targetLeague}データ更新`);
                    result.changes.forEach(change => {
                        console.log(`    - ${change.team}: 試合${change.matches}, ゴール${change.goals}, アシスト${change.assists}`);
                    });
                }
            } else {
                skippedCount++;
            }
        } catch (error) {
            errorCount++;
            if (errorCount <= 5) {
                console.error(`❌ ${player.name}: ${error.message}`);
            }
        }
    }
    
    // データを保存
    const outputData = Array.isArray(data) ? players : { players: players };
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(outputData, null, 2));
    
    console.log('\n============================================================');
    console.log('✅ 修正完了');
    console.log(`📊 チェックした選手数: ${playersToCheck.length}名`);
    console.log(`📊 更新した選手数: ${updatedCount}名`);
    console.log(`⏭️  スキップした選手数: ${skippedCount}名`);
    console.log(`❌ エラー: ${errorCount}名`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('============================================================');
    
    if (updatedPlayers.length > 0 && updatedPlayers.length <= 30) {
        console.log('\n📊 更新した選手の詳細:');
        updatedPlayers.forEach((up, i) => {
            console.log(`  ${i + 1}. ${up.playerName}: ${up.changes.length}件の変更`);
        });
    }
    
    if (endIndex < playersWith2025League.length) {
        console.log(`\n💡 続きを実行するには:`);
        console.log(`   node fix-league-players-2025-data.js "${targetLeague}" ${endIndex} ${batchSize}\n`);
    }
}

main().catch(console.error);
