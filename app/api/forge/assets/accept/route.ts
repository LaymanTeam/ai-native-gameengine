import { acceptRuntimeAssetReview } from '@/engine/runtime/asset-production';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface AcceptReviewRequestBody {
  batchId?: string;
  variable?: string;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as AcceptReviewRequestBody;
    if (!body?.batchId || typeof body.batchId !== 'string') {
      return Response.json({ error: 'batchId (string) required' }, { status: 400 });
    }
    if (!body?.variable || typeof body.variable !== 'string') {
      return Response.json({ error: 'variable (string) required' }, { status: 400 });
    }
    const result = await acceptRuntimeAssetReview({ batchId: body.batchId, variable: body.variable });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Review asset accept failed.' },
      { status: 500 },
    );
  }
}
