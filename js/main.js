// js/main.js
// 依赖：js/xlsx.full.min.js (SheetJS)
// 全功能：加载 staff.json/staff.xlsx -> 搜索 -> scroll-snap 每页2人 -> 图片点击生成海报（preview + high-res）
//          姓名点击跳转 profile.html?id=N
// 管理面板：可上传 Excel（浏览器内生效）和选择性提交到 GitHub（如需可开启）

/* ---------------- 配置 ---------------- */
const perPage = 2;
let staffData = [];
let filteredData = [];
let currentPosterIndex = null;
const ADMIN_CREDENTIALS = { user: "admin", pass: "admin123" }; // 上线请更改

/* ---------- 图片与海报缓存 ---------- */
const imageCache = new Map();         // url -> Promise<HTMLImageElement>
const posterHighResCache = new Map(); // idx -> dataURL

function loadImageCached(url) {
  if (!url) url = `https://via.placeholder.com/420x420?text=No+Image`;
  if (imageCache.has(url)) return imageCache.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      const ph = new Image();
      ph.crossOrigin = "anonymous";
      ph.src = `https://via.placeholder.com/420x420?text=No+Image`;
      ph.onload = () => resolve(ph);
      ph.onerror = () => resolve(ph);
    };
    img.src = url;
  });
  imageCache.set(url, p);
  return p;
}

/* ---------------- 数据加载（更健壮，带调试输出） ---------------- */
async function loadStaffData() {
  console.log('[DEBUG] start loadStaffData');

  function showAdminIfNoData() {
    const p = document.getElementById('adminPanel');
    if (p) p.style.display = 'block';
  }

  // 1. 尝试 staff.json
  try {
    console.log('[DEBUG] trying to fetch staff.json ...');
    const resp = await fetch('staff.json', { cache: "no-cache" });
    if (resp.ok) {
      const js = await resp.json();
      if (Array.isArray(js) && js.length > 0) {
        staffData = js;
        filteredData = staffData.slice();
        console.log('[DEBUG] loaded staff.json, rows=', staffData.length);
        return;
      } else {
        console.warn('[DEBUG] staff.json fetched but empty or not array');
      }
    } else {
      console.warn('[DEBUG] staff.json fetch not ok, status=', resp.status);
    }
  } catch (err) {
    console.warn('[DEBUG] fetch staff.json error:', err);
  }

  // 2. 尝试 staff.xlsx
  try {
    console.log('[DEBUG] trying to fetch staff.xlsx ...');
    const resp2 = await fetch('staff.xlsx', { cache: "no-cache" });
    if (resp2.ok) {
      const ab = await resp2.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(ab), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (Array.isArray(rows) && rows.length > 0) {
        staffData = rows;
        filteredData = staffData.slice();
        console.log('[DEBUG] loaded staff.xlsx, rows=', staffData.length);
        return;
      } else {
        console.warn('[DEBUG] staff.xlsx parsed but empty');
      }
    } else {
      console.warn('[DEBUG] staff.xlsx fetch not ok, status=', resp2.status);
    }
  } catch (err) {
    console.warn('[DEBUG] fetch staff.xlsx error:', err);
  }

  // 3. 未找到数据：打开管理员面板并注入示例（仅用于本地预览，生产请移除）
  console.warn('[DEBUG] no staff data found (staff.json / staff.xlsx). showing admin panel.');
  showAdminIfNoData();

  // 示例数据（方便预览），上线请删除或替换为真实文件
  const sample = [
    { Name: "示例 教师 A", "Profile URL": "", Email: "a@uni.edu", Phone: "+853 1234 0000", Office: "N1-1001", Research: "Machine Learning", Papers: "Paper A; Paper B" },
    { Name: "示例 教师 B", "Profile URL": "", Email: "b@uni.edu", Phone: "+853 1234 0001", Office: "N1-1002", Research: "Analog Circuits", Papers: "Paper C" }
  ];
  staffData = sample;
  filteredData = staffData.slice();
  console.log('[DEBUG] sample data injected for preview (remove for production).');
}

