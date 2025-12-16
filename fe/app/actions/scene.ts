'use server';

import { fal } from "@fal-ai/client";
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { uploadToR2 } from '@/lib/r2';

// --- Scene Rendering Types & Logic ---

interface RenderRequestBody {
  json_prompt: Record<string, unknown>;
  lora?: string;
  seed?: number;
  steps?: number;
  variants?: number;
  aspect_ratio?: string;
  guidance_scale?: number;
  image_url?: string | null;
  structured_prompt?: Record<string, unknown>;
}

interface RenderResponseBody {
  images: string[];
  structuredPrompts?: Record<string, any>[];
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
            guidance_scale: guidanceScale,
            image_url: body.image_url ?? null,
            structured_prompt: body.structured_prompt
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

        try {
          // Download image from Fal
          const imageResponse = await fetch(imageUrl);
          if (!imageResponse.ok) {
             console.error(`Failed to download image from Fal: ${imageResponse.status} ${imageResponse.statusText}`);
             // Fallback to original URL if download fails (though likely won't work well if temporary)
          } else {
             const arrayBuffer = await imageResponse.arrayBuffer();
             const buffer = Buffer.from(arrayBuffer);
             
             // Upload to R2
             // Use requestId and index for unique key
             const key = `generations/${result.requestId || Date.now()}-${index}.png`;
             // Assume PNG for now or check header
             const contentType = imageResponse.headers.get('content-type') || 'image/png';
             
             const r2Url = await uploadToR2(buffer, key, contentType);
             imageUrl = r2Url;
          }
        } catch (uploadError) {
          console.error('Failed to upload Fal image to R2:', uploadError);
          // If upload fails, we still return the Fal URL (better than nothing)
        }

        return {
          imageUrl,
          structuredPrompt: data.structured_prompt,
          requestId: result.requestId,
        };

      } catch (error) {
        console.error(`Error generating variant ${index + 1}:`, error);
        throw error;
      }
    });

    const results = await Promise.all(imagePromises);
    const images = results.map((r) => r.imageUrl).filter(Boolean);
    const structuredPrompts = results.map((r) => r.structuredPrompt).filter(Boolean);
    const requestId = results[0]?.requestId;

    if (images.length === 0) {
      throw new Error('Failed to generate any images');
    }

    return { 
      images,
      structuredPrompts: structuredPrompts.length > 0 ? structuredPrompts : undefined,
      ...(requestId && { requestId }),
    };
  } catch (error) {
    console.error('Error in renderScene:', error);
    throw new Error(error instanceof Error ? error.message : 'Unknown error');
  }
}

// --- Scene JSON Generation Types & Logic ---

/**
 * STAGE TYPES:
 * - 'structure': 3D isometric view of entire layout (spatial truth)
 * - 'visualize': 2D room view (individual room render with styling)
 * - 'refine': Update existing structured prompt (delta patches only)
 */
type GenerateJsonType =
  | 'structure'
  | 'visualize'
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
  // For visualize: which room to focus on
  room_id?: string;
  // For refine: the existing structured prompt to modify
  structured_prompt?: Record<string, unknown>;
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
  type: z.enum(['structure', 'visualize', 'refine']),
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

/**
 * STAGE 1: STRUCTURE - 3D Isometric Cutaway Layout View
 * Purpose: Generate complete spatial layout with geometry, furniture, camera, lighting
 * Output: Complete 3D scene that serves as BASE TRUTH for 2D views and refinements
 * Invariant: This defines geometry that CANNOT change in later stages
 */
