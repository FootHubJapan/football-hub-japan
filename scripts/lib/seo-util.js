/**
 * SEO 生成用ユーティリティ
 */

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** ASCII スラッグ（日本語名は空になりやすい → player-{id} にフォールバック） */
function slugify(name) {
    const raw = String(name || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
    return raw.length >= 2 ? raw : '';
}

function playerFileSlug(name, id) {
    const s = slugify(name);
    const base = s || `player-${id}`;
    return `${base}-stats`;
}

/** 並び替え用スコア（直近シーズンの得点+アシスト目安） */
function playerScore(p) {
    const stats = Array.isArray(p.stats) ? p.stats : [];
    let best = 0;
    for (const st of stats) {
        const g = Number(st.goals) || 0;
        const a = Number(st.assists) || 0;
        const ap = Number(st.appearances) || 0;
        const score = g * 10 + a * 5 + Math.min(ap, 40);
        if (score > best) best = score;
    }
    return best;
}

function pickPrimaryStat(p) {
    const stats = Array.isArray(p.stats) ? p.stats : [];
    if (stats.length === 0) return null;
    const with2025 = stats.find((s) => String(s.season || '').includes('2025'));
    return with2025 || stats[0];
}

module.exports = {
    esc,
    slugify,
    playerFileSlug,
    playerScore,
    pickPrimaryStat
};
