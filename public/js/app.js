(function() {
  'use strict';

  const API = '/api/issues';
  let currentPage = 1;
  let selectedTags = [];
  let currentDetailId = null;
  let pendingScreenshots = [];
  let existingScreenshots = [];

  // --- Navigation ---
  function navigate(hash) {
    const page = (hash || '#dashboard').replace('#', '');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active'));

    const targetPage = document.getElementById('page-' + page);
    if (targetPage) {
      targetPage.classList.add('active');
    } else {
      document.getElementById('page-dashboard').classList.add('active');
    }

    const navLink = document.querySelector(`.nav-link[data-page="${page}"]`);
    if (navLink) navLink.classList.add('active');

    if (page === 'dashboard') loadDashboard();
    if (page === 'issues') loadIssues();
    if (page === 'new') resetForm();
  }

  window.addEventListener('hashchange', () => navigate(location.hash));
  document.querySelectorAll('.nav-link').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      location.hash = a.getAttribute('href');
    });
  });

  // --- API helpers ---
  async function api(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '请求失败');
    }
    return res.json();
  }

  async function uploadScreenshots(issueId, files) {
    const formData = new FormData();
    files.forEach(f => formData.append('screenshots', f));
    const res = await fetch(`${API}/${issueId}/screenshots`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '上传失败');
    }
    return res.json();
  }

  // --- Dashboard ---
  async function loadDashboard() {
    const stats = await api('/api/stats');
    const { total, bySeverity, byStatus, recent } = stats;

    // Stats cards
    const severityCounts = { P0: 0, P1: 0, P2: 0, P3: 0 };
    bySeverity.forEach(s => severityCounts[s.severity] = s.count);

    document.getElementById('stats-cards').innerHTML = `
      <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">总问题数</div></div>
      <div class="stat-card p0"><div class="stat-value">${severityCounts.P0}</div><div class="stat-label">P0 紧急</div></div>
      <div class="stat-card p1"><div class="stat-value">${severityCounts.P1}</div><div class="stat-label">P1 高</div></div>
      <div class="stat-card p2"><div class="stat-value">${severityCounts.P2}</div><div class="stat-label">P2 中</div></div>
      <div class="stat-card p3"><div class="stat-value">${severityCounts.P3}</div><div class="stat-label">P3 低</div></div>
    `;

    // Severity chart
    const maxSev = Math.max(...Object.values(severityCounts), 1);
    document.getElementById('severity-chart').innerHTML = Object.entries(severityCounts).map(([k, v]) => `
      <div class="chart-bar-row">
        <span class="chart-bar-label">${k}</span>
        <div class="chart-bar-track">
          <div class="chart-bar-fill severity-${k}" style="width:${(v / maxSev) * 100}%">${v}</div>
        </div>
      </div>
    `).join('');

    // Status chart
    const statusMap = { open: '待处理', analyzing: '分析中', resolved: '已解决', closed: '已关闭' };
    const statusCounts = { open: 0, analyzing: 0, resolved: 0, closed: 0 };
    byStatus.forEach(s => statusCounts[s.status] = s.count);
    const maxSt = Math.max(...Object.values(statusCounts), 1);
    document.getElementById('status-chart').innerHTML = Object.entries(statusCounts).map(([k, v]) => `
      <div class="chart-bar-row">
        <span class="chart-bar-label">${statusMap[k]}</span>
        <div class="chart-bar-track">
          <div class="chart-bar-fill status-${k}" style="width:${(v / maxSt) * 100}%">${v}</div>
        </div>
      </div>
    `).join('');

    // Recent issues
    document.getElementById('recent-issues').innerHTML = recent.length === 0
      ? '<p style="color:var(--text-secondary);font-size:14px;">暂无问题记录</p>'
      : '<div class="issues-list">' + recent.map(issueItemHTML).join('') + '</div>';

    document.querySelectorAll('#recent-issues .issue-item').forEach(el => {
      el.addEventListener('click', () => showDetail(+el.dataset.id));
    });
  }

  // --- Issues List ---
  async function loadIssues(page = 1) {
    currentPage = page;
    const search = document.getElementById('search-input').value;
    const severity = document.getElementById('filter-severity').value;
    const status = document.getElementById('filter-status').value;

    const params = new URLSearchParams({ page, limit: 10 });
    if (search) params.set('search', search);
    if (severity) params.set('severity', severity);
    if (status) params.set('status', status);

    const result = await api(`${API}?${params}`);
    const { data, total, limit } = result;

    const listEl = document.getElementById('issues-list');
    listEl.innerHTML = data.length === 0
      ? '<p style="color:var(--text-secondary);padding:20px;text-align:center;">没有找到匹配的问题</p>'
      : data.map(issueItemHTML).join('');

    listEl.querySelectorAll('.issue-item').forEach(el => {
      el.addEventListener('click', () => showDetail(+el.dataset.id));
    });

    // Pagination
    const totalPages = Math.ceil(total / limit);
    const pagEl = document.getElementById('pagination');
    if (totalPages <= 1) { pagEl.innerHTML = ''; return; }

    let pagHTML = `<button ${page <= 1 ? 'disabled' : ''} data-p="${page - 1}">上一页</button>`;
    for (let i = 1; i <= totalPages; i++) {
      pagHTML += `<button class="${i === page ? 'active' : ''}" data-p="${i}">${i}</button>`;
    }
    pagHTML += `<button ${page >= totalPages ? 'disabled' : ''} data-p="${page + 1}">下一页</button>`;
    pagEl.innerHTML = pagHTML;

    pagEl.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = +btn.dataset.p;
        if (p && p >= 1 && p <= totalPages) loadIssues(p);
      });
    });
  }

  function issueItemHTML(issue) {
    const statusMap = { open: '待处理', analyzing: '分析中', resolved: '已解决', closed: '已关闭' };
    const tags = (issue.tags || []).map(t => `<span class="detail-tag">${esc(t)}</span>`).join('');
    return `
      <div class="issue-item" data-id="${issue.id}">
        <span class="issue-severity ${issue.severity}">${issue.severity}</span>
        <div class="issue-info">
          <h4>${esc(issue.title)}</h4>
          <div class="issue-desc">${esc(issue.description || '')}</div>
          ${tags ? '<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">' + tags + '</div>' : ''}
        </div>
        <div class="issue-meta">
          <span class="issue-status ${issue.status}">${statusMap[issue.status]}</span>
          <span class="issue-date">${formatDate(issue.created_at)}</span>
        </div>
      </div>
    `;
  }

  // --- Detail ---
  async function showDetail(id) {
    currentDetailId = id;
    const issue = await api(`${API}/${id}`);

    document.getElementById('detail-title').textContent = issue.title;

    const statusMap = { open: '待处理', analyzing: '分析中', resolved: '已解决', closed: '已关闭' };
    const tags = (issue.tags || []).map(t => `<span class="detail-tag">${esc(t)}</span>`).join('');

    document.getElementById('detail-meta').innerHTML = `
      <span class="issue-severity ${issue.severity}">${issue.severity}</span>
      <span class="issue-status ${issue.status}">${statusMap[issue.status]}</span>
      ${tags}
      ${issue.business_module ? `<span class="detail-tag" style="background:#fef3c7;color:#92400e;">业务: ${esc(issue.business_module)}</span>` : ''}
      ${issue.function_module ? `<span class="detail-tag" style="background:#e0e7ff;color:#3730a3;">功能: ${esc(issue.function_module)}</span>` : ''}
      <span class="issue-date">创建: ${formatDate(issue.created_at)}</span>
      <span class="issue-date">更新: ${formatDate(issue.updated_at)}</span>
    `;

    const sections = [
      { label: '问题描述', value: issue.description },
      { label: '影响范围', value: issue.impact_scope },
      { label: '根因分析', value: issue.root_cause },
      { label: '解决方案', value: issue.solution },
      { label: '复盘总结', value: issue.review },
    ];

    document.getElementById('detail-body').innerHTML = sections.map(s => `
      <div class="detail-section">
        <h4>${s.label}</h4>
        <p${!s.value ? ' class="empty"' : ''}>${s.value ? esc(s.value) : '暂无内容'}</p>
      </div>
    `).join('');

    // Screenshots gallery
    const gallery = document.getElementById('detail-gallery');
    if (issue.screenshots && issue.screenshots.length > 0) {
      gallery.innerHTML = `
        <div class="detail-section">
          <h4>截图 (${issue.screenshots.length})</h4>
          <div class="screenshot-gallery">
            ${issue.screenshots.map(s => `
              <div class="screenshot-thumb">
                <img src="/api/screenshots/${s.id}" alt="${esc(s.filename)}" loading="lazy">
                <span class="screenshot-label">${esc(s.filename)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      gallery.querySelectorAll('.screenshot-thumb img').forEach(img => {
        img.addEventListener('click', () => openLightbox(img.src));
      });
    } else {
      gallery.innerHTML = '';
    }

    showPage('detail');
  }

  // --- Form ---
  function resetForm(issue) {
    document.getElementById('form-id').value = issue ? issue.id : '';
    document.getElementById('f-title').value = issue ? issue.title : '';
    document.getElementById('f-description').value = issue ? issue.description : '';
    document.getElementById('f-impact-scope').value = issue ? issue.impact_scope : '';
    document.getElementById('f-root-cause').value = issue ? issue.root_cause : '';
    document.getElementById('f-solution').value = issue ? issue.solution : '';
    document.getElementById('f-review').value = issue ? issue.review : '';
    document.getElementById('f-severity').value = issue ? issue.severity : 'P2';
    document.getElementById('f-status').value = issue ? issue.status : 'open';
    document.getElementById('f-business-module').value = issue ? (issue.business_module || '') : '';
    document.getElementById('f-function-module').value = issue ? (issue.function_module || '') : '';
    document.getElementById('form-title').textContent = issue ? '编辑问题' : '新建问题';
    document.getElementById('form-submit-btn').textContent = issue ? '保存修改' : '创建问题';

    selectedTags = issue ? [...(issue.tags || [])] : [];
    updateTagUI();

    // Reset screenshots
    pendingScreenshots = [];
    existingScreenshots = [];
    document.getElementById('preview-grid').innerHTML = '';

    if (issue && issue.screenshots) {
      existingScreenshots = issue.screenshots;
      renderExistingScreenshots();
    } else {
      document.getElementById('existing-screenshots').innerHTML = '';
    }

    showPage('form');
  }

  function renderExistingScreenshots() {
    const container = document.getElementById('existing-screenshots');
    if (existingScreenshots.length === 0) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = existingScreenshots.map(s => `
      <div class="preview-item" data-screenshot-id="${s.id}">
        <img src="/api/screenshots/${s.id}" alt="${esc(s.filename)}">
        <button type="button" class="preview-remove" data-id="${s.id}">&times;</button>
      </div>
    `).join('');

    container.querySelectorAll('.preview-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const screenshotId = btn.dataset.id;
        const issueId = document.getElementById('form-id').value;
        try {
          await fetch(`${API}/${issueId}/screenshots/${screenshotId}`, { method: 'DELETE' });
          existingScreenshots = existingScreenshots.filter(s => s.id !== +screenshotId);
          renderExistingScreenshots();
          showToast('截图已删除');
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  }

  function updateTagUI() {
    document.querySelectorAll('.tag-option').forEach(el => {
      el.classList.toggle('selected', selectedTags.includes(el.dataset.tag));
    });
  }

  document.querySelectorAll('.tag-option').forEach(el => {
    el.addEventListener('click', () => {
      const tag = el.dataset.tag;
      if (selectedTags.includes(tag)) {
        selectedTags = selectedTags.filter(t => t !== tag);
      } else {
        selectedTags.push(tag);
      }
      updateTagUI();
    });
  });

  document.getElementById('f-custom-tag').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = e.target.value.trim();
      if (val && !selectedTags.includes(val)) {
        selectedTags.push(val);
        const span = document.createElement('span');
        span.className = 'tag-option selected';
        span.dataset.tag = val;
        span.textContent = val;
        span.addEventListener('click', () => {
          selectedTags = selectedTags.filter(t => t !== val);
          updateTagUI();
        });
        e.target.before(span);
        updateTagUI();
        e.target.value = '';
      }
    }
  });

  // --- Screenshot upload ---
  const fileInput = document.getElementById('f-screenshots');
  const uploadArea = document.getElementById('upload-area');
  const uploadPrompt = document.getElementById('upload-prompt');

  uploadPrompt.addEventListener('click', () => fileInput.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
    fileInput.value = '';
  });

  function handleFiles(fileList) {
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024;

    Array.from(fileList).forEach(file => {
      if (!allowed.includes(file.type)) {
        showToast('不支持的文件格式: ' + file.name);
        return;
      }
      if (file.size > maxSize) {
        showToast('文件超过 5MB: ' + file.name);
        return;
      }
      pendingScreenshots.push(file);
      addPreview(file, pendingScreenshots.length - 1);
    });
  }

  function addPreview(file, index) {
    const grid = document.getElementById('preview-grid');
    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement('div');
      div.className = 'preview-item';
      div.innerHTML = `
        <img src="${e.target.result}" alt="${esc(file.name)}">
        <button type="button" class="preview-remove" data-index="${index}">&times;</button>
      `;
      grid.appendChild(div);

      div.querySelector('.preview-remove').addEventListener('click', () => {
        pendingScreenshots.splice(index, 1);
        rebuildPreviews();
      });
    };
    reader.readAsDataURL(file);
  }

  function rebuildPreviews() {
    const grid = document.getElementById('preview-grid');
    grid.innerHTML = '';
    pendingScreenshots.forEach((file, i) => addPreview(file, i));
  }

  document.getElementById('issue-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('form-id').value;
    const body = {
      title: document.getElementById('f-title').value,
      description: document.getElementById('f-description').value,
      impact_scope: document.getElementById('f-impact-scope').value,
      root_cause: document.getElementById('f-root-cause').value,
      solution: document.getElementById('f-solution').value,
      review: document.getElementById('f-review').value,
      business_module: document.getElementById('f-business-module').value,
      function_module: document.getElementById('f-function-module').value,
      severity: document.getElementById('f-severity').value,
      status: document.getElementById('f-status').value,
      tags: selectedTags,
    };

    try {
      let savedIssue;
      if (id) {
        savedIssue = await api(`${API}/${id}`, { method: 'PUT', body });
      } else {
        savedIssue = await api(API, { method: 'POST', body });
      }

      if (pendingScreenshots.length > 0) {
        await uploadScreenshots(savedIssue.id, pendingScreenshots);
        pendingScreenshots = [];
      }

      showToast(id ? '问题已更新' : '问题已创建');
      navigate('#issues');
      location.hash = '#issues';
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('form-cancel-btn').addEventListener('click', () => {
    location.hash = '#issues';
  });

  // --- Detail buttons ---
  document.getElementById('back-btn').addEventListener('click', () => {
    location.hash = '#issues';
  });

  document.getElementById('edit-btn').addEventListener('click', async () => {
    if (!currentDetailId) return;
    const issue = await api(`${API}/${currentDetailId}`);
    resetForm(issue);
  });

  document.getElementById('delete-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.remove('hidden');
  });

  document.getElementById('cancel-delete-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.add('hidden');
  });

  document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    if (!currentDetailId) return;
    try {
      await api(`${API}/${currentDetailId}`, { method: 'DELETE' });
      document.getElementById('confirm-modal').classList.add('hidden');
      showToast('问题已删除');
      location.hash = '#issues';
    } catch (err) {
      showToast(err.message);
    }
  });

  // --- Filters ---
  let searchTimer;
  document.getElementById('search-input').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadIssues(1), 300);
  });
  document.getElementById('filter-severity').addEventListener('change', () => loadIssues(1));
  document.getElementById('filter-status').addEventListener('change', () => loadIssues(1));

  // --- Lightbox ---
  function openLightbox(src) {
    document.getElementById('lightbox-img').src = src;
    document.getElementById('lightbox').classList.remove('hidden');
  }

  document.querySelector('.lightbox-close').addEventListener('click', () => {
    document.getElementById('lightbox').classList.add('hidden');
  });
  document.querySelector('.lightbox-overlay').addEventListener('click', () => {
    document.getElementById('lightbox').classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('lightbox').classList.add('hidden');
    }
  });

  // --- Helpers ---
  function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDate(d) {
    if (!d) return '';
    const date = new Date(d);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2500);
  }

  // --- Init ---
  navigate(location.hash);
})();
