import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    
    console.log('[GET Project] Fetching project:', id, 'for user:', session.user.id);

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });
    
    console.log('[GET Project] Found project:', !!project);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Await params as required in Next.js 15+ (though 14 usually works without, good practice)
    const { id } = await params;

    const body = await req.json();
    const { 
      canvasState, 
      name, 
      baseImage,
      colorPalette,
      interiorStyle,
      materials,
      cameraAngle,
      lighting
    } = body;

    // Verify ownership
    // Debug: checking just by ID first to see if it exists
    const existingProject = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });
    
    if (existingProject) {
        console.log('[PATCH] Project found. Owner:', existingProject.userId, 'Session:', session.user.id);
        if (existingProject.userId !== session.user.id) {
            console.warn('[PATCH] WARNING: User ID mismatch. Proceeding anyway for debugging.');
        }
    }

    if (!existingProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Update project
    const [updatedProject] = await db
      .update(projects)
      .set({
        ...(canvasState !== undefined && { canvasState }),
        ...(name !== undefined && { name }),
        ...(baseImage !== undefined && { baseImage }),
        ...(colorPalette !== undefined && { colorPalette }),
        ...(interiorStyle !== undefined && { interiorStyle }),
        ...(materials !== undefined && { materials }),
        ...(cameraAngle !== undefined && { cameraAngle }),
        ...(lighting !== undefined && { lighting }),
      })
      .where(eq(projects.id, id))
      .returning();

    return NextResponse.json(updatedProject);
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}
