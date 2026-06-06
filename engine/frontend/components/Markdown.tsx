'use client';

/**
 * Minimal, dependency-free Markdown renderer for the subset the engine/LLM emits
 * (headings, blockquote, ordered + unordered lists incl. nesting, **bold**, *italic*,
 * `code`, --- rules, paragraphs). Styled in the Forge design system.
 */
import type { ReactNode } from 'react';
import { Box, Code, Divider, Group, Stack, Text } from '@mantine/core';

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // bold (**..**) first, then italic (*..*), then inline code (`..`)
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) nodes.push(<b key={key++}>{m[1]}</b>);
    else if (m[2] !== undefined) nodes.push(<i key={key++}>{m[2]}</i>);
    else if (m[3] !== undefined) nodes.push(<Code key={key++} fz="inherit">{m[3]}</Code>);
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const BULLET_RE = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED_RE = /^(\s*)(\d+)\.\s+(.*)$/;
const HR_RE = /^\s*([-*_])\1{2,}\s*$/;

export function Markdown({ source, tone = 'muted' }: { source: string; tone?: 'muted' | 'normal' }) {
  const bodyColor = tone === 'muted' ? 'dimmed' : 'var(--mantine-color-text)';
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let key = 0;

  const listItem = (indent: number, marker: string, content: string) => (
    <Group key={key++} gap={8} align="flex-start" wrap="nowrap" pl={indent}>
      <Text size="sm" c={bodyColor} style={{ lineHeight: 1.6 }}>{marker}</Text>
      <Text size="sm" c={bodyColor} style={{ lineHeight: 1.6 }}>{renderInline(content)}</Text>
    </Group>
  );

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '') continue;

    if (HR_RE.test(line)) { blocks.push(<Divider key={key++} my={4} />); continue; }

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      const indent = Math.min(48, Math.floor((bullet[1]?.length ?? 0) / 2) * 14);
      blocks.push(listItem(indent, '•', bullet[2] ?? ''));
      continue;
    }
    const ordered = ORDERED_RE.exec(line);
    if (ordered) {
      const indent = Math.min(48, Math.floor((ordered[1]?.length ?? 0) / 2) * 14);
      blocks.push(listItem(indent, `${ordered[2]}.`, ordered[3] ?? ''));
      continue;
    }

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
      blocks.push(<Text key={key++} size="sm" c={bodyColor} style={{ lineHeight: 1.6 }}>{renderInline(line)}</Text>);
    }
  }

  return <Stack gap={6}>{blocks}</Stack>;
}
