import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'dist', 'index.html');
if (!fs.existsSync(indexPath)) {
  throw new Error('dist/index.html non trovato: esegui prima expo export --platform web.');
}

let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace('<html lang="en">', '<html lang="it">');
html = html.replace(/<meta name="viewport"[^>]*>/i, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />');
html = html.replace(/<title>.*?<\/title>/is, '<title>Marilab Mover</title>');

const pwaHead = `
    <!-- Marilab Mover PWA 1.8.2 -->
    <meta name="theme-color" content="#061F30" />
    <meta name="application-name" content="Marilab Mover" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Marilab Mover" />
    <meta name="description" content="Spostamenti, consegne, chat e notifiche operative Marilab." />
    <link rel="manifest" href="/manifest.json?v=182" />
    <link rel="apple-touch-icon" sizes="120x120" href="/icons/apple-touch-icon-120-v182.png" />
    <link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon-152-v182.png" />
    <link rel="apple-touch-icon" sizes="167x167" href="/icons/apple-touch-icon-167-v182.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180-v182.png" />
    <link rel="apple-touch-icon-precomposed" href="/icons/apple-touch-icon-180-v182.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192-v182.png" />`;

if (!html.includes('Marilab Mover PWA 1.8.2')) {
  html = html.replace('</head>', `${pwaHead}\n  </head>`);
}

fs.writeFileSync(indexPath, html);

const required = [
  'manifest.json',
  'sw.js',
  'notification-badge.png',
  'icons/icon-192-v182.png',
  'icons/icon-512-v182.png',
  'icons/apple-touch-icon-180-v182.png',
];
for (const relative of required) {
  if (!fs.existsSync(path.join(root, 'dist', relative))) {
    throw new Error(`Asset PWA mancante nell’export: ${relative}`);
  }
}

console.log('PWA web patch E1.8.2 applicata: manifest, icone Apple/Android e metadata installazione presenti.');