/* ---------------- 渲染：滚动分页（每页2人） ---------------- */
function renderScrollPages() {
  const container = document.getElementById('scrollContainer');
  if (!container) return;
  container.innerHTML = '';

  for (let i = 0; i < filteredData.length; i += perPage) {
    const pageDiv = document.createElement('section');
    pageDiv.className = 'page';
    pageDiv.setAttribute('data-page', (i / perPage) + 1);

    for (let j = 0; j < perPage; ++j) {
      const idx = i + j;
      if (idx < filteredData.length) {
        const card = createCard(filteredData[idx], idx);
        pageDiv.appendChild(card);
      } else {
        const ph = document.createElement('div');
        ph.style.width = '520px';
        pageDiv.appendChild(ph);
      }
    }
    container.appendChild(pageDiv);
  }

  if (filteredData.length === 0) {
    const p = document.createElement('p');
    p.style.textAlign = 'center';
    p.style.color = '#666';
    p.style.marginTop = '40px';
    p.innerText = '暂无教师数据。管理员请上传 Excel。';
    container.appendChild(p);
  }
}

/* ---------------- 卡片创建（图片->海报，姓名->站内主页） ---------------- */
function createCard(s, index) {
  const div = document.createElement('div');
  div.className = 'card';

  const imgSrc = s.Photo ? `images/${s.Photo}` : (s['Photo URL'] ? s['Photo URL'] : `https://via.placeholder.com/180x180?text=${encodeURIComponent(s.Name||'No')}`);

  div.innerHTML = `
    <img src="${imgSrc}" alt="${escapeHtml(s.Name||'')}" loading="lazy">
    <div class="info">
      <h3 class="card-name" style="cursor:pointer">${escapeHtml(s.Name||'')}</h3>
      <p><strong>Email:</strong> ${escapeHtml(s.Email||'')}</p>
      <p><strong>Phone:</strong> ${escapeHtml(s.Phone||'')}</p>
      <p><strong>Office:</strong> ${escapeHtml(s.Office||'')}</p>
      <div class="links" style="margin-top:8px;"></div>
    </div>
  `;

  const img = div.querySelector('img');
  const nameEl = div.querySelector('.card-name');

  img.addEventListener('click', (e) => {
    e.preventDefault();
    openPosterFor(index);
  });

  nameEl.addEventListener('click', () => {
    location.href = `profile.html?id=${index}`;
  });

  return div;
}

function escapeHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ---------------- 搜索 ---------------- */
function searchStaff() {
  const kw = document.getElementById('searchInput')?.value?.toLowerCase?.() || '';
  if (!kw) {
    filteredData = staffData.slice();
  } else {
    filteredData = staffData.filter(s => {
      return (String(s.Name||'').toLowerCase().includes(kw) ||
              String(s.Email||'').toLowerCase().includes(kw) ||
              String(s.Phone||'').toLowerCase().includes(kw) ||
              String(s.Office||'').toLowerCase().includes(kw) ||
              String(s['Profile URL']||'').toLowerCase().includes(kw) ||
              String(s.Research||'').toLowerCase().includes(kw) ||
              String(s.Papers||'').toLowerCase().includes(kw)
             );
    });
  }
  renderScrollPages();
}

