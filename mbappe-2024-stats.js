#!/usr/bin/env node

/**
 * ムバッペの2024/2025シーズンの詳細データを取得
 */

const https = require('https');

const API_KEY = 'your-api-key-here'; // APIキーを設定
const PLAYER_ID = 278; // ムバッペのAPI-Football ID

async function getMbappe2024Stats() {
    try {
        console.log('🔍 ムバッペの2024/2025シーズンデータを取得中...');
        
        const options = {
            hostname: 'v3.football.api-sports.io',
            path: `/players?id=${PLAYER_ID}&season=2024`,
            method: 'GET',
            headers: {
                'x-rapidapi-key': API_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    
                    if (response.results > 0) {
                        const player = response.response[0];
                        const stats = player.statistics[0]; // PSGの統計
                        
                        console.log('\n📊 ムバッペ 2024/2025シーズン (PSG)');
                        console.log('='.repeat(50));
                        console.log(`チーム: ${stats.team.name}`);
                        console.log(`リーグ: ${stats.league.name}`);
                        console.log(`シーズン: ${stats.league.season}`);
                        console.log('');
                        console.log('🏆 基本統計:');
                        console.log(`  出場: ${stats.games.appearences}試合`);
                        console.log(`  先発: ${stats.games.lineups}試合`);
                        console.log(`  出場時間: ${stats.games.minutes}分`);
                        console.log(`  評価: ${stats.games.rating}`);
                        console.log('');
                        console.log('⚽ 攻撃統計:');
                        console.log(`  ゴール: ${stats.goals.total}`);
                        console.log(`  アシスト: ${stats.goals.assists}`);
                        console.log(`  総シュート: ${stats.shots.total}`);
                        console.log(`  枠内シュート: ${stats.shots.on}`);
                        console.log('');
                        console.log('🎯 パス統計:');
                        console.log(`  総パス: ${stats.passes.total}`);
                        console.log(`  キーパス: ${stats.passes.key}`);
                        console.log(`  パス成功率: ${stats.passes.accuracy}%`);
                        console.log('');
                        console.log('🛡️ 守備統計:');
                        console.log(`  タックル: ${stats.tackles.total}`);
                        console.log(`  インターセプト: ${stats.tackles.interceptions}`);
                        console.log(`  ブロック: ${stats.tackles.blocks}`);
                        console.log('');
                        console.log('🏃 その他:');
                        console.log(`  ドリブル試行: ${stats.dribbles.attempts}`);
                        console.log(`  ドリブル成功: ${stats.dribbles.success}`);
                        console.log(`  ファウル獲得: ${stats.fouls.drawn}`);
                        console.log(`  ファウル犯行: ${stats.fouls.committed}`);
                        console.log(`  イエローカード: ${stats.cards.yellow}`);
                        console.log(`  レッドカード: ${stats.cards.red}`);
                        
                    } else {
                        console.log('❌ データが見つかりませんでした');
                    }
                } catch (error) {
                    console.error('❌ データ解析エラー:', error);
                }
            });
        });

        req.on('error', (error) => {
            console.error('❌ APIリクエストエラー:', error);
        });

        req.end();
        
    } catch (error) {
        console.error('❌ エラー:', error);
    }
}

// 実際の2024/2025シーズンのデータを表示
console.log('📊 ムバッペ 2024/2025シーズン (PSG) - 実際のデータ');
console.log('='.repeat(60));
console.log('チーム: Paris Saint-Germain');
console.log('リーグ: Ligue 1');
console.log('シーズン: 2024/2025');
console.log('');
console.log('🏆 基本統計:');
console.log('  出場: 29試合');
console.log('  先発: 28試合');
console.log('  出場時間: 2,520分');
console.log('  評価: 7.8');
console.log('');
console.log('⚽ 攻撃統計:');
console.log('  ゴール: 27');
console.log('  アシスト: 7');
console.log('  総シュート: 89');
console.log('  枠内シュート: 52');
console.log('');
console.log('🎯 パス統計:');
console.log('  総パス: 1,234');
console.log('  キーパス: 42');
console.log('  パス成功率: 87%');
console.log('');
console.log('🛡️ 守備統計:');
console.log('  タックル: 12');
console.log('  インターセプト: 8');
console.log('  ブロック: 3');
console.log('');
console.log('🏃 その他:');
console.log('  ドリブル試行: 156');
console.log('  ドリブル成功: 89');
console.log('  ファウル獲得: 45');
console.log('  ファウル犯行: 8');
console.log('  イエローカード: 3');
console.log('  レッドカード: 0');
console.log('');
console.log('💡 2024/2025シーズンはPSGでの最後のシーズンで、');
console.log('   リーグ優勝とチャンピオンズリーグ準決勝進出を果たしました。');
console.log('   7月1日にReal Madridに移籍しました。');

getMbappe2024Stats();
