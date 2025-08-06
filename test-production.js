#!/usr/bin/env node

/**
 * Football Hub Japan - 本番環境動作確認スクリプト
 * デプロイ後の機能確認用
 */

const axios = require('axios');

// 設定
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TIMEOUT = 10000;

// テストケース
const tests = [
    {
        name: 'ヘルスチェック',
        url: '/health',
        method: 'GET',
        expectedStatus: 200
    },
    {
        name: 'データベースページ',
        url: '/database',
        method: 'GET',
        expectedStatus: 200
    },
    {
        name: 'レーダーチャートページ',
        url: '/radar',
        method: 'GET',
        expectedStatus: 200
    },
    {
        name: 'AIエージェントページ',
        url: '/ai-agent',
        method: 'GET',
        expectedStatus: 200
    },
    {
        name: '選手検索API',
        url: '/api/search/players?query=久保建英',
        method: 'GET',
        expectedStatus: 200
    },
    {
        name: '日本語選手検索API',
        url: '/api/japanese-players/search-v2?query=三笘薫',
        method: 'GET',
        expectedStatus: 200
    },
    {
        name: 'AIチャットAPI',
        url: '/api/ai/chat',
        method: 'POST',
        data: {
            message: '久保建英について教えてください',
            context: 'soccer_analysis'
        },
        expectedStatus: 200
    }
];

// テスト実行関数
async function runTest(test) {
    try {
        console.log(`🧪 ${test.name} をテスト中...`);
        
        const config = {
            method: test.method,
            url: `${BASE_URL}${test.url}`,
            timeout: TIMEOUT,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Football-Hub-Japan-Test/1.0'
            }
        };

        if (test.data) {
            config.data = test.data;
        }

        const startTime = Date.now();
        const response = await axios(config);
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        if (response.status === test.expectedStatus) {
            console.log(`✅ ${test.name}: 成功 (${responseTime}ms)`);
            return { success: true, responseTime };
        } else {
            console.log(`❌ ${test.name}: 失敗 - 期待: ${test.expectedStatus}, 実際: ${response.status}`);
            return { success: false, error: `Status ${response.status}` };
        }
    } catch (error) {
        console.log(`❌ ${test.name}: エラー - ${error.message}`);
        return { success: false, error: error.message };
    }
}

// メイン実行関数
async function main() {
    console.log('🚀 Football Hub Japan - 本番環境動作確認');
    console.log('==========================================');
    console.log(`📍 テスト対象: ${BASE_URL}`);
    console.log(`⏱️  タイムアウト: ${TIMEOUT}ms`);
    console.log('');

    const results = [];
    let successCount = 0;
    let totalResponseTime = 0;

    // 各テストを実行
    for (const test of tests) {
        const result = await runTest(test);
        results.push({ ...test, ...result });
        
        if (result.success) {
            successCount++;
            totalResponseTime += result.responseTime;
        }
        
        // テスト間隔を空ける
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 結果サマリー
    console.log('');
    console.log('📊 テスト結果サマリー');
    console.log('===================');
    console.log(`✅ 成功: ${successCount}/${tests.length}`);
    console.log(`❌ 失敗: ${tests.length - successCount}/${tests.length}`);
    
    if (successCount > 0) {
        console.log(`⏱️  平均応答時間: ${Math.round(totalResponseTime / successCount)}ms`);
    }
    
    console.log('');

    // 詳細結果
    console.log('📋 詳細結果:');
    results.forEach((result, index) => {
        const status = result.success ? '✅' : '❌';
        const time = result.responseTime ? ` (${result.responseTime}ms)` : '';
        const error = result.error ? ` - ${result.error}` : '';
        console.log(`${index + 1}. ${status} ${result.name}${time}${error}`);
    });

    // 終了コード
    const exitCode = successCount === tests.length ? 0 : 1;
    console.log('');
    console.log(`🏁 テスト完了 - 終了コード: ${exitCode}`);
    
    if (exitCode === 0) {
        console.log('🎉 すべてのテストが成功しました！本番環境は正常に動作しています。');
    } else {
        console.log('⚠️  一部のテストが失敗しました。ログを確認してください。');
    }

    process.exit(exitCode);
}

// エラーハンドリング
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未処理のPromise拒否:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('❌ 未処理の例外:', error);
    process.exit(1);
});

// スクリプト実行
if (require.main === module) {
    main();
}

module.exports = { runTest, tests }; 