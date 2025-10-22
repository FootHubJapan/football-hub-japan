#!/usr/bin/env node

/**
 * 保存されている最新の選手データをデータベースに反映
 * チーム名、過去チーム遍歴、スタッツを更新
 */

const fs = require('fs').promises;
const path = require('path');

const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const DATABASE_FILE = path.join(__dirname, 'football_data.db');

// チーム名の正規化マッピング
const TEAM_NAME_MAPPING = {
    'Manchester City': 'Manchester City',
    'Liverpool': 'Liverpool',
    'Arsenal': 'Arsenal',
    'Chelsea': 'Chelsea',
    'Tottenham': 'Tottenham Hotspur',
    'Manchester United': 'Manchester United',
    'Real Madrid': 'Real Madrid',
    'Barcelona': 'FC Barcelona',
    'Atletico Madrid': 'Atletico Madrid',
    'Bayern Munich': 'Bayern Munich',
    'Borussia Dortmund': 'Borussia Dortmund',
    'Juventus': 'Juventus',
    'AC Milan': 'AC Milan',
    'Inter Milan': 'Inter Milan',
    'PSG': 'Paris Saint-Germain',
    'Real Sociedad': 'Real Sociedad',
    'Brighton': 'Brighton & Hove Albion',
    'SC Freiburg': 'SC Freiburg',
    'Liverpool': 'Liverpool',
    'Monaco': 'AS Monaco',
    'VfL Bochum': 'VfL Bochum',
    'Fortuna Düsseldorf': 'Fortuna Düsseldorf',
    'VfB Stuttgart': 'VfB Stuttgart'
};

// リーグ名の正規化マッピング
const LEAGUE_NAME_MAPPING = {
    'Premier League': 'Premier League',
    'La Liga': 'La Liga',
    'Serie A': 'Serie A',
    'Bundesliga': 'Bundesliga',
    'Ligue 1': 'Ligue 1',
    'Eredivisie': 'Eredivisie',
    'Primeira Liga': 'Primeira Liga',
    'J1 League': 'J1 League',
    'Major League Soccer': 'Major League Soccer',
    'Pro League': 'Saudi Pro League',
    'Community Shield': 'Premier League'
};

// ポジション名の正規化マッピング
const POSITION_MAPPING = {
    'Forward': 'FW',
    'Midfielder': 'MF',
    'Defender': 'DF',
    'Goalkeeper': 'GK',
    'Attacking Midfielder': 'MF',
    'Defensive Midfielder': 'MF',
    'Central Midfielder': 'MF',
    'Left Midfielder': 'MF',
    'Right Midfielder': 'MF',
    'Left Back': 'DF',
    'Right Back': 'DF',
    'Centre Back': 'DF',
    'Left Wing': 'FW',
    'Right Wing': 'FW',
    'Centre Forward': 'FW',
    'Second Striker': 'FW'
};

async function updateDatabaseFromSavedData() {
    try {
        console.log('🚀 データベース更新を開始...');
        
        // 保存されている選手データを読み込み
        const playersData = JSON.parse(await fs.readFile(PLAYERS_FILE, 'utf8'));
        console.log(`📊 ${playersData.length}名の選手データを読み込みました`);
        
        let updatedCount = 0;
        let errorCount = 0;
        
        // 各選手のデータを正規化して更新
        for (let i = 0; i < playersData.length; i++) {
            const player = playersData[i];
            const progress = `[${i + 1}/${playersData.length}]`;
            
            try {
                // チーム名を正規化
                if (player.currentTeam && TEAM_NAME_MAPPING[player.currentTeam]) {
                    player.currentTeam = TEAM_NAME_MAPPING[player.currentTeam];
                }
                
                // リーグ名を正規化
                if (player.league && LEAGUE_NAME_MAPPING[player.league]) {
                    player.league = LEAGUE_NAME_MAPPING[player.league];
                }
                
                // ポジション名を正規化
                if (player.position && POSITION_MAPPING[player.position]) {
                    player.position = POSITION_MAPPING[player.position];
                }
                
                // シーズン情報を2025/2026に統一
                if (player.stats && !player.stats.season) {
                    player.stats.season = '2025/2026';
                }
                
                // 過去チーム遍歴を追加（現在のチームが含まれていない場合）
                if (!player.teamHistory) {
                    player.teamHistory = [];
                }
                
                // 現在のチームが過去チーム遍歴に含まれていない場合は追加
                const currentTeamInHistory = player.teamHistory.some(team => 
                    team.name === player.currentTeam || team.team === player.currentTeam
                );
                
                if (!currentTeamInHistory && player.currentTeam) {
                    player.teamHistory.push({
                        team: player.currentTeam,
                        league: player.league,
                        season: '2025/2026',
                        startDate: '2025-07-01',
                        endDate: null,
                        appearances: player.stats?.appearances || 0,
                        goals: player.stats?.goals || 0,
                        assists: player.stats?.assists || 0
                    });
                }
                
                // 最終更新日時を設定
                player.lastUpdated = new Date().toISOString();
                player.dataSource = 'database-updated';
                
                updatedCount++;
                
                if (i % 500 === 0) {
                    console.log(`${progress} ${player.name} を更新中...`);
                }
                
            } catch (error) {
                console.error(`${progress} ${player.name} の更新エラー:`, error.message);
                errorCount++;
            }
        }
        
        // 更新されたデータを保存
        await fs.writeFile(PLAYERS_FILE, JSON.stringify(playersData, null, 2));
        
        console.log('\n' + '='.repeat(50));
        console.log('✅ データベース更新完了!');
        console.log(`📊 成功: ${updatedCount}名`);
        console.log(`❌ エラー: ${errorCount}名`);
        console.log(`💾 データを保存しました: ${PLAYERS_FILE}`);
        
        // 統計情報を表示
        const leagueStats = {};
        const positionStats = {};
        const nationalityStats = {};
        
        playersData.forEach(player => {
            // リーグ統計
            if (player.league) {
                leagueStats[player.league] = (leagueStats[player.league] || 0) + 1;
            }
            
            // ポジション統計
            if (player.position) {
                positionStats[player.position] = (positionStats[player.position] || 0) + 1;
            }
            
            // 国籍統計
            if (player.nationality) {
                nationalityStats[player.nationality] = (nationalityStats[player.nationality] || 0) + 1;
            }
        });
        
        console.log('\n📈 統計情報:');
        console.log('リーグ別選手数:');
        Object.entries(leagueStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .forEach(([league, count]) => {
                console.log(`  ${league}: ${count}名`);
            });
        
        console.log('\nポジション別選手数:');
        Object.entries(positionStats)
            .sort(([,a], [,b]) => b - a)
            .forEach(([position, count]) => {
                console.log(`  ${position}: ${count}名`);
            });
        
        console.log('\n国籍別選手数（Top 10）:');
        Object.entries(nationalityStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .forEach(([nationality, count]) => {
                console.log(`  ${nationality}: ${count}名`);
            });
        
    } catch (error) {
        console.error('❌ データベース更新エラー:', error);
        process.exit(1);
    }
}

// メイン処理を実行
updateDatabaseFromSavedData();
