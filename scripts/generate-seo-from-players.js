#!/usr/bin/env node
/**
 * data/players.json から選手SEO用HTMLを生成する
 *
 *   node scripts/generate-seo-from-players.js
 *   node scripts/generate-seo-from-players.js --limit 300 --japan-only
 *   node scripts/generate-seo-from-players.js --limit 50 --base-url https://example.com
 *
 * メモリ: players.json が大きい場合は NODE_OPTIONS=--max-old-space-size=8192 を推奨
 */

const fs = require('fs');
const path = require('path');
const { esc, playerFileSlug, playerScore, pickPrimaryStat } = require('./lib/seo-util');

const ROOT = path.join(__dirname, '..');
const PLAYERS_PATH = path.join(ROOT, 'data', 'players.json');
const OUT_DIR = path.join(ROOT, 'public', 'seo-generated', 'p');
const BASE_URL_DEFAULT = 'https://football-hub-japan-ubzb.onrender.com';

function parseArgs() {
    const out = {
        limit: 500,
        japanOnly: false,
        baseUrl: process.env.BASE_URL || BASE_URL_DEFAULT,
        dryRun: false
    };
    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--limit' && argv[i + 1]) {
            out.limit = Math.max(1, parseInt(argv[i + 1], 10) || 500);
            i++;
        } else if (argv[i] === '--japan-only') {
            out.japanOnly = true;
        } else if (argv[i] === '--base-url' && argv[i + 1]) {
            out.baseUrl = argv[i + 1].replace(/\/$/, '');
            i++;
        } else if (argv[i] === '--dry-run') {
            out.dryRun = true;
        }
    }
    return out;
}

