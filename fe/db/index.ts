import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in environment variables');
}

// Create the connection
const connectionString = process.env.DATABASE_URL;
const client = postgres(connectionString);

// Create the drizzle instance
export const db = drizzle(client, { schema });

// Export the schema for use in queries
export { schema };

