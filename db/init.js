const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

pool.query(`
  CREATE TABLE IF NOT EXISTS issues (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    impact_scope TEXT,
    root_cause TEXT,
    solution TEXT,
    review TEXT,
    business_module TEXT DEFAULT '',
    function_module TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    severity TEXT DEFAULT 'P2',
    status TEXT DEFAULT 'open',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
  CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity);
  CREATE INDEX IF NOT EXISTS idx_issues_created_at ON issues(created_at);
`).then(() => {
  return pool.query(`
    CREATE TABLE IF NOT EXISTS issue_screenshots (
      id SERIAL PRIMARY KEY,
      issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      filesize INTEGER NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_screenshots_issue_id ON issue_screenshots(issue_id);
  `);
}).then(() => {
  console.log('数据库初始化完成');
  return pool.end();
}).catch(err => {
  console.error('初始化失败:', err.message);
  pool.end();
});
