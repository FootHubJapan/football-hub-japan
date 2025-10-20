#!/usr/bin/env node

/**
 * 全選手2025/2026シーズン最新データ更新スクリプト
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const API_KEY = process.env.API_FOOTBALL_KEY || process.env.RAPIDAPI_KEY;
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const DELAY_BETWEEN_REQUESTS = 1000; // 1秒（APIレート制限対策）

// 選手名マッピング（日本語名 → 英語検索名）
const PLAYER_MAPPINGS = {
    '久保建英': { searchNames: ['Kubo', 'T. Kubo'], league: 140 }, // La Liga
    '三苫薫': { searchNames: ['Mitoma', 'K. Mitoma'], league: 39 }, // Premier League
    '富安健洋': { searchNames: ['Tomiyasu', 'T. Tomiyasu'], league: 39 }, // Premier League
    '遠藤航': { searchNames: ['Endo', 'W. Endo'], league: 39 }, // Premier League
    '堂安律': { searchNames: ['Doan', 'R. Doan'], league: 78 }, // Bundesliga
    '伊藤洋輝': { searchNames: ['Ito', 'H. Ito'], league: 78 }, // Bundesliga
    '浅野拓磨': { searchNames: ['Asano', 'T. Asano'], league: 78 }, // Bundesliga
    '板倉滉': { searchNames: ['Itakura', 'K. Itakura'], league: 78 }, // Bundesliga
    '鎌田大地': { searchNames: ['Kamada', 'D. Kamada'], league: 78 }, // Bundesliga
    '久保田空': { searchNames: ['Kubota', 'S. Kubota'], league: 78 }, // Bundesliga
    '田中碧': { searchNames: ['Tanaka', 'A. Tanaka'], league: 78 }, // Bundesliga
    '南野拓実': { searchNames: ['Minamino', 'T. Minamino'], league: 61 }, // Ligue 1
    '伊東純也': { searchNames: ['Ito', 'J. Ito'], league: 61 }, // Ligue 1
    '守田英正': { searchNames: ['Morita', 'H. Morita'], league: 61 }, // Ligue 1
    '町田浩樹': { searchNames: ['Machida', 'H. Machida'], league: 61 }, // Ligue 1
    '上田綺世': { searchNames: ['Ueda', 'A. Ueda'], league: 61 }, // Ligue 1
    '古橋亨梧': { searchNames: ['Furuhashi', 'K. Furuhashi'], league: 98 }, // J1 League
    '旗手怜央': { searchNames: ['Hatate', 'R. Hatate'], league: 98 }, // J1 League
    '前田大然': { searchNames: ['Maeda', 'D. Maeda'], league: 98 }, // J1 League
    '菅原由勢': { searchNames: ['Sugawara', 'Y. Sugawara'], league: 98 }, // J1 League
    '中村敬斗': { searchNames: ['Nakamura', 'K. Nakamura'], league: 98 }, // J1 League
    'Erling Haaland': { searchNames: ['Haaland', 'E. Haaland'], league: 39 }, // Premier League
    'Kevin De Bruyne': { searchNames: ['De Bruyne', 'K. De Bruyne'], league: 39 }, // Premier League
    'Mohamed Salah': { searchNames: ['Salah', 'M. Salah'], league: 39 }, // Premier League
    'Bukayo Saka': { searchNames: ['Saka', 'B. Saka'], league: 39 }, // Premier League
    'Martin Ødegaard': { searchNames: ['Odegaard', 'M. Odegaard'], league: 39 }, // Premier League
    'Phil Foden': { searchNames: ['Foden', 'P. Foden'], league: 39 }, // Premier League
    'Son Heung-min': { searchNames: ['Son', 'H. Son'], league: 39 }, // Premier League
    'Virgil van Dijk': { searchNames: ['van Dijk', 'V. van Dijk'], league: 39 }, // Premier League
    'Jude Bellingham': { searchNames: ['Bellingham', 'J. Bellingham'], league: 140 }, // La Liga
    'Vinícius Júnior': { searchNames: ['Vinícius', 'V. Júnior'], league: 140 }, // La Liga
    'Robert Lewandowski': { searchNames: ['Lewandowski', 'R. Lewandowski'], league: 140 }, // La Liga
    'Lamine Yamal': { searchNames: ['Yamal', 'L. Yamal'], league: 140 }, // La Liga
    'Pedri': { searchNames: ['Pedri'], league: 140 }, // La Liga
    'Harry Kane': { searchNames: ['Kane', 'H. Kane'], league: 78 }, // Bundesliga
    'Jamal Musiala': { searchNames: ['Musiala', 'J. Musiala'], league: 78 }, // Bundesliga
    'Florian Wirtz': { searchNames: ['Wirtz', 'F. Wirtz'], league: 78 }, // Bundesliga
    'Lautaro Martínez': { searchNames: ['Martínez', 'L. Martínez'], league: 135 }, // Serie A
    'Victor Osimhen': { searchNames: ['Osimhen', 'V. Osimhen'], league: 135 }, // Serie A
    'Kylian Mbappé': { searchNames: ['Mbappé', 'K. Mbappé'], league: 61 }, // Ligue 1
    'Ousmane Dembélé': { searchNames: ['Dembélé', 'O. Dembélé'], league: 61 }, // Ligue 1
    'Lionel Messi': { searchNames: ['Messi', 'L. Messi'], league: 253 }, // MLS
    'Cristiano Ronaldo': { searchNames: ['Ronaldo', 'C. Ronaldo'], league: 307 }, // Saudi Pro League
    'Neymar Jr': { searchNames: ['Neymar', 'Neymar Jr'], league: 307 }, // Saudi Pro League
    'Sadio Mané': { searchNames: ['Mané', 'S. Mané'], league: 307 }, // Saudi Pro League
    'Riyad Mahrez': { searchNames: ['Mahrez', 'R. Mahrez'], league: 307 } // Saudi Pro League
};

// APIから選手統計を取得
async function fetchPlayerStats2025(playerName, mapping) {
    try {
        const { searchNames, league } = mapping;
        
        for (const searchName of searchNames) {
            try {
                const response = await fetch(
                    `https://v3.football.api-sports.io/players?search=${encodeURIComponent(searchName)}&league=${league}&season=2025`,
                    {
                        headers: {
                            'x-apisports-key': API_KEY
                        }
                    }
                );
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.results > 0) {
                        console.log(`   ✅ 発見: ${searchName} (リーグ${league})`);
                        
                        const player = data.response[0].player;
                        const stats = data.response[0].statistics?.[0] || {};
                        
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
                            lastUpdated: new Date().toISOString(),
                            season: '2025/2026'
                        };
                    }
                }
                
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.log(`   ⚠️ 検索エラー (${searchName}): ${error.message}`);
            }
        }
        
        console.log(`   ⚠️ 選手が見つかりません: ${playerName}`);
        return null;
        
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
        console.error('❌ API_FOOTBALL_KEY 環境変数が設定されていません');
        process.exit(1);
    }

    console.log('🚀 全選手2025/2026シーズン最新データ更新を開始...\n');

    // 既存の選手データを読み込み
    const playersData = JSON.parse(await fs.readFile(PLAYERS_FILE, 'utf8'));
    console.log(`📊 ${playersData.length}名の選手データを読み込みました\n`);

    let updatedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < playersData.length; i++) {
        const player = playersData[i];
        const progress = `[${i + 1}/${playersData.length}]`;

        console.log(`${progress} ${player.name} を更新中...`);

        // 選手マッピングを確認
        const mapping = PLAYER_MAPPINGS[player.name];
        
        if (mapping) {
            // APIから最新データを取得
            const apiData = await fetchPlayerStats2025(player.name, mapping);

            if (apiData) {
                // データを更新
                playersData[i] = {
                    ...player,
                    ...apiData,
                    name: player.name, // 元の名前を保持
                    fullName: player.fullName || player.name,
                    firstName: player.firstName || player.name.split(' ')[0],
                    lastName: player.lastName || player.name.split(' ').slice(1).join(' '),
                    source: 'api-football-2025'
                };

                console.log(`   ✅ 更新完了: ${apiData.stats.goals}G ${apiData.stats.assists}A ${apiData.stats.appearances}試合`);
                updatedCount++;
            } else {
                console.log(`   ⚠️ スキップ`);
                failedCount++;
            }
        } else {
            console.log(`   ⚠️ マッピング未定義`);
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
    console.log('✅ 2025/2026シーズン更新完了!');
    console.log(`📊 成功: ${updatedCount}名`);
    console.log(`⚠️  失敗: ${failedCount}名`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('='.repeat(50));
}

main().catch(error => {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
});
