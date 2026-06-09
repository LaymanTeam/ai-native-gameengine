import { redirect } from 'next/navigation';

// Landing page → the keyless playable demo (Baker Pantry Panic). The agentic creation engine
// needs API keys to run, so the public entry point is the runtime demo that works without them.
// The engine itself lives at /studio (set a Gemini key + FORGE_MODEL_API_ENABLED=1 to use it).
export default function HomePage() {
  redirect('/forge?play');
}
