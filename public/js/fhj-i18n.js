/**
 * Football Hub Japan — サイト全体 日本語 / English / Español
 * - ?lang=ja|en|es と localStorage（fhj_lang）
 * - [data-i18n="key"] および主要ナビは href から自動翻訳
 */
(function () {
    var STORAGE_KEY = 'fhj_lang';

    var STR = {
        ja: {
            'lang.label': '言語',
            'nav.database': 'データベース',
            'nav.radar': 'レーダーチャート',
            'nav.schedule': 'スケジュール',
            'nav.match': '試合分析',
            'nav.ranking': 'ランキング',
            'nav.competitions': '大会対戦表',
            'nav.insights': 'コラム',
            'nav.dashboard': 'ダッシュボード',
            'nav.ai': 'AIエージェント',
            'nav.login': 'ログイン',
            'nav.home': 'ホーム',
            'footer.about': '運営者情報',
            'footer.contact': 'お問い合わせ',
            'footer.terms': '利用規約',
            'footer.privacy': 'プライバシーポリシー',
            'cta.search': '選手を検索',
            'cta.schedule': '今日の試合を見る',
            'cta.radar': '2選手を比較',
            'cta.ai': 'AIに質問',
            'badge.beta': 'β',
            'search.hint': '地図上のマーカーをタップすると、対象地域のデータベースへ移動します。',
            'stats.label1': '日次',
            'stats.label2': '更新（目安）',
            'stats.label3': '10+',
            'stats.label4': '対象リーグ例',
            'competitions.loadBtn': '対戦表を読み込む',
            'competitions.initialHint': '大会とシーズンを選んで「対戦表を読み込む」を押してください。'
        },
        en: {
            'lang.label': 'Language',
            'nav.database': 'Database',
            'nav.radar': 'Radar chart',
            'nav.schedule': 'Schedule',
            'nav.match': 'Match analysis',
            'nav.ranking': 'Rankings',
            'nav.competitions': 'Cup brackets',
            'nav.insights': 'Columns',
            'nav.dashboard': 'Dashboard',
            'nav.ai': 'AI agent',
            'nav.login': 'Log in',
            'nav.home': 'Home',
            'footer.about': 'About',
            'footer.contact': 'Contact',
            'footer.terms': 'Terms',
            'footer.privacy': 'Privacy',
            'cta.search': 'Search players',
            'cta.schedule': "Today's matches",
            'cta.radar': 'Compare 2 players',
            'cta.ai': 'Ask AI',
            'badge.beta': 'β',
            'search.hint': 'Tap a map marker to open the database for that region.',
            'stats.label1': 'Daily',
            'stats.label2': 'updates (est.)',
            'stats.label3': '10+',
            'stats.label4': 'leagues (sample)',
            'competitions.loadBtn': 'Load bracket',
            'competitions.initialHint': 'Pick a competition and season, then tap Load bracket.'
        },
        es: {
            'lang.label': 'Idioma',
            'nav.database': 'Base de datos',
            'nav.radar': 'Gráfico radar',
            'nav.schedule': 'Calendario',
            'nav.match': 'Análisis de partidos',
            'nav.ranking': 'Clasificación',
            'nav.competitions': 'Cuadros copas',
            'nav.insights': 'Columnas',
            'nav.dashboard': 'Panel',
            'nav.ai': 'Agente IA',
            'nav.login': 'Iniciar sesión',
            'nav.home': 'Inicio',
            'footer.about': 'Quiénes somos',
            'footer.contact': 'Contacto',
            'footer.terms': 'Términos',
            'footer.privacy': 'Privacidad',
            'cta.search': 'Buscar jugadores',
            'cta.schedule': 'Partidos de hoy',
            'cta.radar': 'Comparar 2 jugadores',
            'cta.ai': 'Preguntar a la IA',
            'badge.beta': 'β',
            'search.hint': 'Toca un marcador del mapa para abrir la base de datos de esa región.',
            'stats.label1': 'Diario',
            'stats.label2': 'actualiz. (aprox.)',
            'stats.label3': '10+',
            'stats.label4': 'ligas (ej.)',
            'competitions.loadBtn': 'Cargar cuadro',
            'competitions.initialHint': 'Elige competición y temporada, luego pulsa Cargar cuadro.'
        }
    };

    /** pathname 正規化（.html 除去、末尾スラッシュ除去） */
    function normPath(href) {
        if (!href || href.charAt(0) === '#' || href.indexOf('mailto:') === 0) return null;
        try {
            var a = document.createElement('a');
            a.href = href;
            var p = a.pathname || '';
            if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1);
            p = p.replace(/\.html$/i, '');
            return p || '/';
        } catch (e) {
            return null;
        }
    }

    var PATH_TO_KEY = {
        '/database': 'nav.database',
        '/database-new': 'nav.database',
        '/database-enhanced': 'nav.database',
        '/database-final': 'nav.database',
        '/radar': 'nav.radar',
        '/radar-enhanced': 'nav.radar',
        '/schedule': 'nav.schedule',
        '/match-detail': 'nav.match',
        '/ranking': 'nav.ranking',
        '/competitions': 'nav.competitions',
        '/insights': 'nav.insights',
        '/dashboard': 'nav.dashboard',
        '/login': 'nav.login',
        '/ai-agent-enhanced': 'nav.ai',
        '/ai-agent': 'nav.ai',
        '/about': 'footer.about',
        '/contact': 'footer.contact',
        '/terms': 'footer.terms',
        '/privacy-policy': 'footer.privacy'
    };

    /** フッター等の .html 付き href（文言は言語別に footer.*） */
    var FOOTER_HREF_KEY = {
        '/about.html': 'footer.about',
        '/contact.html': 'footer.contact',
        '/terms.html': 'footer.terms',
        '/privacy-policy.html': 'footer.privacy'
    };

    function normLang(l) {
        l = (l || 'ja').toLowerCase().slice(0, 2);
        return l === 'en' ? 'en' : l === 'es' ? 'es' : 'ja';
    }

    function getInitialLang() {
        try {
            var q = new URLSearchParams(window.location.search).get('lang');
            if (q) return normLang(q);
        } catch (e) {}
        try {
            var s = localStorage.getItem(STORAGE_KEY);
            if (s) return normLang(s);
        } catch (e) {}
        try {
            var o = localStorage.getItem('fhj_seo_lang');
            if (o) return normLang(o);
        } catch (e) {}
        return 'ja';
    }

    function setLang(lang) {
        lang = normLang(lang);
        try {
            localStorage.setItem(STORAGE_KEY, lang);
            localStorage.setItem('fhj_seo_lang', lang);
        } catch (e) {}
        document.documentElement.lang = lang === 'ja' ? 'ja' : lang === 'es' ? 'es' : 'en';
        return lang;
    }

    function t(lang, key) {
        var pack = STR[lang] || STR.ja;
        return pack[key] != null ? pack[key] : (STR.ja[key] != null ? STR.ja[key] : key);
    }

    /** ナビ・フッター・トップの CTA ツール帯（全 a だとロゴや本文リンクを壊す） */
    var NAV_FOOTER_SEL =
        'nav a[href], footer a[href], .nav a[href], .nav-buttons a[href], .footer-links a[href], ' +
        '.site-footer a[href], .site-footer-wrap a[href], [data-fhj-nav] a[href], .nav-menu a[href], ' +
        '.tool-links a[href]';

    function applyNavByHref(lang) {
        var links = document.querySelectorAll(NAV_FOOTER_SEL);
        for (var i = 0; i < links.length; i++) {
            var a = links[i];
            if (a.closest && a.closest('#fhj-lang-bar')) continue;
            if (a.hasAttribute && a.hasAttribute('data-i18n')) continue;
            if (a.querySelector && a.querySelector('img')) continue;
            if (a.querySelector && a.querySelector('[data-i18n]')) continue;
            var href = a.getAttribute('href');
            if (!href) continue;
            var nk = FOOTER_HREF_KEY[href.split('?')[0]];
            if (nk) {
                a.textContent = t(lang, nk);
                continue;
            }
            var p = normPath(href);
            if (!p) continue;
            var key = PATH_TO_KEY[p];
            if (key && t(lang, key) !== key) {
                a.textContent = t(lang, key);
            }
        }
    }

    function applyDataI18n(lang) {
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            if (!key) return;
            var val = t(lang, key);
            if (val !== key) el.textContent = val;
        });
    }

    function injectBar(lang) {
        if (document.getElementById('fhj-lang-bar')) return;
        if (window.__FHJ_SEO_I18N__) return;

        var style = document.createElement('style');
        style.textContent =
            '#fhj-lang-bar{position:fixed;top:12px;right:12px;z-index:2147483000;display:flex;align-items:center;gap:6px;flex-wrap:wrap;' +
            'padding:6px 10px;border-radius:10px;background:rgba(10,14,23,0.92);border:1px solid #334155;box-shadow:0 4px 20px rgba(0,0,0,0.35);font-family:system-ui,sans-serif;font-size:12px;}' +
            '#fhj-lang-bar .fhj-lb-l{color:#94a3b8;margin-right:4px;}' +
            '#fhj-lang-bar button{font:inherit;cursor:pointer;padding:4px 8px;border-radius:6px;border:1px solid #475569;background:#111827;color:#e2e8f0;}' +
            '#fhj-lang-bar button[aria-pressed="true"]{border-color:#22d3ee;color:#22d3ee;background:rgba(0,189,199,0.15);}' +
            '@media(max-width:640px){#fhj-lang-bar{top:auto;bottom:12px;right:8px;left:8px;justify-content:center;}}';
        document.head.appendChild(style);

        var bar = document.createElement('div');
        bar.id = 'fhj-lang-bar';
        bar.setAttribute('role', 'group');
        bar.setAttribute('aria-label', t(lang, 'lang.label'));
        bar.innerHTML =
            '<span class="fhj-lb-l" data-i18n="lang.label">' +
            t(lang, 'lang.label') +
            '</span>' +
            '<button type="button" class="fhj-glb" data-lang="ja" aria-pressed="' +
            (lang === 'ja') +
            '">日本語</button>' +
            '<button type="button" class="fhj-glb" data-lang="en" aria-pressed="' +
            (lang === 'en') +
            '">English</button>' +
            '<button type="button" class="fhj-glb" data-lang="es" aria-pressed="' +
            (lang === 'es') +
            '">Español</button>';

        document.body.appendChild(bar);

        bar.querySelectorAll('.fhj-glb').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var L = setLang(btn.getAttribute('data-lang'));
                applyAll(L);
                syncUrl(L);
                updateBarState(L);
            });
        });
    }

    function updateBarState(lang) {
        var bar = document.getElementById('fhj-lang-bar');
        if (!bar) return;
        bar.setAttribute('aria-label', t(lang, 'lang.label'));
        var lab = bar.querySelector('.fhj-lb-l');
        if (lab) lab.textContent = t(lang, 'lang.label');
        bar.querySelectorAll('.fhj-glb').forEach(function (b) {
            b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false');
        });
    }

    function syncUrl(lang) {
        if (!history.replaceState) return;
        try {
            var u = new URL(window.location.href);
            u.searchParams.set('lang', lang);
            history.replaceState({}, '', u.pathname + u.search + u.hash);
        } catch (e) {}
    }

    function applyAll(lang) {
        lang = setLang(lang);
        applyDataI18n(lang);
        applyNavByHref(lang);
        if (typeof window.FHJ_applySeoLang === 'function') {
            try {
                window.FHJ_applySeoLang(lang);
            } catch (e) {}
        }
        updateBarState(lang);
    }

    function init() {
        var lang = getInitialLang();
        setLang(lang);
        injectBar(lang);
        applyAll(lang);
        syncUrl(lang);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
