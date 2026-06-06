import { Box } from '@mantine/core';
import { PlayableForgeStudio } from '@/engine/frontend/components/PlayableForgeStudio';

// Spike branch: use the multimodal shell as the front door for the already-working
// Prompt Roguelite Forge generation/player pipeline.
export default function HomePage() {
  return (
    <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <PlayableForgeStudio />
    </Box>
  );
}
