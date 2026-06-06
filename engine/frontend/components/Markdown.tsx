'use client';

/**
 * Minimal, dependency-free Markdown renderer for the subset the engine emits in artifacts
 * (headings, blockquote, bullet lists, **bold**, `code`, paragraphs). Styled in the Forge
 * design system. Swap for react-markdown later if richer content is needed.
 */
import type { ReactNode } from 'react';
import { Box, Code, List, Stack, Text } from '@mantine/core';

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) nodes.push(<b key={key++}>{m[1]}</b>);
    else if (m[2] !== undefined) nodes.push(<Code key={key++} fz="inherit">{m[2]}</Code>);
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ source, tone = 'muted' }: { source: string; tone?: 'muted' | 'normal' }) {
  const bodyColor = tone === 'muted' ? 'dimmed' : undefined;
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <List key={key++} spacing={4} size="sm" withPadding listStyleType="disc">
        {items.map((b, i) => (
          <List.Item key={i}><Text span size="sm" c={bodyColor}>{renderInline(b)}</Text></List.Item>
        ))}
      </List>,
    );
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('- ')) { bullets.push(line.slice(2)); continue; }
    flushBullets();
    if (line === '') continue;
    if (line.startsWith('### ')) {
      blocks.push(<Text key={key++} fw={600} size="sm" mt={6}>{renderInline(line.slice(4))}</Text>);
    } else if (line.startsWith('## ')) {
      blocks.push(<Text key={key++} fw={600} tt="uppercase" lts="0.1em" c="dimmed" size="xs" mt={8}>{renderInline(line.slice(3))}</Text>);
    } else if (line.startsWith('# ')) {
      blocks.push(<Text key={key++} fw={600} size="md">{renderInline(line.slice(2))}</Text>);
    } else if (line.startsWith('> ')) {
      blocks.push(
        <Box key={key++} pl="sm" style={{ borderLeft: '2px solid var(--forge-accent)' }}>
          <Text size="sm" fs="italic" c="dimmed">{renderInline(line.slice(2))}</Text>
        </Box>,
      );
    } else {
      blocks.push(<Text key={key++} size="sm" c={bodyColor}>{renderInline(line)}</Text>);
    }
  }
  flushBullets();

  return <Stack gap={6}>{blocks}</Stack>;
}
