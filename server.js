const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const issuesRouter = require('./routes/issues');

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化数据库
const dbPath = path.join(__dirname, 'db', 'issues.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    impact_scope TEXT,
    root_cause TEXT,
    solution TEXT,
    review TEXT,
    tags TEXT DEFAULT '[]',
    severity TEXT DEFAULT 'P2',
    status TEXT DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
  CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity);
  CREATE INDEX IF NOT EXISTS idx_issues_created_at ON issues(created_at);
`);
db.close();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API 路由
app.use('/api/issues', issuesRouter);

// 统计接口
app.get('/api/stats', (req, res) => {
  const statsDb = new Database(dbPath);
  const bySeverity = statsDb.prepare('SELECT severity, COUNT(*) as count FROM issues GROUP BY severity').all();
  const byStatus = statsDb.prepare('SELECT status, COUNT(*) as count FROM issues GROUP BY status').all();
  const total = statsDb.prepare('SELECT COUNT(*) as count FROM issues').get().count;
  const recent = statsDb.prepare('SELECT * FROM issues ORDER BY created_at DESC LIMIT 5').all();
  recent.forEach(issue => {
    try { issue.tags = JSON.parse(issue.tags); } catch { issue.tags = []; }
  });
  statsDb.close();

  res.json({ total, bySeverity, byStatus, recent });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`生产问题沉淀系统已启动: http://localhost:${PORT}`);
});
