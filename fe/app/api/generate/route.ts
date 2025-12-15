import { NextResponse } from 'next/server';
import { db } from '@/db';
import { versions } from '@/db/schema';

// MOCK DATA for Hackathon
const MOCK_IMAGES = {
  scandi: "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?q=80&w=1000",
  boho: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?q=80&w=1000",
  industrial: "https://images.unsplash.com/photo-1616486338812-3dadae4b4f9d?q=80&w=1000",
  modern: "https://images.unsplash.com/photo-1600210492493-0946911123ea?q=80&w=1000",
  luxury: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=1000",
  minimalist: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?q=80&w=1000",
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, parentVersionId, config, imageUrl: providedImageUrl } = body;

    // If imageUrl is provided, use it directly (from fal.ai render)
    // Otherwise, use mock images for demo purposes
    let newImageUrl: string;
    
    if (providedImageUrl) {
      newImageUrl = providedImageUrl;
    } else {
      // 1. Simulate Runpod Delay (2 seconds)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 2. Select Mock Image based on config.style
      const styleKey = config.style?.toLowerCase() || 'scandi';
      newImageUrl = MOCK_IMAGES[styleKey as keyof typeof MOCK_IMAGES] || MOCK_IMAGES.scandi;
    }

    // Determine version type and name
    const versionType = parentVersionId ? 'style' : 'base';
    const versionName = parentVersionId 
      ? `V${Date.now()} Style: ${config.style || 'Generated'}`
      : `V1 Base - ${config.style || 'Generated'}`;

    // 3. Save to DB
    const [newVersion] = await db.insert(versions).values({
      projectId,
      parentId: parentVersionId,
      name: versionName,
      type: versionType,
      imageUrl: newImageUrl,
      configJson: config,
    }).returning();

    return NextResponse.json(newVersion);
  } catch (error) {
    console.error('Error generating version:', error);
    return NextResponse.json(
      { error: 'Failed to generate version' },
      { status: 500 }
    );
  }
}