function buildStructurePrompt(input: GenerateJsonRequestBody): string {
  const styleInfo = input.style || input.theme?.style || 'modern';
  
  return `You are a 3D architectural scene JSON generator.

Your task is to generate a DETAILED 3D ISOMETRIC CUTAWAY SCENE
representing the complete spatial layout of an apartment.

This is the BASE SCENE.
It defines spatial structure, room layout, major furniture volumes,
camera setup, lighting setup, and high-level material intent.

STRICT RULES:
- The entire apartment must be visible in a single 3D isometric cutaway view.
- Walls must be partially cut (cutaway height) to reveal interiors.
- Do NOT optimize for beauty or mood.
- Do NOT generate close-up or cinematic views.
- Do NOT omit rooms, walls, or connections.
- Objects must be placed consistently inside rooms.
- Decorative detail is allowed ONLY at a low level.
- This scene must be usable as a reference for 2D room images.

STYLE INPUT:
- Apply the provided style ONLY as high-level material intent.
- Style: ${styleInfo}
- Do not over-style or over-decorate.

CAMERA:
- Camera must be architectural, stable, and deterministic.
- Use isometric or high-angle perspective.
- Entire layout must fit inside the frame.

LIGHTING:
- Lighting must be neutral and even.
- Lighting exists to reveal geometry, not create mood.

OUTPUT FORMAT:
- Return ONLY valid JSON.
- No markdown.
- No comments.
- No explanations.

The output JSON must have this EXACT structure:
{
  "id": "scene_XXX",
  "parent_id": null,
  "type": "structure",
  "style": "<style string>",
  "json_prompt": {
    "scene_metadata": {
      "scene_type": "3d_layout",
      "description": "<complete scene description>",
      "style": "<style>",
      "units": "meters"
    },
    "spatial_layout": {
      "view_type": "isometric_cutaway",
      "cutaway_height": 1.2,
      "floor_visibility": "full",
      "ceiling_visibility": "removed",
      "layout_orientation": "north-up",
      "connectivity_description": "<how rooms connect>"
    },
    "rooms": [
      {
        "id": "<room_id>",
        "name": "<Room Name>",
        "position": "<position in layout>",
        "approx_dimensions": { "width": 0, "depth": 0 },
        "floor_type": "<material>",
        "wall_type": "<material>",
        "connections": ["<connected_room_ids>"]
      }
    ],
    "objects": [
      {
        "id": "<object_id>",
        "room": "<room_id>",
        "type": "<object_type>_block",
        "volume": "<size description>",
        "orientation": "<orientation>",
        "placement": "<placement description>"
      }
    ],
    "materials_intent": {
      "flooring": { "<type>": "<description>" },
      "walls": { "<type>": "<description>" },
      "furniture": "<general material description>"
    },
    "camera": {
      "projection": "isometric",
      "angle": "high_angle",
      "positioning": "pulled back to include entire apartment",
      "lens_type": "architectural_wide",
      "distortion": "minimal",
      "framing": "full_layout_visible"
    },
    "lighting": {
      "mode": "studio_neutral",
      "light_sources": [
        {
          "type": "overhead_diffuse",
          "intensity": "medium",
          "purpose": "uniform visibility"
        }
      ],
      "shadow_quality": "soft",
      "contrast": "low"
    },
    "render_settings": {
      "detail_level": "medium",
      "texture_resolution": "medium",
      "edge_definition": "clear",
      "realism_level": "architectural"
    }
  }
}

USER INPUT:
${JSON.stringify(input, null, 2)}`;
}

/**
 * STAGE 2: VISUALIZE - 2D Room View (Photographic Quality)
 * Purpose: Generate rich, immersive 2D interior photography from 3D structure
 * Input: Parent structure defines geometry - we add atmosphere and materiality
 * Invariant: Room geometry, object positions MUST NOT change
 */
function buildVisualizePrompt(input: GenerateJsonRequestBody): string {
  const styleInfo = input.style || input.theme?.style || 'modern';
  const lightingMode = input.lighting?.mode || input.lighting?.type || 'daylight';
  const roomFocus = input.room_id || 'main room';
  
  return `You are a high-end interior visualization and architectural photography
scene JSON generator.

Your role is to translate a defined 3D room layout into a richly detailed,
visually immersive 2D interior image description suitable for premium
editorial, home décor magazines, and architectural portfolios.

This stage is about ATMOSPHERE, MATERIALITY, and PHOTOGRAPHIC REALISM.

────────────────────────────────────────────────────────────────────────────────
CORE CONTEXT (IMPORTANT)
────────────────────────────────────────────────────────────────────────────────
• A parent 3D scene already defines room geometry, object placement,
  proportions, window locations, and spatial relationships.
• You must respect that spatial structure completely.
• You are NOT designing a new room.
• You are visually interpreting an existing one.
• Room focus: ${roomFocus}

────────────────────────────────────────────────────────────────────────────────
WHAT YOU SHOULD DO (ENCOURAGED)
────────────────────────────────────────────────────────────────────────────────
• Use rich, sensory language to describe:
  – materials (fabric weave, wood grain, finishes)
  – lighting quality (soft, diffused, warm, directional)
  – surface interaction with light (shadows, highlights, reflections)
• Describe objects as they appear within the camera frame, not abstractly
• Emphasize how natural light enters the room and moves across surfaces
• Create a calm, believable atmosphere that feels lived-in and intentional
• Write as if describing a real photograph, not a 3D render
• Add subtle styling elements that feel realistic and restrained
• Make the space feel balanced, composed, and thoughtfully designed

────────────────────────────────────────────────────────────────────────────────
WHAT YOU MUST NOT DO (STRICT)
────────────────────────────────────────────────────────────────────────────────
• Do NOT move walls, windows, or doors
• Do NOT change object positions or orientations
• Do NOT add or remove furniture unless explicitly requested
• Do NOT introduce fantasy lighting or impossible viewpoints
• Do NOT describe multiple camera views
• Do NOT describe unseen rooms

────────────────────────────────────────────────────────────────────────────────
CAMERA GUIDANCE
────────────────────────────────────────────────────────────────────────────────
• Choose a realistic interior photography camera setup
• Prefer eye-level or gentle corner views
• Use lenses typical for interior photography (35mm–50mm equivalent)
• Avoid distortion, extreme wide angles, or cinematic exaggeration
• Camera framing should feel intentional and composed

────────────────────────────────────────────────────────────────────────────────
LIGHTING GUIDANCE
────────────────────────────────────────────────────────────────────────────────
• Lighting mode: ${lightingMode}
• Lighting must follow the selected lighting mode:
  – Daylight: natural, bright, soft shadows
  – Warm Ambient: golden, cozy, evening warmth
  – Studio: controlled, even, professional
  – Dramatic: high contrast, directional, moody
  – Night: artificial lights, window reflections, intimate
• Natural light direction must align with window placement
• Shadows should be soft or pronounced based on time of day
• Light should enhance textures and depth, not overpower the scene

────────────────────────────────────────────────────────────────────────────────
STYLE GUIDANCE
────────────────────────────────────────────────────────────────────────────────
• Style: ${styleInfo}
• Apply the provided style faithfully
• Style influences color palette, materials, furniture character
• Avoid over-decorating or clutter
• Keep the aesthetic refined, cohesive, and believable

────────────────────────────────────────────────────────────────────────────────
OUTPUT FORMAT (MANDATORY)
────────────────────────────────────────────────────────────────────────────────
Return ONLY valid JSON.
No markdown.
No explanations.
No comments.

The output JSON must have this EXACT structure:
{
  "id": "scene_XXX",
  "parent_id": "<parent_structure_id or null>",
  "type": "visualize",
  "style": "<style>",
  "json_prompt": {
    "short_description": "<lush, evocative, photographic description>",
    "room_focus": "<room being visualized>",
    "objects": [
      {
        "description": "<richly described object>",
        "location": "<position in frame>",
        "relative_size": "<size in frame>",
        "shape_and_color": "<visual description>",
        "texture": "<material feel>",
        "appearance_details": "<surface qualities, light interaction>"
      }
    ],
    "background_setting": "<environmental context, visible backdrop>",
    "lighting": {
      "conditions": "<lighting quality description>",
      "direction": "<where light comes from>",
      "shadows": "<shadow character>"
    },
    "aesthetics": {
      "composition": "<framing and balance>",
      "color_scheme": "<palette description>",
      "mood_atmosphere": "<emotional quality>"
    },
    "photographic_characteristics": {
      "depth_of_field": "<focus quality>",
      "focus": "<what's in focus>",
      "camera_angle": "<view position>",
      "lens_focal_length": "<35mm-50mm typical>"
    },
    "style_medium": "photograph",
    "context": "<type of image this would be>",
    "artistic_style": "<refined visual character>"
  }
}

USER INPUT:
${JSON.stringify(input, null, 2)}`;
}

