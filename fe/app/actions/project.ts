'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

// Helper to serialize dates
const serializeProject = (project: any) => {
  if (!project) return null;
  return {
    ...project,
    createdAt: project.createdAt ? new Date(project.createdAt).toISOString() : null,
    // Add other date fields if any, e.g. updatedAt
  };
};

export async function getUserProjects() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return [];
    }

    const userProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, session.user.id))
      .orderBy(desc(projects.createdAt));

    return userProjects.map(serializeProject);
  } catch (error) {
    console.error('Error fetching projects:', error);
    // Return empty array on error to prevent crashing UI, or throw if you prefer error handling in UI
    return [];
  }
}

export async function createProject(name: string, baseImage?: string) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      throw new Error('Unauthorized');
    }

    const [newProject] = await db
      .insert(projects)
      .values({
        name: name || 'New Project',
        userId: session.user.id,
        baseImage: baseImage || null,
      })
      .returning();

    revalidatePath('/'); // Revalidate home page where projects are listed
    return serializeProject(newProject);
  } catch (error) {
    console.error('Error creating project:', error);
    throw new Error('Failed to create project');
  }
}

export async function getProject(id: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new Error('Unauthorized');
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });

    if (!project) {
        return null;
    }

    if (project.userId !== session.user.id) {
         throw new Error('Unauthorized: You do not own this project');
    }

    return serializeProject(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    throw new Error('Failed to fetch project');
  }
}

export async function updateProject(id: string, data: Partial<typeof projects.$inferInsert> & { canvasState?: any }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new Error('Unauthorized');
    }

     // Verify ownership
    const existingProject = await db.query.projects.findFirst({
      where: eq(projects.id, id),
      columns: { userId: true } // Only need to check userId
    });
    
    if (!existingProject) {
      throw new Error('Project not found');
    }
    
    if (existingProject.userId !== session.user.id) {
        throw new Error('Unauthorized: You do not own this project');
    }

    const [updatedProject] = await db
      .update(projects)
      .set(data)
      .where(eq(projects.id, id))
      .returning();

    revalidatePath(`/editor/${id}`); 
    return serializeProject(updatedProject);
  } catch (error) {
    console.error('Error updating project:', error);
    throw new Error('Failed to update project');
  }
}

export async function getProjectSettings(id: string) {
    // We can reuse getProject logic or fetch specific fields
    try {
        const session = await getServerSession(authOptions);
        console.log('Session:', session);
        if (!session?.user?.id) {
            throw new Error('Unauthorized');
        }

        const project = await db.query.projects.findFirst({
            where: eq(projects.id, id),
            columns: {
                userId: true,
                colorPalette: true,
                interiorStyle: true,
                materials: true,
                cameraAngle: true,
                lighting: true,
                canvasState: true
            }
        });
        console.log('Project Settings:', project);

        if (!project) return null;
        if (project.userId !== session.user.id) throw new Error('Unauthorized');

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


 

        return {
          colorPalette: project.colorPalette || defaults.colorPalette,
          interiorStyle: project.interiorStyle || defaults.interiorStyle,
          materials: project.materials || defaults.materials,
          cameraAngle: project.cameraAngle || defaults.cameraAngle,
          lighting: project.lighting || defaults.lighting,
          canvasState: project.canvasState || []
        };

    } catch (error) {
        console.error('Error fetching settings:', error);
        throw new Error('Failed to fetch settings');
    }
}


