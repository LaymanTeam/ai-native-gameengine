/**
 * Vercel Node-runtime (NOT Edge — LangChain needs Node APIs) streaming API route: receives the
 * user's chat message, runs the director agent, and streams tokens/progress back to the Mantine
 * frontend. export const maxDuration tuned per research/vercel-langchain-gemini.md.
 */
