import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config({ override: false }); // don't overwrite env vars already set in the shell

export default {
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
