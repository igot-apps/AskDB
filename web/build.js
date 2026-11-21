// Builds the web version into web/dist by reusing the desktop app's screens (src/renderer).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src', 'renderer');
const out = path.join(__dirname, 'dist');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });

for (const f of ['styles.css', 'format.js', 'agent.js', 'voice.js', 'app.js']) {
  fs.copyFileSync(path.join(src, f), path.join(out, f));
}
fs.copyFileSync(path.join(__dirname, 'api-web.js'), path.join(out, 'api-web.js'));
fs.copyFileSync(path.join(root, 'node_modules', 'chart.js', 'dist', 'chart.umd.min.js'), path.join(out, 'vendor', 'chart.umd.min.js'));

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const replace = (from, to) => {
  if (!html.includes(from)) throw new Error(`build: expected text not found in index.html: ${from}`);
  html = html.replace(from, to);
};
replace('../../node_modules/chart.js/dist/chart.umd.min.js', 'vendor/chart.umd.min.js');
replace('<script src="format.js"></script>', '<script src="api-web.js"></script>\n<script src="format.js"></script>');
replace('connect-src https://openrouter.ai', "connect-src 'self' https://openrouter.ai");
replace('are saved only on this computer', 'are saved only in this browser on this device');
replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">');
fs.writeFileSync(path.join(out, 'index.html'), html);

console.log('Web version built into web/dist');
