const { DATABASE_URL } = require("../src/config/env");

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const USER_EMAIL = "aastikyadav1997.ay@gmail.com";

async function main() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  if (!USER_EMAIL) {
    throw new Error("USER_EMAIL is required");
  }

  const connectionString = DATABASE_URL;
  const target = new URL(connectionString);

  console.log("Connecting with PrismaPg:", {
    user: target.username,
    host: target.hostname,
    port: target.port,
    database: target.pathname.slice(1),
    sslmode: target.searchParams.get("sslmode"),
  });

  process.env.DATABASE_URL = connectionString;

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  // const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findUnique({
      where: { email: USER_EMAIL },
      select: {
        name: true
      },
    });

    console.log("User result:", user);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("PrismaPg user lookup failed:");
  console.error(error);
  process.exitCode = 1;
});
