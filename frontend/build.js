// Copia os arquivos do site para dist/ (compativel com deploy Netlify)
const fs = require('fs');
const path = require('path');

const root = __dirname;
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

['index.html', 'style.css', 'app.js', 'config.js'].forEach(f => {
  fs.copyFileSync(path.join(root, f), path.join(dist, f));
});

console.log('Build OK -> frontend/dist');
