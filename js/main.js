/* ---------- 图片缓存（避免重复加载） ---------- */
const imageCache = new Map(); // url -> Promise<HTMLImageElement>

/** loadImageCached(url) -> Promise<HTMLImageElement>
 *  返回一个 Promise，在图片加载好后 resolve，若失败也 resolve（占位图）
 */
function loadImageCached(url) {
  if (!url) url = `https://via.placeholder.com/420x420?text=No+Image`;
  if (imageCache.has(url)) return imageCache.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      // fallback placeholder
      const ph = new Image();
      ph.src = `https://via.placeholder.com/420x420?text=No+Image`;
      ph.onload = () => resolve(ph);
      ph.onerror = () => resolve(ph);
    };
    img.src = url;
  });
  imageCache.set(url, p);
  return p;
}

/* ---------- 卡片渲染：移除按钮，绑定交互（图片->海报，名字->个人页） ---------- */
function createCard(s, index) {
  const div = document.createElement('div');
  div.className = 'card';

  // 图片来源优先 Photo / Photo URL，再降级 placeholder
  const imgSrc = s.Photo ? `images/${s.Photo}` : (s['Photo URL'] ? s['Photo URL'] : `https://via.placeholder.com/180x180?text=${encodeURIComponent(s.Name||'No')}`);

  div.innerHTML = `
    <img src="${imgSrc}" alt="${escapeHtml(s.Name||'')}" loading="lazy">
    <div class="info">
      <h3 class="card-name" style="cursor:pointer">${escapeHtml(s.Name||'')}</h3>
      <p><strong>Email:</strong> ${escapeHtml(s.Email||'')}</p>
      <p><strong>Phone:</strong> ${escapeHtml(s.Phone||'')}</p>
      <p><strong>Office:</strong> ${escapeHtml(s.Office||'')}</p>
      <div class="links" style="margin-top:8px;">
        <!-- 去掉显式按钮；姓名/图片有交互 -->
      </div>
    </div>
  `;

  const img = div.querySelector('img');
  const nameEl = div.querySelector('.card-name');

  // 点击图片 -> 生成海报
  img.addEventListener('click', (e) => {
    e.preventDefault();
    openPosterFor(index);
  });

  // 点击姓名 -> 跳转到站内个人主页
  nameEl.addEventListener('click', () => {
    location.href = `profile.html?id=${index}`;
  });

  return div;
}

/* ---------- 海报生成：两阶段渲染（快速预览 + 高清替换） ---------- */
let currentPosterIndex = null;
const posterHighResCache = new Map(); // index -> dataURL (high res) 防止重复生成

