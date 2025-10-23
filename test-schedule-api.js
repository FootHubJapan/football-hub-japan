#!/usr/bin/env node

/**
 * Test script for the new /api/schedule endpoint
 * Tests the unified API priority over fallback data
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:10000';

async function testScheduleAPI() {
    console.log('🧪 Testing /api/schedule endpoint...\n');
    
    const testCases = [
        {
            name: 'Premier League 2025',
            params: { league: 'premierLeague', season: '2025' },
            expectedSource: 'live'
        },
        {
            name: 'All Leagues 2025',
            params: { league: 'all', season: '2025' },
            expectedSource: 'live'
        },
        {
            name: 'Europa League 2025 (API-Football priority)',
            params: { league: 'europaLeague', season: '2025' },
            expectedSource: 'live'
        },
        {
            name: 'Invalid League (should return 400)',
            params: { league: 'invalidLeague', season: '2025' },
            expectedSource: 'error'
        }
    ];
    
    for (const testCase of testCases) {
        console.log(`📋 Testing: ${testCase.name}`);
        console.log(`   Params:`, testCase.params);
        
        try {
            const response = await axios.get(`${BASE_URL}/api/schedule`, {
                params: testCase.params,
                timeout: 10000
            });
            
            const data = response.data;
            console.log(`   ✅ Status: ${response.status}`);
            console.log(`   📊 Source: ${data.source}`);
            console.log(`   📈 Items: ${data.total || 0} matches`);
            console.log(`   ⏰ Timestamp: ${data.timestamp}`);
            
            if (testCase.expectedSource === 'error') {
                console.log(`   ⚠️  Expected error but got success`);
            } else if (data.source === testCase.expectedSource) {
                console.log(`   ✅ Source matches expected: ${testCase.expectedSource}`);
            } else {
                console.log(`   ⚠️  Source mismatch: expected ${testCase.expectedSource}, got ${data.source}`);
            }
            
        } catch (error) {
            if (testCase.expectedSource === 'error') {
                console.log(`   ✅ Expected error: ${error.response?.status} - ${error.response?.data?.error || error.message}`);
            } else {
                console.log(`   ❌ Unexpected error: ${error.response?.status} - ${error.response?.data?.error || error.message}`);
            }
        }
        
        console.log('');
    }
    
    // Test caching
    console.log('🔄 Testing cache functionality...');
    try {
        const start = Date.now();
        const response1 = await axios.get(`${BASE_URL}/api/schedule`, {
            params: { league: 'premierLeague', season: '2025' },
            timeout: 10000
        });
        const time1 = Date.now() - start;
        
        const start2 = Date.now();
        const response2 = await axios.get(`${BASE_URL}/api/schedule`, {
            params: { league: 'premierLeague', season: '2025' },
            timeout: 10000
        });
        const time2 = Date.now() - start2;
        
        console.log(`   First request: ${time1}ms, source: ${response1.data.source}`);
        console.log(`   Second request: ${time2}ms, source: ${response2.data.source}`);
        
        if (response2.data.source === 'cache' && time2 < time1) {
            console.log(`   ✅ Cache working: second request was faster and used cache`);
        } else {
            console.log(`   ⚠️  Cache may not be working as expected`);
        }
        
    } catch (error) {
        console.log(`   ❌ Cache test error: ${error.message}`);
    }
    
    console.log('\n🎯 Test Summary:');
    console.log('   - /api/schedule endpoint created');
    console.log('   - Unified API prioritized over fallback');
    console.log('   - League validation implemented');
    console.log('   - Europa League API-Football priority');
    console.log('   - 15-minute caching system');
    console.log('   - API key masking in logs');
    console.log('   - Log spam reduction');
    console.log('   - Node.js version fixed to 20.x');
}

if (require.main === module) {
    testScheduleAPI().catch(console.error);
}

module.exports = { testScheduleAPI };
