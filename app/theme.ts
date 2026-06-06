import { createTheme, type MantineColorsTuple } from '@mantine/core';

/**
 * Forge design tokens expressed as a Mantine v9 theme (ported from design/forge.css).
 * Nordic / calm: warm "bone" surfaces, one restrained sage accent, Schibsted Grotesk.
 * No product branding here — visual system only (name pending team decision).
 */

// muted sage accent ramp; shade 6 (#7e8b6d) is the canonical accent
const sage: MantineColorsTuple = [
  '#f4f6ef', '#e7ecdd', '#d3dabe', '#bdc89d', '#aab884',
  '#9aaa6f', '#7e8b6d', '#69755a', '#586248', '#465036',
];

export const theme = createTheme({
  primaryColor: 'sage',
  primaryShade: { light: 6, dark: 4 },
  autoContrast: true,
  luminanceThreshold: 0.4,
  fontFamily: 'var(--font-schibsted), system-ui, -apple-system, sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  headings: {
    fontFamily: 'var(--font-schibsted), system-ui, sans-serif',
    fontWeight: '600',
  },
  defaultRadius: 'md',
  radius: { sm: '8px', md: '12px', lg: '16px', xl: '20px' },
  colors: { sage },
});
