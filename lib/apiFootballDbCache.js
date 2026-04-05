/**
 * API-Football の取得結果を data/api-football-stored に保存し、
 * Web 表示は原則ここ（＝自作 DB / ファイルストア）経由にする。
 *
 * 環境変数:
 * - API_FOOTBALL_DETAIL_CACHE_TTL_MS … 選手シーズン詳細キャッシュ（既定 6 時間）
 * - API_FOOTBALL_CAREER_CACHE_TTL_MS … キャリア表キャッシュ（既定 24 時間）
 */
const fs = require('fs').promises;
const path = require('path');

const ROOT = path.join(__dirname, '..', 'data', 'api-football-stored');
const PLAYERS_DIR = path.join(ROOT, 'players');
const CAREER_DIR = path.join(ROOT, 'career');

function detailTtlMs() {
    return parseInt(process.env.API_FOOTBALL_DETAIL_CACHE_TTL_MS || String(6 * 60 * 60 * 1000), 10);
}

function careerTtlMs() {
    return parseInt(process.env.API_FOOTBALL_CAREER_CACHE_TTL_MS || String(24 * 60 * 60 * 1000), 10);
}

function isFresh(fetchedAt, ttlMs) {
    if (!fetchedAt) return false;
    const t = new Date(fetchedAt).getTime();
    if (Number.isNaN(t)) return false;
    return Date.now() - t < ttlMs;
}

