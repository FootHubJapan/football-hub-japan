#!/usr/bin/env node
/**
 * data/players.json 全選手に seasons['2025-2026'] を player.stats から再計算して付与。
 * 実行前にバックアップ推奨: cp data/players.json data/players.json.bak
 *
 * usage: node --max-old-space-size=16384 scripts/refresh-players-2526-seasons.js
 */

const fs = require('fs');
const path = require('path');
const psc = require('../lib/player-stats-consistency');

const root = path.join(__dirname, '..');
const playersPath = path.join(root, 'data', 'players.json');

function main() {
    if (!fs.existsSync(playersPath)) {
        console.error('Missing', playersPath);
        process.exit(1);
    }
    console.log('Reading', playersPath, '...');
    const raw = fs.readFileSync(playersPath, 'utf8');
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : parsed.players;
    if (!Array.isArray(arr)) {
        console.error('Expected array or { players: [] }');
        process.exit(1);
    }
    let n = 0;
    const out = arr.map((p) => {
        const u = psc.enrichPlayerWithSeasonSnapshot(p);
        if (u.seasons && u.seasons[psc.CURRENT_SEASON_KEY]) n++;
        return u;
    });
    if (Array.isArray(parsed)) {
        fs.writeFileSync(playersPath, JSON.stringify(out));
    } else {
        parsed.players = out;
        fs.writeFileSync(playersPath, JSON.stringify(parsed));
    }
    console.log('Done. Players:', out.length, 'with 2025-26 snapshot:', n);
}

main();
