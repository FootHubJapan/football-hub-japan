/**
 * 選手スタッツの一貫性: 2025-26 シーズンを基準に API / ローカル JSON を正規化
 */
const CURRENT_SEASON_KEY = '2025-2026';
const API_SEASON_YEAR = 2025;

function isSeason2025_26(raw) {
    if (raw == null || raw === '') return false;
    const s = String(raw).trim();
    if (s === '2025' || s === '2025/26' || s === '2025/2026' || s === '2025-2026') return true;
    if (/2025.*2026/.test(s)) return true;
    if (/^2025\//.test(s)) return true;
    return false;
}

/** 同一コンペの重複行を解消（出場数が多い行、なければ lastUpdated が新しい行） */
function dedupeCompetitionStats(statsArray) {
    if (!Array.isArray(statsArray) || statsArray.length === 0) return [];
    const byKey = new Map();
    for (const st of statsArray) {
        if (!st) continue;
        const league = String(st.leagueName || st.league || '').toLowerCase().trim();
        const season = String(st.season || '');
        const key = `${season}::${league}::${String(st.teamName || st.team || '')}`;
        const apps = Number(st.appearances || st.matches || st.lineups || 0);
        const prev = byKey.get(key);
        if (!prev) {
            byKey.set(key, st);
            continue;
        }
        const prevApps = Number(prev.appearances || prev.matches || prev.lineups || 0);
        const prevTs = prev.lastUpdated ? new Date(prev.lastUpdated).getTime() : 0;
        const curTs = st.lastUpdated ? new Date(st.lastUpdated).getTime() : 0;
        if (apps > prevApps || (apps === prevApps && curTs >= prevTs)) {
            byKey.set(key, st);
        }
    }
    return Array.from(byKey.values());
}

function formatRating(r) {
    if (r == null || r === '' || r === 'N/A') return null;
    const n = parseFloat(String(r).replace(',', '.'));
    if (Number.isNaN(n)) return null;
    return Math.round(n * 100) / 100;
}

/**
 * player.stats から 2025-26 のスナップショット（一覧用）を生成
 */
function buildSeason2526SnapshotFromLocalStats(statsArray) {
    if (!Array.isArray(statsArray)) return null;
    const seasonRows = statsArray.filter((s) => s && isSeason2025_26(s.season));
    if (seasonRows.length === 0) return null;
    const deduped = dedupeCompetitionStats(seasonRows);
    let goals = 0;
    let assists = 0;
    let appearances = 0;
    let minutes = 0;
    let ratingWeighted = 0;
    let ratingW = 0;
    const leagueSet = new Set();
    for (const st of deduped) {
        goals += Number(st.goals || 0);
        assists += Number(st.assists || 0);
        const apps = Number(st.appearances || st.matches || st.lineups || 0);
        appearances += apps;
        minutes += Number(st.minutes || 0);
        const r = formatRating(st.rating);
        if (r != null && apps > 0) {
            ratingWeighted += r * apps;
            ratingW += apps;
        }
        const ln = st.leagueName || st.league;
        if (ln) leagueSet.add(ln);
    }
    const rating = ratingW > 0 ? Math.round((ratingWeighted / ratingW) * 100) / 100 : null;
    const league =
        deduped
            .filter((x) => {
                const n = String(x.leagueName || x.league || '').toLowerCase();
                return n.includes('liga') || n.includes('premier') || n.includes('serie') || n.includes('bundes') || n.includes('ligue');
            })
            .sort((a, b) => (b.appearances || 0) - (a.appearances || 0))[0]?.leagueName ||
        deduped.sort((a, b) => (b.appearances || 0) - (a.appearances || 0))[0]?.leagueName ||
        Array.from(leagueSet)[0] ||
        '—';

    return {
        league,
        goals,
        assists,
        appearances,
        minutes,
        rating: rating != null ? String(rating) : 'N/A',
        stats: {
            goals,
            assists,
            appearances,
            minutes,
            rating: rating != null ? String(rating) : 'N/A'
        }
    };
}

function enrichPlayerWithSeasonSnapshot(player) {
    if (!player || typeof player !== 'object') return player;
    const seasons = player.seasons && typeof player.seasons === 'object' ? { ...player.seasons } : {};
    if (seasons[CURRENT_SEASON_KEY] && seasons[CURRENT_SEASON_KEY].stats) {
        return { ...player, seasons };
    }
    const snap = buildSeason2526SnapshotFromLocalStats(player.stats);
    if (!snap) return { ...player, seasons };
    return {
        ...player,
        seasons: {
            ...seasons,
            [CURRENT_SEASON_KEY]: snap
        }
    };
}

/** API-Football: players?id=&season= */
async function fetchApiFootballPlayerRaw(playerId, seasonYear) {
    const apiKey = process.env.API_FOOTBALL_KEY;
    if (!apiKey) return null;
    const url = `https://v3.football.api-sports.io/players?id=${encodeURIComponent(playerId)}&season=${seasonYear}`;
    const response = await fetch(url, {
        headers: {
            'x-apisports-key': apiKey,
            'x-rapidapi-host': 'v3.football.api-sports.io'
        }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.response && data.response.length > 0) return data.response[0];
    return null;
}

/** キャリア行は「国内リーグ等のクラブリーグ」を想定（カップ・欧州CL・親善は除外） */
const CUP_OR_INTL_RE =
    /world cup|champions league|europa|conference league|super cup|copa del rey|fa cup|coppa|dfb-pokal|coupe de france|club world|j\.league cup|天皇|ルヴァン|friendl|nations league|qualification|olympic/i;

function isDomesticClubStat(stat) {
    const leagueName = (stat.league?.name || '').toLowerCase();
    if (CUP_OR_INTL_RE.test(leagueName)) return false;
    if (/\bcup\b|pokal|coupe(?! de la ligue)/i.test(leagueName)) return false;
    return true;
}

/**
 * シーズンごとの「キャリア表」用: 国内リーグ等で出場が最大の1行
 */
function pickDomesticCareerRowFromApiPlayer(playerData, seasonYear) {
    const statistics = playerData?.statistics || [];
    const candidates = statistics.filter(isDomesticClubStat);
    const pool = candidates.length > 0 ? candidates : statistics;
    if (pool.length === 0) return null;
    const best = pool.reduce((a, b) => {
        const aa = a.games?.appearences || a.games?.lineups || 0;
        const bb = b.games?.appearences || b.games?.lineups || 0;
        return bb > aa ? b : a;
    });
    const apps = best.games?.appearences || best.games?.lineups || 0;
    const ratingRaw = best.games?.rating != null ? parseFloat(best.games.rating) : null;
    return {
        season: `${seasonYear}/${String(seasonYear + 1).slice(-2)}`,
        seasonYear,
        club: best.team?.name || 'Unknown',
        teamName: best.team?.name,
        league: best.league?.name || 'Unknown',
        matches: apps,
        appearances: apps,
        goals: best.goals?.total || 0,
        assists: best.goals?.assists || 0,
        rating: ratingRaw != null && !Number.isNaN(ratingRaw) ? Math.round(ratingRaw * 100) / 100 : null,
        source: 'API-Football'
    };
}

/**
 * 詳細ページのコンペ別テーブル用: API statistics をフロント形式に変換
 */
function mapApiStatisticsToStatsArray(playerData, seasonLabel = '2025/2026') {
    const statistics = playerData?.statistics || [];
    return statistics.map((stat) => {
        const apps = stat.games?.appearences || stat.games?.lineups || 0;
        const ratingRaw = stat.games?.rating != null ? parseFloat(stat.games.rating) : null;
        return {
            season: seasonLabel,
            leagueName: stat.league?.name,
            leagueId: stat.league?.id,
            teamName: stat.team?.name,
            teamId: stat.team?.id,
            appearances: apps,
            lineups: stat.games?.lineups || 0,
            minutes: stat.games?.minutes || 0,
            goals: stat.goals?.total || 0,
            assists: stat.goals?.assists || 0,
            rating: ratingRaw != null && !Number.isNaN(ratingRaw) ? Math.round(ratingRaw * 100) / 100 : null,
            yellowCards: stat.cards?.yellow || 0,
            redCards: stat.cards?.red || 0,
            source: 'api-football-live',
            lastUpdated: new Date().toISOString()
        };
    });
}

function aggregateTotalsFromStatsArray(statsArray) {
    if (!Array.isArray(statsArray)) return { goals: 0, assists: 0, appearances: 0, minutes: 0 };
    const d = dedupeCompetitionStats(statsArray);
    let goals = 0;
    let assists = 0;
    let appearances = 0;
    let minutes = 0;
    let rw = 0;
    let ra = 0;
    for (const st of d) {
        goals += Number(st.goals || 0);
        assists += Number(st.assists || 0);
        const apps = Number(st.appearances || st.matches || st.lineups || 0);
        appearances += apps;
        minutes += Number(st.minutes || 0);
        const r = formatRating(st.rating);
        if (r != null && apps > 0) {
            rw += r * apps;
            ra += apps;
        }
    }
    const rating = ra > 0 ? Math.round((rw / ra) * 100) / 100 : null;
    return { goals, assists, appearances, minutes, rating };
}

module.exports = {
    CURRENT_SEASON_KEY,
    API_SEASON_YEAR,
    isSeason2025_26,
    dedupeCompetitionStats,
    formatRating,
    buildSeason2526SnapshotFromLocalStats,
    enrichPlayerWithSeasonSnapshot,
    fetchApiFootballPlayerRaw,
    pickDomesticCareerRowFromApiPlayer,
    mapApiStatisticsToStatsArray,
    aggregateTotalsFromStatsArray
};
