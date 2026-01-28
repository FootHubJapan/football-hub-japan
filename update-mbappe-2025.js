#!/usr/bin/env node

/**
 * API-Footballからエンバペの2025シーズンの最新データを取得して更新
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

require('dotenv').config({ override: true });

const API_KEY = process.env.API_FOOTBALL_KEY || process.env.RAPIDAPI_KEY;
const PLAYER_ID = 278; // Kylian Mbappé
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

if (!API_KEY || API_KEY.length < 10) {
    console.error('❌ APIキーが正しく設定されていません');
    process.exit(1);
}

// API-Footballの統計データを正規化
function normalizePlayerStats(stat) {
    if (!stat) return null;
    
    return {
        season: stat.league?.season || '2025/2026',
        leagueName: stat.league?.name || 'Unknown',
        leagueId: stat.league?.id || null,
        teamName: stat.team?.name || 'Unknown',
        teamId: stat.team?.id || null,
        appearances: stat.games?.appearences || stat.games?.appearances || 0,
        lineups: stat.games?.lineups || 0,
        minutes: stat.games?.minutes || 0,
        rating: stat.games?.rating ? parseFloat(stat.games.rating) : null,
        goals: stat.goals?.total || 0,
        assists: stat.goals?.assists || 0,
        yellowCards: stat.cards?.yellow || 0,
        redCards: stat.cards?.red || 0,
        shotsTotal: stat.shots?.total || 0,
        shotsOnTarget: stat.shots?.on || 0,
        passesTotal: stat.passes?.total || 0,
        passesKey: stat.passes?.key || 0,
        passesAccuracy: stat.passes?.accuracy || null,
        tackles: stat.tackles?.total || 0,
        blocks: stat.tackles?.blocks || 0,
        interceptions: stat.tackles?.interceptions || 0,
        duelsTotal: stat.duels?.total || 0,
        duelsWon: stat.duels?.won || 0,
        dribblesAttempts: stat.dribbles?.attempts || 0,
        dribblesSuccess: stat.dribbles?.success || 0,
        foulsDraw: stat.fouls?.drawn || 0,
        foulsCommitted: stat.fouls?.committed || 0,
        penalty: {
            won: stat.penalty?.won || null,
            commited: stat.penalty?.commited || null,
            scored: stat.penalty?.scored || 0,
            missed: stat.penalty?.missed || 0,
            saved: stat.penalty?.saved || null
        },
        source: 'api-football-2025-latest',
        lastUpdated: new Date().toISOString()
    };
}

async function updateMbappe2025() {
    try {
        console.log('🔍 API-Footballからエンバペの2025シーズンデータを取得中...');
        console.log('Player ID:', PLAYER_ID);
        
        // API-Footballからデータを取得
        const response = await axios.get('https://v3.football.api-sports.io/players', {
            headers: {
                'x-apisports-key': API_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            },
            params: {
                id: PLAYER_ID,
                season: 2025
            },
            timeout: 20000
        });
        
        if (!response.data || !response.data.response || response.data.response.length === 0) {
            console.log('❌ APIからデータが取得できませんでした');
            return;
        }
        
        const apiData = response.data.response[0];
        const player = apiData.player;
        
        console.log('\n✅ API-Footballからデータ取得成功');
        console.log('選手名:', player.name);
        console.log('チーム:', apiData.statistics && apiData.statistics.length > 0 ? apiData.statistics[0].team.name : 'N/A');
        
        // 統計データを正規化
        const statsArray = [];
        if (apiData.statistics && Array.isArray(apiData.statistics)) {
            console.log('\n=== 2025シーズンの統計（全リーグ） ===');
            apiData.statistics.forEach((stat, index) => {
                const normalized = normalizePlayerStats(stat);
                if (normalized) {
                    statsArray.push(normalized);
                    console.log(`\n【${normalized.leagueName}】`);
                    console.log('試合数:', normalized.appearances);
                    console.log('ゴール:', normalized.goals);
                    console.log('アシスト:', normalized.assists);
                    console.log('評価:', normalized.rating ? normalized.rating.toFixed(1) : 'N/A');
                }
            });
        }
        
        // データベースを読み込み
        const data = await fs.readFile(PLAYERS_FILE, 'utf8');
        const playersData = JSON.parse(data);
        const players = Array.isArray(playersData) ? playersData : (playersData.players || []);
        
        // エンバペを検索
        const playerIndex = players.findIndex(p => 
            (p.name || '').toLowerCase().includes('mbapp') && 
            !(p.name || '').includes('Ethan') && 
            !(p.name || '').includes('E.')
        );
        
        if (playerIndex === -1) {
            console.log('❌ エンバペのデータがデータベースに見つかりません');
            return;
        }
        
        const existingPlayer = players[playerIndex];
        console.log(`\n✅ データベースでエンバペを発見: ${existingPlayer.name}`);
        
        // stats配列を更新
        if (!existingPlayer.stats || !Array.isArray(existingPlayer.stats)) {
            existingPlayer.stats = [];
        }
        
        // 2025/26シーズンの既存データを削除
        existingPlayer.stats = existingPlayer.stats.filter(s => 
            !(s.season || '').includes('2025') && !(s.season || '').includes('25/26')
        );
        
        // 新しい統計データを追加
        statsArray.forEach(stat => {
            existingPlayer.stats.push(stat);
        });
        
        // データをソート（最新シーズンを先頭に）
        existingPlayer.stats.sort((a, b) => {
            const seasonA = a.season || '';
            const seasonB = b.season || '';
            return seasonB.localeCompare(seasonA);
        });
        
        // 最新のチーム情報を更新
        const laligaStats = statsArray.find(s => s.leagueId === 140); // La Liga ID: 140
        if (laligaStats) {
            existingPlayer.currentTeam = laligaStats.teamName;
            existingPlayer.league = laligaStats.leagueName;
            existingPlayer.leagueId = laligaStats.leagueId;
            existingPlayer.teamId = laligaStats.teamId;
        }
        
        // データベースを保存
        const outputData = Array.isArray(playersData) ? players : { players: players };
        await fs.writeFile(PLAYERS_FILE, JSON.stringify(outputData, null, 2), 'utf8');
        
        console.log('\n✅ データベースを更新しました');
        console.log(`📊 La Liga: ${laligaStats ? laligaStats.appearances : 'N/A'}試合`);
        
    } catch (error) {
        console.error('❌ エラー発生');
        if (error.response) {
            console.error('ステータス:', error.response.status);
            console.error('エラーデータ:', JSON.stringify(error.response.data, null, 2).substring(0, 500));
        } else {
            console.error('エラーメッセージ:', error.message);
        }
    }
}

updateMbappe2025();
