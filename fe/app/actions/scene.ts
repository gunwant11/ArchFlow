'use server';

import { fal } from "@fal-ai/client";
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// --- Scene Rendering Types & Logic ---

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

export async function renderScene(body: RenderRequestBody): Promise<RenderResponseBody> {
  try {
    if (!body.json_prompt) {
      throw new Error('Missing required field "json_prompt".');
    }

    const variants = body.variants && body.variants > 0 ? body.variants : 1;
    const seed = body.seed ?? 2771;
    const stepsNum = body.steps ?? 50;
    const aspectRatio = body.aspect_ratio ?? '1:1';
    const guidanceScale = body.guidance_scale ?? 5;

    const imagePromises = Array.from({ length: variants }, async (_, index) => {
      try {
        console.log(`[Fal] Submitting variant ${index + 1}/${variants}`);

        const result = await fal.subscribe("bria/fibo/generate", {
          input: {
            prompt: JSON.stringify(body.json_prompt),
            seed: seed + index,
            steps_num: stepsNum,
            aspect_ratio: aspectRatio,
            guidance_scale: guidanceScale
          },
          logs: true,
          onQueueUpdate: (update) => {
            if (update.status === "IN_PROGRESS") {
              update.logs.map((log) => log.message).forEach(console.log);
            }
          },
        });

        console.log(result.data);
        console.log(result.requestId);

        // Extract image URL from result.data
        // Assuming typical Fal response handling
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = result.data as any;
        let imageUrl: string | undefined;

        if (data.images && Array.isArray(data.images) && data.images.length > 0) {
            imageUrl = data.images[0].url;
        } else if (data.image) {
            imageUrl = data.image.url;
        }

        if (!imageUrl) {
             throw new Error('No image URL in Fal response');
        }

        return {
          imageUrl,
          requestId: result.requestId,
        };

      } catch (error) {
        console.error(`Error generating variant ${index + 1}:`, error);
        throw error;
      }
    });

    const results = await Promise.all(imagePromises);
    const images = results.map((r) => r.imageUrl).filter(Boolean);
    const requestId = results[0]?.requestId;

    if (images.length === 0) {
      throw new Error('Failed to generate any images');
    }

    return { 
      images,
      ...(requestId && { requestId }),
    };
  } catch (error) {
    console.error('Error in renderScene:', error);
    throw new Error(error instanceof Error ? error.message : 'Unknown error');
  }
}

// --- Scene JSON Generation Types & Logic ---

type GenerateJsonType =
  | 'floor plan image'
  | 'floor plan prompt'
  | 'generate'
  | 'refine';

interface GenerateJsonRequestBody {
  type: GenerateJsonType;
  style?: string;
  theme?: Record<string, unknown>;
  json_prompt?: Record<string, unknown>;
  prompt?: string;
  camera?: Record<string, unknown>;
  lighting?: Record<string, unknown>;
  reference_image?: string;
  parent_id?: string | null;
}

interface GenerateJsonResponseBody {
  id: string;
  parent_id: string | null;
  type: GenerateJsonType;
  style: string | undefined;
  json_prompt: Record<string, unknown>;
}

const MODEL_NAME = 'gemini-2.5-pro';

// Zod schema for the response
const generateJsonResponseSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable(),
  type: z.enum(['floor plan image', 'floor plan prompt', 'generate', 'refine']),
  style: z.string().optional(),
  json_prompt: z.record(z.string(), z.unknown()),
});

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Missing GEMINI_API_KEY environment variable for @google/genai.'
    );
  }

  return new GoogleGenAI({
    apiKey,
  });
}

function buildSystemPrompt(input: GenerateJsonRequestBody, type: GenerateJsonType): string {
  console.log('type', type);
    return [
    'You are a scene JSON generator for an interior architecture tool.',
    'Your job is to return ONLY valid JSON for a scene definition, no markdown, no prose.',
    '',
    'Input fields:',
    '- type: describes the action (floor plan image | floor plan prompt | generate | refine)',
    '- style: high-level style like boho, contemporary, industrial',
    '- theme: color palette + mood',
    '- json_prompt: existing scene JSON to refine (if present)',
    '- prompt: natural language description',
    '- camera, lighting, reference_image: optional controls',
    '',
    'Output JSON MUST have this exact top-level shape:',
    '{',
    '  "id": "scene_XXX",',
    '  "parent_id": "prev_scene_id or null",',
    '  "type": "<same as input type>",',
    '  "style": "<final style string>",',
    '  "json_prompt": {',
    '    // structured scene spec, rooms/objects/etc.',
    '  }',
    '}',
    '',
    'Rules:',
    '- Always return valid JSON.',
    '- Never wrap the JSON in code fences.',
    '- Do not include comments in the final JSON.',
    '',
    'User input (for context):',
    JSON.stringify(input, null, 2),
  ].join('\n');
}

export async function generateSceneJson(body: GenerateJsonRequestBody): Promise<GenerateJsonResponseBody> {
  try {
    if (!body.type) {
      throw new Error('Missing required field "type".');
    }

    const client = getGenAIClient();
    const config = {
      thinkingConfig: {
        thinkingBudget: -1,
      },
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 16000,
        responseMimeType: 'application/json',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        responseJsonSchema: zodToJsonSchema(generateJsonResponseSchema as any) as any,
      },
    };

    const prompt = buildSystemPrompt(body, body.type);

    const contents = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];

    const result = await client.models.generateContent({
      model: MODEL_NAME,
      config,
      contents,
    });

    const text = result.text ?? '';

    if (!text) {
      throw new Error('Empty response from @google/genai.');
    }

    // Log the raw response for debugging
    console.log('Raw model response:', text.substring(0, 200));

    // Clean the text: remove markdown code fences if present
    let cleanedText = text.trim();
    
    // Remove ```json ... ``` or ``` ... ``` wrapper
    const codeBlockMatch = cleanedText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
    if (codeBlockMatch) {
      cleanedText = codeBlockMatch[1].trim();
    }

    // Parse the JSON response (should already be valid JSON due to responseJsonSchema)
    let parsed: z.infer<typeof generateJsonResponseSchema>;
    try {
      parsed = JSON.parse(cleanedText);
    } catch (e) {
      console.error('Failed to parse JSON. Cleaned text:', cleanedText.substring(0, 500));
      throw new Error(`Failed to parse JSON response from model: ${(e as Error).message}`);
    }

    // Validate with Zod (responseJsonSchema should ensure structure, but validate for safety)
    const validated = generateJsonResponseSchema.parse(parsed);

    // Apply fallback defaults if any fields are missing
    const response: GenerateJsonResponseBody = {
      id: validated.id || `scene_${Date.now()}`,
      parent_id: validated.parent_id ?? body.parent_id ?? null,
      type: validated.type || body.type,
      style: validated.style ?? body.style,
      json_prompt: validated.json_prompt || {},
    };

    return response;
  } catch (error) {
    console.error('Error in generateSceneJson:', error);
    throw new Error(error instanceof Error ? error.message : 'Unknown error');
  }
}
