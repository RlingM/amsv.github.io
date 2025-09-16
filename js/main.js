// main.js (updated)
// 依赖：xlsx.full.min.js (SheetJS)

let staffData = [];
let filteredData = [];
const perPage = 2;           // 每页显示2位
let ADMIN_CREDENTIALS = { user: "admin", pass: "admin123" };

// ------------------------ 数据加载 ------------------------
async function loadStaffData() {
  // 优先 staff.json
  try {
    const resp = await fetch('staff.json');
    if (resp.ok) {
      staffData = await resp.json();
      filteredData = staffData.slice();
      return;
    }
  } catch(e){ /* ignore */ }

  // 尝试 staff.xlsx
  try {
    const resp = await fetch('staff.xlsx');
    if (resp.ok) {
      const ab = await resp.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(ab), {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      staffData = XLSX.utils.sheet_to_json(ws, {defval:""});
      filteredData = staffData.slice();
      return;
    }
  } catch(e){
    console.warn('没有 staff.json 或 staff.xlsx，可通过管理员上传。', e);
    staffData = [];
    filteredData = [];
  }
}

// ------------------------ 渲染滚动分页 ------------------------
function renderScrollPages() {
  const container = document.getElementById('scrollContainer');
  if (!container) return;
  container.innerHTML = '';

  // 分页数据：每页 2 位
  for (let i = 0; i < filteredData.length; i += perPage) {
    const pageDiv = document.createElement('section');
    pageDiv.className = 'page';
    // 两个 slot
    for (let j = 0; j < perPage; ++j) {
      const idx = i + j;
      if (idx < filteredData.length) {
        const card = createCard(filteredData[idx], idx);
        pageDiv.appendChild(card);
      } else {
        // 放空占位，保持布局
        const ph = document.createElement('div');
        ph.style.width = '520px';
        pageDiv.appendChild(ph);
      }
    }
    container.appendChild(pageDiv);
  }

  // 如果没有数据，提示用户
  if (filteredData.length === 0) {
    const p = document.createElement('p');
    p.style.textAlign = 'center';
    p.style.color = '#666';
    p.style.marginTop = '40px';
    p.innerText = '暂无教师数据。管理员请上传 Excel。';
    container.appendChild(p);
  }
}

// ------------------------ 创建卡片 ------------------------
function createCard(s, index) {
  const div = document.createElement('div');
  div.className = 'card';

  const imgSrc = s.Photo ? `images/${s.Photo}` : (s['Photo URL'] ? s['Photo URL'] : `https://via.placeholder.com/180x180?text=${encodeURIComponent(s.Name||'No')}`);

  div.innerHTML = `
    <img src="${imgSrc}" alt="${escapeHtml(s.Name||'')}" loading="lazy">
    <div class="info">
      <h3 class="card-name">${escapeHtml(s.Name||'')}</h3>
      <p><strong>Email:</strong> ${escapeHtml(s.Email||'')}</p>
      <p><strong>Phone:</strong> ${escapeHtml(s.Phone||'')}</p>
      <p><strong>Office:</strong> ${escapeHtml(s.Office||'')}</p>
      <div class="links">
        <a class="profile-link" href="profile.html?id=${index}">站内主页</a>
        ${s['Profile URL'] ? `<a class="profile-link" style="background:#6b7280;" href="${s['Profile URL']}" target="_blank">外部页面</a>` : ''}
        <button class="poster-btn" data-idx="${index}" style="margin-left:8px;padding:8px;border-radius:8px;">生成海报</button>
      </div>
    </div>
  `;

  // 点击姓名或图片生成海报（与poster按钮相同）
  const img = div.querySelector('img');
  const nameEl = div.querySelector('.card-name');
  function posterHandler() { openPosterFor(index); }
  img.addEventListener('click', posterHandler);
  nameEl.addEventListener('click', () => { location.href = `profile.html?id=${index}`; }); // 点击姓名进入个人页

  const posterBtn = div.querySelector('.poster-btn');
  posterBtn.addEventListener('click', posterHandler);

  return div;
}

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ------------------------ 搜索 ------------------------
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

// ------------------------ 管理员上传（浏览器内） ------------------------
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
    renderScrollPages();
    alert('已在浏览器中更新显示（注意：此操作不会持久化到仓库）');
  };
  reader.readAsArrayBuffer(f);
}

// ------------------------ 个人主页渲染（profile.html 调用） ------------------------
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

