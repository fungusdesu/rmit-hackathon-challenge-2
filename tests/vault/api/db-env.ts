// Imported first so Prisma sees DATABASE_URL before the client is created.
process.env.DATABASE_URL ??= "postgresql://businessvault:businessvault@localhost:5432/businessvault";
