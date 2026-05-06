const express = require('express');
const router = express.Router();

function parseTags(issue) {
  try { issue.tags = JSON.parse(issue.tags); } catch { issue.tags = []; }
  return issue;
}

// GET /api/issues - 列表
router.get('/', async (req, res) => {
  const { search, tag, severity, status, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  const db = req.db;

  let where = [];
  let params = [];
  let idx = 1;

  if (search) {
    where.push(`(title LIKE $${idx} OR description LIKE $${idx} OR root_cause LIKE $${idx} OR solution LIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (tag) {
    where.push(`tags LIKE $${idx}`);
    params.push(`%"${tag}"%`);
    idx++;
  }
  if (severity) {
    where.push(`severity = $${idx}`);
    params.push(severity);
    idx++;
  }
  if (status) {
    where.push(`status = $${idx}`);
    params.push(status);
    idx++;
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const totalResult = await db.query(
      `SELECT COUNT(*) as count FROM issues ${whereClause}`,
      params
    );
    const total = parseInt(totalResult.rows[0].count);

    const issuesResult = await db.query(
      `SELECT * FROM issues ${whereClause} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    const issues = issuesResult.rows.map(parseTags);
    res.json({ data: issues, total, page: +page, limit: +limit });
  } catch (err) {
    res.status(500).json({ error: '查询失败' });
  }
});

// GET /api/issues/:id - 详情
router.get('/:id', async (req, res) => {
  try {
    const result = await req.db.query('SELECT * FROM issues WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: '问题不存在' });
    res.json(parseTags(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: '查询失败' });
  }
});

// POST /api/issues - 新建
router.post('/', async (req, res) => {
  const { title, description, impact_scope, root_cause, solution, review, tags, severity, status } = req.body;
  if (!title) return res.status(400).json({ error: '标题不能为空' });

  try {
    const result = await req.db.query(`
      INSERT INTO issues (title, description, impact_scope, root_cause, solution, review, tags, severity, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [title, description || '', impact_scope || '', root_cause || '', solution || '', review || '', JSON.stringify(tags || []), severity || 'P2', status || 'open']);

    res.status(201).json(parseTags(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: '创建失败' });
  }
});

// PUT /api/issues/:id - 更新
router.put('/:id', async (req, res) => {
  try {
    const existing = await req.db.query('SELECT * FROM issues WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: '问题不存在' });

    const e = existing.rows[0];
    const { title, description, impact_scope, root_cause, solution, review, tags, severity, status } = req.body;

    const result = await req.db.query(`
      UPDATE issues SET
        title = $1, description = $2, impact_scope = $3, root_cause = $4,
        solution = $5, review = $6, tags = $7, severity = $8, status = $9,
        updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `, [
      title || e.title,
      description !== undefined ? description : e.description,
      impact_scope !== undefined ? impact_scope : e.impact_scope,
      root_cause !== undefined ? root_cause : e.root_cause,
      solution !== undefined ? solution : e.solution,
      review !== undefined ? review : e.review,
      JSON.stringify(tags || []),
      severity || e.severity,
      status || e.status,
      req.params.id,
    ]);

    res.json(parseTags(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: '更新失败' });
  }
});

// DELETE /api/issues/:id - 删除
router.delete('/:id', async (req, res) => {
  try {
    const existing = await req.db.query('SELECT * FROM issues WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: '问题不存在' });
    await req.db.query('DELETE FROM issues WHERE id = $1', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

module.exports = router;
