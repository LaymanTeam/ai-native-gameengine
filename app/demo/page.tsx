import { Box } from '@mantine/core';
import { PlayableForgeStudio } from '@/engine/frontend/components/PlayableForgeStudio';

// Bounded-template demo: describe → local GameSpec → playable Canvas2D game in-app. Kept as a
// reliable, keyless playable while the agentic pipeline (Studio) builds out its own runtime.
export default function DemoPage() {
  return (
    <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <PlayableForgeStudio />
    </Box>
  );
}
