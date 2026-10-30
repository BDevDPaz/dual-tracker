const fs = require('fs');
const path = require('path');

const roots = ['app', 'src/components'];
const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(e.name)) files.push(p);
  }
}
roots.forEach(r => { if (fs.existsSync(r)) walk(r); });

console.log('archivo | useTheme() | importa TOKENS | importa theme | veredicto');
for (const f of files.sort()) {
  const c = fs.readFileSync(f, 'utf8');
  const useTheme = /useTheme\s*\(/.test(c);
  const tok = /\bTOKENS\b/.test(c);
  const impTheme = /constants\/theme/.test(c);
  let v = 'OK';
  if (tok) v = 'CORREGIR: usa TOKENS estático';
  else if (impTheme && !useTheme) v = 'REVISAR: importa theme pero no usa useTheme()';
  else if (!impTheme && !useTheme) v = 'SIN TEMA';
  console.log(`${f} | ${useTheme} | ${tok} | ${impTheme} | ${v}`);
}
