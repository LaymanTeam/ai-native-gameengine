import '@mantine/core/styles.css';
import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core';
import { Schibsted_Grotesk } from 'next/font/google';
import { theme } from './theme';
import { TopBar } from '@/engine/frontend/components/TopBar';

// NOTE: Clerk is intentionally NOT wired into the engine app shell — it is offered as
// runtime tooling for the generated games (engine/auth/clerk.ts), not as a gate on the engine UI.

const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-schibsted',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Game Engine', // no branding yet — name pending user decision
  description: 'Describe a game; the engine generates and deploys it.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps} className={schibsted.variable}>
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="light">
          <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
            <TopBar />
            <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {children}
            </main>
          </div>
        </MantineProvider>
      </body>
    </html>
  );
}
