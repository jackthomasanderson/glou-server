const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ user: 'glou', host: 'localhost', database: 'glou', password: 'glou', port: 5432 });
  try {
    const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='app_settings' ORDER BY ordinal_position");
    console.log(res.rows.map(r => r.column_name).join(', '));
  } catch (e) {
    console.error('query error', e);
  } finally {
    await pool.end();
  }
})();
