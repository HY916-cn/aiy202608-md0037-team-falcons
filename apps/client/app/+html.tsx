import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <meta content="#1677FE" name="theme-color" />
        <meta content="校园教学、成长与治理协作平台" name="description" />
        <link href="/manifest.webmanifest" rel="manifest" />
        <link href="/apple-touch-icon.png" rel="apple-touch-icon" />
        <link href="/favicon-32.png" rel="icon" sizes="32x32" type="image/png" />
        <link href="/favicon-16.png" rel="icon" sizes="16x16" type="image/png" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root {
                background: #F3F3F3;
                color: rgba(0, 0, 0, 0.894);
                font-family: "Segoe UI Variable", "Microsoft YaHei UI", "Segoe UI", sans-serif;
              }
              *, *::before, *::after { box-sizing: border-box; }
              button, input, textarea, select { font: inherit; }
              [class*="css-text-"], [class*="css-textinput-"] {
                font-family: "Segoe UI Variable", "Microsoft YaHei UI", "Segoe UI", sans-serif !important;
              }
              ::selection { background: #1677FE; color: #FFFFFF; }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
