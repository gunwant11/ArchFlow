import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in environment variables');
}

// Create the connection
// Singleton pattern for database connection to prevent exhaustion in dev
const connectionString = process.env.DATABASE_URL!;
let client: ReturnType<typeof postgres>;

if (process.env.NODE_ENV === 'production') {
  client = postgres(connectionString);
} else {
  const globalWithPostgres = global as typeof globalThis & {
    postgresClient?: ReturnType<typeof postgres>;
  };
  if (!globalWithPostgres.postgresClient) {
    globalWithPostgres.postgresClient = postgres(connectionString);
  }
  client = globalWithPostgres.postgresClient;
}

// Create the drizzle instance
export const db = drizzle(client, { schema });
export { schema };