async function openPosterFor(index) {
  currentPosterIndex = index;
  const s = staffData[index];
  if (!s) return alert('未找到该教师数据');

  const modal = document.getElementById('posterModal');
  const canvas = document.getElementById('posterCanvas');
  const ctx = canvas.getContext('2d');

  // 显示 modal 立即展示 loading / 低分辨率预览
  modal.style.display = 'flex';
  // 先用较小分辨率快速渲染（preview）
  await renderPosterPreview(s, canvas, ctx);

  // 若已有高分辨率缓存，直接用缓存
  if (posterHighResCache.has(index)) {
    const dataUrl = posterHighResCache.get(index);
    const img = new Image();
    img.onload = () => {
      // 用高分辨率图替换 canvas（保持画面）
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
    return;
  }

  // 异步生成高分辨率并缓存（不阻塞 UI）
  generatePosterHighRes(s, index).then((dataUrl) => {
    posterHighResCache.set(index, dataUrl);
    // 若用户仍在 modal 中并且仍是当前 index，则替换画面
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

/* renderPosterPreview: 快速、低分辨率的海报渲染（让用户立即看到效果） */
async function renderPosterPreview(s, canvas, ctx) {
  // preview canvas smaller: set to 600x800 for speed (canvas 元素仍然为高分也可)
  const PRE_W = 600, PRE_H = 800;
  canvas.width = PRE_W;
  canvas.height = PRE_H;

  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,PRE_W,PRE_H);

  // 顶部色条
  ctx.fillStyle = '#0b4f6c';
  ctx.fillRect(0,0,PRE_W,110);

  // 姓名
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px "Segoe UI", Arial';
  ctx.fillText(s.Name || '', 30, 76);

  // 头像快速占位
  const imgX = 40, imgY = 150, imgS = 260;
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(imgX, imgY, imgS, imgS);

  // 文字快速渲染（研究与论文的第一行）
  ctx.fillStyle = '#222';
  ctx.font = '14px "Segoe UI"';
  ctx.fillText('Research: ' + (s.Research ? s.Research.split(';')[0] : '—'), imgX + imgS + 20, imgY + 10);
  ctx.fillText('Email: ' + (s.Email || '—'), imgX + imgS + 20, imgY + 40);

  // load image (cached) and draw into preview (may be lower-res scaled)
  const imgUrl = s.Photo ? `images/${s.Photo}` : (s['Photo URL'] ? s['Photo URL'] : `https://via.placeholder.com/420x420?text=${encodeURIComponent(s.Name||'No')}`);
  try {
    const img = await loadImageCached(imgUrl);
    // draw image fit
    drawRoundImageSimple(ctx, img, imgX, imgY, imgS, imgS, 12);
  } catch(e){
    // ignore, preview already ok
    console.warn('preview image load failed', e);
  }
}

/* generatePosterHighRes: 返回 Promise<dataURL> (高分辨率 PNG) */
async function generatePosterHighRes(s, index) {
  // high-res canvas: 1200x1600
  const W = 1200, H = 1600;
  // 创建离线 canvas（动态）
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const ctx = off.getContext('2d');

  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,W,H);

  // accent top bar + school name/logo
  ctx.fillStyle = '#0b4f6c';
  ctx.fillRect(0,0,W,140);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 48px "Segoe UI", Arial';
  ctx.fillText(s.Name || '', 60, 96);

  // left big image
  const imgX = 70, imgY = 200, imgS = 520;
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(imgX-8, imgY-8, imgS+16, imgS+16);

  const imgUrl = s.Photo ? `images/${s.Photo}` : (s['Photo URL'] ? s['Photo URL'] : `https://via.placeholder.com/420x420?text=${encodeURIComponent(s.Name||'No')}`);
  const img = await loadImageCached(imgUrl);
  drawRoundImage(ctx, img, imgX, imgY, imgS, imgS, 20);

  // right texts
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

  // Add QR code image (via Google Chart API) bottom-right
  const qrSize = 280;
  const qrX = W - qrSize - 80;
  const qrY = H - qrSize - 80;
  const profileUrl = s['Profile URL'] ? s['Profile URL'] : (`${location.origin}${location.pathname.replace(/\/[^/]*$/,'/') }profile.html?id=${index}`);
  const qrSrc = `https://chart.googleapis.com/chart?cht=qr&chs=${qrSize}x${qrSize}&chl=${encodeURIComponent(profileUrl)}&chld=L|2`;
  try {
    const qrImg = await loadImageCached(qrSrc);
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  } catch(e) {
    // fallback: draw placeholder box
    ctx.fillStyle = '#efefef';
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
    ctx.fillStyle = '#666';
    ctx.font = '16px "Segoe UI"';
    ctx.fillText('QR unavailable', qrX + 12, qrY + 20);
  }

  // small footer text
  ctx.fillStyle = '#666';
  ctx.font = '16px "Segoe UI"';
  ctx.fillText('Generated by Academy Staff Directory', 80, H - 40);

  // 返回 dataURL
  return off.toDataURL('image/png');
}

/* ---------- 辅助绘图函数（用于高/低分辨率绘制） ---------- */
function drawRoundImageSimple(ctx, img, x, y, w, h, r) {
  try {
    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.clip();
    // simple cover
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  } catch(e){ console.warn('drawRoundImageSimple err', e); }
}

function drawRoundImage(ctx, img, x, y, w, h, r) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  // cover behaviour
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx=0, sy=0, sw=img.width, sh=img.height;
  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio;
    sx = (img.width - sw)/2;
  } else {
    sh = img.width / boxRatio;
    sy = (img.height - sh)/2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

/* wrapText: same as before (把 ; 或换行当作分行) */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(/;|\n/).map(s => s.trim()).filter(Boolean);
  let curY = y;
  for (let i=0;i<words.length;i++) {
    let line = words[i];
    while (ctx.measureText(line).width > maxWidth) {
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

/* ---------- 关闭 / 下载函数（下载使用高分辨率缓存，若尚未生成则提示等待） ---------- */
function closePoster() {
  currentPosterIndex = null;
  document.getElementById('posterModal').style.display = 'none';
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
    // 如果高分还没生成，则先提示，并触发一次生成（若未触发）
    alert('高清海报尚在生成中，稍等数秒后再下载（或重试）。');
    // 触发后台生成（若尚未开始）
    generatePosterHighRes(staffData[idx], idx).then(dataUrl => {
      posterHighResCache.set(idx, dataUrl);
      // 自动触发下载
      const link = document.createElement('a');
      link.download = `poster_${(staffData[idx] && staffData[idx].Name)||'staff'}.png`;
      link.href = dataUrl;
      link.click();
    }).catch(err => {
      console.error(err);
      alert('生成失败，请检查控制台。');
    });
  }
}
