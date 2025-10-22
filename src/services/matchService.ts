/**
 * Football Hub Japan
 * Match Service (Failover between API-Football & football-data.org)
 * Author: Yuuki Isomura
 */

import axios from "axios";

// ===============================
// 🔐 環境変数
// ===============================
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY!;
const FOOTBALLDATA_KEY = process.env.FOOTBALL_DATA_API_KEY!;

// ===============================
// 🗺️ Football-Data 対応リーグコード
// ===============================
const leagueCodeMap: Record<number, string> = {
  2: "CL",    // Champions League
  39: "PL",   // Premier League
  140: "PD",  // La Liga
  78: "BL1",  // Bundesliga
  135: "SA",  // Serie A
  61: "FL1",  // Ligue 1
  94: "ELC",  // Championship
  71: "PPL",  // Primeira Liga
  2013: "BSA", // Brazil Serie A
  88: "DED"   // Eredivisie
};

// ===============================
// 🧩 Football-Data.org の呼び出し
// ===============================
async function fetchFromFootballData(leagueId: number, season: number) {
  const code = leagueCodeMap[leagueId];
  if (!code) {
    console.warn(`⚠️ Football-data.org未対応リーグ: ${leagueId}`);
    return [];
  }

  const url = `https://api.football-data.org/v4/competitions/${code}/matches?season=${season}`;
  try {
    const res = await axios.get(url, {
      headers: { "X-Auth-Token": FOOTBALLDATA_KEY },
      timeout: 8000
    });
    console.log(`✅ Football-data.org: ${code} (${res.data.matches.length}件)`);
    return res.data.matches.map((m: any) => ({
      source: "football-data.org",
      match_id: m.id,
      utcDate: m.utcDate,
      status: m.status,
      home: m.homeTeam.name,
      away: m.awayTeam.name,
      home_score: m.score.fullTime.home,
      away_score: m.score.fullTime.away,
      competition: m.competition?.name
    }));
  } catch (err: any) {
    console.error("❌ Football-data.org error:", err.response?.status || err.message);
    return [];
  }
}

// ===============================
// ⚡ API-Football の呼び出し
// ===============================
async function fetchFromApiFootball(leagueId: number, season: number) {
  const url = `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${season}`;
  try {
    const res = await axios.get(url, {
      headers: { "x-apisports-key": API_FOOTBALL_KEY },
      timeout: 8000
    });
    console.log(`✅ API-Football: ${leagueId} (${res.data.response.length}件)`);
    return res.data.response.map((m: any) => ({
      source: "api-football",
      match_id: m.fixture.id,
      utcDate: m.fixture.date,
      status: m.fixture.status.short,
      home: m.teams.home.name,
      away: m.teams.away.name,
      home_score: m.goals.home,
      away_score: m.goals.away,
      competition: m.league.name
    }));
  } catch (err: any) {
    console.error("❌ API-Football error:", err.response?.status || err.message);
    return [];
  }
}

// ===============================
// 🧠 自動フェイルオーバー関数
// ===============================
export async function getMatchesWithFailover(leagueId: number, season = 2024) {
  // 1️⃣ Football-data.orgから取得（優先）
  const fdMatches = await fetchFromFootballData(leagueId, season);
  if (fdMatches.length > 0) return fdMatches;

  // 2️⃣ ダメなら API-Football からフェイルオーバー
  const apiMatches = await fetchFromApiFootball(leagueId, season);
  if (apiMatches.length > 0) return apiMatches;

  // 3️⃣ 両方ダメなら空配列
  console.warn(`⚠️ どちらのAPIからも試合データ取得不可: league=${leagueId}, season=${season}`);
  return [];
}

// ===============================
// 🔄 統合データ形式変換
// ===============================
export function normalizeMatchData(matches: any[]) {
  return matches.map(match => ({
    id: match.match_id,
    homeTeam: match.home,
    awayTeam: match.away,
    homeScore: match.home_score,
    awayScore: match.away_score,
    status: match.status,
    statusLong: match.status,
    elapsed: null,
    venue: 'Unknown Venue',
    leagueName: match.competition,
    league: match.competition,
    leagueId: null,
    country: null,
    round: null,
    season: new Date(match.utcDate).getFullYear(),
    date: match.utcDate,
    timestamp: new Date(match.utcDate).getTime(),
    events: [],
    lineups: {},
    statistics: {},
    source: match.source
  }));
}

// ===============================
// 📊 統計情報取得
// ===============================
export async function getMatchStats(leagueId: number, season = 2024) {
  const matches = await getMatchesWithFailover(leagueId, season);
  const normalizedMatches = normalizeMatchData(matches);
  
  const stats = {
    total: normalizedMatches.length,
    sources: {
      'football-data.org': normalizedMatches.filter(m => m.source === 'football-data.org').length,
      'api-football': normalizedMatches.filter(m => m.source === 'api-football').length
    },
    status: {
      scheduled: normalizedMatches.filter(m => m.status === 'SCHEDULED' || m.status === 'NS').length,
      live: normalizedMatches.filter(m => m.status === 'IN_PLAY' || m.status === 'LIVE').length,
      finished: normalizedMatches.filter(m => m.status === 'FINISHED' || m.status === 'FT').length
    }
  };
  
  return { matches: normalizedMatches, stats };
}
