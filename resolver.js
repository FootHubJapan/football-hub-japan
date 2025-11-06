const axios = require('axios');

const KEY = process.env.API_FOOTBALL_KEY || process.env.RAPIDAPI_KEY;

// 簡易キャッシュ（Redis/DB推奨）
const mapping = new Map(); // fotmobId -> apiFixtureId

/**
 * FotMob IDからAPI-Football fixtureIdを解決
 * @param {Object} params
 * @param {string} params.fotmobId - FotMobの試合ID
 * @param {string} params.kickoffUtc - キックオフ時刻（UTC ISO形式）
 * @param {string} params.homeName - ホームチーム名
 * @param {string} params.awayName - アウェイチーム名
 * @param {string} params.leagueKey - リーグキー（CL, PL, PD, SA, BL1, FL1, ELなど）
 * @returns {Promise<number|null>} API-Footballのfixture ID、見つからない場合はnull
 */
async function resolveApiFootballFixtureId({ fotmobId, kickoffUtc, homeName, awayName, leagueKey }) {
    if (!KEY || KEY === 'YOUR_API_FOOTBALL_KEY') {
        console.warn('⚠️ API key not configured for resolver');
        return null;
    }

    // キャッシュチェック
    if (mapping.has(fotmobId)) {
        console.log(`✅ Cache hit for fotmobId: ${fotmobId} -> ${mapping.get(fotmobId)}`);
        return mapping.get(fotmobId);
    }

    // 1) 既知のリーグIDにマップ（CL=2など）
    const leagueMap = {
        PL: 39,    // Premier League
        PD: 140,   // La Liga
        SA: 135,   // Serie A
        BL1: 78,   // Bundesliga
        FL1: 61,   // Ligue 1
        CL: 2,     // UEFA Champions League
        EL: 3,     // UEFA Europa League
        J1: 98     // J1 League
    };
    const league = leagueMap[leagueKey] ?? 0; // 不明なら0で全検索にフォールバックも可

    // 2) 日付レンジ（UTCで±1日バッファ）
    const d = new Date(kickoffUtc);
    if (isNaN(d.getTime())) {
        console.warn('⚠️ Invalid kickoffUtc:', kickoffUtc);
        return null;
    }
    
    const from = new Date(d.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to = new Date(d.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);

    console.log(`🔍 Resolving fixture ID for: ${homeName} vs ${awayName} (${leagueKey})`);
    console.log(`   Date range: ${from} to ${to}, League: ${league || 'all'}`);

    try {
        // 3) まずは date+league で引く（軽い）
        const params = {
            from: from,
            to: to
        };
        
        if (league) {
            params.league = String(league);
        }
        
        // CLなどは season=2025 を付けると精度↑（大会次第で必須）
        const season = d.getFullYear();
        if (league === 2 || league === 3) { // CL or EL
            params.season = String(season);
        }

        const response = await axios.get('https://v3.football.api-sports.io/fixtures', {
            headers: {
                'x-apisports-key': KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            },
            params: params,
            timeout: 15000
        });

        let candidates = response.data?.response ?? [];

        if (candidates.length === 0) {
            console.warn('⚠️ No fixtures found in date range');
            return null;
        }

        console.log(`📊 Found ${candidates.length} candidates`);

        // 4) チーム名でフィルタ（大文字小文字/アクセント除去など簡易normalize）
        const norm = (s) => {
            if (!s) return '';
            return s.toLowerCase()
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\./g, '')
                .replace(/\s+/g, ' ')
                .trim();
        };

        const th = norm(homeName);
        const ta = norm(awayName);

        const hit = candidates.find(fixt => {
            const h = norm(fixt.teams?.home?.name);
            const a = norm(fixt.teams?.away?.name);

            // 片方順序が逆になる可能性があるなら両順比較
            return (h.includes(th) && a.includes(ta)) || 
                   (h.includes(ta) && a.includes(th)) ||
                   (th.includes(h) && ta.includes(a)) ||
                   (th.includes(a) && ta.includes(h));
        });

        if (hit?.fixture?.id) {
            const fixtureId = hit.fixture.id;
            mapping.set(fotmobId, fixtureId);
            console.log(`✅ Resolved fixture ID: ${fotmobId} -> ${fixtureId}`);
            console.log(`   Matched: ${hit.teams.home.name} vs ${hit.teams.away.name}`);
            return fixtureId;
        }

        console.warn('⚠️ No matching fixture found');
        console.warn(`   Searched for: ${homeName} vs ${awayName}`);
        console.warn(`   Available fixtures (first 5):`);
        candidates.slice(0, 5).forEach(f => {
            console.warn(`     - ${f.teams.home.name} vs ${f.teams.away.name} (ID: ${f.fixture.id})`);
        });

        return null; // 見つからず
    } catch (error) {
        console.error('❌ Error resolving fixture ID:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
        return null;
    }
}

module.exports = { resolveApiFootballFixtureId };

