const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'issues.db');
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

console.log('Database initialized at', dbPath);
db.close();
