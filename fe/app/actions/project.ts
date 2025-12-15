'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

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

    // Convert dates to strings to avoid serialization issues
    return userProjects.map(p => ({
      ...p,
      createdAt: p.createdAt ? p.createdAt.toISOString() : new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Error fetching projects:', error);
    return [];
  }
}
