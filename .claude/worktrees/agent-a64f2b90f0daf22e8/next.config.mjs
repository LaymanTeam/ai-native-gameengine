/** @type {import('next').NextConfig} */
const nextConfig = {
  // LangChain + node-canvas etc. must stay external to the server bundle
  serverExternalPackages: ['@langchain/google-genai', 'langchain', '@langchain/core', '@langchain/langgraph'],
};

export default nextConfig;
