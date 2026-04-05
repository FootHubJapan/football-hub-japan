#!/usr/bin/env node
/**
 * data/api-football-stored に 2025 シーズン詳細 + キャリアを API から取得して保存する。
 * Web はこのストアを読む（TTL 内は API を叩かない）。
 *
 * 用法:
 *   node scripts/fill-api-football-stored-cache.js [--all] [--limit N] [--offset N] [--detail-only] [--career-only]
 *   --limit を省略すると全ユニーク API ID を処理（数千件・数時間かかる場合あり）
 *
 * 環境変数:
 *   API_FOOTBALL_KEY … 必須
 *   API_FOOTBALL_REQUEST_DELAY_MS … キャリアの年ループ間の待機（例: 300）
 *   FILL_CACHE_DELAY_MS … 選手ごとの待機（既定 400）
 */

require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const apiFootballDbCache = require('../lib/apiFootballDbCache');

const PLAYERS_FILE = path.join(__dirname, '..', 'data', 'players.json');
const LOCK_FILE = path.join(__dirname, '..', 'data', '.cache-fill-running');

function acquireLock() {
    if (fs.existsSync(LOCK_FILE)) {
        try {
            const old = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
            if (Number.isFinite(old) && old > 0) {
                try {
                    process.kill(old, 0);
                    console.error(
                        `別の一括更新が実行中です (pid ${old})。終了するか ${LOCK_FILE} を確認してください。`
                    );
                    process.exit(1);
                } catch {
                    /* プロセスなし = 古いロック */
                }
            }
        } catch {
            /* ignore */
        }
        try {
            fs.unlinkSync(LOCK_FILE);
        } catch {
            /* ignore */
        }
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
    const cleanup = () => {
        try {
            fs.unlinkSync(LOCK_FILE);
        } catch {
            /* ignore */
        }
    };
    process.on('exit', cleanup);
    process.on('SIGINT', () => {
        cleanup();
        process.exit(130);
    });
    process.on('SIGTERM', () => {
        cleanup();
        process.exit(143);
    });
}

function parseArgs() {
    const out = {
        limit: null,
        offset: 0,
        detailOnly: false,
        careerOnly: false
    };
    const a = process.argv.slice(2);
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--limit' && a[i + 1]) {
            out.limit = parseInt(a[++i], 10);
        } else if (a[i] === '--offset' && a[i + 1]) {
            out.offset = parseInt(a[++i], 10);
        } else if (a[i] === '--detail-only') {
            out.detailOnly = true;
        } else if (a[i] === '--career-only') {
            out.careerOnly = true;
        } else if (a[i] === '--all') {
            /* no-op: 全件は --limit 省略で既定 */
        } else if (a[i] === '--help' || a[i] === '-h') {
            console.log(`
Usage: node scripts/fill-api-football-stored-cache.js [options]

  --all           全ユニーク API ID（--limit 省略と同じ）
  --limit N       Max players to process (after offset)
  --offset N      Skip first N unique API player ids
  --detail-only   Only refresh players/{id}.json (2025 season)
  --career-only   Only refresh career/{id}.json
`);
            process.exit(0);
        }
    }
    if (out.detailOnly && out.careerOnly) {
        console.error('Cannot use both --detail-only and --career-only');
        process.exit(1);
    }
    return out;
}

function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function buildDefaultYearList() {
    const cy = new Date().getFullYear();
    const list = [];
    for (let y = cy - 12; y <= cy; y++) list.push(y);
    return list.sort((a, b) => b - a);
}

function collectApiIds(players) {
    const seen = new Set();
    const ids = [];
    for (const p of players) {
        const raw =
            p.apiFootballId ||
            p.playerId ||
            (typeof p.id === 'string' && p.id.startsWith('api_') ? p.id.replace('api_', '') : null);
        if (raw == null || raw === '') continue;
        const n = parseInt(String(raw), 10);
        if (!Number.isFinite(n) || n <= 0) continue;
        const key = String(n);
        if (seen.has(key)) continue;
        seen.add(key);
        ids.push(n);
    }
    return ids;
}

async function main() {
    const { limit, offset, detailOnly, careerOnly } = parseArgs();

    if (!process.env.API_FOOTBALL_KEY || String(process.env.API_FOOTBALL_KEY).length < 10) {
        console.error('API_FOOTBALL_KEY が .env に設定されていません。');
        process.exit(1);
    }

    acquireLock();

    const raw = await fs.promises.readFile(PLAYERS_FILE, 'utf8');
    const players = JSON.parse(raw);
    const allIds = collectApiIds(players);
    let slice = allIds.slice(offset);
    if (limit != null && Number.isFinite(limit)) {
        slice = slice.slice(0, limit);
    }

    const yearList = buildDefaultYearList();
    const betweenPlayers = parseInt(process.env.FILL_CACHE_DELAY_MS || '400', 10);

    console.log(
        `API-Football ストア更新: uniqueIds=${allIds.length} offset=${offset} ` +
            `processing=${slice.length} detail=${!careerOnly} career=${!detailOnly}`
    );
    console.log(`Store root: ${apiFootballDbCache.ROOT}`);

    let okDetail = 0;
    let okCareer = 0;
    let failDetail = 0;
    let failCareer = 0;

    for (let i = 0; i < slice.length; i++) {
        const apiPid = slice[i];
        const label = `[${i + 1}/${slice.length}] apiPid=${apiPid}`;

        if (!careerOnly) {
            try {
                const r = await apiFootballDbCache.loadOrRefreshPlayerSeason2025(apiPid, true);
                if (r && r.statsArray && r.statsArray.length) {
                    okDetail++;
                    console.log(`${label} detail OK (${r.statsArray.length} rows)`);
                } else {
                    failDetail++;
                    console.warn(`${label} detail empty or failed`);
                }
            } catch (e) {
                failDetail++;
                console.warn(`${label} detail error:`, e.message);
            }
            await delay(betweenPlayers);
        }

        if (!detailOnly) {
            try {
                const r = await apiFootballDbCache.loadOrRefreshCareer(apiPid, yearList, true);
                const n = Array.isArray(r.careerStats) ? r.careerStats.length : 0;
                if (n > 0) {
                    okCareer++;
                    console.log(`${label} career OK (${n} seasons)`);
                } else {
                    failCareer++;
                    console.warn(`${label} career empty`);
                }
            } catch (e) {
                failCareer++;
                console.warn(`${label} career error:`, e.message);
            }
            await delay(betweenPlayers);
        }
    }

    console.log(
        `Done. detail ok=${okDetail} fail=${failDetail} | career ok=${okCareer} fail=${failCareer}`
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