function safeFileId(apiPid) {
    return String(apiPid).replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function ensureDirs() {
    await fs.mkdir(PLAYERS_DIR, { recursive: true });
    await fs.mkdir(CAREER_DIR, { recursive: true });
}

async function readJson(filePath) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function writeJson(filePath, obj) {
    await ensureDirs();
    await fs.writeFile(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

const playerStatsConsistency = require('./player-stats-consistency');

/**
 * 2025-26 シーズン詳細: キャッシュが新しければ API 不要。失敗時は古いキャッシュを返す。
 * @param {string|number} apiPid
 * @param {boolean} forceRefresh
 * @returns {Promise<null|{ statsArray, totals, snap, fetchedAt, statsSource, fromCache: boolean }>}
 */
async function loadOrRefreshPlayerSeason2025(apiPid, forceRefresh) {
    const p = path.join(PLAYERS_DIR, `${safeFileId(apiPid)}.json`);
    const cached = await readJson(p);
    const ttl = detailTtlMs();

    if (!forceRefresh && cached && isFresh(cached.fetchedAt, ttl) && Array.isArray(cached.statsArray) && cached.statsArray.length) {
        const totals =
            cached.totals ||
            playerStatsConsistency.aggregateTotalsFromStatsArray(cached.statsArray);
        const snap =
            cached.seasonsSnapshot ||
            playerStatsConsistency.buildSeason2526SnapshotFromLocalStats(cached.statsArray);
        return {
            statsArray: cached.statsArray,
            totals,
            snap: snap || null,
            fetchedAt: cached.fetchedAt,
            statsSource: 'api-football-stored',
            fromCache: true
        };
    }

    if (!process.env.API_FOOTBALL_KEY) {
        if (cached && Array.isArray(cached.statsArray) && cached.statsArray.length) {
            const totals =
                cached.totals ||
                playerStatsConsistency.aggregateTotalsFromStatsArray(cached.statsArray);
            const snap =
                cached.seasonsSnapshot ||
                playerStatsConsistency.buildSeason2526SnapshotFromLocalStats(cached.statsArray);
            return {
                statsArray: cached.statsArray,
                totals,
                snap: snap || null,
                fetchedAt: cached.fetchedAt,
                statsSource: 'api-football-stored-stale-no-key',
                fromCache: true
            };
        }
        return null;
    }

    try {
        const raw = await playerStatsConsistency.fetchApiFootballPlayerRaw(
            apiPid,
            playerStatsConsistency.API_SEASON_YEAR
        );
        if (!raw || !raw.statistics || !raw.statistics.length) {
            throw new Error('empty API statistics');
        }
        let statsArr = playerStatsConsistency.mapApiStatisticsToStatsArray(raw);
        statsArr = playerStatsConsistency.dedupeCompetitionStats(statsArr);
        const totals = playerStatsConsistency.aggregateTotalsFromStatsArray(statsArr);
        const snap = playerStatsConsistency.buildSeason2526SnapshotFromLocalStats(statsArr);
        const fetchedAt = new Date().toISOString();
        await writeJson(p, {
            apiFootballPlayerId: String(apiPid),
            seasonYear: playerStatsConsistency.API_SEASON_YEAR,
            statsArray: statsArr,
            totals,
            seasonsSnapshot: snap,
            fetchedAt
        });
        return {
            statsArray: statsArr,
            totals,
            snap: snap || null,
            fetchedAt,
            statsSource: 'api-football-stored',
            fromCache: false
        };
    } catch (e) {
        if (cached && Array.isArray(cached.statsArray) && cached.statsArray.length) {
            const totals =
                cached.totals ||
                playerStatsConsistency.aggregateTotalsFromStatsArray(cached.statsArray);
            const snap =
                cached.seasonsSnapshot ||
                playerStatsConsistency.buildSeason2526SnapshotFromLocalStats(cached.statsArray);
            console.warn('apiFootballDbCache: API失敗、保存済みを返却', e.message);
            return {
                statsArray: cached.statsArray,
                totals,
                snap: snap || null,
                fetchedAt: cached.fetchedAt,
                statsSource: 'api-football-stored-stale',
                fromCache: true
            };
        }
        console.warn('apiFootballDbCache: 取得・キャッシュとも不可', e.message);
        return null;
    }
}

/**
 * キャリア表: yearList ごとにキャッシュ。API は TTL 切れまたは refresh のときのみ。
 */
async function loadOrRefreshCareer(apiPid, yearList, forceRefresh) {
    const sortedYears = [...yearList].sort((a, b) => b - a);
    const yearsKey = sortedYears.join(',');
    const p = path.join(CAREER_DIR, `${safeFileId(apiPid)}.json`);
    const cached = await readJson(p);
    const ttl = careerTtlMs();

    if (
        !forceRefresh &&
        cached &&
        cached.yearsKey === yearsKey &&
        isFresh(cached.fetchedAt, ttl) &&
        Array.isArray(cached.careerStats)
    ) {
        return { careerStats: cached.careerStats, fromCache: true, fetchedAt: cached.fetchedAt };
    }

    if (!process.env.API_FOOTBALL_KEY) {
        if (cached && Array.isArray(cached.careerStats)) {
            return { careerStats: cached.careerStats, fromCache: true, fetchedAt: cached.fetchedAt };
        }
        return { careerStats: null, fromCache: false, fetchedAt: null };
    }

    const { fetchApiFootballPlayerRaw, pickDomesticCareerRowFromApiPlayer } = playerStatsConsistency;
    const careerStats = [];
    const seenSeason = new Set();

    function normalizeSeasonKey(s) {
        const str = String(s || '').replace(/\s/g, '');
        const m = str.match(/(\d{4})/);
        return m ? m[1] : str;
    }

    const betweenYearMs = parseInt(process.env.API_FOOTBALL_REQUEST_DELAY_MS || '0', 10);

    try {
        for (let yi = 0; yi < sortedYears.length; yi++) {
            const year = sortedYears[yi];
            try {
                const raw = await fetchApiFootballPlayerRaw(apiPid, year);
                if (!raw || !raw.statistics || !raw.statistics.length) continue;
                const row = pickDomesticCareerRowFromApiPlayer(raw, year);
                if (!row || (!row.matches && !row.goals && !row.assists)) continue;
                const sk = normalizeSeasonKey(row.season);
                if (seenSeason.has(sk)) continue;
                seenSeason.add(sk);
                careerStats.push(row);
            } catch (err) {
                console.log(`⚠️ キャリア ${year}:`, err.message);
            }
            if (betweenYearMs > 0 && yi < sortedYears.length - 1) {
                await new Promise((r) => setTimeout(r, betweenYearMs));
            }
        }

        const fetchedAt = new Date().toISOString();
        if (careerStats.length > 0) {
            await writeJson(p, {
                apiFootballPlayerId: String(apiPid),
                yearsKey,
                careerStats,
                fetchedAt
            });
            return { careerStats, fromCache: false, fetchedAt };
        }
        if (cached && Array.isArray(cached.careerStats) && cached.careerStats.length) {
            console.warn('apiFootballDbCache career: API結果が空、保存済みを返却');
            return { careerStats: cached.careerStats, fromCache: true, fetchedAt: cached.fetchedAt };
        }
        return { careerStats: [], fromCache: false, fetchedAt: null };
    } catch (e) {
        if (cached && Array.isArray(cached.careerStats)) {
            console.warn('apiFootballDbCache career: API失敗、保存済みを返却', e.message);
            return { careerStats: cached.careerStats, fromCache: true, fetchedAt: cached.fetchedAt };
        }
        return { careerStats: null, fromCache: false, fetchedAt: null };
    }
}

module.exports = {
    loadOrRefreshPlayerSeason2025,
    loadOrRefreshCareer,
    detailTtlMs,
    careerTtlMs,
    ROOT
};
