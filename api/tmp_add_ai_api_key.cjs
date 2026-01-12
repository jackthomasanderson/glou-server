const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ user: 'glou', host: 'localhost', database: 'glou', password: 'glou', port: 5432 });
  try {
    const res = await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_api_key TEXT");
    console.log('ALTER TABLE executed');
  } catch (e) {
    console.error('alter error', e);
  } finally {
    await pool.end();
  }
})();