/* ---------------- 管理面板：打开/登录/上传（浏览器内生效） ---------------- */
function toggleAdminPanel() {
  const p = document.getElementById('adminPanel');
  if (!p) return;
  p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none';
}
function adminLogin() {
  const u = document.getElementById('adminUser')?.value;
  const p = document.getElementById('adminPass')?.value;
  if (u === ADMIN_CREDENTIALS.user && p === ADMIN_CREDENTIALS.pass) {
    alert('管理员登录成功');
    document.getElementById('adminActions').style.display = 'block';
  } else {
    alert('用户名或密码错误');
  }
}
function uploadExcel() {
  const fileInput = document.getElementById('uploadExcel');
  const f = fileInput.files && fileInput.files[0];
  if (!f) { alert('请选择文件'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    staffData = XLSX.utils.sheet_to_json(ws, { defval: "" });
    filteredData = staffData.slice();
    renderScrollPages();
    alert('已在浏览器中更新显示（注意：此操作不会持久化到仓库）');
  };
  reader.readAsArrayBuffer(f);
}

/* ---------------- 个人主页渲染（profile.html 使用） ---------------- */
function renderProfileFromUrl() {
  const params = new URLSearchParams(location.search);
  let id = params.get('id');
  if (!id && location.hash) {
    const h = location.hash.replace('#','');
    if (h.startsWith('id=')) id = h.split('=')[1];
  }
  if (!id) {
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
  const imgSrc = s.Photo ? `images/${s.Photo}` : (s['Photo URL'] ? s['Photo URL'] : 'https://via.placeholder.com/220x220?text=No+Image');
  c.innerHTML = `
    <div style="display:flex; gap:20px; flex-wrap:wrap;">
      <img src="${imgSrc}" style="width:220px;height:220px;object-fit:cover;border-radius:6px;">
      <div style="flex:1; min-width:260px;">
        <h2>${escapeHtml(s.Name || '')}</h2>
        <p><strong>Email:</strong> ${escapeHtml(s.Email || '')}</p>
        <p><strong>Phone:</strong> ${escapeHtml(s.Phone || '')}</p>
        <p><strong>Office:</strong> ${escapeHtml(s.Office || '')}</p>
        <p><strong>Research:</strong> ${escapeHtml(s.Research || '—')}</p>
        <p><strong>Papers:</strong> ${escapeHtml(s.Papers || '—')}</p>
        <p><strong>外部页面:</strong> ${s['Profile URL'] ? `<a href="${s['Profile URL']}" target="_blank">${escapeHtml(s['Profile URL'])}</a>` : '无'}</p>
        <div style="margin-top:10px;">
          <button onclick="openPosterFor(${id})">生成海报</button>
        </div>
      </div>
    </div>
  `;
}

/* ---------------- 海报：两阶段渲染（快速 preview + 高分生成并缓存） ---------------- */
async function openPosterFor(index) {
  currentPosterIndex = index;
  const s = staffData[index];
  if (!s) return alert('未找到该教师数据');

  const modal = document.getElementById('posterModal');
  const canvas = document.getElementById('posterCanvas');
  const ctx = canvas.getContext('2d');

  // 显示 modal 并先渲染快速预览
  modal.style.display = 'flex';
  await renderPosterPreview(s, canvas, ctx);

  // 若缓存高分，不用重做
  if (posterHighResCache.has(index)) {
    const dataUrl = posterHighResCache.get(index);
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
    return;
  }

  // 异步生成高分（不阻塞 UI）
  generatePosterHighRes(s, index).then((dataUrl) => {
    posterHighResCache.set(index, dataUrl);
    if (modal.style.display !== 'none' && currentPosterIndex === index) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = dataUrl;
    }
  }).catch(err => {
    console.error('generatePosterHighRes error', err);
  });
}

async function renderPosterPreview(s, canvas, ctx) {
  const PRE_W = 600, PRE_H = 800;
  canvas.width = PRE_W;
  canvas.height = PRE_H;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,PRE_W,PRE_H);
  ctx.fillStyle = '#0b4f6c';
  ctx.fillRect(0,0,PRE_W,110);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px "Segoe UI", Arial';
  ctx.fillText(s.Name || '', 30, 76);

  const imgX = 40, imgY = 150, imgS = 260;
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(imgX, imgY, imgS, imgS);

  ctx.fillStyle = '#222';
  ctx.font = '14px "Segoe UI"';
  ctx.fillText('Research: ' + (s.Research ? s.Research.split(';')[0] : '—'), imgX + imgS + 20, imgY + 10);
  ctx.fillText('Email: ' + (s.Email || '—'), imgX + imgS + 20, imgY + 40);

  const imgUrl = s.Photo ? `images/${s.Photo}` : (s['Photo URL'] ? s['Photo URL'] : `https://via.placeholder.com/420x420?text=${encodeURIComponent(s.Name||'No')}`);
  try {
    const img = await loadImageCached(imgUrl);
    drawRoundImageSimple(ctx, img, imgX, imgY, imgS, imgS, 12);
  } catch(e) {
    console.warn('preview image load failed', e);
  }
}

