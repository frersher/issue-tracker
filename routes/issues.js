const express = require('express');
const router = express.Router();
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'db', 'issues.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// GET /api/issues - 列表（支持搜索、标签过滤、严重程度过滤、分页）
router.get('/', (req, res) => {
  const { search, tag, severity, status, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  let where = [];
  let params = [];

  if (search) {
    where.push('(title LIKE ? OR description LIKE ? OR root_cause LIKE ? OR solution LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }
  if (tag) {
    where.push('tags LIKE ?');
    params.push(`%"${tag}"%`);
  }
  if (severity) {
    where.push('severity = ?');
    params.push(severity);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const totalResult = db.prepare(`SELECT COUNT(*) as count FROM issues ${whereClause}`).get(...params);
  const total = totalResult.count;

  const issues = db.prepare(
    `SELECT * FROM issues ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  issues.forEach(issue => {
    try { issue.tags = JSON.parse(issue.tags); } catch { issue.tags = []; }
  });

  res.json({ data: issues, total, page: +page, limit: +limit });
});

// GET /api/issues/:id - 详情
router.get('/:id', (req, res) => {
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  if (!issue) return res.status(404).json({ error: '问题不存在' });
  try { issue.tags = JSON.parse(issue.tags); } catch { issue.tags = []; }
  res.json(issue);
});

// POST /api/issues - 新建
router.post('/', (req, res) => {
  const { title, description, impact_scope, root_cause, solution, review, tags, severity, status } = req.body;
  if (!title) return res.status(400).json({ error: '标题不能为空' });

  const tagsJson = JSON.stringify(tags || []);
  const result = db.prepare(`
    INSERT INTO issues (title, description, impact_scope, root_cause, solution, review, tags, severity, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || '', impact_scope || '', root_cause || '', solution || '', review || '', tagsJson, severity || 'P2', status || 'open');

  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(result.lastInsertRowid);
  try { issue.tags = JSON.parse(issue.tags); } catch { issue.tags = []; }
  res.status(201).json(issue);
});

// PUT /api/issues/:id - 更新
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '问题不存在' });

  const { title, description, impact_scope, root_cause, solution, review, tags, severity, status } = req.body;
  const tagsJson = JSON.stringify(tags || []);

  db.prepare(`
    UPDATE issues SET
      title = ?, description = ?, impact_scope = ?, root_cause = ?,
      solution = ?, review = ?, tags = ?, severity = ?, status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    title || existing.title,
    description !== undefined ? description : existing.description,
    impact_scope !== undefined ? impact_scope : existing.impact_scope,
    root_cause !== undefined ? root_cause : existing.root_cause,
    solution !== undefined ? solution : existing.solution,
    review !== undefined ? review : existing.review,
    tagsJson,
    severity || existing.severity,
    status || existing.status,
    req.params.id
  );

  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  try { issue.tags = JSON.parse(issue.tags); } catch { issue.tags = []; }
  res.json(issue);
});

// DELETE /api/issues/:id - 删除
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '问题不存在' });
  db.prepare('DELETE FROM issues WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

module.exports = router;
