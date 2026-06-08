export const runtime = 'nodejs';

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.toLowerCase();
  if (!raw) return fallback;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  return fallback;
}

export function GET(): Response {
  const modelApiEnabled = envFlag('FORGE_MODEL_API_ENABLED', false);
  const reviewedAssetsAvailable = modelApiEnabled && Boolean(process.env['GOOGLE_API_KEY']);
  const defaultReviewedAssets =
    reviewedAssetsAvailable && envFlag('FORGE_REVIEWED_ART_DEFAULT', false);
  return Response.json({
    reviewedAssetsAvailable,
    defaultReviewedAssets,
    reason: reviewedAssetsAvailable
      ? null
      : modelApiEnabled
        ? 'GOOGLE_API_KEY missing'
        : 'FORGE_MODEL_API_ENABLED disabled',
  });
}
