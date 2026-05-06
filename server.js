const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  lines.forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

const express = require('express');
const { Pool } = require('pg');
const issuesRouter = require('./routes/issues');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL 连接池
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// 初始化数据库表
pool.query(`
  CREATE TABLE IF NOT EXISTS issues (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    impact_scope TEXT,
    root_cause TEXT,
    solution TEXT,
    review TEXT,
    tags TEXT DEFAULT '[]',
    severity TEXT DEFAULT 'P2',
    status TEXT DEFAULT 'open',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
`).then(() => {
  return pool.query(`CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status)`);
}).then(() => {
  return pool.query(`CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity)`);
}).then(() => {
  return pool.query(`CREATE INDEX IF NOT EXISTS idx_issues_created_at ON issues(created_at)`);
}).then(() => {
  console.log('数据库表已就绪');
}).catch(err => {
  console.error('数据库初始化失败:', err.message);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 将 pool 注入到路由
app.use('/api/issues', (req, res, next) => {
  req.db = pool;
  next();
}, issuesRouter);

// 统计接口
app.get('/api/stats', async (req, res) => {
  try {
    const [sevRes, staRes, totRes, recRes] = await Promise.all([
      pool.query('SELECT severity, COUNT(*) as count FROM issues GROUP BY severity'),
      pool.query('SELECT status, COUNT(*) as count FROM issues GROUP BY status'),
      pool.query('SELECT COUNT(*) as count FROM issues'),
      pool.query('SELECT * FROM issues ORDER BY created_at DESC LIMIT 5'),
    ]);

    const recent = recRes.rows.map(issue => {
      try { issue.tags = JSON.parse(issue.tags); } catch { issue.tags = []; }
      return issue;
    });

    res.json({
      total: parseInt(totRes.rows[0].count),
      bySeverity: sevRes.rows,
      byStatus: staRes.rows,
      recent,
    });
  } catch (err) {
    res.status(500).json({ error: '数据库查询失败' });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`生产问题沉淀系统已启动: http://localhost:${PORT}`);
});
