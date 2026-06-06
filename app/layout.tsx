import '@mantine/core/styles.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ColorSchemeScript, MantineProvider, createTheme, mantineHtmlProps } from '@mantine/core';

// NOTE: Clerk is intentionally NOT wired into the engine app shell — it is offered as
// runtime tooling for the generated games (engine/auth/clerk.ts), not as a gate on the engine UI.

export const metadata: Metadata = {
  title: 'Game Engine', // no branding yet — name pending user decision
  description: 'Describe a game; the engine generates and deploys it.',
};

const theme = createTheme({
  primaryColor: 'indigo',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider theme={theme}>{children}</MantineProvider>
      </body>
    </html>
  );
}
