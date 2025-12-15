'use server';

import { uploadToR2 } from '@/lib/r2';

export async function uploadImage(formData: FormData): Promise<string> {
  try {
    const file = formData.get('file') as File;
    if (!file) {
      throw new Error('No file provided');
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Generate a unique key
    const uniqueId = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `uploads/${Date.now()}-${uniqueId}-${safeName}`;
    
    // Upload to R2
    const url = await uploadToR2(buffer, key, file.type);
    
    return url;
  } catch (error) {
    console.error('Error in uploadImage action:', error);
    throw new Error('Failed to upload image');
  }
}