// ------------------------ 海报生成（canvas） ------------------------
let currentPosterIndex = null;
function openPosterFor(index) {
  currentPosterIndex = index;
  const s = staffData[index];
  const canvas = document.getElementById('posterCanvas');
  if (!canvas) return alert('海报画布未找到');
  const ctx = canvas.getContext('2d');

  // 海报尺寸：1200x1600 (可打印 300dpi ≈ 4" * 5.3" —— 根据需要调整)
  const W = canvas.width;
  const H = canvas.height;
  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,W,H);

  // Accent band
  ctx.fillStyle = '#0b4f6c';
  ctx.fillRect(0,0,W,160);

  // 大标题（姓名）
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px "Segoe UI", Arial';
  ctx.fillText(s.Name || '', 40, 110);

  // 子标题：单位/职位（如果有 Profile URL 也可以取域名）
  ctx.font = '20px "Segoe UI"';
  ctx.fillStyle = '#e6f2f6';
  const sub = s.Office ? `Office: ${s.Office}` : (s['Profile URL'] ? s['Profile URL'] : '');
  if (sub) ctx.fillText(sub, 40, 142);

  // 左侧头像框
  const imgX = 60, imgY = 200, imgS = 420;
  // 画占位色块
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(imgX-6, imgY-6, imgS+12, imgS+12);

  // 异步加载图片然后绘制 & 继续绘制文字
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = s.Photo ? `images/${s.Photo}` : (s['Photo URL'] ? s['Photo URL'] : `https://via.placeholder.com/420x420?text=${encodeURIComponent(s.Name||'No')}`);
  img.onload = () => {
    // 裁剪成圆角（圆角矩形）
    drawRoundImage(ctx, img, imgX, imgY, imgS, imgS, 18);
    // 右侧信息
    drawPosterTexts(ctx, s, W, H, imgX + imgS + 40);
  };
  img.onerror = () => {
    // 即使图片加载失败，也继续绘制文本
    drawPosterTexts(ctx, s, W, H, imgX + imgS + 40);
  };

  // 显示 modal
  document.getElementById('posterModal').style.display = 'flex';
}

function drawPosterTexts(ctx, s, W, H, startX) {
  // startX 为右侧起始 x
  let y = 220;
  ctx.fillStyle = '#0b4f6c';
  ctx.font = '28px "Segoe UI"';
  ctx.fillText('Research', startX, y);
  y += 34;
  ctx.fillStyle = '#222';
  ctx.font = '18px "Segoe UI"';
  wrapText(ctx, s.Research || '—', startX, y, W - startX - 60, 26);
  y += 120;

  ctx.fillStyle = '#0b4f6c';
  ctx.font = '26px "Segoe UI"';
  ctx.fillText('Selected Papers', startX, y);
  y += 36;
  ctx.fillStyle = '#222';
  ctx.font = '16px "Segoe UI"';
  wrapText(ctx, s.Papers || '—', startX, y, W - startX - 60, 22);
  y += 160;

  ctx.fillStyle = '#0b4f6c';
  ctx.font = '20px "Segoe UI"';
  ctx.fillText('Contact', startX, y);
  y += 30;
  ctx.fillStyle = '#222';
  ctx.font = '16px "Segoe UI"';
  ctx.fillText(`Email: ${s.Email || '—'}`, startX, y); y += 28;
  ctx.fillText(`Phone: ${s.Phone || '—'}`, startX, y); y += 28;
  ctx.fillText(`Office: ${s.Office || '—'}`, startX, y); y += 40;

  // 下方加一个小二维码（这里我们画一个占位方块，并在旁边写 profile 链接）
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(W - 240, H - 240, 180, 180);
  ctx.fillStyle = '#666';
  ctx.font = '14px "Segoe UI"';
  ctx.fillText('Scan to open profile:', startX, H - 120);
  ctx.fillStyle = '#0b4f6c';
  ctx.fillText(s['Profile URL'] ? s['Profile URL'] : `profile.html?id=${currentPosterIndex}`, startX, H - 96);
}

// small helper: rounded image
function drawRoundImage(ctx, img, x, y, w, h, r) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  // cover
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx=0, sy=0, sw=img.width, sh=img.height;
  if (imgRatio > boxRatio) {
    // image wider -> cut sides
    sh = img.height;
    sw = sh * boxRatio;
    sx = (img.width - sw)/2;
  } else {
    // taller -> cut top/bottom
    sw = img.width;
    sh = sw / boxRatio;
    sy = (img.height - sh)/2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

// text wrap
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(/;|\n/).map(s => s.trim()).filter(Boolean);
  let curY = y;
  for (let i=0;i<words.length;i++) {
    let line = words[i];
    // if too long, break further
    while (ctx.measureText(line).width > maxWidth) {
      // binary chop
      let fit = line.length;
      while (ctx.measureText(line.substring(0,fit)).width > maxWidth) fit--;
      ctx.fillText(line.substring(0,fit), x, curY);
      line = line.substring(fit);
      curY += lineHeight;
    }
    ctx.fillText(line, x, curY);
    curY += lineHeight;
  }
}

// ------------------------ 海报控制 ------------------------
function closePoster() {
  document.getElementById('posterModal').style.display = 'none';
}
function downloadPoster() {
  const canvas = document.getElementById('posterCanvas');
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = `poster_${(staffData[currentPosterIndex] && staffData[currentPosterIndex].Name)||'staff'}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ------------------------ 初始加载 ------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await loadStaffData();
  renderScrollPages();

  // 绑定上传 file change
  const fileInput = document.getElementById('uploadExcel');
  if (fileInput) {
    fileInput.addEventListener('change', () => {});
  }
});
