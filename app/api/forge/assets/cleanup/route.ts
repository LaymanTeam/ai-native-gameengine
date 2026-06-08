import { pruneRuntimeAssetBatches, type RuntimeAssetRetentionOptions } from '@/engine/runtime/asset-production';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface CleanupBatchesRequestBody {
  keepLatest?: unknown;
  maxAgeDays?: unknown;
  dryRun?: unknown;
}

function optionalPositiveInteger(value: unknown, name: string, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > max) {
    throw new Error(`${name} must be a number from 1 to ${max}`);
  }
  return Math.floor(value);
}

export async function POST(req: Request): Promise<Response> {
  try {
    let body: CleanupBatchesRequestBody = {};
    try {
      body = (await req.json()) as CleanupBatchesRequestBody;
    } catch {
      body = {};
    }

    const keepLatest = optionalPositiveInteger(body.keepLatest, 'keepLatest', 100);
    const maxAgeDays = optionalPositiveInteger(body.maxAgeDays, 'maxAgeDays', 365);
    const options: RuntimeAssetRetentionOptions = {};
    if (keepLatest !== undefined) options.keepLatest = keepLatest;
    if (maxAgeDays !== undefined) options.maxAgeDays = maxAgeDays;
    if (typeof body.dryRun === 'boolean') options.dryRun = body.dryRun;

    const result = await pruneRuntimeAssetBatches(options);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Reviewed-art cleanup failed.' },
      { status: 500 },
    );
  }
}
