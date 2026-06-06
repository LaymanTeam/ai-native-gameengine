import { Container, Stack, Text } from '@mantine/core';
import { Chat } from '../engine/frontend/components/Chat';

export default function HomePage() {
  return (
    <Container size="sm" py="xl" h="100dvh">
      <Stack h="100%" gap="md">
        {/* No branding yet — name/title pending user decision */}
        <Text c="dimmed" size="sm">
          Describe the game you want — the engine plans, generates, and deploys it.
        </Text>
        <Chat />
      </Stack>
    </Container>
  );
}
