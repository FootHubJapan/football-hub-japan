#!/usr/bin/env node

/**
 * 主要選手を正しい2025/2026シーズンデータで更新
 */

const fs = require('fs').promises;
const path = require('path');

const API_KEY = '53cfd1d0230dfe92a2d99f81ca0fab88';
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

// 正しい2025/2026シーズンデータ（昨日取得したもの）
const CORRECT_2025_DATA = {
    '久保建英': { goals: 1, assists: 0, appearances: 8 },
    '三苫薫': { goals: 1, assists: 1, appearances: 6 },
    '遠藤航': { goals: 0, assists: 1, appearances: 4 },
    '堂安律': { goals: 2, assists: 3, appearances: 7 },
    '南野拓実': { goals: 2, assists: 2, appearances: 8 },
    '前田大然': { goals: 0, assists: 0, appearances: 3 },
    '中村敬斗': { goals: 0, assists: 0, appearances: 0 },
    'Erling Haaland': { goals: 11, assists: 1, appearances: 8 },
    'Mohamed Salah': { goals: 2, assists: 2, appearances: 8 },
    'Bukayo Saka': { goals: 2, assists: 0, appearances: 6 },
    'Phil Foden': { goals: 1, assists: 0, appearances: 6 },
    'Virgil van Dijk': { goals: 0, assists: 0, appearances: 8 },
    'Jude Bellingham': { goals: 0, assists: 0, appearances: 5 },
    'Robert Lewandowski': { goals: 4, assists: 0, appearances: 7 },
    'Lamine Yamal': { goals: 2, assists: 4, appearances: 5 },
    'Pedri': { goals: 2, assists: 1, appearances: 9 },
    'Harry Kane': { goals: 12, assists: 3, appearances: 7 },
    'Jamal Musiala': { goals: 0, assists: 0, appearances: 0 },
    'Lionel Messi': { goals: 29, assists: 16, appearances: 28 },
    'Cristiano Ronaldo': { goals: 5, assists: 1, appearances: 5 },
    'Riyad Mahrez': { goals: 0, assists: 2, appearances: 5 }
};

// 名前マッピング（DB内の名前）
const NAME_MAPPING = {
    'Erling Haaland': 'E. Haaland',
    'Mohamed Salah': 'Mohamed Salah',
    'Bukayo Saka': 'B. Saka',
    'Phil Foden': 'Phil Foden',
    'Virgil van Dijk': 'V. van Dijk',
    'Jude Bellingham': 'J. Bellingham',
    'Robert Lewandowski': 'R. Lewandowski',
    'Lamine Yamal': 'L. Yamal',
    'Pedri': 'Pedri',
    'Harry Kane': 'H. Kane',
    'Jamal Musiala': 'J. Musiala',
    'Lionel Messi': 'L. Messi',
    'Cristiano Ronaldo': 'Cristiano Ronaldo',
    'Riyad Mahrez': 'R. Mahrez'
};

async function fixData() {
    console.log('🚀 主要選手の2025/2026シーズンデータを修正中...');
    
    const playersData = JSON.parse(await fs.readFile(PLAYERS_FILE, 'utf8'));
    console.log(`📊 総選手数: ${playersData.length}名`);
    
    let updatedCount = 0;
    
    for (const [japaneseName, correctData] of Object.entries(CORRECT_2025_DATA)) {
        const dbName = NAME_MAPPING[japaneseName] || japaneseName;
        
        const playerIndex = playersData.findIndex(p => 
            p.name === dbName || 
            p.name === japaneseName ||
            p.fullName === dbName ||
            p.fullName === japaneseName
        );
        
        if (playerIndex !== -1) {
            const player = playersData[playerIndex];
            const oldStats = `${player.stats.goals}G ${player.stats.assists}A ${player.stats.appearances}試合`;
            
            playersData[playerIndex].stats.goals = correctData.goals;
            playersData[playerIndex].stats.assists = correctData.assists;
            playersData[playerIndex].stats.appearances = correctData.appearances;
            playersData[playerIndex].season = '2025/2026';
            playersData[playerIndex].source = 'api-football-2025-corrected';
            playersData[playerIndex].lastUpdated = new Date().toISOString();
            
            const newStats = `${correctData.goals}G ${correctData.assists}A ${correctData.appearances}試合`;
            console.log(`  ✅ ${dbName}: ${oldStats} → ${newStats}`);
            updatedCount++;
        } else {
            console.log(`  ⚠️ 見つかりません: ${japaneseName} (${dbName})`);
        }
    }
    
    await fs.writeFile(PLAYERS_FILE, JSON.stringify(playersData, null, 2), 'utf8');
    
    console.log('\n============================================================');
    console.log(`✅ 修正完了: ${updatedCount}名の選手を2025/2026シーズンデータに更新`);
    console.log(`📁 保存先: ${PLAYERS_FILE}`);
    console.log('============================================================');
}

fixData().catch(console.error);