async function generatePosterHighRes(s, index) {
  const W = 1200, H = 1600;
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const ctx = off.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,W,H);

  ctx.fillStyle = '#0b4f6c';
  ctx.fillRect(0,0,W,140);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 48px "Segoe UI", Arial';
  ctx.fillText(s.Name || '', 60, 96);

  const imgX = 70, imgY = 200, imgS = 520;
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(imgX-8, imgY-8, imgS+16, imgS+16);

  const imgUrl = s.Photo ? `images/${s.Photo}` : (s['Photo URL'] ? s['Photo URL'] : `https://via.placeholder.com/420x420?text=${encodeURIComponent(s.Name||'No')}`);
  const img = await loadImageCached(imgUrl);
  drawRoundImage(ctx, img, imgX, imgY, imgS, imgS, 20);

  const startX = imgX + imgS + 60;
  let y = imgY;
  ctx.fillStyle = '#0b4f6c';
  ctx.font = '26px "Segoe UI"';
  ctx.fillText('Research', startX, y + 6);
  y += 34;
  ctx.fillStyle = '#222';
  ctx.font = '20px "Segoe UI"';
  wrapText(ctx, s.Research || '—', startX, y, W - startX - 80, 28);
  y += 140;

  ctx.fillStyle = '#0b4f6c';
  ctx.font = '24px "Segoe UI"';
  ctx.fillText('Selected Papers', startX, y);
  y += 36;
  ctx.fillStyle = '#222';
  ctx.font = '18px "Segoe UI"';
  wrapText(ctx, s.Papers || '—', startX, y, W - startX - 80, 24);
  y += 200;

  ctx.fillStyle = '#0b4f6c';
  ctx.font = '22px "Segoe UI"';
  ctx.fillText('Contact', startX, y);
  y += 36;
  ctx.fillStyle = '#222';
  ctx.font = '18px "Segoe UI"';
  ctx.fillText(`Email: ${s.Email || '—'}`, startX, y); y += 28;
  ctx.fillText(`Phone: ${s.Phone || '—'}`, startX, y); y += 28;
  ctx.fillText(`Office: ${s.Office || '—'}`, startX, y); y += 40;

  const qrSize = 280;
  const qrX = W - qrSize - 80;
  const qrY = H - qrSize - 80;
  const profileUrl = s['Profile URL'] ? s['Profile URL'] : (`${location.origin}${location.pathname.replace(/\/[^/]*$/,'/') }profile.html?id=${index}`);
  const qrSrc = `https://chart.googleapis.com/chart?cht=qr&chs=${qrSize}x${qrSize}&chl=${encodeURIComponent(profileUrl)}&chld=L|2`;
  try {
    const qrImg = await loadImageCached(qrSrc);
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  } catch(e) {
    ctx.fillStyle = '#efefef';
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
    ctx.fillStyle = '#666';
    ctx.font = '16px "Segoe UI"';
    ctx.fillText('QR unavailable', qrX + 12, qrY + 20);
  }

  ctx.fillStyle = '#666';
  ctx.font = '16px "Segoe UI"';
  ctx.fillText('Generated by Academy Staff Directory', 80, H - 40);

  return off.toDataURL('image/png');
}

/* ---------- 绘图辅助 ---------- */
function drawRoundImageSimple(ctx, img, x, y, w, h, r) {
  try {
    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  } catch(e){ console.warn('drawRoundImageSimple err', e); }
}
function drawRoundImage(ctx, img, x, y, w, h, r) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / boxRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const parts = String(text || '').split(/;|\n/).map(s => s.trim()).filter(Boolean);
  let curY = y;
  for (let i = 0; i < parts.length; i++) {
    let line = parts[i];
    while (ctx.measureText(line).width > maxWidth) {
      let fit = line.length;
      while (ctx.measureText(line.substring(0, fit)).width > maxWidth) fit--;
      ctx.fillText(line.substring(0, fit), x, curY);
      line = line.substring(fit);
      curY += lineHeight;
    }
    ctx.fillText(line, x, curY);
    curY += lineHeight;
  }
}

/* ---------------- 海报关闭与下载 ---------------- */
function closePoster() {
  currentPosterIndex = null;
  const modal = document.getElementById('posterModal');
  if (modal) modal.style.display = 'none';
}
function downloadPoster() {
  const idx = currentPosterIndex;
  if (!Number.isInteger(idx)) { alert('无可下载海报'); return; }
  if (posterHighResCache.has(idx)) {
    const dataUrl = posterHighResCache.get(idx);
    const link = document.createElement('a');
    link.download = `poster_${(staffData[idx] && staffData[idx].Name)||'staff'}.png`;
    link.href = dataUrl;
    link.click();
  } else {
    alert('高清海报尚在生成中，稍等数秒后再下载（或重试）。');
    generatePosterHighRes(staffData[idx], idx).then(dataUrl => {
      posterHighResCache.set(idx, dataUrl);
      const link = document.createElement('a');
      link.download = `poster_${(staffData[idx] && staffData[idx].Name)||'staff'}.png`;
      link.href = dataUrl;
      link.click();
    }).catch(err => {
      console.error(err);
      alert('生成失败，请查看控制台。');
    });
  }
}

/* ---------------- 初始化 ---------------- */
document.addEventListener('DOMContentLoaded', async () => {
  await loadStaffData();
  renderScrollPages();

  // 绑定上传 file change（若有）
  const fileInput = document.getElementById('uploadExcel');
  if (fileInput) {
    fileInput.addEventListener('change', () => { /* optional preview */ });
  }

  // 如果在 profile.html 上，自动渲染 profile
  if (document.getElementById('profileContent')) {
    // 如果数据尚未加载完（异步），等待 loadStaffData 完成后渲染
    renderProfileFromUrl();
  }
});
