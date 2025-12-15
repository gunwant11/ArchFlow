import { NextResponse } from 'next/server';
import { fal } from '@/lib/fal';

interface RenderRequestBody {
  json_prompt: Record<string, unknown>;
  lora?: string;
  seed?: number;
  steps?: number;
  variants?: number;
  aspect_ratio?: string;
  guidance_scale?: number;
}

interface RenderResponseBody {
  images: string[];
  requestId?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RenderRequestBody;

    if (!body.json_prompt) {
      return NextResponse.json(
        { error: 'Missing required field "json_prompt".' },
        { status: 400 }
      );
    }

    const variants = body.variants && body.variants > 0 ? body.variants : 1;
    const seed = body.seed ?? 5555;
    const stepsNum = body.steps ?? 50;
    const aspectRatio = body.aspect_ratio ?? '1:1';
    const guidanceScale = body.guidance_scale ?? 5;

    // Generate images using fal.ai
    const imagePromises = Array.from({ length: variants }, async (_, index) => {
      try {
        // The API expects prompt to be a JSON string, not an object
        const promptString = JSON.stringify(body.json_prompt);
        
        const inputPayload = {
          prompt: promptString,
          seed: seed + index,
          steps_num: stepsNum,
          aspect_ratio: aspectRatio,
          guidance_scale: guidanceScale,
        };
        
        console.log('Calling fal.ai bria/fibo/generate with input:', {
          prompt: promptString.substring(0, 200) + '...',
          seed: seed + index,
          steps_num: stepsNum,
          aspect_ratio: aspectRatio,
          guidance_scale: guidanceScale,
        });

        const result = await fal.subscribe('bria/fibo/generate', {
          input: inputPayload,
          logs: true,
          onQueueUpdate: (update) => {
            if (update.status === 'IN_PROGRESS') {
              update.logs?.map((log) => log.message).forEach(console.log);
            }
          },
        });

        // Extract image URL from result
        // Handle different possible response structures
        let imageUrl = '';
        if (result.data) {
          if (typeof result.data === 'string') {
            imageUrl = result.data;
          } else if (result.data.image?.url) {
            imageUrl = result.data.image.url;
          } else if (result.data.url) {
            imageUrl = result.data.url;
          } else if (result.data.images && Array.isArray(result.data.images) && result.data.images[0]) {
            imageUrl = typeof result.data.images[0] === 'string' ? result.data.images[0] : result.data.images[0].url || '';
          }
        }
        
        if (!imageUrl) {
          console.warn('Unexpected response structure:', JSON.stringify(result.data, null, 2));
        }
        
        return {
          imageUrl,
          requestId: result.requestId,
        };
      } catch (error) {
        console.error(`Error generating variant ${index + 1}:`, error);
        // Log more details about the validation error
        const err = error as { status?: number; body?: unknown; message?: string };
        if (err.status === 422 && err.body) {
          console.error('Validation error details:', JSON.stringify(err.body, null, 2));
        }
        throw error;
      }
    });

    const results = await Promise.all(imagePromises);
    const images = results.map((r) => r.imageUrl).filter(Boolean);
    const requestId = results[0]?.requestId;

    if (images.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate any images' },
        { status: 500 }
      );
    }

    const response: RenderResponseBody = { 
      images,
      ...(requestId && { requestId }),
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in /api/scene/render:', error);

    return NextResponse.json(
      {
        error: 'Failed to render images from json_prompt',
        details:
          process.env.NODE_ENV === 'development'
            ? (error as Error).message
            : undefined,
      },
      { status: 500 }
    );
  }
}



