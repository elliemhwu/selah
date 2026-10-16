// Points the API at the test database before any module is loaded.
try {
  process.loadEnvFile('.env');
} catch {
  // CI or a real environment provides the variables.
}
const url = process.env['TEST_DATABASE_URL'];
if (!url) throw new Error('TEST_DATABASE_URL is not set. See .env.example.');
process.env['DATABASE_URL'] = url;
