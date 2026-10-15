/**
 * The name of the database a test run may use. Refuses anything not named `*_test`, so integration tests
 * (which truncate every table) can never touch real data. The test DB client calls this first.
 */
export function assertTestDatabaseUrl(url: string | undefined): string {
  if (!url) throw new Error("DATABASE_URL is not set — create .env.test (see .env.example)");
  let dbName: string;
  try {
    dbName = new URL(url).pathname.replace(/^\//, "");
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  if (!dbName.endsWith("_test")) {
    throw new Error(`Refusing to run integration tests against "${dbName}" — database name must end in _test`);
  }
  return dbName;
}
