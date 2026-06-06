import { Box } from '@mantine/core';
import { Chat } from '@/engine/frontend/components/Chat';

// Studio = the engine's chat surface. Conversation drives generation; the chat handles its
// own empty state and composer. (No branding yet — name pending user decision.)
export default function HomePage() {
  return (
    <Box px="md" py="lg" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Chat />
    </Box>
  );
}
