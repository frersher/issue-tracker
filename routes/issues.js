const express = require('express');
const router = express.Router();
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 PNG, JPG, GIF, WebP 格式'));
    }
  }
});

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
    const issue = parseTags(result.rows[0]);

    const screenshots = await req.db.query(
      'SELECT id, filename, filesize, created_at FROM issue_screenshots WHERE issue_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    issue.screenshots = screenshots.rows;
    res.json(issue);
  } catch (err) {
    res.status(500).json({ error: '查询失败' });
  }
});

// POST /api/issues - 新建
router.post('/', async (req, res) => {
  const { title, description, impact_scope, root_cause, solution, review, business_module, function_module, tags, severity, status } = req.body;
  if (!title) return res.status(400).json({ error: '标题不能为空' });

  try {
    const result = await req.db.query(`
      INSERT INTO issues (title, description, impact_scope, root_cause, solution, review, business_module, function_module, tags, severity, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [title, description || '', impact_scope || '', root_cause || '', solution || '', review || '', business_module || '', function_module || '', JSON.stringify(tags || []), severity || 'P2', status || 'open']);

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
    const { title, description, impact_scope, root_cause, solution, review, business_module, function_module, tags, severity, status } = req.body;

    const result = await req.db.query(`
      UPDATE issues SET
        title = $1, description = $2, impact_scope = $3, root_cause = $4,
        solution = $5, review = $6, business_module = $7, function_module = $8,
        tags = $9, severity = $10, status = $11,
        updated_at = NOW()
      WHERE id = $12
      RETURNING *
    `, [
      title || e.title,
      description !== undefined ? description : e.description,
      impact_scope !== undefined ? impact_scope : e.impact_scope,
      root_cause !== undefined ? root_cause : e.root_cause,
      solution !== undefined ? solution : e.solution,
      review !== undefined ? review : e.review,
      business_module !== undefined ? business_module : e.business_module,
      function_module !== undefined ? function_module : e.function_module,
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

// POST /api/issues/:id/screenshots - 上传截图
router.post('/:id/screenshots', upload.array('screenshots', 10), async (req, res) => {
  try {
    const issueCheck = await req.db.query('SELECT id FROM issues WHERE id = $1', [req.params.id]);
    if (issueCheck.rows.length === 0) return res.status(404).json({ error: '问题不存在' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: '请选择图片' });

    const inserted = [];
    for (const file of req.files) {
      const result = await req.db.query(
        `INSERT INTO issue_screenshots (issue_id, filename, mimetype, filesize, data)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, filename, filesize, created_at`,
        [req.params.id, file.originalname, file.mimetype, file.size, file.buffer]
      );
      inserted.push(result.rows[0]);
    }
    res.status(201).json(inserted);
  } catch (err) {
    res.status(500).json({ error: '上传失败' });
  }
});

// GET /api/issues/:id/screenshots - 获取截图列表
router.get('/:id/screenshots', async (req, res) => {
  try {
    const result = await req.db.query(
      'SELECT id, filename, filesize, created_at FROM issue_screenshots WHERE issue_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: '查询失败' });
  }
});

// DELETE /api/issues/:id/screenshots/:screenshotId - 删除截图
router.delete('/:id/screenshots/:screenshotId', async (req, res) => {
  try {
    const result = await req.db.query(
      'DELETE FROM issue_screenshots WHERE id = $1 AND issue_id = $2 RETURNING id',
      [req.params.screenshotId, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '截图不存在' });
    res.json({ message: '截图已删除' });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

// multer 错误处理
router.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小不能超过 5MB' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message === '只支持 PNG, JPG, GIF, WebP 格式') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
