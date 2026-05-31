const FETCH_TIMEOUT = 45000;

async function fetchWithTimeout(url, options, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function fmtTime(secs) {
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function timeStr(m, s) {
  return `00:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
function hideError(el) { el.classList.add('hidden'); }

// ---- TABS ----
const MAIL_PASS = 'AS12!DF31';
let mailUnlocked = false;

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const tab = document.getElementById('tab-' + btn.dataset.tab);
    if (btn.dataset.tab === 'mail' && !mailUnlocked) {
      const pwd = prompt('Mail araçlarına erişmek için şifre girin:');
      if (pwd === MAIL_PASS) { mailUnlocked = true; tab.classList.add('active'); }
      else { alert('Yanlış şifre'); document.querySelectorAll('.tab-btn')[0].click(); }
    } else {
      tab.classList.add('active');
    }
  });
});

// ---- CONVERTER ----
const convUrl = document.getElementById('convUrl');
const convLoadBtn = document.getElementById('convLoadBtn');
const convError = document.getElementById('convError');
const convInfo = document.getElementById('convInfo');
const convThumb = document.getElementById('convThumb');
const convTitle = document.getElementById('convTitle');
const convAuthor = document.getElementById('convAuthor');
const convDuration = document.getElementById('convDuration');
const convPlatform = document.getElementById('convPlatform');
const qualitySelect = document.getElementById('qualitySelect');
const convertBtn = document.getElementById('convertBtn');
const sendToTrimBtn = document.getElementById('sendToTrimBtn');
const convProgress = document.getElementById('convProgress');
const convProgressFill = document.getElementById('convProgressFill');
const convProgressText = document.getElementById('convProgressText');

const platformIcons = {
  Youtube: '▶', Instagram: '📷', Twitter: '🐦', TikTok: '🎵',
  Facebook: '📘', Soundcloud: '🎧', Vimeo: '🎥', Twitch: '📺', 'Twitch:Vod': '📺',
  Dailymotion: '🎬', Bilibili: '📹', Kick: '🎙'
};
const platformColors = {
  Youtube: '#ff0033', Instagram: '#e1306c', Twitter: '#1da1f2',
  TikTok: '#00f2ea', Facebook: '#1877f2', Soundcloud: '#ff7700',
  Vimeo: '#1ab7ea', Twitch: '#9146ff', 'Twitch:Vod': '#9146ff',
  Dailymotion: '#0a0a0a', Bilibili: '#00a1d6', Kick: '#53fc18'
};

const mp4Qualities = ['360p', '480p', '720p', '1080p'];
const mp3Bitrates = ['128', '192', '320'];

let convUrlValue = '';
let convTitleText = '';

document.querySelectorAll('input[name="fmt"]').forEach(r => r.addEventListener('change', updateQualityOptions));
document.querySelector('input[name="fmt"][value="mp4"]').checked = true;
updateQualityOptions();

function updateQualityOptions() {
  const isMp3 = document.querySelector('input[name="fmt"]:checked').value === 'mp3';
  qualitySelect.innerHTML = '';
  (isMp3 ? mp3Bitrates : mp4Qualities).forEach(q => {
    const opt = document.createElement('option');
    opt.value = q;
    opt.textContent = isMp3 ? q + ' kbps' : q;
    if (q === (isMp3 ? '192' : '720p')) opt.selected = true;
    qualitySelect.appendChild(opt);
  });
}

convUrl.addEventListener('keydown', e => { if (e.key === 'Enter') loadConvInfo(); });
convLoadBtn.addEventListener('click', loadConvInfo);

async function loadConvInfo() {
  const url = convUrl.value.trim();
  if (!url) { showError(convError, 'URL girin'); return; }
  hideError(convError);
  convLoadBtn.disabled = true; convLoadBtn.textContent = 'Bilgi alınıyor...';
  try {
    const res = await fetchWithTimeout('/api/info', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) { showError(convError, data.error); convLoadBtn.disabled = false; convLoadBtn.textContent = 'Bilgi Al'; return; }
    convUrlValue = data.webpage_url || url;
    convTitleText = data.title;
    convThumb.src = data.thumbnail;
    convTitle.textContent = data.title;
    convAuthor.textContent = data.author || '';
    convDuration.textContent = '⏱ ' + fmtTime(data.duration);
    const ext = data.extractor;
    const icon = platformIcons[ext] || '🌐';
    const color = platformColors[ext] || '#888';
    convPlatform.innerHTML = `<span style="color:${color};font-weight:700">${icon} ${ext || 'Diğer'}</span>`;
    convPlatform.classList.remove('hidden');
    convInfo.classList.remove('hidden');
  } catch (err) {
    showError(convError, err.name === 'AbortError' ? 'Sunucu yanıt vermiyor. server.js çalışıyor mu?' : 'Hata: ' + err.message);
  }
  convLoadBtn.disabled = false; convLoadBtn.textContent = 'Bilgi Al';
}

convertBtn.addEventListener('click', async () => {
  if (!convUrlValue) return;
  const fmt = document.querySelector('input[name="fmt"]:checked').value;
  const quality = qualitySelect.value;
  convertBtn.disabled = true; sendToTrimBtn.disabled = true;
  convProgress.classList.remove('hidden');
  convProgressFill.style.width = '10%';
  convProgressText.textContent = 'İndiriliyor...';
  try {
    const res = await fetchWithTimeout('/api/convert', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: convUrlValue, format: fmt, quality })
    });
    const data = await res.json();
    if (!res.ok) { convProgressText.textContent = 'Hata: ' + data.error; convertBtn.disabled = false; sendToTrimBtn.disabled = false; return; }
    convProgressFill.style.width = '80%';
    convProgressText.textContent = 'İndirme hazırlanıyor...';
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '.' + fmt;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      convProgressFill.style.width = '100%';
      convProgressText.textContent = '✅ Tamamlandı!';
      setTimeout(() => { convProgress.classList.add('hidden'); convProgressFill.style.width = '0%'; convertBtn.disabled = false; sendToTrimBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    convProgressText.textContent = 'Hata: ' + (err.name === 'AbortError' ? 'Zaman aşımı' : err.message);
    convertBtn.disabled = false; sendToTrimBtn.disabled = false;
  }
});

sendToTrimBtn.addEventListener('click', () => {
  if (!convUrlValue) return;
  document.querySelectorAll('.tab-btn')[7].click();
  loadTrimVideo(convUrlValue, convTitleText);
});

// ---- TRIMMER ----
const fileInput = document.getElementById('fileInput');
const selectFileBtn = document.getElementById('selectFileBtn');
const uploadArea = document.getElementById('uploadArea');
const uploadInfo = document.getElementById('uploadInfo');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const clearFileBtn = document.getElementById('clearFileBtn');
const trimSection = document.getElementById('trimSection');
const trimPlayer = document.getElementById('trimPlayer');
const trimStartMin = document.getElementById('trimStartMin');
const trimStartSec = document.getElementById('trimStartSec');
const trimEndMin = document.getElementById('trimEndMin');
const trimEndSec = document.getElementById('trimEndSec');
const setTrimStartBtn = document.getElementById('setTrimStartBtn');
const setTrimEndBtn = document.getElementById('setTrimEndBtn');
const trimDownloadBtn = document.getElementById('trimDownloadBtn');
const trimProgress = document.getElementById('trimProgress');
const trimProgressFill = document.getElementById('trimProgressFill');
const trimProgressText = document.getElementById('trimProgressText');
const trimError = document.getElementById('trimError');

let trimFile = null;
let trimUrl = '';
let trimTitle = '';

function showTrimVideo(src) {
  trimSection.classList.remove('hidden');
  trimPlayer.src = src;
  trimPlayer.onloadedmetadata = () => {
    trimEndMin.value = Math.floor(trimPlayer.duration / 60);
    trimEndSec.value = Math.floor(trimPlayer.duration % 60);
  };
  trimPlayer.onerror = () => {};
}

selectFileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  if (e.target.files.length > 0) {
    trimFile = e.target.files[0];
    trimUrl = '';
    fileNameDisplay.textContent = '📁 ' + trimFile.name;
    uploadInfo.classList.remove('hidden');
    showTrimVideo(URL.createObjectURL(trimFile));
  }
});

uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.borderColor = 'var(--blue)'; });
uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
uploadArea.addEventListener('drop', e => {
  e.preventDefault(); uploadArea.style.borderColor = '';
  if (e.dataTransfer.files.length > 0) {
    trimFile = e.dataTransfer.files[0];
    trimUrl = '';
    fileNameDisplay.textContent = '📁 ' + trimFile.name;
    uploadInfo.classList.remove('hidden');
    showTrimVideo(URL.createObjectURL(trimFile));
  }
});

clearFileBtn.addEventListener('click', () => {
  trimFile = null; trimUrl = ''; trimTitle = '';
  fileInput.value = '';
  uploadInfo.classList.add('hidden');
  trimSection.classList.add('hidden');
  trimPlayer.src = '';
});

setTrimStartBtn.addEventListener('click', () => {
  const ct = trimPlayer.currentTime || 0;
  trimStartMin.value = Math.floor(ct / 60);
  trimStartSec.value = Math.floor(ct % 60);
});
setTrimEndBtn.addEventListener('click', () => {
  const ct = trimPlayer.currentTime || 0;
  trimEndMin.value = Math.floor(ct / 60);
  trimEndSec.value = Math.floor(ct % 60);
});

trimDownloadBtn.addEventListener('click', async () => {
  hideError(trimError);
  const start = timeStr(trimStartMin.value || 0, trimStartSec.value || 0);
  const end = timeStr(trimEndMin.value || 0, trimEndSec.value || 0);
  trimDownloadBtn.disabled = true;
  trimProgress.classList.remove('hidden');
  trimProgressFill.style.width = '10%';
  trimProgressText.textContent = 'İşleniyor...';
  try {
    let res;
    if (trimFile) {
      const form = new FormData();
      form.append('video', trimFile);
      form.append('startTime', start);
      form.append('endTime', end);
      res = await fetchWithTimeout('/api/trim', { method: 'POST', body: form });
    } else if (trimUrl) {
      res = await fetchWithTimeout('/api/trim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimUrl, startTime: start, endTime: end })
      });
    } else {
      showError(trimError, 'Önce bir video yükleyin veya Dönüştürücü\'den gönderin');
      trimDownloadBtn.disabled = false; return;
    }
    const data = await res.json();
    if (!res.ok) { trimProgressText.textContent = 'Hata: ' + data.error; trimDownloadBtn.disabled = false; return; }
    trimProgressFill.style.width = '70%';
    trimProgressText.textContent = 'Kesiliyor...';
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '_kesilmis.mp4';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      trimProgressFill.style.width = '100%';
      trimProgressText.textContent = '✅ İndiriliyor!';
      setTimeout(() => { trimProgress.classList.add('hidden'); trimProgressFill.style.width = '0%'; trimDownloadBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    trimProgressText.textContent = 'Hata: ' + (err.name === 'AbortError' ? 'Sunucu yanıt vermedi' : err.message);
    trimDownloadBtn.disabled = false;
  }
});

async function loadTrimVideo(url, title) {
  trimUrl = url; trimTitle = title;
  trimFile = null; fileInput.value = '';
  uploadInfo.classList.remove('hidden');
  fileNameDisplay.textContent = '🎬 ' + title + ' (önce dönüştürüp dosyayı yükleyin)';
  trimSection.classList.remove('hidden');
  trimPlayer.src = '';
  document.querySelector('.upload-area p').textContent = 'Dönüştürücü\'den MP4 indirin, sonra buraya yükleyin';
  hideError(trimError);
  trimDownloadBtn.disabled = false;
  try {
    const res = await fetchWithTimeout('/api/info', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (res.ok) {
      trimEndMin.value = Math.floor(data.duration / 60);
      trimEndSec.value = Math.floor(data.duration % 60);
    }
  } catch {}
}

// ---- COMPRESSOR ----
const compUrl = document.getElementById('compUrl');
const compLoadBtn = document.getElementById('compLoadBtn');
const compUploadArea = document.getElementById('compUploadArea');
const compFileInput = document.getElementById('compFileInput');
const compSelectBtn = document.getElementById('compSelectBtn');
const compFileInfo = document.getElementById('compFileInfo');
const compFileName = document.getElementById('compFileName');
const compClearBtn = document.getElementById('compClearBtn');
const compError = document.getElementById('compError');
const compSection = document.getElementById('compSection');
const compSizeInfo = document.getElementById('compSizeInfo');
const compressBtn = document.getElementById('compressBtn');
const compProgress = document.getElementById('compProgress');
const compProgressFill = document.getElementById('compProgressFill');
const compProgressText = document.getElementById('compProgressText');
const compResult = document.getElementById('compResult');
const compResultText = document.getElementById('compResultText');
const compDownloadBtn = document.getElementById('compDownloadBtn');

let compFile = null;
let compUrlValue = '';
let compTitleText = '';

compSelectBtn.addEventListener('click', () => compFileInput.click());
compFileInput.addEventListener('change', e => {
  if (e.target.files.length > 0) {
    compFile = e.target.files[0];
    compUrlValue = '';
    compFileName.textContent = '📁 ' + compFile.name + ' (' + fmtSize(compFile.size) + ')';
    compFileInfo.classList.remove('hidden');
    compSection.classList.remove('hidden');
    compSizeInfo.textContent = 'Orijinal: ' + fmtSize(compFile.size);
  }
});
compUploadArea.addEventListener('dragover', e => { e.preventDefault(); compUploadArea.style.borderColor = 'var(--blue)'; });
compUploadArea.addEventListener('dragleave', () => { compUploadArea.style.borderColor = ''; });
compUploadArea.addEventListener('drop', e => {
  e.preventDefault(); compUploadArea.style.borderColor = '';
  if (e.dataTransfer.files.length > 0) {
    compFile = e.dataTransfer.files[0];
    compUrlValue = '';
    compFileName.textContent = '📁 ' + compFile.name + ' (' + fmtSize(compFile.size) + ')';
    compFileInfo.classList.remove('hidden');
    compSection.classList.remove('hidden');
    compSizeInfo.textContent = 'Orijinal: ' + fmtSize(compFile.size);
  }
});
compClearBtn.addEventListener('click', () => {
  compFile = null; compUrlValue = ''; compTitleText = '';
  compFileInput.value = '';
  compFileInfo.classList.add('hidden');
  compSection.classList.add('hidden');
  compResult.classList.add('hidden');
  compSizeInfo.textContent = 'Henüz dosya seçilmedi';
});

compLoadBtn.addEventListener('click', async () => {
  const url = compUrl.value.trim();
  if (!url) { showError(compError, 'URL girin'); return; }
  hideError(compError);
  compLoadBtn.disabled = true; compLoadBtn.textContent = 'Bilgi alınıyor...';
  try {
    const res = await fetchWithTimeout('/api/info', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) { showError(compError, data.error); compLoadBtn.disabled = false; compLoadBtn.textContent = 'Bilgi Al'; return; }
    compUrlValue = data.webpage_url || url;
    compTitleText = data.title;
    compFileName.textContent = '🎬 ' + data.title;
    compFileInfo.classList.remove('hidden');
    compSection.classList.remove('hidden');
    compSizeInfo.textContent = 'Dosya boyutu indirme sonrası belli olacak';
    compFile = null;
  } catch (err) {
    showError(compError, err.name === 'AbortError' ? 'Sunucu yanıt vermiyor' : 'Hata: ' + err.message);
  }
  compLoadBtn.disabled = false; compLoadBtn.textContent = 'Bilgi Al';
});

function fmtSize(bytes) {
  if (!bytes) return '?';
  const s = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + s[i];
}

compressBtn.addEventListener('click', async () => {
  if (!compUrlValue && !compFile) { showError(compError, 'Önce bir URL gir veya dosya seç'); return; }
  hideError(compError);
  const level = document.querySelector('input[name="clvl"]:checked').value;
  compressBtn.disabled = true;
  compProgress.classList.remove('hidden');
  compResult.classList.add('hidden');
  compProgressFill.style.width = '5%';
  compProgressText.textContent = 'Sıkıştırılıyor...';
  try {
    let res;
    if (compFile) {
      const form = new FormData();
      form.append('video', compFile);
      form.append('level', level);
      res = await fetchWithTimeout('/api/compress', { method: 'POST', body: form });
    } else {
      res = await fetchWithTimeout('/api/compress', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: compUrlValue, level })
      });
    }
    const data = await res.json();
    if (!res.ok) { compProgressText.textContent = 'Hata: ' + data.error; compressBtn.disabled = false; return; }
    compProgressFill.style.width = '90%';
    compProgressText.textContent = 'Hazırlanıyor...';
    compResultText.textContent = '✨ ' + fmtSize(data.original) + ' → ' + fmtSize(data.compressed) + ' (%' + data.savings + ' küçüldü)';
    if (data.savings < 1) compResultText.textContent = '⚠️ Dosya zaten küçük, çok değişmedi (' + fmtSize(data.compressed) + ')';
    compResult.classList.remove('hidden');
    compSizeInfo.textContent = 'Sıkıştırma: ' + data.level + ' | Orijinal: ' + fmtSize(data.original) + ' → ' + fmtSize(data.compressed);
    compDownloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '_sikistirilmis.mp4';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    setTimeout(() => {
      compProgressFill.style.width = '100%';
      compProgressText.textContent = '✅ Tamamlandı!';
      setTimeout(() => { compProgress.classList.add('hidden'); compProgressFill.style.width = '0%'; compressBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    compProgressText.textContent = 'Hata: ' + (err.name === 'AbortError' ? 'Zaman aşımı' : err.message);
    compressBtn.disabled = false;
  }
});

// ---- FILE TOOLS ----
const filesUploadArea = document.getElementById('filesUploadArea');
const filesFileInput = document.getElementById('filesFileInput');
const filesSelectBtn = document.getElementById('filesSelectBtn');
const filesFileInfo = document.getElementById('filesFileInfo');
const filesFileName = document.getElementById('filesFileName');
const filesClearBtn = document.getElementById('filesClearBtn');
const filesError = document.getElementById('filesError');
const filesSection = document.getElementById('filesSection');
const filesSizeInfo = document.getElementById('filesSizeInfo');
const filesProcessBtn = document.getElementById('filesProcessBtn');
const filesProgress = document.getElementById('filesProgress');
const filesProgressFill = document.getElementById('filesProgressFill');
const filesProgressText = document.getElementById('filesProgressText');
const filesResult = document.getElementById('filesResult');
const filesResultText = document.getElementById('filesResultText');
const filesDownloadBtn = document.getElementById('filesDownloadBtn');
const filesTargetFormat = document.getElementById('filesTargetFormat');
const filesFormatGroup = document.getElementById('filesFormatGroup');

let filesFile = null;

document.querySelectorAll('input[name="fop"]').forEach(r => r.addEventListener('change', () => {
  const op = document.querySelector('input[name="fop"]:checked').value;
  filesFormatGroup.style.display = op === 'convert' ? '' : 'none';
}));

filesSelectBtn.addEventListener('click', () => filesFileInput.click());
filesFileInput.addEventListener('change', e => {
  if (e.target.files.length > 0) {
    filesFile = e.target.files[0];
    filesFileName.textContent = '📁 ' + filesFile.name + ' (' + fmtSize(filesFile.size) + ')';
    filesFileInfo.classList.remove('hidden');
    filesSection.classList.remove('hidden');
    filesSizeInfo.textContent = 'Dosya: ' + fmtSize(filesFile.size);
  }
});
filesUploadArea.addEventListener('dragover', e => { e.preventDefault(); filesUploadArea.style.borderColor = 'var(--blue)'; });
filesUploadArea.addEventListener('dragleave', () => { filesUploadArea.style.borderColor = ''; });
filesUploadArea.addEventListener('drop', e => {
  e.preventDefault(); filesUploadArea.style.borderColor = '';
  if (e.dataTransfer.files.length > 0) {
    filesFile = e.dataTransfer.files[0];
    filesFileName.textContent = '📁 ' + filesFile.name + ' (' + fmtSize(filesFile.size) + ')';
    filesFileInfo.classList.remove('hidden');
    filesSection.classList.remove('hidden');
    filesSizeInfo.textContent = 'Dosya: ' + fmtSize(filesFile.size);
  }
});
filesClearBtn.addEventListener('click', () => {
  filesFile = null;
  filesFileInput.value = '';
  filesFileInfo.classList.add('hidden');
  filesSection.classList.add('hidden');
  filesResult.classList.add('hidden');
  filesSizeInfo.textContent = '';
});

filesProcessBtn.addEventListener('click', async () => {
  if (!filesFile) { showError(filesError, 'Önce bir dosya seç'); return; }
  hideError(filesError);
  const op = document.querySelector('input[name="fop"]:checked').value;
  const format = filesTargetFormat.value;
  filesProcessBtn.disabled = true;
  filesProgress.classList.remove('hidden');
  filesResult.classList.add('hidden');
  filesProgressFill.style.width = '5%';
  filesProgressText.textContent = op === 'zip' ? 'ZIP sıkıştırılıyor...' : op === 'unzip' ? 'ZIP açılıyor...' : 'Dönüştürülüyor...';
  try {
    const form = new FormData();
    form.append('file', filesFile);
    form.append('op', op);
    form.append('format', format);
    const res = await fetchWithTimeout('/api/convert-file', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) { filesProgressText.textContent = 'Hata: ' + data.error; filesProcessBtn.disabled = false; return; }
    filesProgressFill.style.width = '90%';
    filesProgressText.textContent = 'Hazırlanıyor...';
    let msg;
    if (op === 'zip') msg = '🗜 ZIP yapıldı! ' + fmtSize(data.original) + ' → ' + fmtSize(data.compressed) + ' (%' + data.savings + ' küçüldü)';
    else if (op === 'unzip') msg = '📂 ZIP açıldı!';
    else msg = '✅ ' + format.toUpperCase() + ' dönüştürüldü!';
    filesResultText.textContent = msg;
    filesResult.classList.remove('hidden');
    filesSizeInfo.textContent = data.original ? 'Orijinal: ' + fmtSize(data.original) + ' → ' + fmtSize(data.compressed) : '';
    const ext = op === 'unzip' ? data.file.split('.').pop() : format || 'zip';
    filesDownloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '.' + ext;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    setTimeout(() => {
      filesProgressFill.style.width = '100%';
      filesProgressText.textContent = '✅ Tamamlandı!';
      setTimeout(() => { filesProgress.classList.add('hidden'); filesProgressFill.style.width = '0%'; filesProcessBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    filesProgressText.textContent = 'Hata: ' + (err.name === 'AbortError' ? 'Zaman aşımı' : err.message);
    filesProcessBtn.disabled = false;
  }
});

// ---- PDF CONVERTER ----
const pdfUploadArea = document.getElementById('pdfUploadArea');
const pdfFileInput = document.getElementById('pdfFileInput');
const pdfSelectBtn = document.getElementById('pdfSelectBtn');
const pdfFileInfo = document.getElementById('pdfFileInfo');
const pdfFileName = document.getElementById('pdfFileName');
const pdfClearBtn = document.getElementById('pdfClearBtn');
const pdfError = document.getElementById('pdfError');
const pdfSection = document.getElementById('pdfSection');
const pdfPreview = document.getElementById('pdfPreview');
const pdfConvertBtn = document.getElementById('pdfConvertBtn');
const pdfProgress = document.getElementById('pdfProgress');
const pdfProgressFill = document.getElementById('pdfProgressFill');
const pdfProgressText = document.getElementById('pdfProgressText');
const pdfResult = document.getElementById('pdfResult');
const pdfResultText = document.getElementById('pdfResultText');
const pdfDownloadBtn = document.getElementById('pdfDownloadBtn');

let pdfFile = null;

pdfSelectBtn.addEventListener('click', () => pdfFileInput.click());
pdfFileInput.addEventListener('change', e => {
  if (e.target.files.length > 0) {
    pdfFile = e.target.files[0];
    pdfFileName.textContent = '📁 ' + pdfFile.name + ' (' + fmtSize(pdfFile.size) + ')';
    pdfFileInfo.classList.remove('hidden');
    pdfSection.classList.remove('hidden');
    pdfResult.classList.add('hidden');
    const ext = pdfFile.name.split('.').pop().toLowerCase();
    if (['txt','csv','md','json','xml','log','ini','cfg','yaml','yml','env','docx'].includes(ext)) {
      const reader = new FileReader();
      reader.onload = () => {
        pdfPreview.textContent = reader.result.slice(0, 3000) + (reader.result.length > 3000 ? '\n...' : '');
        pdfPreview.classList.remove('hidden');
      };
      if (ext === 'docx') { pdfPreview.textContent = '(DOCX dosyası - içerik sunucuda okunacak)'; pdfPreview.classList.remove('hidden'); }
      else reader.readAsText(pdfFile);
    } else { pdfPreview.classList.add('hidden'); }
    pdfError.classList.add('hidden');
  }
});
pdfUploadArea.addEventListener('dragover', e => { e.preventDefault(); pdfUploadArea.style.borderColor = 'var(--blue)'; });
pdfUploadArea.addEventListener('dragleave', () => { pdfUploadArea.style.borderColor = ''; });
pdfUploadArea.addEventListener('drop', e => {
  e.preventDefault(); pdfUploadArea.style.borderColor = '';
  if (e.dataTransfer.files.length > 0) {
    pdfFile = e.dataTransfer.files[0];
    pdfFileName.textContent = '📁 ' + pdfFile.name + ' (' + fmtSize(pdfFile.size) + ')';
    pdfFileInfo.classList.remove('hidden');
    pdfSection.classList.remove('hidden');
    pdfResult.classList.add('hidden');
    pdfPreview.classList.add('hidden');
  }
});
pdfClearBtn.addEventListener('click', () => {
  pdfFile = null; pdfFileInput.value = '';
  pdfFileInfo.classList.add('hidden'); pdfSection.classList.add('hidden');
  pdfResult.classList.add('hidden'); pdfPreview.classList.add('hidden');
});

pdfConvertBtn.addEventListener('click', async () => {
  if (!pdfFile) { showError(pdfError, 'Önce bir dosya seç'); return; }
  hideError(pdfError);
  pdfConvertBtn.disabled = true;
  pdfProgress.classList.remove('hidden'); pdfResult.classList.add('hidden');
  pdfProgressFill.style.width = '10%'; pdfProgressText.textContent = 'PDF oluşturuluyor...';
  try {
    const form = new FormData();
    form.append('file', pdfFile);
    const res = await fetchWithTimeout('/api/pdf-convert', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) { pdfProgressText.textContent = 'Hata: ' + data.error; pdfConvertBtn.disabled = false; return; }
    pdfProgressFill.style.width = '80%'; pdfProgressText.textContent = 'Hazırlanıyor...';
    pdfResultText.textContent = '✅ PDF hazır!';
    pdfResult.classList.remove('hidden');
    pdfDownloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    setTimeout(() => {
      pdfProgressFill.style.width = '100%'; pdfProgressText.textContent = '✅ Tamamlandı!';
      setTimeout(() => { pdfProgress.classList.add('hidden'); pdfProgressFill.style.width = '0%'; pdfConvertBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    pdfProgressText.textContent = 'Hata: ' + (err.name === 'AbortError' ? 'Zaman aşımı' : err.message);
    pdfConvertBtn.disabled = false;
  }
});

// ---- DOCUMENT EDITOR ----
const editUploadArea = document.getElementById('editUploadArea');
const editFileInput = document.getElementById('editFileInput');
const editSelectBtn = document.getElementById('editSelectBtn');
const editFileInfo = document.getElementById('editFileInfo');
const editFileName = document.getElementById('editFileName');
const editClearBtn = document.getElementById('editClearBtn');
const editError = document.getElementById('editError');
const editSection = document.getElementById('editSection');
const editTextarea = document.getElementById('editTextarea');
const editSaveBtn = document.getElementById('editSaveBtn');
const editProgress = document.getElementById('editProgress');
const editProgressFill = document.getElementById('editProgressFill');
const editProgressText = document.getElementById('editProgressText');
const editResult = document.getElementById('editResult');
const editResultText = document.getElementById('editResultText');
const editDownloadBtn = document.getElementById('editDownloadBtn');

let editTitle = '';
let editExt = '';

editSelectBtn.addEventListener('click', () => editFileInput.click());
editFileInput.addEventListener('change', e => {
  if (e.target.files.length > 0) {
    const file = e.target.files[0];
    editTitle = file.name.replace(/\.[^.]+$/, '');
    editExt = file.name.split('.').pop().toLowerCase();
    editFileName.textContent = '📁 ' + file.name + ' (' + fmtSize(file.size) + ')';
    editFileInfo.classList.remove('hidden');
    editSection.classList.remove('hidden');
    editResult.classList.add('hidden');
    editTextarea.value = 'Yükleniyor...';
    const form = new FormData();
    form.append('file', file);
    fetchWithTimeout('/api/document-read', { method: 'POST', body: form }).then(r => r.json()).then(d => {
      if (d.error) { editTextarea.value = 'Hata: ' + d.error; return; }
      editTextarea.value = d.content;
      editTitle = d.title;
    }).catch(() => { editTextarea.value = 'Okuma hatası'; });
  }
});
editUploadArea.addEventListener('dragover', e => { e.preventDefault(); editUploadArea.style.borderColor = 'var(--blue)'; });
editUploadArea.addEventListener('dragleave', () => { editUploadArea.style.borderColor = ''; });
editUploadArea.addEventListener('drop', e => {
  e.preventDefault(); editUploadArea.style.borderColor = '';
  if (e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    editFileInput.files = e.dataTransfer.files;
    editTitle = file.name.replace(/\.[^.]+$/, '');
    editExt = file.name.split('.').pop().toLowerCase();
    editFileName.textContent = '📁 ' + file.name + ' (' + fmtSize(file.size) + ')';
    editFileInfo.classList.remove('hidden');
    editSection.classList.remove('hidden');
    editResult.classList.add('hidden');
    editTextarea.value = 'Yükleniyor...';
    const form = new FormData();
    form.append('file', file);
    fetchWithTimeout('/api/document-read', { method: 'POST', body: form }).then(r => r.json()).then(d => {
      if (d.error) { editTextarea.value = 'Hata: ' + d.error; return; }
      editTextarea.value = d.content;
    }).catch(() => { editTextarea.value = 'Okuma hatası'; });
  }
});
editClearBtn.addEventListener('click', () => {
  editFileInput.value = '';
  editFileInfo.classList.add('hidden'); editSection.classList.add('hidden');
  editResult.classList.add('hidden'); editTextarea.value = '';
});

editSaveBtn.addEventListener('click', async () => {
  const content = editTextarea.value.trim();
  if (!content) { showError(editError, 'İçerik boş'); return; }
  hideError(editError);
  const fmt = document.querySelector('input[name="editFmt"]:checked').value;
  editSaveBtn.disabled = true;
  editProgress.classList.remove('hidden'); editResult.classList.add('hidden');
  editProgressFill.style.width = '10%'; editProgressText.textContent = 'Kaydediliyor...';
  try {
    const res = await fetchWithTimeout('/api/document-save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, title: editTitle, format: fmt })
    });
    const data = await res.json();
    if (!res.ok) { editProgressText.textContent = 'Hata: ' + data.error; editSaveBtn.disabled = false; return; }
    editProgressFill.style.width = '80%'; editProgressText.textContent = 'Hazırlanıyor...';
    editResultText.textContent = '✅ ' + fmt.toUpperCase() + ' kaydedildi!';
    editResult.classList.remove('hidden');
    editDownloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '.' + fmt;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    setTimeout(() => {
      editProgressFill.style.width = '100%'; editProgressText.textContent = '✅ Tamamlandı!';
      setTimeout(() => { editProgress.classList.add('hidden'); editProgressFill.style.width = '0%'; editSaveBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    editProgressText.textContent = 'Hata: ' + (err.name === 'AbortError' ? 'Zaman aşımı' : err.message);
    editSaveBtn.disabled = false;
  }
});

// ---- STREAM TOOLS (Twitch / Kick VOD) ----
const streamUrl = document.getElementById('streamUrl');
const streamLoadBtn = document.getElementById('streamLoadBtn');
const streamError = document.getElementById('streamError');
const streamInfo = document.getElementById('streamInfo');
const streamThumb = document.getElementById('streamThumb');
const streamTitle = document.getElementById('streamTitle');
const streamAuthor = document.getElementById('streamAuthor');
const streamDuration = document.getElementById('streamDuration');
const streamPlatform = document.getElementById('streamPlatform');
const streamQuality = document.getElementById('streamQuality');
const streamDownloadBtn = document.getElementById('streamDownloadBtn');
const streamProgress = document.getElementById('streamProgress');
const streamProgressFill = document.getElementById('streamProgressFill');
const streamProgressText = document.getElementById('streamProgressText');
const streamResult = document.getElementById('streamResult');
const streamResultText = document.getElementById('streamResultText');
const streamResultDownloadBtn = document.getElementById('streamResultDownloadBtn');
const streamPlayer = document.getElementById('streamPlayer');
const streamPlayerWrap = document.getElementById('streamPlayerWrap');
const streamTrimSection = document.getElementById('streamTrimSection');
const streamStartMin = document.getElementById('streamStartMin');
const streamStartSec = document.getElementById('streamStartSec');
const streamEndMin = document.getElementById('streamEndMin');
const streamEndSec = document.getElementById('streamEndSec');
const streamSetStartBtn = document.getElementById('streamSetStartBtn');
const streamSetEndBtn = document.getElementById('streamSetEndBtn');

let streamUrlValue = '';
let streamTitleText = '';

document.querySelectorAll('input[name="streamOp"]').forEach(r => r.addEventListener('change', () => {
  const isTrim = document.querySelector('input[name="streamOp"]:checked').value === 'trim';
  streamPlayerWrap.classList.toggle('hidden', !isTrim);
  streamTrimSection.classList.toggle('hidden', !isTrim);
}));

streamUrl.addEventListener('keydown', e => { if (e.key === 'Enter') loadStreamInfo(); });
streamLoadBtn.addEventListener('click', loadStreamInfo);

async function loadStreamInfo() {
  const url = streamUrl.value.trim();
  if (!url) { showError(streamError, 'Twitch VOD veya Kick VOD URL girin'); return; }
  hideError(streamError);
  streamLoadBtn.disabled = true; streamLoadBtn.textContent = 'Bilgi alınıyor...';
  try {
    const res = await fetchWithTimeout('/api/info', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) { showError(streamError, data.error); streamLoadBtn.disabled = false; streamLoadBtn.textContent = 'Bilgi Al'; return; }
    streamUrlValue = data.webpage_url || url;
    streamTitleText = data.title;
    streamThumb.src = data.thumbnail;
    streamTitle.textContent = data.title;
    streamAuthor.textContent = data.author || '';
    streamDuration.textContent = '⏱ ' + fmtTime(data.duration);
    const ext = data.extractor;
    const icon = platformIcons[ext] || '🌐';
    const color = platformColors[ext] || '#888';
    streamPlatform.innerHTML = `<span style="color:${color};font-weight:700">${icon} ${ext || 'Diğer'}</span>`;
    streamPlatform.classList.remove('hidden');
    streamInfo.classList.remove('hidden');
    streamResult.classList.add('hidden');
    streamEndMin.value = Math.floor(data.duration / 60);
    streamEndSec.value = Math.floor(data.duration % 60);
  } catch (err) {
    showError(streamError, err.name === 'AbortError' ? 'Sunucu yanıt vermiyor' : 'Hata: ' + err.message);
  }
  streamLoadBtn.disabled = false; streamLoadBtn.textContent = 'Bilgi Al';
}

streamSetStartBtn.addEventListener('click', () => {
  const ct = streamPlayer.currentTime || 0;
  streamStartMin.value = Math.floor(ct / 60);
  streamStartSec.value = Math.floor(ct % 60);
});
streamSetEndBtn.addEventListener('click', () => {
  const ct = streamPlayer.currentTime || 0;
  streamEndMin.value = Math.floor(ct / 60);
  streamEndSec.value = Math.floor(ct % 60);
});

streamDownloadBtn.addEventListener('click', async () => {
  if (!streamUrlValue) return;
  hideError(streamError);
  const op = document.querySelector('input[name="streamOp"]:checked').value;
  const quality = streamQuality.value;
  const isTrim = op === 'trim';
  streamDownloadBtn.disabled = true;
  streamProgress.classList.remove('hidden');
  streamResult.classList.add('hidden');
  streamProgressFill.style.width = '10%';
  streamProgressText.textContent = isTrim ? 'Kesiliyor...' : 'İndiriliyor...';
  try {
    let res;
    if (isTrim) {
      const start = timeStr(streamStartMin.value || 0, streamStartSec.value || 0);
      const end = timeStr(streamEndMin.value || 0, streamEndSec.value || 0);
      res = await fetchWithTimeout('/api/trim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: streamUrlValue, startTime: start, endTime: end })
      });
    } else {
      const fmt = quality === 'mp3' ? 'mp3' : 'mp4';
      const q = quality === 'mp3' ? '192' : quality;
      res = await fetchWithTimeout('/api/convert', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: streamUrlValue, format: fmt, quality: q })
      });
    }
    const data = await res.json();
    if (!res.ok) { streamProgressText.textContent = 'Hata: ' + data.error; streamDownloadBtn.disabled = false; return; }
    streamProgressFill.style.width = '90%';
    streamProgressText.textContent = 'Hazırlanıyor...';
    streamResultText.textContent = '✅ ' + (isTrim ? 'Kesildi' : 'İndirildi') + '!';
    streamResult.classList.remove('hidden');
    streamResultDownloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '.' + (quality === 'mp3' ? 'mp3' : 'mp4');
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    setTimeout(() => {
      streamProgressFill.style.width = '100%';
      streamProgressText.textContent = '✅ Tamamlandı!';
      setTimeout(() => { streamProgress.classList.add('hidden'); streamProgressFill.style.width = '0%'; streamDownloadBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    streamProgressText.textContent = 'Hata: ' + (err.name === 'AbortError' ? 'Zaman aşımı' : err.message);
    streamDownloadBtn.disabled = false;
  }
});

// ---- MAIL TOOLS ----
const mailHost = document.getElementById('mailHost');
const mailPort = document.getElementById('mailPort');
const mailUser = document.getElementById('mailUser');
const mailPass = document.getElementById('mailPass');
const mailName = document.getElementById('mailName');
const mailSaveSmtp = document.getElementById('mailSaveSmtp');
const mailSmtpStatus = document.getElementById('mailSmtpStatus');
const mailTo = document.getElementById('mailTo');
const mailSubject = document.getElementById('mailSubject');
const mailBody = document.getElementById('mailBody');
const mailAttachment = document.getElementById('mailAttachment');
const mailSendBtn = document.getElementById('mailSendBtn');
const mailError = document.getElementById('mailError');
const mailProgress = document.getElementById('mailProgress');
const mailProgressFill = document.getElementById('mailProgressFill');
const mailProgressText = document.getElementById('mailProgressText');
const mailResult = document.getElementById('mailResult');

function loadSmtpSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('omnitool_smtp') || '{}');
    if (s.host) mailHost.value = s.host;
    if (s.port) mailPort.value = s.port;
    if (s.user) mailUser.value = s.user;
    if (s.pass) mailPass.value = s.pass;
    if (s.name) mailName.value = s.name;
  } catch {}
}
loadSmtpSettings();

mailSaveSmtp.addEventListener('click', () => {
  const s = { host: mailHost.value, port: mailPort.value, user: mailUser.value, pass: mailPass.value, name: mailName.value };
  localStorage.setItem('omnitool_smtp', JSON.stringify(s));
  mailSmtpStatus.textContent = '✅ Kaydedildi';
  setTimeout(() => { mailSmtpStatus.textContent = ''; }, 3000);
});

mailSendBtn.addEventListener('click', async () => {
  hideError(mailError);
  const host = mailHost.value.trim();
  const port = mailPort.value.trim();
  const user = mailUser.value.trim();
  const pass = mailPass.value.trim();
  const fromName = mailName.value.trim();
  const to = mailTo.value.trim();
  const subject = mailSubject.value.trim();
  const body = mailBody.value.trim();

  if (!host || !user || !pass) { showError(mailError, 'SMTP ayarlarını doldur (Host, E-posta, Şifre)'); return; }
  if (!to) { showError(mailError, 'En az bir alıcı girin'); return; }
  if (!subject || !body) { showError(mailError, 'Konu ve mesaj gerekli'); return; }

  mailSendBtn.disabled = true;
  mailProgress.classList.remove('hidden');
  mailResult.classList.add('hidden');
  mailProgressFill.style.width = '10%';
  mailProgressText.textContent = 'Gönderiliyor...';
  try {
    const form = new FormData();
    form.append('host', host);
    form.append('port', port || '587');
    form.append('user', user);
    form.append('pass', pass);
    form.append('fromName', fromName);
    form.append('to', to);
    form.append('subject', subject);
    form.append('body', body);
    if (mailAttachment.files.length > 0) form.append('attachment', mailAttachment.files[0]);

    const res = await fetchWithTimeout('/api/send-mail', { method: 'POST', body: form }, 60000);
    const data = await res.json();
    if (!res.ok) { mailProgressText.textContent = 'Hata: ' + data.error; mailSendBtn.disabled = false; return; }
    mailProgressFill.style.width = '100%';
    mailProgressText.textContent = '✅ ' + data.sent + ' gönderildi, ' + data.failed + ' hata';
    let html = '<div style="padding:0.8rem;background:rgba(51,255,119,0.08);border:1px solid var(--green);border-radius:10px">';
    html += '<p style="color:var(--green);font-weight:600">📤 ' + data.sent + '/' + (data.sent + data.failed) + ' başarılı</p>';
    if (data.results && data.results.length > 0) {
      html += '<div style="margin-top:0.5rem;font-size:0.8rem;max-height:200px;overflow-y:auto">';
      for (const r of data.results) html += '<p style="color:' + (r.status === 'ok' ? 'var(--green)' : 'var(--red)') + '">' + r.email + ' → ' + r.status + (r.error ? ': ' + r.error : '') + '</p>';
      html += '</div>';
    }
    html += '</div>';
    mailResult.innerHTML = html;
    mailResult.classList.remove('hidden');
    setTimeout(() => { mailProgress.classList.add('hidden'); mailProgressFill.style.width = '0%'; mailSendBtn.disabled = false; }, 3000);
  } catch (err) {
    mailProgressText.textContent = 'Hata: ' + (err.name === 'AbortError' ? 'Zaman aşımı (60sn)' : err.message);
    mailSendBtn.disabled = false;
  }
});
