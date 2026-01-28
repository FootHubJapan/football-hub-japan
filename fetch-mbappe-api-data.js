#!/usr/bin/env node

/**
 * API-Footballからエンバペの2025シーズンの最新データを取得
 */

require('dotenv').config({ override: true });
const axios = require('axios');

const API_KEY = process.env.API_FOOTBALL_KEY || process.env.RAPIDAPI_KEY;
const PLAYER_ID = 278; // Kylian Mbappé

if (!API_KEY || API_KEY.length < 10) {
    console.error('❌ APIキーが正しく設定されていません');
    process.exit(1);
}

async function fetchMbappeFromAPI() {
    try {
        console.log('🔍 API-Footballからエンバペの2025シーズンデータを取得中...');
        console.log('Player ID:', PLAYER_ID);
        
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
        
        if (response.data && response.data.response && response.data.response.length > 0) {
            const player = response.data.response[0];
            console.log('\n✅ API-Footballからデータ取得成功');
            console.log('選手名:', player.player.name);
            console.log('チーム:', player.statistics && player.statistics.length > 0 ? player.statistics[0].team.name : 'N/A');
            console.log('\n=== 2025シーズンの統計（全リーグ） ===');
            
            if (player.statistics && Array.isArray(player.statistics)) {
                player.statistics.forEach((stat, index) => {
                    console.log(`\n【${stat.league.name || 'Unknown'}】`);
                    console.log('シーズン:', stat.league.season || 'N/A');
                    console.log('試合数:', stat.games.appearances || 0);
                    console.log('先発:', stat.games.lineups || 0);
                    console.log('ゴール:', stat.goals.total || 0);
                    console.log('アシスト:', stat.goals.assists || 0);
                    console.log('出場時間:', stat.games.minutes || 0, '分');
                    console.log('評価:', stat.games.rating ? parseFloat(stat.games.rating).toFixed(1) : 'N/A');
                    console.log('シュート数:', stat.shots.total || 0);
                    console.log('枠内シュート:', stat.shots.on || 0);
                    console.log('キーパス:', stat.passes.key || 0);
                    console.log('パス成功率:', stat.passes.accuracy ? stat.passes.accuracy + '%' : 'N/A');
                    console.log('パス総数:', stat.passes.total || 0);
                    console.log('ドリブル成功:', stat.dribbles.success || 0, '/', stat.dribbles.attempts || 0);
                    console.log('タックル:', stat.tackles.total || 0);
                    console.log('インターセプト:', stat.tackles.interceptions || 0);
                });
                
                // 合計値を計算
                const totalGoals = player.statistics.reduce((sum, stat) => sum + (stat.goals.total || 0), 0);
                const totalAssists = player.statistics.reduce((sum, stat) => sum + (stat.goals.assists || 0), 0);
                const totalAppearances = player.statistics.reduce((sum, stat) => sum + (stat.games.appearances || 0), 0);
                const totalMinutes = player.statistics.reduce((sum, stat) => sum + (stat.games.minutes || 0), 0);
                
                console.log('\n=== 2025シーズン合計 ===');
                console.log('総試合数:', totalAppearances);
                console.log('総ゴール数:', totalGoals);
                console.log('総アシスト数:', totalAssists);
                console.log('総出場時間:', totalMinutes, '分');
            }
        } else {
            console.log('❌ レスポンスにデータがありません');
            if (response.data) {
                console.log('レスポンス:', JSON.stringify(response.data, null, 2).substring(0, 500));
            }
        }
    } catch (error) {
        console.error('❌ APIエラー発生');
        if (error.response) {
            console.error('ステータス:', error.response.status);
            console.error('エラーデータ:', JSON.stringify(error.response.data, null, 2).substring(0, 500));
        } else {
            console.error('エラーメッセージ:', error.message);
        }
    }
}

fetchMbappeFromAPI();
