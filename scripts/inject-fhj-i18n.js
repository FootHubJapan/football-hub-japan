/**
 * public 配下の全 HTML に <script src="/js/fhj-i18n.js" defer></script> を 1 回だけ追加
 */
const fs = require('fs');
const path = require('path');

const TAG = '<script src="/js/fhj-i18n.js" defer></script>';

function walkHtml(dir, out = []) {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) walkHtml(p, out);
        else if (name.endsWith('.html')) out.push(p);
    }
    return out;
}

function main() {
    const root = path.join(__dirname, '..', 'public');
    const files = walkHtml(root);
    let added = 0;
    let skipped = 0;
    for (const file of files) {
        let html = fs.readFileSync(file, 'utf8');
        if (html.includes('fhj-i18n.js')) {
            skipped++;
            continue;
        }
        if (/<\/body>/i.test(html)) {
            html = html.replace(/<\/body>/i, `${TAG}\n</body>`);
        } else {
            html += `\n${TAG}\n`;
        }
        fs.writeFileSync(file, html, 'utf8');
        added++;
        console.log('added:', path.relative(root, file));
    }
    console.log('done. added:', added, 'skipped (already had script):', skipped);
}

main();
