#!/usr/bin/env node

/**
 * Football-data.org API統合テスト
 * Free + Deep Data プラン対応
 */

const { FootballDataIntegration } = require('./football-data-integration');

async function testFootballDataAPI() {
    try {
        console.log('🧪 Football-data.org API統合テスト開始...');
        console.log('='.repeat(60));
        
        const integration = new FootballDataIntegration();
        
        // 1. API接続テスト
        console.log('\n1️⃣ API接続テスト');
        console.log('-'.repeat(30));
        const leagues = await integration.testAPI();
        
        if (leagues && leagues.length > 0) {
            console.log(`✅ API接続成功: ${leagues.length}リーグ取得`);
            
            // 主要リーグの情報を表示
            const majorLeagues = leagues.filter(league => 
                ['Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1', 'Champions League'].includes(league.name)
            );
            
            console.log('\n🏆 主要リーグ情報:');
            majorLeagues.forEach(league => {
                console.log(`  ${league.name}:`);
                console.log(`    ID: ${league.id}`);
                console.log(`    国: ${league.area.name}`);
                console.log(`    シーズン: ${league.currentSeason?.startDate} - ${league.currentSeason?.endDate}`);
            });
        } else {
            console.log('❌ API接続失敗: リーグデータが取得できませんでした');
            return;
        }
        
        // 2. 試合データ取得テスト（Premier League）
        console.log('\n2️⃣ 試合データ取得テスト (Premier League)');
        console.log('-'.repeat(30));
        
        const premierLeagueId = leagues.find(l => l.name === 'Premier League')?.id;
        if (premierLeagueId) {
            try {
                const matches = await integration.fetchMatchesForLeague(premierLeagueId, 2024);
                console.log(`✅ Premier League試合データ取得成功: ${matches.length}試合`);
                
                if (matches.length > 0) {
                    console.log('\n📊 サンプル試合データ:');
                    const sampleMatch = matches[0];
                    console.log(`  試合: ${sampleMatch.homeTeam.name} vs ${sampleMatch.awayTeam.name}`);
                    console.log(`  日時: ${sampleMatch.date}`);
                    console.log(`  ステータス: ${sampleMatch.status}`);
                    console.log(`  スコア: ${sampleMatch.score.fullTime.home} - ${sampleMatch.score.fullTime.away}`);
                }
            } catch (error) {
                console.log(`⚠️ Premier League試合データ取得失敗: ${error.message}`);
            }
        } else {
            console.log('⚠️ Premier League IDが見つかりませんでした');
        }
        
        // 3. 選手データ取得テスト（ムバッペ）
        console.log('\n3️⃣ 選手データ取得テスト (Mbappé)');
        console.log('-'.repeat(30));
        
        try {
            // ムバッペのID（例：278）
            const mbappeId = 278;
            const playerStats = await integration.fetchPlayerMatches(mbappeId, 2024);
            
            if (playerStats) {
                console.log(`✅ ムバッペデータ取得成功`);
                console.log(`  出場: ${playerStats.appearances}試合`);
                console.log(`  先発: ${playerStats.lineups}試合`);
                console.log(`  出場時間: ${playerStats.minutes}分`);
                console.log(`  ポジション: ${playerStats.position}`);
                
                if (playerStats.matches && playerStats.matches.length > 0) {
                    console.log(`  試合数: ${playerStats.matches.length}試合`);
                }
            }
        } catch (error) {
            console.log(`⚠️ ムバッペデータ取得失敗: ${error.message}`);
        }
        
        // 4. データ保存確認
        console.log('\n4️⃣ データ保存確認');
        console.log('-'.repeat(30));
        
        const fs = require('fs');
        const path = require('path');
        const dataDir = path.join(__dirname, 'data');
        
        if (fs.existsSync(dataDir)) {
            const files = fs.readdirSync(dataDir).filter(file => file.includes('football-data'));
            console.log(`✅ データディレクトリ確認: ${files.length}ファイル`);
            
            if (files.length > 0) {
                console.log('📁 保存されたファイル:');
                files.forEach(file => {
                    const filePath = path.join(dataDir, file);
                    const stats = fs.statSync(filePath);
                    console.log(`  ${file}: ${(stats.size / 1024).toFixed(2)}KB`);
                });
            }
        } else {
            console.log('⚠️ データディレクトリが見つかりません');
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('🎉 Football-data.org API統合テスト完了!');
        console.log('\n💡 次のステップ:');
        console.log('  1. FOOTBALL_DATA_API_KEY環境変数を設定');
        console.log('  2. /api/football-data/leagues でリーグ一覧取得');
        console.log('  3. /api/football-data/matches/:leagueId で試合データ取得');
        console.log('  4. /api/football-data/player/:playerId で選手データ取得');
        
    } catch (error) {
        console.error('❌ テスト実行エラー:', error.message);
        console.error('詳細:', error.stack);
        process.exit(1);
    }
}

// メイン実行
if (require.main === module) {
    testFootballDataAPI();
}

module.exports = { testFootballDataAPI };
