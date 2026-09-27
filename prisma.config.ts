import "dotenv/config";
import { defineConfig } from "prisma/config";

// The Prisma CLI loads this file directly and never requires src/config/env.js,
// so the ENVIRONMENT -> DATABASE_URL resolution is mirrored here. Keep the two
// in sync: `prisma migrate` must hit the same database the app connects to.
const ENVIRONMENT = process.env.ENVIRONMENT || "local";

const DATABASE_URL =
  ({
    local: process.env.DATABASE_URL_LOCAL,
    production: process.env.DATABASE_URL_PRODUCTION,
    lovable: process.env.DATABASE_URL_PRODUCTION,
  } as Record<string, string | undefined>)[ENVIRONMENT] ??
  process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    `No database URL for ENVIRONMENT="${ENVIRONMENT}". Set DATABASE_URL_${ENVIRONMENT.toUpperCase()} (or DATABASE_URL) in .env.`
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: DATABASE_URL,
  },
});


// respoonse function
// handle error response
// env config file.