const ASSET_URL_LOG_PREFIX = '[engine/storage/asset-url]';

/**
 * Resolve any asset reference to a loadable URL so build-time and runtime-generated assets share
 * one convention:
 * - data: URLs pass through,
 * - "runtime:<file>" maps to the public-dir convention URL /runtime/<file>,
 * - anything else is returned as-is.
 */
export function resolveAssetUrl(ref: string): string {
  if (!ref || typeof ref !== 'string') {
    throw new Error(`${ASSET_URL_LOG_PREFIX} resolveAssetUrl: ref must be a non-empty string`);
  }
  if (ref.startsWith('data:')) return ref;
  if (ref.startsWith('runtime:')) {
    const file = ref.slice('runtime:'.length).replace(/^\/+/, '');
    if (file.length === 0) {
      throw new Error(`${ASSET_URL_LOG_PREFIX} resolveAssetUrl: empty runtime: reference`);
    }
    return `/runtime/${file}`;
  }
  return ref;
}
