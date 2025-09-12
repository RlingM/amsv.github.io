// main.js
let staffData = [];        // 数组：每个元素根据 Excel 行
let filteredData = [];     // 搜索后数据
let page = 1;
const perPage = 2;         // 每页显示 2 位（并排）
const ADMIN_CREDENTIALS = { user: "admin", pass: "admin123" }; // 请上线前改密码

// load on page (for profile.html too)
async function loadStaffData() {
  // 优先尝试 fetch staff.json 或 staff.xlsx 放在仓库
  try {
    // 尝试 staff.json 优先（如果你已生成 JSON）
    let resp = await fetch('staff.json');
    if (resp.ok) {
      staffData = await resp.json();
      filteredData = staffData.slice();
      return;
    }
  } catch(e){ /* ignore */ }

  try {
    // 尝试直接 fetch staff.xlsx 并解析
    let resp = await fetch('staff.xlsx');
    if (!resp.ok) throw new Error('no excel');
    let ab = await resp.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(ab), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    staffData = XLSX.utils.sheet_to_json(ws, {defval: ""});
    filteredData = staffData.slice();
    return;
  } catch(e) {
    // 没有 staff.xlsx / staff.json — 页面会要求用户上传（也可以在 admin 上传）
    console.warn("未找到 staff.xlsx 或 staff.json，页面将等待上传或使用手动数据。", e);
    staffData = [];
    filteredData = [];
  }
}

// Render directory (index.html)
function renderDirectory() {
  const container = document.getElementById('directory');
  if (!container) return;

  // empty
  container.innerHTML = '';

  // pagination bounds
  const total = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;

  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, total);

  for (let i = start; i < end; ++i) {
    const s = filteredData[i];
    const card = createCard(s, i);
    container.appendChild(card);
  }

  // update page info
  const pageInfo = document.getElementById('pageInfo');
  pageInfo && (pageInfo.innerText = `第 ${page} 页 / 共 ${totalPages} 页`);
}

// create a DOM node card
function createCard(s, index) {
  const div = document.createElement('div');
  div.className = 'card';

  // try to show photo if exists (assume 'Photo' column) else placeholder
  let imgSrc = (s.Photo) ? `images/${s.Photo}` : `https://via.placeholder.com/140x140?text=${encodeURIComponent(s.Name || 'No')}`;

  const html = `
    <img src="${imgSrc}" alt="${escapeHtml(s.Name || '')}" onerror="this.src='https://via.placeholder.com/140x140?text=No+Image'">
    <div class="info">
      <h3>${escapeHtml(s.Name || '')}</h3>
      <p><strong>Email:</strong> ${escapeHtml(s.Email || '')}</p>
      <p><strong>Phone:</strong> ${escapeHtml(s.Phone || '')}</p>
      <p><strong>Office:</strong> ${escapeHtml(s.Office || '')}</p>
      <div>
        <a class="profile-link" href="profile.html?id=${index}">站内主页</a>
        ${s['Profile URL'] ? ` <a class="profile-link" style="background:#6b7280;" href="${s['Profile URL']}" target="_blank">外部页面</a>` : ''}
      </div>
    </div>
  `;
  div.innerHTML = html;
  return div;
}

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function prevPage(){ page = Math.max(1, page - 1); renderDirectory(); }
function nextPage(){ page = page + 1; renderDirectory(); }

function searchStaff() {
  const kw = document.getElementById('searchInput')?.value?.toLowerCase?.() || '';
  if (!kw) {
    filteredData = staffData.slice();
  } else {
    filteredData = staffData.filter(s => {
      return (String(s.Name || '').toLowerCase().includes(kw) ||
              String(s.Email || '').toLowerCase().includes(kw) ||
              String(s.Phone || '').toLowerCase().includes(kw) ||
              String(s.Office || '').toLowerCase().includes(kw) ||
              (String(s['Profile URL'] || '').toLowerCase().includes(kw))
             );
    });
  }
  page = 1;
  renderDirectory();
}

/* ---------------- Admin ---------------- */

