import { Box } from '@mantine/core';
import { Chat } from '@/engine/frontend/components/Chat';

// Studio = the agentic engine conversation. The director drives generation phase by phase
// (design → assets → code → test → deploy); phases stream in as tool events + artifacts.
// Requires a Gemini key + FORGE_MODEL_API_ENABLED=1; the keyless playable demo lives at /forge?play.
export default function StudioPage() {
  return (
    <Box px="md" py="lg" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Chat />
    </Box>
  );
}
