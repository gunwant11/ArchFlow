import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/projects/[id]/settings - Fetch project settings
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch project from database
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });

    if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Default settings if fields are null
    const defaults = {
        colorPalette: {
          primary: '#2C3E50',
          secondary: '#ECF0F1',
          accent: '#3498DB',
          neutral: '#95A5A6',
          highlight: '#E74C3C',
        },
        interiorStyle: 'general',
        materials: ['wood', 'fabric', 'metal'],
        cameraAngle: {
          position: 'eye-level',
          fov: 75,
        },
        lighting: {
          type: 'natural',
          intensity: 80,
        },
      };

    return NextResponse.json({
      colorPalette: project.colorPalette || defaults.colorPalette,
      interiorStyle: project.interiorStyle || defaults.interiorStyle,
      materials: project.materials || defaults.materials,
      cameraAngle: project.cameraAngle || defaults.cameraAngle,
      lighting: project.lighting || defaults.lighting,
    });
  } catch (error) {
    console.error('Error fetching project settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project settings' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/settings - Save or update project settings
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { colorPalette, interiorStyle, materials, cameraAngle, lighting } = body;

    // Update project settings
    const [updated] = await db
      .update(projects)
      .set({
        colorPalette,
        interiorStyle,
        materials,
        cameraAngle,
        lighting,
      })
      .where(eq(projects.id, id))
      .returning();

    if (!updated) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({
        colorPalette: updated.colorPalette,
        interiorStyle: updated.interiorStyle,
        materials: updated.materials,
        cameraAngle: updated.cameraAngle,
        lighting: updated.lighting,
    });

  } catch (error) {
    console.error('Error saving project settings:', error);
    return NextResponse.json(
      { error: 'Failed to save project settings' },
      { status: 500 }
    );
  }
}

