process.env.BCRYPT_COST = "4";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.APP_URL = "http://localhost:3000";
process.env.PGLITE_DIR = "memory";
process.env.REQUIRE_EMAIL_VERIFICATION = "true";
// Default: embedded in-memory PGlite. To run the same suite against a real PostgreSQL server set
// TEST_DATABASE_URL (a throw-away database – the tests create users and data in it; see docs/TESTING.md).
if (process.env.TEST_DATABASE_URL) { process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; process.env.DATABASE_SSL = process.env.TEST_DATABASE_SSL ?? "false"; process.env.AUTO_MIGRATE = "true"; }
else delete process.env.DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SMTP_HOST;
