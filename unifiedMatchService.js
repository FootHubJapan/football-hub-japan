/**
 * Football Hub Japan - Unified Match Service
 * API-Football + Football-data.org フェイルオーバー統合モジュール
 * @author Yuuki Isomura
 */

const axios = require('axios');

// ===============================
// 🔐 環境変数
// ===============================
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const FOOTBALLDATA_KEY = process.env.FOOTBALL_DATA_API_KEY || process.env.FOOTBALLDATA_KEY;

// ===============================
// ⚙️ リーグマッピング
// ===============================
// API-Football と Football-data.org のIDを統一
const leagueMapping = {
    premierLeague: { apiFootball: 39, footballData: 2021 },
    laLiga: { apiFootball: 140, footballData: 2014 },
    serieA: { apiFootball: 135, footballData: 2019 },
    bundesliga: { apiFootball: 78, footballData: 2002 },
    ligue1: { apiFootball: 61, footballData: 2015 },
    championship: { apiFootball: 40, footballData: 2016 },
    eredivisie: { apiFootball: 88, footballData: 2003 },
    primeiraLiga: { apiFootball: 94, footballData: 2017 },
    brasileirao: { apiFootball: 71, footballData: 2013 },
    j1: { apiFootball: 98, footballData: null }, // J1はFootball-data.org非対応
    championsLeague: { apiFootball: 2, footballData: 2001 },
    europaLeague: { apiFootball: 3, footballData: 2146 },
    conferenceLeague: { apiFootball: 848, footballData: 2017 }
};

// リーグコードからマッピングキーを取得
function getLeagueKey(leagueCode) {
    const codeMap = {
        'PL': 'premierLeague',
        'PD': 'laLiga', 
        'SA': 'serieA',
        'BL1': 'bundesliga',
        'FL1': 'ligue1',
        'ELC': 'championship',
        'DED': 'eredivisie',
        'PPL': 'primeiraLiga',
        'BSA': 'brasileirao',
        'J1': 'j1',
        'CL': 'championsLeague',
        'EL': 'europaLeague',
        'ECL': 'conferenceLeague'
    };
    return codeMap[leagueCode] || null;
}

// ===============================
// 🧩 Football-data.org 呼び出し
// ===============================
async function fetchFromFootballData(leagueCode, season) {
    try {
        const url = `https://api.football-data.org/v4/competitions/${leagueCode}/matches?season=${season}`;
        const res = await axios.get(url, {
            headers: { "X-Auth-Token": FOOTBALLDATA_KEY },
            timeout: 10000,
        });

        console.log(`✅ Football-data.org ${leagueCode}: ${res.data.matches.length}件`);

        return res.data.matches.map((m) => ({
            source: "football-data.org",
            match_id: m.id,
            date: m.utcDate,
            status: m.status,
            home: m.homeTeam.name,
            away: m.awayTeam.name,
            home_score: m.score.fullTime.home,
            away_score: m.score.fullTime.away,
            competition: m.competition.name,
        }));
    } catch (err) {
        console.error(`⚠️ Football-data.orgエラー (${leagueCode}):`, err.response?.status || err.message);
        return [];
    }
}

// ===============================
// ⚡ API-Football 呼び出し
// ===============================
async function fetchFromApiFootball(leagueId, season) {
    try {
        const url = `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${season}`;
        const res = await axios.get(url, {
            headers: { "x-apisports-key": API_FOOTBALL_KEY },
            timeout: 10000,
        });

        console.log(`✅ API-Football ${leagueId}: ${res.data.response.length}件`);

        return res.data.response.map((m) => ({
            source: "api-football",
            match_id: m.fixture.id,
            date: m.fixture.date,
            status: m.fixture.status.short,
            home: m.teams.home.name,
            away: m.teams.away.name,
            home_score: m.goals.home,
            away_score: m.goals.away,
            competition: m.league.name,
        }));
    } catch (err) {
        console.error(`⚠️ API-Footballエラー (${leagueId}):`, err.response?.status || err.message);
        return [];
    }
}

// ===============================
// 🧠 統合フェイルオーバー関数
// ===============================
async function getUnifiedMatches(leagueKey, season = 2024) {
    const league = leagueMapping[leagueKey];

    if (!league) {
        console.warn(`⚠️ 無効なリーグキー: ${leagueKey}`);
        return [];
    }

    let matches = [];

    // ヨーロッパリーグはAPI-Football優先（403エラー対策）
    const preferApiFootball = ['europaLeague', 'conferenceLeague'].includes(leagueKey);
    
    if (preferApiFootball) {
        // 1️⃣ API-Football（優先）
        matches = await fetchFromApiFootball(league.apiFootball, season);
        
        // 2️⃣ データ0件ならFootball-data.orgへフォールバック
        if (!matches || matches.length === 0) {
            if (league.footballData) {
                matches = await fetchFromFootballData(league.footballData, season);
            }
        }
    } else {
        // 1️⃣ Football-data.org（優先）
        if (league.footballData) {
            matches = await fetchFromFootballData(league.footballData, season);
        }

        // 2️⃣ データ0件ならAPI-Footballへフォールバック
        if (!matches || matches.length === 0) {
            matches = await fetchFromApiFootball(league.apiFootball, season);
        }
    }

    // 3️⃣ 両方0件ならローカルフォールバックを返す
    if (!matches || matches.length === 0) {
        try {
            const fs = require('fs');
            const path = require('path');
            const localDataPath = path.join(__dirname, 'data', 'integrated-matches.json');
            
            if (fs.existsSync(localDataPath)) {
                const data = fs.readFileSync(localDataPath, 'utf8');
                const localData = JSON.parse(data);
                console.log("📊 ローカルフォールバック使用");
                matches = localData || [];
            }
        } catch (err) {
            console.warn("⚠️ ローカルフォールバックファイルが見つかりません:", err.message);
        }
    }

    console.log(`✅ 統合結果: ${matches.length}件（${leagueKey}, season=${season}）`);
    return matches;
}

// ===============================
// 🎯 メイン統合関数（リーグコード対応）
// ===============================
async function getMatchesByLeagueCode(leagueCode, season = 2024) {
    const leagueKey = getLeagueKey(leagueCode);
    
    if (!leagueKey) {
        console.warn(`⚠️ 未対応のリーグコード: ${leagueCode}`);
        return [];
    }
    
    return await getUnifiedMatches(leagueKey, season);
}

// ===============================
// 🔄 全リーグ対応関数
// ===============================
async function getAllMatches(season = 2024) {
    let allMatches = [];
    
    // 主要リーグを順次取得
    const majorLeagues = ['premierLeague', 'laLiga', 'serieA', 'bundesliga', 'ligue1', 'championsLeague', 'europaLeague'];
    
    for (const leagueKey of majorLeagues) {
        try {
            const matches = await getUnifiedMatches(leagueKey, season);
            allMatches = allMatches.concat(matches);
        } catch (err) {
            console.error(`⚠️ ${leagueKey}取得エラー:`, err.message);
        }
    }
    
    console.log(`✅ 全リーグ統合結果: ${allMatches.length}件（season=${season}）`);
    return allMatches;
}

module.exports = {
    leagueMapping,
    getLeagueKey,
    getUnifiedMatches,
    getMatchesByLeagueCode,
    getAllMatches,
    fetchFromFootballData,
    fetchFromApiFootball
};
