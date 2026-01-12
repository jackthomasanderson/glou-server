const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ user: 'glou', host: 'localhost', database: 'glou', password: 'glou', port: 5432 });
  try {
    await pool.query("ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS ai_api_key TEXT");
    console.log('app_settings.ai_api_key ensured');
  } catch (e) {
    console.error('alter error', e);
  } finally {
    await pool.end();
  }
})();