function toggleAdminPanel(){
  const p = document.getElementById('adminPanel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

function adminLogin(){
  const u = document.getElementById('adminUser').value;
  const p = document.getElementById('adminPass').value;
  if (u === ADMIN_CREDENTIALS.user && p === ADMIN_CREDENTIALS.pass) {
    alert('管理员登录成功');
    document.getElementById('adminActions').style.display = 'block';
  } else {
    alert('用户名或密码错误');
  }
}

// 上传 Excel，并直接在浏览器中替换当前数据（不会写回仓库）
function uploadExcel(){
  const fileInput = document.getElementById('uploadExcel');
  const f = fileInput.files && fileInput.files[0];
  if (!f) { alert('请选择文件'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    staffData = XLSX.utils.sheet_to_json(ws, {defval:""});
    filteredData = staffData.slice();
    page = 1;
    renderDirectory();
    alert('已在浏览器中更新显示（注意：此操作不会持久化到仓库）');
  };
  reader.readAsArrayBuffer(f);
}

/* -------------- 可选：上传并提交到 GitHub（会把文件写到仓库） -------------- */
/* 注意：在浏览器中使用个人访问令牌 (PAT) 有安全风险。用户需知晓。
   要求：Token 需有 repo（或 repo:contents）权限，填写 owner/repo，填写目标路径（例如 staff.xlsx）。
   下面的函数使用 GitHub REST API v3，PUT contents API。
*/
async function uploadToGithub(){
  const token = document.getElementById('ghToken').value.trim();
  const repo = document.getElementById('ghRepo').value.trim();
  const path = document.getElementById('ghPath').value.trim() || 'staff.xlsx';
  const fileInput = document.getElementById('uploadExcel');
  const f = fileInput.files && fileInput.files[0];
  if (!token || !repo || !f) { alert('请填写 Token、Repo 并选择 Excel 文件'); return; }

  // read file as base64
  const fileArrayBuffer = await f.arrayBuffer();
  const base64Content = arrayBufferToBase64(fileArrayBuffer);

  // need to get current file sha if exists
  const apiBase = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;

  try {
    const getResp = await fetch(apiBase, {
      headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json' }
    });
    let sha = null;
    if (getResp.ok) {
      const js = await getResp.json();
      sha = js.sha;
    }

    const commitMsg = `Update ${path} via web admin UI`;
    const body = {
      message: commitMsg,
      content: base64Content,
      committer: { name: "Site Admin", email: "admin@example.com" }
    };
    if (sha) body.sha = sha;

    const putResp = await fetch(apiBase, {
      method: 'PUT',
      headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json' },
      body: JSON.stringify(body)
    });

    if (!putResp.ok) {
      const err = await putResp.json();
      console.error(err);
      alert('上传失败：' + (err.message || JSON.stringify(err)));
      return;
    }
    alert('已提交到 GitHub 仓库。注意：GitHub Pages 可能需要几分钟来部署更新。');
  } catch(err) {
    console.error(err);
    alert('提交发生错误，请查看控制台：' + err.message);
  }
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/* ---------------- Profile page rendering ---------------- */

function renderProfileFromUrl() {
  const params = new URLSearchParams(location.search);
  let id = params.get('id');
  if (!id && location.hash) {
    const h = location.hash.replace('#','');
    if (h.startsWith('id=')) id = h.split('=')[1];
  }
  if (!id) {
    // show error
    const el = document.getElementById('profileContent');
    el && (el.innerHTML = '<p>未指定教师 id。请从目录页面点击链接进入。</p>');
    return;
  }
  id = Number(id);
  if (isNaN(id) || id < 0 || id >= staffData.length) {
    const el = document.getElementById('profileContent');
    el && (el.innerHTML = '<p>无效的 id。</p>');
    return;
  }
  const s = staffData[id];
  const c = document.getElementById('profileContent');
  const imgSrc = s.Photo ? `images/${s.Photo}` : 'https://via.placeholder.com/220x220?text=No+Image';
  c.innerHTML = `
    <div style="display:flex; gap:20px;">
      <img src="${imgSrc}" style="width:220px;height:220px;object-fit:cover;border-radius:6px;">
      <div>
        <h2>${escapeHtml(s.Name || '')}</h2>
        <p><strong>Email:</strong> ${escapeHtml(s.Email || '')}</p>
        <p><strong>Phone:</strong> ${escapeHtml(s.Phone || '')}</p>
        <p><strong>Office:</strong> ${escapeHtml(s.Office || '')}</p>
        <p><strong>Profile URL:</strong> ${s['Profile URL'] ? `<a href="${s['Profile URL']}" target="_blank">${escapeHtml(s['Profile URL'])}</a>` : '无'}</p>
      </div>
    </div>
  `;
}

/* ----------------- 初始化 ----------------- */
document.addEventListener('DOMContentLoaded', async () => {
  await loadStaffData();
  renderDirectory();

  // 绑定上传 file change 到 reader（管理面板的上传操作中也会读取）
  const fileInput = document.getElementById('uploadExcel');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      // 可在这里做预览或自动上传
    });
  }
});
