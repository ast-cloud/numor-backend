// Decides the `ssl` option for a raw pg.Pool from its connection string.
//
// The managed providers (Aiven, Supabase) require TLS but serve certificates
// this app does not pin, hence rejectUnauthorized: false. A stock local
// Postgres is built with ssl = off, and pg does not degrade gracefully there -
// it fails the connection outright with "The server does not support SSL
// connections". So local connections must pass ssl: false, not a relaxed
// config.
//
// Prisma does not use this: it reads sslmode from the URL itself.

function pgSslFor(connectionString) {
  if (!connectionString) return false;

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    // Not a URL we can inspect - assume a remote managed host.
    return { rejectUnauthorized: false };
  }

  const sslmode = url.searchParams.get("sslmode");
  if (sslmode === "disable") return false;
  if (sslmode) return { rejectUnauthorized: false };

  const host = url.hostname;
  const isLoopback =
    host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";

  return isLoopback ? false : { rejectUnauthorized: false };
}

module.exports = { pgSslFor };
