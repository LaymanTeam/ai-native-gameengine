'use client';

/**
 * Shared top navigation across the engine UI surfaces (Studio chat, Library, Schema).
 * Visual system only — no product name/wordmark yet (pending team decision); a neutral
 * spark glyph stands in for the brand mark.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Anchor, Avatar, Box, Group, Text } from '@mantine/core';

const LINKS = [
  { href: '/', label: 'Studio' },
  { href: '/library', label: 'Library' },
  { href: '/schema', label: 'Schema' },
] as const;

function SparkMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--forge-accent)" strokeWidth="1.7" aria-hidden>
      <path d="M12 2l2.2 6.6H21l-5.4 4 2 6.6L12 15l-5.6 4.2 2-6.6L3 8.6h6.8z" />
    </svg>
  );
}

export function TopBar() {
  const pathname = usePathname();
  return (
    <Box
      component="header"
      h={64}
      px="xl"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: 'var(--forge-bone)',
        borderBottom: '1px solid rgba(38,36,31,0.06)',
      }}
    >
      <Group h="100%" gap="xl" wrap="nowrap">
        <Anchor component={Link} href="/" aria-label="Home" style={{ display: 'flex', alignItems: 'center' }}>
          <SparkMark />
        </Anchor>
        <Group gap="lg">
          {LINKS.map((link) => {
            const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Anchor
                key={link.href}
                component={Link}
                href={link.href}
                size="sm"
                c={active ? 'var(--forge-ink)' : 'dimmed'}
                fw={active ? 500 : 400}
                underline="never"
              >
                {link.label}
              </Anchor>
            );
          })}
        </Group>
        <Group gap="lg" ml="auto" wrap="nowrap">
          <Group gap={8} wrap="nowrap">
            <Box w={6} h={6} style={{ borderRadius: '50%', background: 'var(--forge-accent)' }} />
            <Text size="sm" c="dimmed">ready</Text>
          </Group>
          <Avatar size={30} radius="xl" color="gray" variant="light">T</Avatar>
        </Group>
      </Group>
    </Box>
  );
}
