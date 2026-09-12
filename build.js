// Inline the three scripts into one self-contained HTML file: dist/tidewright.html
const fs = require('fs');
const path = require('path');
const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  if (/^https?:/.test(src)) return m;   // external libraries stay as links
  const code = fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>\n${code}\n</script>`;
});
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'tidewright.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`);

// Standalone document: full HTML skeleton so it opens directly from disk.
const body = html.replace('</style>', '</style>\n</head>\n<body>');
const standalone = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' + body + '\n</body>\n</html>\n';
const out2 = path.join(root, 'Tidewright.html');
fs.writeFileSync(out2, standalone);
console.log(`wrote ${out2} (${(standalone.length / 1024).toFixed(1)} KB)`);
