#!/usr/bin/env node

/**
 * シーズンデータの不一致を修正するスクリプト
 * 2025年のデータが2024年のデータになっている場合を修正
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const API_KEY = process.env.API_FOOTBALL_KEY;
const REQUEST_DELAY = 200; // APIレート制限対策

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

async function verifyAndFixPlayer(player) {
    const playerId = player.playerId || player.apiFootballId || player.id;
    if (!playerId) return { fixed: false, reason: 'No playerId' };
    
    // 2025/2026シーズンのLa Ligaデータを確認
    const laLiga2025 = player.careerStats?.find(cs => 
        (cs.season === '2025/2026' || cs.season === '2025/26') &&
        (cs.leagueName === 'La Liga' || cs.league === 'La Liga')
    );
    
    if (!laLiga2025) return { fixed: false, reason: 'No 2025 La Liga data' };
    
    // APIから2025年のデータを取得
    try {
        const data2025 = await fetchWithDelay(`https://v3.football.api-sports.io/players?season=2025&id=${playerId}`);
        if (!data2025 || !data2025.response || data2025.response.length === 0) {
            return { fixed: false, reason: 'No API data for 2025' };
        }
        
        const stats2025 = data2025.response[0].statistics || [];
        const laLigaStat2025 = stats2025.find(s => s.league?.name === 'La Liga');
        
        if (!laLigaStat2025) return { fixed: false, reason: 'No La Liga data in API' };
        
        const apiMatches = laLigaStat2025.games?.appearences || 0;
        const apiGoals = laLigaStat2025.goals?.total ?? 0;
        const apiAssists = laLigaStat2025.goals?.assists ?? 0;
        const apiRating = laLigaStat2025.games?.rating ? parseFloat(laLigaStat2025.games.rating) : null;
        
        // 2024年のデータも取得して比較
        const data2024 = await fetchWithDelay(`https://v3.football.api-sports.io/players?season=2024&id=${playerId}`);
        let apiMatches2024 = 0;
        let apiGoals2024 = 0;
        let apiAssists2024 = 0;
        let apiRating2024 = null;
        
        if (data2024 && data2024.response && data2024.response.length > 0) {
            const stats2024 = data2024.response[0].statistics || [];
            const laLigaStat2024 = stats2024.find(s => s.league?.name === 'La Liga');
            if (laLigaStat2024) {
                apiMatches2024 = laLigaStat2024.games?.appearences || 0;
                apiGoals2024 = laLigaStat2024.goals?.total ?? 0;
                apiAssists2024 = laLigaStat2024.goals?.assists ?? 0;
                apiRating2024 = laLigaStat2024.games?.rating ? parseFloat(laLigaStat2024.games.rating) : null;
            }
        }
        
        const dbMatches = laLiga2025.matches || laLiga2025.appearances || 0;
        const dbGoals = laLiga2025.goals ?? 0;
        const dbAssists = laLiga2025.assists ?? 0;
        const dbRating = laLiga2025.rating;
        
        // 2025年のデータが2024年のデータと一致している場合は修正
        const matches2024Match = apiMatches2024 > 0 && dbMatches === apiMatches2024 && dbGoals === apiGoals2024 && dbAssists === apiAssists2024;
        const matches2025Match = dbMatches === apiMatches && dbGoals === apiGoals && dbAssists === apiAssists;
        
        if (matches2024Match && !matches2025Match) {
            // 2025年のデータが2024年のデータになっているので修正
            laLiga2025.matches = apiMatches;
            laLiga2025.appearances = apiMatches;
            laLiga2025.goals = apiGoals;
            laLiga2025.assists = apiAssists;
            laLiga2025.rating = apiRating;
            laLiga2025.lastUpdated = new Date().toISOString();
            laLiga2025.source = 'api-football-fixed';
            
            return {
                fixed: true,
                playerName: player.name,
                changes: {
                    matches: `${dbMatches} → ${apiMatches}`,
                    goals: `${dbGoals} → ${apiGoals}`,
                    assists: `${dbAssists} → ${apiAssists}`,
                    rating: `${dbRating} → ${apiRating}`
                }
            };
        }
        
        return { fixed: false, reason: 'Data matches correctly' };
    } catch (error) {
        return { fixed: false, reason: `Error: ${error.message}` };
    }
}

async function main() {
    console.log('🚀 シーズンデータの不一致を修正開始...\n');
    
    // データ読み込み
    const data = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
    const players = Array.isArray(data) ? data : (data.players || []);
    
    // 2025/2026シーズンのLa Ligaデータがある選手をフィルタリング
    const playersWith2025LaLiga = players.filter(p => {
        if (!p.careerStats || !Array.isArray(p.careerStats)) return false;
        return p.careerStats.some(cs => 
            (cs.season === '2025/2026' || cs.season === '2025/26') &&
            (cs.leagueName === 'La Liga' || cs.league === 'La Liga')
        );
    });
    
    console.log(`📊 2025/2026 La Ligaデータがある選手: ${playersWith2025LaLiga.length}名\n`);
    
    let fixedCount = 0;
    const fixedPlayers = [];
    
    // 最初の50名のみチェック（APIレート制限対策）
    const playersToCheck = playersWith2025LaLiga.slice(0, 50);
    
    for (let i = 0; i < playersToCheck.length; i++) {
        const player = playersToCheck[i];
        console.log(`[${i + 1}/${playersToCheck.length}] ${player.name || 'Unknown'} (ID: ${player.playerId || player.apiFootballId || player.id})`);
        
        const result = await verifyAndFixPlayer(player);
        
        if (result.fixed) {
            fixedCount++;
            fixedPlayers.push(result);
            console.log(`  ✅ 修正: ${JSON.stringify(result.changes)}`);
        } else {
            console.log(`  ⏭️  スキップ: ${result.reason}`);
        }
        console.log('');
    }
    
    // データを保存
    const outputData = Array.isArray(data) ? players : { players: players };
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(outputData, null, 2));
    
    console.log('\n============================================================');
    console.log('✅ 修正完了');
    console.log(`📊 チェックした選手数: ${playersToCheck.length}名`);
    console.log(`📊 修正した選手数: ${fixedCount}名`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('============================================================');
    
    if (fixedPlayers.length > 0) {
        console.log('\n📊 修正した選手の詳細:');
        fixedPlayers.forEach((fp, i) => {
            console.log(`  ${i + 1}. ${fp.playerName}: ${JSON.stringify(fp.changes)}`);
        });
    }
}

main().catch(console.error);
