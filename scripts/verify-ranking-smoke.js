#!/usr/bin/env node
/**
 * ランキング共通化（lib/ranking-player-map）のスモークテスト。
 * API サーバー不要。CI / ローカルで: node scripts/verify-ranking-smoke.js
 */

const {
    mapRawPlayersToRankingRows,
    processRankingPlayerList
} = require('../lib/ranking-player-map');

function pickPlayerStatsForRanking(seasonRowArray) {
    if (!seasonRowArray || !seasonRowArray.length) return null;
    const meta = [...seasonRowArray].sort(
        (a, b) =>
            (b.appearances || b.matches || b.lineups || 0) -
            (a.appearances || a.matches || a.lineups || 0)
    )[0];
    return { ...meta, goals: meta.goals || 0, assists: meta.assists || 0 };
}

function fail(msg) {
    console.error('VERIFY FAIL:', msg);
    process.exit(1);
}

const seasonPatterns = ['2025/2026', '2025/26', '2025'];

const plRows = mapRawPlayersToRankingRows(
    [
        {
            id: 1,
            name: 'Smoke PL',
            position: 'Forward',
            detailedPosition: 'Forward',
            stats: [
                {
                    season: '2025/2026',
                    leagueName: 'Premier League',
                    goals: 7,
                    assists: 2,
                    appearances: 12
                }
            ]
        }
    ],
    'PL',
    2025,
    seasonPatterns,
    pickPlayerStatsForRanking
);
const plDone = processRankingPlayerList(plRows, 'PL', 'Forward', 'goals', '');
if (plDone.length !== 1 || plDone[0].goals !== 7) {
    fail(`PL+Forward expected 1 row goals 7, got ${JSON.stringify(plDone)}`);
}

// リーグ未指定時: player.league が空でも最終フィルタで落とさない
const allLeague = processRankingPlayerList([{ name: 'NoLeague', league: '', goals: 3 }], '', '', 'goals', '');
if (allLeague.length !== 1) {
    fail(`empty league filter should keep row, got ${allLeague.length}`);
}

// EL ラベルが最終マッチに含まれる
const elRows = [{ name: 'EL', league: 'uefa europa league', goals: 1 }];
const elDone = processRankingPlayerList(elRows, 'EL', '', 'goals', '');
if (elDone.length !== 1) {
    fail(`EL filter expected 1 row, got ${elDone.length}`);
}

console.log('verify-ranking-smoke: OK');