/**
 * STAGE 3: REFINE - Delta Patch Only
 * Purpose: Apply specific modifications to existing structured prompt
 * Input: Existing structured_prompt + modification instructions
 * Invariant: Only modify what the user explicitly requests
 */
function buildRefinePrompt(input: GenerateJsonRequestBody): string {
  return [
    'You are a precision refinement engine for interior scene JSON.',
    '',
    '## YOUR TASK',
    'Apply ONLY the requested changes to the existing scene JSON.',
    'You are given an existing structured prompt and modification instructions.',
    '',
    '## CRITICAL RULES',
    '1. PRESERVE everything not explicitly asked to change.',
    '2. Do NOT restate unchanged fields unnecessarily.',
    '3. Do NOT modify object positions or room dimensions unless explicitly asked.',
    '4. Apply changes holistically - if lighting changes, update related mood/shadows.',
    '5. Keep object IDs stable.',
    '',
    '## MODIFICATION SCOPE',
    'You may change:',
    '- Lighting: type, intensity, direction, color temperature',
    '- Materials: textures, colors, finishes',
    '- Camera: angle, position, focus',
    '- Style: mood, atmosphere, color scheme',
    '- Specific objects: as explicitly requested',
    '',
    'You must NOT change:',
    '- Room dimensions',
    '- Object positions (unless explicitly requested)',
    '- Object IDs',
    '- Structural relationships',
    '',
    '## OUTPUT JSON STRUCTURE',
    'Return a COMPLETE updated json_prompt with the changes applied:',
    '{',
    '  "id": "scene_XXX",',
    '  "parent_id": "<previous_scene_id>",',
    '  "type": "refine",',
    '  "style": "<style>",',
    '  "json_prompt": { <full updated scene with changes applied> }',
    '}',
    '',
    '## USER INPUT',
    JSON.stringify(input, null, 2),
  ].join('\n');
}

/**
 * Dispatch to appropriate prompt builder based on generation type
 */
function buildSystemPrompt(input: GenerateJsonRequestBody, type: GenerateJsonType): string {
  console.log('[Scene] Building prompt for type:', type);
  
  switch (type) {
    case 'structure':
      return buildStructurePrompt(input);
    case 'visualize':
      return buildVisualizePrompt(input);
    case 'refine':
      return buildRefinePrompt(input);
    default:
      // Fallback to structure for unknown types
      console.warn('[Scene] Unknown type, falling back to structure:', type);
      return buildStructurePrompt(input);
  }
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