function buildPlayerHtml(baseUrl, p) {
    const id = p.id || p.playerId;
    const slug = playerFileSlug(p.name || p.fullName, id);
    const fileBase = `${id}-${slug}`;
    const pageUrl = `${baseUrl}/p/${fileBase}`;
    const name = p.fullName || p.name || 'Player';
    const team = p.currentTeam || '';
    const league = p.league || '';
    const nationality = p.nationality || '';
    const st = pickPrimaryStat(p);
    const goals = st ? st.goals ?? '—' : '—';
    const assists = st ? st.assists ?? '—' : '—';
    const apps = st ? st.appearances ?? '—' : '—';
    const season = st ? st.season || '' : '';

    const title = `${name}のスタッツ・所属（${league || '各リーグ'}）｜Football Hub Japan`;
    const desc = `${name}（${team || '所属チーム参照'}）の出場・得点・アシスト等の目安。${season ? `対象シーズン例: ${season}。` : ''}データは外部API・DB由来で遅延・誤差があり得ます。`;

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        url: pageUrl,
        description: desc.slice(0, 300),
        isPartOf: { '@type': 'WebSite', name: 'Football Hub Japan', url: baseUrl }
    };

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc.slice(0, 160))}" />
  <link rel="canonical" href="${esc(pageUrl)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc.slice(0, 200))}" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:type" content="article" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    body { font-family: 'Noto Sans JP', system-ui, sans-serif; background:#0a0e17; color:#e2e8f0; margin:0; padding:1.5rem; line-height:1.65; max-width:42rem; margin-left:auto; margin-right:auto; }
    a { color:#22d3ee; }
    .muted { color:#94a3b8; font-size:0.88rem; }
    h1 { font-size:1.35rem; margin-bottom:0.75rem; }
    table { width:100%; border-collapse:collapse; margin:1rem 0; font-size:0.9rem; }
    th, td { border:1px solid #334155; padding:0.5rem 0.65rem; text-align:left; }
    th { background:rgba(0,189,199,0.12); }
    .cta { margin-top:1.25rem; }
    nav.related { margin-top:2rem; padding-top:1.25rem; border-top:1px solid #334155; }
    nav.related h2 { font-size:1rem; color:#22d3ee; }
  </style>
</head>
<body>
  <article>
    <h1>${esc(name)}のスタッツ</h1>
    <p class="muted">国籍: ${esc(nationality)} / 所属: ${esc(team)} / リーグ: ${esc(league)}</p>
    <p>詳細な数値・写真はアプリ内の選手詳細で確認できます。</p>
    <table aria-label="シーズン目安">
      <thead><tr><th>項目</th><th>値（目安）</th></tr></thead>
      <tbody>
        <tr><td>出場</td><td>${esc(apps)}</td></tr>
        <tr><td>得点</td><td>${esc(goals)}</td></tr>
        <tr><td>アシスト</td><td>${esc(assists)}</td></tr>
      </tbody>
    </table>
    <p class="cta"><a href="${esc(baseUrl + '/player/' + id)}">→ この選手の詳細ページを開く</a></p>
    <nav class="related" aria-label="関連リンク">
      <h2>関連（回遊）</h2>
      <ul>
        <li><a href="${esc(baseUrl + '/ranking')}">ランキング</a></li>
        <li><a href="${esc(baseUrl + '/database')}">データベース検索</a></li>
        <li><a href="${esc(baseUrl + '/match-detail')}">試合分析</a></li>
      </ul>
    </nav>
    <p class="muted">最終更新目安: ${esc((st && st.lastUpdated) || new Date().toISOString().slice(0, 10))}</p>
  </article>
</body>
</html>`;
}

function main() {
    const opts = parseArgs();

    if (!fs.existsSync(PLAYERS_PATH)) {
        console.error('❌ data/players.json が見つかりません:', PLAYERS_PATH);
        process.exit(1);
    }

    console.log('📂 読み込み中:', PLAYERS_PATH, '（数MB〜数十MBのため数十秒かかることがあります）');
    const raw = fs.readFileSync(PLAYERS_PATH, 'utf8');
    let players;
    try {
        players = JSON.parse(raw);
    } catch (e) {
        console.error('❌ JSON parse error:', e.message);
        process.exit(1);
    }
    if (!Array.isArray(players)) {
        console.error('❌ players.json は配列である必要があります');
        process.exit(1);
    }

    let list = players;
    if (opts.japanOnly) {
        list = list.filter((p) => String(p.nationality || '').toLowerCase().includes('japan'));
        console.log('🇯🇵 japan-only:', list.length, '名');
    }

    list.sort((a, b) => playerScore(b) - playerScore(a));
    list = list.slice(0, opts.limit);

    if (opts.dryRun) {
        console.log('Dry run — 先頭5件:');
        list.slice(0, 5).forEach((p) => {
            const id = p.id || p.playerId;
            console.log(' ', id, playerFileSlug(p.name, id), p.name);
        });
        return;
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });

    const manifest = {
        generatedAt: new Date().toISOString(),
        source: 'data/players.json',
        baseUrl: opts.baseUrl,
        count: list.length,
        pages: []
    };

    for (const p of list) {
        const id = p.id || p.playerId;
        if (id == null) continue;
        const slug = playerFileSlug(p.name || p.fullName, id);
        const fname = `${id}-${slug}.html`;
        const full = path.join(OUT_DIR, fname);
        const html = buildPlayerHtml(opts.baseUrl, p);
        fs.writeFileSync(full, html, 'utf8');
        manifest.pages.push({
            path: `/p/${id}-${slug}`,
            file: `/seo-generated/p/${fname}`,
            url: `${opts.baseUrl}/p/${id}-${slug}`
        });
    }

    const manifestPath = path.join(ROOT, 'public', 'seo-generated', 'seo-players-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    const sitemapPath = path.join(ROOT, 'public', 'sitemap_seo_players.xml');
    const lastmod = new Date().toISOString().slice(0, 10);
    const urlLines = manifest.pages
        .map((x) => `  <url>\n    <loc>${esc(x.url)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`)
        .join('\n');
    const sitemapBody = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlLines}
</urlset>
`;
    fs.writeFileSync(sitemapPath, sitemapBody, 'utf8');

    console.log('✅ 生成完了');
    console.log('   HTML:', OUT_DIR, `(${manifest.pages.length} 件)`);
    console.log('   Manifest:', manifestPath);
    console.log('   Sitemap:', sitemapPath);
    console.log('');
    console.log('   例:', manifest.pages[0]?.url || '（なし）');
}

main();
