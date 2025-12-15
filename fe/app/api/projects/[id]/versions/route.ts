import { NextResponse } from 'next/server';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }
    
    // Fetch project for settings
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });

    const defaultSettings = {
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

    const projectSettingsData = project
      ? {
          colorPalette: project.colorPalette || defaultSettings.colorPalette,
          interiorStyle: project.interiorStyle || defaultSettings.interiorStyle,
          materials: project.materials || defaultSettings.materials,
          cameraAngle: project.cameraAngle || defaultSettings.cameraAngle,
          lighting: project.lighting || defaultSettings.lighting,
        }
      : defaultSettings;

    return NextResponse.json({
      versions: [], // Deprecated: Versions are now part of canvasState
      settings: projectSettingsData,
    });
  } catch (error) {
    console.error('Error fetching project data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project data' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    { error: 'Versions are now stored in project canvas state. Please update the project canvasState directly.' },
    { status: 410 }
  );
}

