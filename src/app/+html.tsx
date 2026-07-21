import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="it">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#061F30" />
        <meta name="application-name" content="Marilab Mover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Marilab Mover" />
        <meta name="description" content="Spostamenti, consegne, chat e notifiche operative Marilab." />
        <link rel="manifest" href="/manifest.json?v=182" />
        <link rel="apple-touch-icon" sizes="120x120" href="/icons/apple-touch-icon-120-v182.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon-152-v182.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/apple-touch-icon-167-v182.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180-v182.png" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body, #root { width: 100%; height: 100%; min-height: 100dvh; }
          html { background: #F2F6F7; overscroll-behavior: none; }
          body { margin: 0; overflow: hidden; background: #F2F6F7; text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; }
          #root { display: flex; min-width: 0; min-height: 0; }
          * { box-sizing: border-box; }
          button, input, textarea { font: inherit; }
          @media (min-width: 1100px) { body { min-width: 1100px; } }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
