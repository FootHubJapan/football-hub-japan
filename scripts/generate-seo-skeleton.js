#!/usr/bin/env node
/**
 * SEO用 HTML 骨格 + seo-manifest.json を生成する（最小サンプル）
 *
 * 使い方:
 *   node scripts/generate-seo-skeleton.js
 *   node scripts/generate-seo-skeleton.js --seed scripts/seo-seed-sample.json
 *
 * 出力先: public/seo-generated/ （.gitignore 対象）
 * 本番では DB/API から同じ構造の JSON を渡す想定。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'seo-generated');
const DEFAULT_SEED = path.join(ROOT, 'scripts', 'seo-seed-sample.json');

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function argSeed() {
    const i = process.argv.indexOf('--seed');
    if (i >= 0 && process.argv[i + 1]) return path.resolve(process.argv[i + 1]);
    return DEFAULT_SEED;
}

function playerPageHtml(baseUrl, p) {
    const url = `${baseUrl}/seo-generated/p/${p.apiId}-${p.slug}-stats.html`;
    const title = `${p.nameJa || p.name}のスタッツ・所属（${p.season}）｜Football Hub Japan`;
    const desc = `${p.league}の${p.season}シーズンにおける${p.nameJa || p.name}（${p.team}）の出場・得点等の目安。データは外部API由来で遅延・誤差があり得ます。`;
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        url,
        description: desc,
        isPartOf: { '@type': 'WebSite', name: 'Football Hub Japan', url: baseUrl }
    };

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${esc(url)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${esc(url)}" />
  <meta property="og:type" content="article" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    body { font-family: 'Noto Sans JP', system-ui, sans-serif; background:#0a0e17; color:#e2e8f0; margin:0; padding:1.5rem; line-height:1.6; }
    a { color:#22d3ee; }
    .muted { color:#94a3b8; font-size:0.9rem; }
    h1 { font-size:1.25rem; }
    nav.related { margin-top:2rem; padding-top:1rem; border-top:1px solid #334155; }
    nav.related h2 { font-size:1rem; color:#22d3ee; }
  </style>
</head>
<body>
  <article>
    <h1>${esc(p.nameJa || p.name)}のスタッツ（${esc(String(p.season))}）</h1>
    <p class="muted">所属: ${esc(p.team)} / ${esc(p.league)} — 本ページは自動生成された骨格です。数値は API 連携後に差し替えてください。</p>
    <section aria-label="関連リンク">
      <nav class="related">
        <h2>関連（回遊用・最低3リンク例）</h2>
        <ul>
          <li><a href="${esc(baseUrl + '/ranking')}">ランキング</a></li>
          <li><a href="${esc(baseUrl + '/database')}">データベースで検索</a></li>
          <li><a href="${esc(baseUrl + '/match-detail')}">試合分析</a></li>
        </ul>
      </nav>
    </section>
  </article>
</body>
</html>`;
}

function matchPageHtml(baseUrl, m) {
    const url = `${baseUrl}/seo-generated/m/${m.fixtureId}.html`;
    const title = `${m.home} vs ${m.away} 試合データ｜${m.date}｜Football Hub Japan`;
    const desc = `${m.competition} ${m.home}対${m.away}（${m.date}）。スタッツ・イベントはデータ更新後に反映。`;
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'SportsEvent',
        name: `${m.home} vs ${m.away}`,
        startDate: m.date,
        sport: 'Soccer',
        homeTeam: { '@type': 'SportsTeam', name: m.home },
        awayTeam: { '@type': 'SportsTeam', name: m.away }
    };

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${esc(url)}" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    body { font-family: 'Noto Sans JP', system-ui, sans-serif; background:#0a0e17; color:#e2e8f0; margin:0; padding:1.5rem; }
    a { color:#22d3ee; }
    h1 { font-size:1.25rem; }
    nav.related { margin-top:2rem; border-top:1px solid #334155; padding-top:1rem; }
  </style>
</head>
<body>
  <article>
    <h1>${esc(m.home)} vs ${esc(m.away)}</h1>
    <p>${esc(m.competition)} — ${esc(m.date)}</p>
    <nav class="related">
      <h2>関連</h2>
      <ul>
        <li><a href="${esc(baseUrl + '/competitions')}">大会対戦表</a></li>
        <li><a href="${esc(baseUrl + '/schedule')}">スケジュール</a></li>
        <li><a href="${esc(baseUrl + '/insights.html')}">分析コラム</a></li>
      </ul>
    </nav>
  </article>
</body>
</html>`;
}

function main() {
    const seedPath = argSeed();
    if (!fs.existsSync(seedPath)) {
        console.error('Seed not found:', seedPath);
        process.exit(1);
    }
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const baseUrl = (seed.baseUrl || 'https://example.com').replace(/\/$/, '');

    fs.mkdirSync(OUT_DIR, { recursive: true });

    const manifest = {
        generatedAt: new Date().toISOString(),
        baseUrl,
        pages: []
    };

    for (const p of seed.players || []) {
        const file = `p/${p.apiId}-${p.slug}-stats.html`;
        const full = path.join(OUT_DIR, file);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, playerPageHtml(baseUrl, p), 'utf8');
        manifest.pages.push({
            type: 'player',
            path: '/seo-generated/' + file.replace(/\\/g, '/'),
            url: `${baseUrl}/seo-generated/${file.replace(/\\/g, '/')}`
        });
    }

    for (const m of seed.matches || []) {
        const file = `m/${m.fixtureId}.html`;
        const full = path.join(OUT_DIR, file);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, matchPageHtml(baseUrl, m), 'utf8');
        manifest.pages.push({
            type: 'match',
            path: '/seo-generated/' + file.replace(/\\/g, '/'),
            url: `${baseUrl}/seo-generated/${file.replace(/\\/g, '/')}`
        });
    }

    const manifestPath = path.join(OUT_DIR, 'seo-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    console.log('✅ SEO skeleton written to', OUT_DIR);
    console.log('   Pages:', manifest.pages.length);
    console.log('   Manifest:', manifestPath);
}

main();
