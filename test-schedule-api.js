/**
 * /api/scheduleエンドポイントの検証スクリプト
 */

const testCases = [
    {
        name: '全リーグ、デフォルトシーズン',
        params: {}
    },
    {
        name: 'プレミアリーグ、2025シーズン',
        params: { league: 'PL', season: '2025' }
    },
    {
        name: 'ラ・リーガ、今日の試合',
        params: { league: 'PD', timeRange: 'today' }
    },
    {
        name: '終了した試合のみ',
        params: { status: '終了' }
    }
];

async function testScheduleAPI() {
    const baseUrl = process.env.TEST_URL || 'http://localhost:10000';
    
    console.log('🧪 /api/scheduleエンドポイントの検証を開始します...\n');
    
    for (const testCase of testCases) {
        console.log(`📋 テストケース: ${testCase.name}`);
        const params = new URLSearchParams(testCase.params);
        const url = `${baseUrl}/api/schedule?${params.toString()}`;
        
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (response.ok) {
                const itemCount = data.items?.length || data.matches?.length || 0;
                console.log(`  ✅ 成功: ${itemCount}件の試合データを取得`);
                
                if (itemCount > 0) {
                    const firstMatch = data.items?.[0] || data.matches?.[0];
                    console.log(`  📊 サンプルデータ:`, {
                        id: firstMatch.id,
                        homeTeam: firstMatch.homeTeam,
                        awayTeam: firstMatch.awayTeam,
                        date: firstMatch.date,
                        status: firstMatch.status
                    });
                }
            } else {
                console.log(`  ❌ エラー: ${response.status} - ${data.error || data.message || 'Unknown error'}`);
            }
        } catch (error) {
            console.log(`  ❌ 例外: ${error.message}`);
        }
        
        console.log('');
    }
    
    console.log('✅ 検証完了');
}

// スクリプトが直接実行された場合
if (require.main === module) {
    testScheduleAPI().catch(console.error);
}

module.exports = { testScheduleAPI };
