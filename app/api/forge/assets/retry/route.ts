import { retryRuntimeAssetReview } from '@/engine/runtime/asset-production';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface RetryReviewRequestBody {
  batchId?: string;
  variable?: string;
  feedback?: string;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as RetryReviewRequestBody;
    if (!body?.batchId || typeof body.batchId !== 'string') {
      return Response.json({ error: 'batchId (string) required' }, { status: 400 });
    }
    if (!body?.variable || typeof body.variable !== 'string') {
      return Response.json({ error: 'variable (string) required' }, { status: 400 });
    }
    const retryOptions = {
      batchId: body.batchId,
      variable: body.variable,
      ...(typeof body.feedback === 'string' ? { feedback: body.feedback } : {}),
    };
    const result = await retryRuntimeAssetReview(retryOptions);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Review asset retry failed.' },
      { status: 500 },
    );
  }
}
