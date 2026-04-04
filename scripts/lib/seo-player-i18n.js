/**
 * 選手SEOページ用 i18n（ja / en / es）
 * generate-seo-from-players.js から利用
 */

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * 各言語の表示用テキスト（title/description は SEO 用に言語別）
 */
function buildPlayerLangPack(name, team, league, nationality, season, apps, goals, assists) {
    const leagueSafe = league || '';
    const teamSafe = team || '';
    const snJa = season ? `対象シーズン例: ${season}。` : '';
    const snEn = season ? `Season: ${season}. ` : '';
    const snEs = season ? `Temporada: ${season}. ` : '';

    return {
        ja: {
            title: `${name}のスタッツ・所属（${leagueSafe || '各リーグ'}）｜Football Hub Japan`,
            description: `${name}（${teamSafe || '所属参照'}）の出場・得点・アシスト等の目安。${snJa}データは外部API・DB由来で遅延・誤差があり得ます。`.slice(0, 200),
            h1: `${name}のスタッツ`,
            intro: '詳細な数値・写真はアプリ内の選手詳細で確認できます。',
            lblNat: '国籍',
            lblTeam: '所属',
            lblLeague: 'リーグ',
            tableAria: 'シーズン目安',
            thItem: '項目',
            thVal: '値（目安）',
            rowApps: '出場',
            rowGoals: '得点',
            rowAssists: 'アシスト',
            cta: '→ この選手の詳細ページを開く',
            relatedH: '関連（回遊）',
            linkRanking: 'ランキング',
            linkDb: 'データベース検索',
            linkMatch: '試合分析',
            relatedNav: '関連リンク',
            footerUpd: '最終更新目安:',
            switchLabel: '言語',
            langGroupAria: '言語を選択',
            jsonLdName: `${name}のスタッツ・所属`
        },
        en: {
            title: `${name} — stats & club (${leagueSafe || 'leagues'}) | Football Hub Japan`,
            description: `${name} (${teamSafe || 'club TBD'}) — appearances, goals, assists (indicative). ${snEn}Data may be delayed or incomplete (API/DB).`.slice(0, 200),
            h1: `${name} — stats`,
            intro: 'Full numbers and photos are available on the player detail page.',
            lblNat: 'Nationality',
            lblTeam: 'Club',
            lblLeague: 'League',
            tableAria: 'Season snapshot',
            thItem: 'Stat',
            thVal: 'Value (est.)',
            rowApps: 'Appearances',
            rowGoals: 'Goals',
            rowAssists: 'Assists',
            cta: '→ Open player detail',
            relatedH: 'Related',
            linkRanking: 'Rankings',
            linkDb: 'Database search',
            linkMatch: 'Match analysis',
            relatedNav: 'Related links',
            footerUpd: 'Last updated (approx.):',
            switchLabel: 'Language',
            langGroupAria: 'Choose language',
            jsonLdName: `${name} — stats & club`
        },
        es: {
            title: `${name} — estadísticas y club (${leagueSafe || 'ligas'}) | Football Hub Japan`,
            description: `${name} (${teamSafe || 'club'}) — partidos, goles, asistencias (orientativo). ${snEs}Los datos pueden tener retrasos u omisiones (API/BD).`.slice(0, 200),
            h1: `${name} — estadísticas`,
            intro: 'Los números completos y fotos están en la ficha del jugador.',
            lblNat: 'Nacionalidad',
            lblTeam: 'Club',
            lblLeague: 'Liga',
            tableAria: 'Resumen de temporada',
            thItem: 'Concepto',
            thVal: 'Valor (aprox.)',
            rowApps: 'Partidos',
            rowGoals: 'Goles',
            rowAssists: 'Asistencias',
            cta: '→ Abrir ficha del jugador',
            relatedH: 'Relacionado',
            linkRanking: 'Clasificación',
            linkDb: 'Base de datos',
            linkMatch: 'Análisis de partidos',
            relatedNav: 'Enlaces relacionados',
            footerUpd: 'Última actualización (aprox.):',
            switchLabel: 'Idioma',
            langGroupAria: 'Elegir idioma',
            jsonLdName: `${name} — estadísticas y club`
        }
    };
}

/**
 * 埋め込み用の言語切り替えスクリプト（プレーン文字列）
 */
function buildLangSwitcherScript() {
    return `(function(){
  var I18N=window.__FHJ_SEO_I18N__;
  if(!I18N)return;
  function norm(l){l=(l||'ja').toLowerCase().slice(0,2);return l==='en'?'en':l==='es'?'es':'ja';}
  function getInitial(){
    var q=new URLSearchParams(location.search).get('lang');
    if(q)return norm(q);
    try{
      var a=localStorage.getItem('fhj_lang');
      if(a)return norm(a);
      var b=localStorage.getItem('fhj_seo_lang');
      if(b)return norm(b);
    }catch(e){}
    return 'ja';
  }
  function apply(lang){
    lang=norm(lang);
    try{localStorage.setItem('fhj_lang',lang);localStorage.setItem('fhj_seo_lang',lang);}catch(e){}
    document.documentElement.lang=lang==='ja'?'ja':lang==='es'?'es':'en';
    var pack=I18N[lang];if(!pack)return;
    if(pack.title)document.title=pack.title;
    var md=document.querySelector('meta[name="description"]');
    if(md&&pack.description)md.setAttribute('content',pack.description);
    var tab=document.querySelector('[data-i18n-table]');
    if(tab&&pack.tableAria)tab.setAttribute('aria-label',pack.tableAria);
    var relNav=document.querySelector('[data-i18n-related-nav]');
    if(relNav&&pack.relatedNav)relNav.setAttribute('aria-label',pack.relatedNav);
    var gb=document.querySelector('[data-i18n-group-lang]');
    if(gb&&pack.langGroupAria)gb.setAttribute('aria-label',pack.langGroupAria);
    document.querySelectorAll('[data-i18n]').forEach(function(el){
      var k=el.getAttribute('data-i18n');
      if(pack[k]!=null)el.textContent=pack[k];
    });
    document.querySelectorAll('.fhj-lang-btn').forEach(function(btn){
      btn.setAttribute('aria-pressed',btn.getAttribute('data-lang')===lang?'true':'false');
    });
    if(history.replaceState){
      var u=new URL(location.href);
      u.searchParams.set('lang',lang);
      history.replaceState({},'',u.pathname+u.search+u.hash);
    }
  }
  window.FHJ_applySeoLang=apply;
  document.addEventListener('DOMContentLoaded',function(){
    apply(getInitial());
    document.querySelectorAll('.fhj-lang-btn').forEach(function(btn){
      btn.addEventListener('click',function(){apply(btn.getAttribute('data-lang'));});
    });
  });
})();`;
}

module.exports = {
    esc,
    buildPlayerLangPack,
    buildLangSwitcherScript
};
