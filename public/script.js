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
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
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
  if (!url) { showError(convError, t('err.urlRequired')); return; }
  hideError(convError);
  convLoadBtn.disabled = true; convLoadBtn.textContent = t('common.gettingInfo');
  try {
    const res = await fetchWithTimeout('/api/info', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) { showError(convError, data.error); convLoadBtn.disabled = false; convLoadBtn.textContent = t('common.getInfo'); return; }
    convUrlValue = data.webpage_url || url;
    convTitleText = data.title;
    convThumb.src = data.thumbnail;
    convTitle.textContent = data.title;
    convAuthor.textContent = data.author || '';
    convDuration.textContent = '⏱ ' + fmtTime(data.duration);
    const ext = data.extractor;
    const icon = platformIcons[ext] || '🌐';
    const color = platformColors[ext] || '#888';
    convPlatform.innerHTML = `<span style="color:${color};font-weight:700">${icon} ${ext || t('common.other')}</span>`;
    convPlatform.classList.remove('hidden');
    convInfo.classList.remove('hidden');
  } catch (err) {
    showError(convError, err.name === 'AbortError' ? t('common.serverNotRespondingDetailed') : t('common.errorPrefix') + err.message);
  }
  convLoadBtn.disabled = false; convLoadBtn.textContent = t('common.getInfo');
}

convertBtn.addEventListener('click', async () => {
  if (!convUrlValue) return;
  const fmt = document.querySelector('input[name="fmt"]:checked').value;
  const quality = qualitySelect.value;
  convertBtn.disabled = true; sendToTrimBtn.disabled = true;
  convProgress.classList.remove('hidden');
  convProgressFill.style.width = '10%';
  convProgressText.textContent = t('common.downloading');
  try {
    const res = await fetchWithTimeout('/api/convert', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: convUrlValue, format: fmt, quality })
    });
    const data = await res.json();
    if (!res.ok) { convProgressText.textContent = t('common.errorPrefix') + data.error; convertBtn.disabled = false; sendToTrimBtn.disabled = false; return; }
    convProgressFill.style.width = '80%';
    convProgressText.textContent = t('common.preparingDownload');
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '.' + fmt;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      convProgressFill.style.width = '100%';
      convProgressText.textContent = t('common.completed');
      setTimeout(() => { convProgress.classList.add('hidden'); convProgressFill.style.width = '0%'; convertBtn.disabled = false; sendToTrimBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    convProgressText.textContent = t('common.errorPrefix') + (err.name === 'AbortError' ? t('common.timeout') : err.message);
    convertBtn.disabled = false; sendToTrimBtn.disabled = false;
  }
});

sendToTrimBtn.addEventListener('click', () => {
  if (!convUrlValue) return;
  document.querySelector('.tab-btn[data-tab="trim"]').click();
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
  trimProgressText.textContent = t('common.processing');
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
      showError(trimError, t('err.uploadOrSendFromConverter'));
      trimDownloadBtn.disabled = false; return;
    }
    const data = await res.json();
    if (!res.ok) { trimProgressText.textContent = t('common.errorPrefix') + data.error; trimDownloadBtn.disabled = false; return; }
    trimProgressFill.style.width = '70%';
    trimProgressText.textContent = t('trim.trimming');
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '_kesilmis.mp4';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      trimProgressFill.style.width = '100%';
      trimProgressText.textContent = t('trim.downloadingResult');
      setTimeout(() => { trimProgress.classList.add('hidden'); trimProgressFill.style.width = '0%'; trimDownloadBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    trimProgressText.textContent = t('common.errorPrefix') + (err.name === 'AbortError' ? t('common.serverNotResponding') : err.message);
    trimDownloadBtn.disabled = false;
  }
});

async function loadTrimVideo(url, title) {
  trimUrl = url; trimTitle = title;
  trimFile = null; fileInput.value = '';
  uploadInfo.classList.remove('hidden');
  fileNameDisplay.textContent = t('trim.fromConverter', { title });
  trimSection.classList.remove('hidden');
  trimPlayer.src = '';
  uploadArea.querySelector('p').textContent = t('trim.uploadFromConverter');
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
    compSizeInfo.textContent = t('compress.original', { size: fmtSize(compFile.size) });
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
    compSizeInfo.textContent = t('compress.original', { size: fmtSize(compFile.size) });
  }
});
compClearBtn.addEventListener('click', () => {
  compFile = null; compUrlValue = ''; compTitleText = '';
  compFileInput.value = '';
  compFileInfo.classList.add('hidden');
  compSection.classList.add('hidden');
  compResult.classList.add('hidden');
  compSizeInfo.textContent = t('compress.noFileYet');
});

compLoadBtn.addEventListener('click', async () => {
  const url = compUrl.value.trim();
  if (!url) { showError(compError, t('err.urlRequired')); return; }
  hideError(compError);
  compLoadBtn.disabled = true; compLoadBtn.textContent = t('common.gettingInfo');
  try {
    const res = await fetchWithTimeout('/api/info', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) { showError(compError, data.error); compLoadBtn.disabled = false; compLoadBtn.textContent = t('common.getInfo'); return; }
    compUrlValue = data.webpage_url || url;
    compTitleText = data.title;
    compFileName.textContent = '🎬 ' + data.title;
    compFileInfo.classList.remove('hidden');
    compSection.classList.remove('hidden');
    compSizeInfo.textContent = t('compress.sizeAfterDownload');
    compFile = null;
  } catch (err) {
    showError(compError, err.name === 'AbortError' ? t('common.serverNotResponding') : t('common.errorPrefix') + err.message);
  }
  compLoadBtn.disabled = false; compLoadBtn.textContent = t('common.getInfo');
});

function fmtSize(bytes) {
  if (!bytes) return '?';
  const s = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + s[i];
}

compressBtn.addEventListener('click', async () => {
  if (!compUrlValue && !compFile) { showError(compError, t('err.selectUrlOrFile')); return; }
  hideError(compError);
  const level = document.querySelector('input[name="clvl"]:checked').value;
  compressBtn.disabled = true;
  compProgress.classList.remove('hidden');
  compResult.classList.add('hidden');
  compProgressFill.style.width = '5%';
  compProgressText.textContent = t('compress.compressing');
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
    if (!res.ok) { compProgressText.textContent = t('common.errorPrefix') + data.error; compressBtn.disabled = false; return; }
    compProgressFill.style.width = '90%';
    compProgressText.textContent = t('common.preparing');
    compResultText.textContent = t('compress.resultShrunk', { from: fmtSize(data.original), to: fmtSize(data.compressed), pct: data.savings });
    if (data.savings < 1) compResultText.textContent = t('compress.resultTooSmall', { size: fmtSize(data.compressed) });
    compResult.classList.remove('hidden');
    compSizeInfo.textContent = t('compress.summary', { level: data.level, from: fmtSize(data.original), to: fmtSize(data.compressed) });
    compDownloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '_sikistirilmis.mp4';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    setTimeout(() => {
      compProgressFill.style.width = '100%';
      compProgressText.textContent = t('common.completed');
      setTimeout(() => { compProgress.classList.add('hidden'); compProgressFill.style.width = '0%'; compressBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    compProgressText.textContent = t('common.errorPrefix') + (err.name === 'AbortError' ? t('common.timeout') : err.message);
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
    filesSizeInfo.textContent = t('files.fileSizeLabel', { size: fmtSize(filesFile.size) });
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
    filesSizeInfo.textContent = t('files.fileSizeLabel', { size: fmtSize(filesFile.size) });
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
  if (!filesFile) { showError(filesError, t('err.selectFileFirst')); return; }
  hideError(filesError);
  const op = document.querySelector('input[name="fop"]:checked').value;
  const format = filesTargetFormat.value;
  filesProcessBtn.disabled = true;
  filesProgress.classList.remove('hidden');
  filesResult.classList.add('hidden');
  filesProgressFill.style.width = '5%';
  filesProgressText.textContent = op === 'zip' ? t('files.zipping') : op === 'unzip' ? t('files.unzipping') : t('files.converting');
  try {
    const form = new FormData();
    form.append('file', filesFile);
    form.append('op', op);
    form.append('format', format);
    const res = await fetchWithTimeout('/api/convert-file', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) { filesProgressText.textContent = t('common.errorPrefix') + data.error; filesProcessBtn.disabled = false; return; }
    filesProgressFill.style.width = '90%';
    filesProgressText.textContent = t('common.preparing');
    let msg;
    if (op === 'zip') msg = t('files.resultZip', { from: fmtSize(data.original), to: fmtSize(data.compressed), pct: data.savings });
    else if (op === 'unzip') msg = t('files.resultUnzip');
    else msg = t('files.resultConvert', { format: format.toUpperCase() });
    filesResultText.textContent = msg;
    filesResult.classList.remove('hidden');
    filesSizeInfo.textContent = data.original ? t('files.originalToCompressed', { from: fmtSize(data.original), to: fmtSize(data.compressed) }) : '';
    const ext = op === 'unzip' ? data.file.split('.').pop() : format || 'zip';
    filesDownloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '.' + ext;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    setTimeout(() => {
      filesProgressFill.style.width = '100%';
      filesProgressText.textContent = t('common.completed');
      setTimeout(() => { filesProgress.classList.add('hidden'); filesProgressFill.style.width = '0%'; filesProcessBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    filesProgressText.textContent = t('common.errorPrefix') + (err.name === 'AbortError' ? t('common.timeout') : err.message);
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
const pdfConvertBlock = document.getElementById('pdfConvertBlock');
const pdfMergeBlock = document.getElementById('pdfMergeBlock');
const pdfSplitBlock = document.getElementById('pdfSplitBlock');
const pdfMergeAction = document.getElementById('pdfMergeAction');
const pdfSplitAction = document.getElementById('pdfSplitAction');

document.querySelectorAll('input[name="pdfOp"]').forEach(r => r.addEventListener('change', () => {
  const op = document.querySelector('input[name="pdfOp"]:checked').value;
  pdfConvertBlock.classList.toggle('hidden', op !== 'convert');
  pdfMergeBlock.classList.toggle('hidden', op !== 'merge');
  pdfSplitBlock.classList.toggle('hidden', op !== 'split');
  pdfSection.classList.add('hidden');
  pdfMergeAction.classList.toggle('hidden', op !== 'merge' || pdfMergeFiles.length < 2);
  pdfSplitAction.classList.toggle('hidden', op !== 'split' || !pdfSplitFile);
  pdfResult.classList.add('hidden');
  hideError(pdfError);
}));

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
      if (ext === 'docx') { pdfPreview.textContent = t('pdf.docxPreviewNote'); pdfPreview.classList.remove('hidden'); }
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
  if (!pdfFile) { showError(pdfError, t('err.selectFileFirst')); return; }
  hideError(pdfError);
  pdfConvertBtn.disabled = true;
  pdfProgress.classList.remove('hidden'); pdfResult.classList.add('hidden');
  pdfProgressFill.style.width = '10%'; pdfProgressText.textContent = t('pdf.creating');
  try {
    const form = new FormData();
    form.append('file', pdfFile);
    const res = await fetchWithTimeout('/api/pdf-convert', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) { pdfProgressText.textContent = t('common.errorPrefix') + data.error; pdfConvertBtn.disabled = false; return; }
    pdfProgressFill.style.width = '80%'; pdfProgressText.textContent = t('common.preparing');
    pdfResultText.textContent = t('pdf.ready');
    pdfResult.classList.remove('hidden');
    pdfDownloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    setTimeout(() => {
      pdfProgressFill.style.width = '100%'; pdfProgressText.textContent = t('common.completed');
      setTimeout(() => { pdfProgress.classList.add('hidden'); pdfProgressFill.style.width = '0%'; pdfConvertBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    pdfProgressText.textContent = t('common.errorPrefix') + (err.name === 'AbortError' ? t('common.timeout') : err.message);
    pdfConvertBtn.disabled = false;
  }
});

// ---- PDF MERGE ----
const pdfMergeUploadArea = document.getElementById('pdfMergeUploadArea');
const pdfMergeFileInput = document.getElementById('pdfMergeFileInput');
const pdfMergeSelectBtn = document.getElementById('pdfMergeSelectBtn');
const pdfMergeFileList = document.getElementById('pdfMergeFileList');
const pdfMergeBtn = document.getElementById('pdfMergeBtn');

let pdfMergeFiles = [];

function renderMergeList() {
  pdfMergeFileList.innerHTML = pdfMergeFiles.map((f, i) =>
    `<span style="display:inline-flex;align-items:center;gap:0.3rem;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:0.3rem 0.6rem;margin:0.2rem">📄 ${f.name}<button data-i="${i}" class="pdfMergeRemove" style="background:none;border:none;color:var(--red);cursor:pointer;font-weight:700">✖</button></span>`
  ).join('');
  pdfMergeAction.classList.toggle('hidden', pdfMergeFiles.length < 2);
}
function addMergeFiles(fileList) {
  for (const f of fileList) if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) pdfMergeFiles.push(f);
  renderMergeList();
}
pdfMergeSelectBtn.addEventListener('click', () => pdfMergeFileInput.click());
pdfMergeFileInput.addEventListener('change', e => { addMergeFiles(e.target.files); pdfMergeFileInput.value = ''; });
pdfMergeUploadArea.addEventListener('dragover', e => { e.preventDefault(); pdfMergeUploadArea.style.borderColor = 'var(--blue)'; });
pdfMergeUploadArea.addEventListener('dragleave', () => { pdfMergeUploadArea.style.borderColor = ''; });
pdfMergeUploadArea.addEventListener('drop', e => { e.preventDefault(); pdfMergeUploadArea.style.borderColor = ''; addMergeFiles(e.dataTransfer.files); });
pdfMergeFileList.addEventListener('click', e => {
  const btn = e.target.closest('.pdfMergeRemove');
  if (btn) { pdfMergeFiles.splice(Number(btn.dataset.i), 1); renderMergeList(); }
});

pdfMergeBtn.addEventListener('click', async () => {
  if (pdfMergeFiles.length < 2) return;
  hideError(pdfError);
  pdfMergeBtn.disabled = true;
  pdfProgress.classList.remove('hidden'); pdfResult.classList.add('hidden');
  pdfProgressFill.style.width = '10%'; pdfProgressText.textContent = t('pdf.merging');
  try {
    const form = new FormData();
    for (const f of pdfMergeFiles) form.append('files', f);
    const res = await fetchWithTimeout('/api/pdf-merge', { method: 'POST', body: form }, 60000);
    const data = await res.json();
    if (!res.ok) { pdfProgressText.textContent = t('common.errorPrefix') + data.error; pdfMergeBtn.disabled = false; return; }
    pdfProgressFill.style.width = '80%'; pdfProgressText.textContent = t('common.preparing');
    pdfResultText.textContent = t('pdf.mergeReady');
    pdfResult.classList.remove('hidden');
    pdfDownloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    setTimeout(() => {
      pdfProgressFill.style.width = '100%'; pdfProgressText.textContent = t('common.completed');
      setTimeout(() => { pdfProgress.classList.add('hidden'); pdfProgressFill.style.width = '0%'; pdfMergeBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    pdfProgressText.textContent = t('common.errorPrefix') + (err.name === 'AbortError' ? t('common.timeout') : err.message);
    pdfMergeBtn.disabled = false;
  }
});

// ---- PDF SPLIT ----
const pdfSplitUploadArea = document.getElementById('pdfSplitUploadArea');
const pdfSplitFileInput = document.getElementById('pdfSplitFileInput');
const pdfSplitSelectBtn = document.getElementById('pdfSplitSelectBtn');
const pdfSplitFileInfo = document.getElementById('pdfSplitFileInfo');
const pdfSplitFileName = document.getElementById('pdfSplitFileName');
const pdfSplitClearBtn = document.getElementById('pdfSplitClearBtn');
const pdfSplitBtn = document.getElementById('pdfSplitBtn');

let pdfSplitFile = null;

function pickSplitFile(f) {
  if (!f) return;
  pdfSplitFile = f;
  pdfSplitFileName.textContent = '📄 ' + f.name + ' (' + fmtSize(f.size) + ')';
  pdfSplitFileInfo.classList.remove('hidden');
  pdfSplitAction.classList.remove('hidden');
}
pdfSplitSelectBtn.addEventListener('click', () => pdfSplitFileInput.click());
pdfSplitFileInput.addEventListener('change', e => pickSplitFile(e.target.files[0]));
pdfSplitUploadArea.addEventListener('dragover', e => { e.preventDefault(); pdfSplitUploadArea.style.borderColor = 'var(--blue)'; });
pdfSplitUploadArea.addEventListener('dragleave', () => { pdfSplitUploadArea.style.borderColor = ''; });
pdfSplitUploadArea.addEventListener('drop', e => { e.preventDefault(); pdfSplitUploadArea.style.borderColor = ''; pickSplitFile(e.dataTransfer.files[0]); });
pdfSplitClearBtn.addEventListener('click', () => {
  pdfSplitFile = null; pdfSplitFileInput.value = '';
  pdfSplitFileInfo.classList.add('hidden'); pdfSplitAction.classList.add('hidden');
});

pdfSplitBtn.addEventListener('click', async () => {
  if (!pdfSplitFile) return;
  hideError(pdfError);
  pdfSplitBtn.disabled = true;
  pdfProgress.classList.remove('hidden'); pdfResult.classList.add('hidden');
  pdfProgressFill.style.width = '10%'; pdfProgressText.textContent = t('pdf.splitting');
  try {
    const form = new FormData();
    form.append('file', pdfSplitFile);
    const res = await fetchWithTimeout('/api/pdf-split', { method: 'POST', body: form }, 60000);
    const data = await res.json();
    if (!res.ok) { pdfProgressText.textContent = t('common.errorPrefix') + data.error; pdfSplitBtn.disabled = false; return; }
    pdfProgressFill.style.width = '80%'; pdfProgressText.textContent = t('common.preparing');
    pdfResultText.textContent = t('pdf.splitReady', { pages: data.pages });
    pdfResult.classList.remove('hidden');
    pdfDownloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '_bolunmus.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    setTimeout(() => {
      pdfProgressFill.style.width = '100%'; pdfProgressText.textContent = t('common.completed');
      setTimeout(() => { pdfProgress.classList.add('hidden'); pdfProgressFill.style.width = '0%'; pdfSplitBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    pdfProgressText.textContent = t('common.errorPrefix') + (err.name === 'AbortError' ? t('common.timeout') : err.message);
    pdfSplitBtn.disabled = false;
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
    editTextarea.value = t('common.loadingEllipsis');
    const form = new FormData();
    form.append('file', file);
    fetchWithTimeout('/api/document-read', { method: 'POST', body: form }).then(r => r.json()).then(d => {
      if (d.error) { editTextarea.value = t('common.errorPrefix') + d.error; return; }
      editTextarea.value = d.content;
      editTitle = d.title;
    }).catch(() => { editTextarea.value = t('common.readError'); });
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
    editTextarea.value = t('common.loadingEllipsis');
    const form = new FormData();
    form.append('file', file);
    fetchWithTimeout('/api/document-read', { method: 'POST', body: form }).then(r => r.json()).then(d => {
      if (d.error) { editTextarea.value = t('common.errorPrefix') + d.error; return; }
      editTextarea.value = d.content;
    }).catch(() => { editTextarea.value = t('common.readError'); });
  }
});
editClearBtn.addEventListener('click', () => {
  editFileInput.value = '';
  editFileInfo.classList.add('hidden'); editSection.classList.add('hidden');
  editResult.classList.add('hidden'); editTextarea.value = '';
});

editSaveBtn.addEventListener('click', async () => {
  const content = editTextarea.value.trim();
  if (!content) { showError(editError, t('err.contentEmpty')); return; }
  hideError(editError);
  const fmt = document.querySelector('input[name="editFmt"]:checked').value;
  editSaveBtn.disabled = true;
  editProgress.classList.remove('hidden'); editResult.classList.add('hidden');
  editProgressFill.style.width = '10%'; editProgressText.textContent = t('editor.saving');
  try {
    const res = await fetchWithTimeout('/api/document-save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, title: editTitle, format: fmt })
    });
    const data = await res.json();
    if (!res.ok) { editProgressText.textContent = t('common.errorPrefix') + data.error; editSaveBtn.disabled = false; return; }
    editProgressFill.style.width = '80%'; editProgressText.textContent = t('common.preparing');
    editResultText.textContent = t('editor.saved', { fmt: fmt.toUpperCase() });
    editResult.classList.remove('hidden');
    editDownloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '.' + fmt;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    setTimeout(() => {
      editProgressFill.style.width = '100%'; editProgressText.textContent = t('common.completed');
      setTimeout(() => { editProgress.classList.add('hidden'); editProgressFill.style.width = '0%'; editSaveBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    editProgressText.textContent = t('common.errorPrefix') + (err.name === 'AbortError' ? t('common.timeout') : err.message);
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
  if (!url) { showError(streamError, t('err.needStreamUrl')); return; }
  hideError(streamError);
  streamLoadBtn.disabled = true; streamLoadBtn.textContent = t('common.gettingInfo');
  try {
    const res = await fetchWithTimeout('/api/info', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) { showError(streamError, data.error); streamLoadBtn.disabled = false; streamLoadBtn.textContent = t('common.getInfo'); return; }
    streamUrlValue = data.webpage_url || url;
    streamTitleText = data.title;
    streamThumb.src = data.thumbnail;
    streamTitle.textContent = data.title;
    streamAuthor.textContent = data.author || '';
    streamDuration.textContent = '⏱ ' + fmtTime(data.duration);
    const ext = data.extractor;
    const icon = platformIcons[ext] || '🌐';
    const color = platformColors[ext] || '#888';
    streamPlatform.innerHTML = `<span style="color:${color};font-weight:700">${icon} ${ext || t('common.other')}</span>`;
    streamPlatform.classList.remove('hidden');
    streamInfo.classList.remove('hidden');
    streamResult.classList.add('hidden');
    streamEndMin.value = Math.floor(data.duration / 60);
    streamEndSec.value = Math.floor(data.duration % 60);
  } catch (err) {
    showError(streamError, err.name === 'AbortError' ? t('common.serverNotResponding') : t('common.errorPrefix') + err.message);
  }
  streamLoadBtn.disabled = false; streamLoadBtn.textContent = t('common.getInfo');
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
  streamProgressText.textContent = isTrim ? t('trim.trimming') : t('common.downloading');
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
    if (!res.ok) { streamProgressText.textContent = t('common.errorPrefix') + data.error; streamDownloadBtn.disabled = false; return; }
    streamProgressFill.style.width = '90%';
    streamProgressText.textContent = t('common.preparing');
    streamResultText.textContent = t(isTrim ? 'stream.trimmed' : 'stream.downloaded');
    streamResult.classList.remove('hidden');
    streamResultDownloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '.' + (quality === 'mp3' ? 'mp3' : 'mp4');
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    setTimeout(() => {
      streamProgressFill.style.width = '100%';
      streamProgressText.textContent = t('common.completed');
      setTimeout(() => { streamProgress.classList.add('hidden'); streamProgressFill.style.width = '0%'; streamDownloadBtn.disabled = false; }, 3000);
    }, 500);
  } catch (err) {
    streamProgressText.textContent = t('common.errorPrefix') + (err.name === 'AbortError' ? t('common.timeout') : err.message);
    streamDownloadBtn.disabled = false;
  }
});

// ---- SLIDESHOW ----
const ssImageSlots = document.getElementById('ssImageSlots');
const ssAddSlotBtn = document.getElementById('ssAddSlotBtn');
const ssAudio = document.getElementById('ssAudio');
const ssAudioBtn = document.getElementById('ssAudioBtn');
const ssAudioName = document.getElementById('ssAudioName');
const ssTransition = document.getElementById('ssTransition');
const ssDuration = document.getElementById('ssDuration');
const ssResolution = document.getElementById('ssResolution');
const ssCreateBtn = document.getElementById('ssCreateBtn');
const ssError = document.getElementById('ssError');
const ssProgress = document.getElementById('ssProgress');
const ssProgressFill = document.getElementById('ssProgressFill');
const ssProgressText = document.getElementById('ssProgressText');
const ssCancelBtn = document.getElementById('ssCancelBtn');
const ssResult = document.getElementById('ssResult');
const ssDownloadBtn = document.getElementById('ssDownloadBtn');

let ssAudioFile = null;
let ssAbort = null;

function getSlotFiles() {
  const files = [];
  document.querySelectorAll('#ssImageSlots .upload-area').forEach(el => {
    const inp = el.querySelector('input[type=file]');
    if (inp && inp.files.length > 0) files.push(inp.files[0]);
  });
  return files;
}

function updateSlotLabels() {
  const slots = document.querySelectorAll('#ssImageSlots .upload-area');
  slots.forEach((el, i) => {
    const lbl = el.querySelector('.ssSlotLabel');
    if (lbl) { lbl.dataset.n = i + 1; lbl.textContent = t('slideshow.photoN', { n: i + 1 }); }
    const rm = el.querySelector('.ssRemoveBtn');
    if (rm) rm.style.display = slots.length > 2 ? '' : 'none';
  });
}

ssImageSlots.addEventListener('click', e => {
  const btn = e.target.closest('.ssSlotBtn');
  if (btn) { const inp = btn.parentElement.querySelector('input[type=file]'); if (inp) inp.click(); return; }
  const rm = e.target.closest('.ssRemoveBtn');
  if (rm) { const slot = rm.closest('.upload-area'); if (slot && document.querySelectorAll('#ssImageSlots .upload-area').length > 2) { slot.remove(); updateSlotLabels(); } }
});
ssImageSlots.addEventListener('change', e => {
  if (e.target.matches('input[type=file]')) {
    const nameSpan = e.target.parentElement.querySelector('.ssSlotName');
    if (nameSpan) nameSpan.textContent = e.target.files.length > 0 ? '✅ ' + e.target.files[0].name : '';
  }
});

ssAddSlotBtn.addEventListener('click', () => {
  const idx = document.querySelectorAll('#ssImageSlots .upload-area').length;
  const div = document.createElement('div');
  div.className = 'upload-area';
  div.style.cssText = 'padding:0.8rem;display:flex;align-items:center;gap:0.5rem';
  div.innerHTML = `<span class="ssSlotLabel" data-n="${idx+1}" style="font-weight:600;font-size:0.85rem;min-width:90px">${t('slideshow.photoN', { n: idx+1 })}</span>
<input type="file" accept="image/*" hidden>
<button class="btn btn-small btn-outline ssSlotBtn">${t('slideshow.select')}</button>
<span class="ssSlotName" style="font-size:0.85rem;color:var(--text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
<button class="btn btn-small btn-outline ssRemoveBtn" style="color:var(--red);margin-left:auto">✖</button>`;
  ssImageSlots.appendChild(div);
  updateSlotLabels();
});

ssAudioBtn.addEventListener('click', () => ssAudio.click());
ssAudio.addEventListener('change', e => {
  if (e.target.files.length > 0) { ssAudioFile = e.target.files[0]; ssAudioName.textContent = '🎵 ' + ssAudioFile.name; }
});

ssCreateBtn.addEventListener('click', async () => {
  hideError(ssError);
  const files = getSlotFiles();
  if (files.length < 2) { showError(ssError, t('err.needTwoPhotos')); return; }
  ssCreateBtn.disabled = true;
  ssProgress.classList.remove('hidden');
  ssResult.classList.add('hidden');
  ssProgressFill.style.width = '5%';
  ssProgressText.textContent = t('slideshow.creating');
  ssAbort = new AbortController();
  try {
    const form = new FormData();
    form.append('transition', ssTransition.value);
    form.append('duration', ssDuration.value);
    form.append('resolution', ssResolution.value);
    for (const f of files) form.append('images', f);
    if (ssAudioFile) form.append('audio', ssAudioFile);
    const res = await fetch('/api/slideshow', { method: 'POST', body: form, signal: ssAbort.signal });
    const data = await res.json();
    if (!res.ok) { ssProgressText.textContent = t('common.errorPrefix') + data.error; ssCancel(); return; }
    ssProgressFill.style.width = '90%';
    ssProgressText.textContent = t('common.preparing');
    ssResult.classList.remove('hidden');
    ssDownloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.title + '.mp4';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    setTimeout(() => { ssProgressFill.style.width = '100%'; ssProgressText.textContent = t('slideshow.ready'); setTimeout(() => { ssProgress.classList.add('hidden'); ssProgressFill.style.width = '0%'; ssCancel(); }, 3000); }, 500);
  } catch (err) {
    if (err.name === 'AbortError') { ssProgressText.textContent = t('common.cancelled'); } else { ssProgressText.textContent = t('common.errorPrefix') + err.message; }
    ssCancel();
  }
});
function ssCancel() { ssCreateBtn.disabled = false; ssAbort = null; }
ssCancelBtn.addEventListener('click', () => { if (ssAbort) { ssAbort.abort(); ssProgressText.textContent = t('common.cancelling'); ssCancelBtn.disabled = true; } });

// ---- SUBTITLES ----
const subUrl = document.getElementById('subUrl');
const subLoadBtn = document.getElementById('subLoadBtn');
const subError = document.getElementById('subError');
const subResult = document.getElementById('subResult');
const subTitle = document.getElementById('subTitle');
const subManualGroup = document.getElementById('subManualGroup');
const subManualList = document.getElementById('subManualList');
const subAutoGroup = document.getElementById('subAutoGroup');
const subAutoList = document.getElementById('subAutoList');
const subProgress = document.getElementById('subProgress');
const subProgressFill = document.getElementById('subProgressFill');
const subProgressText = document.getElementById('subProgressText');
const subDone = document.getElementById('subDone');
const subDoneText = document.getElementById('subDoneText');
const subDownloadBtn = document.getElementById('subDownloadBtn');

let subUrlValue = '';

function langBtn(lang, auto) {
  return `<button class="btn btn-small btn-outline subLangBtn" data-lang="${lang}" data-auto="${auto ? '1' : '0'}">${lang}</button>`;
}

subUrl.addEventListener('keydown', e => { if (e.key === 'Enter') loadSubtitleList(); });
subLoadBtn.addEventListener('click', loadSubtitleList);

async function loadSubtitleList() {
  const url = subUrl.value.trim();
  if (!url) { showError(subError, t('err.urlRequired')); return; }
  hideError(subError);
  subResult.classList.add('hidden'); subDone.classList.add('hidden');
  subLoadBtn.disabled = true; subLoadBtn.textContent = t('common.gettingInfo');
  try {
    const res = await fetchWithTimeout('/api/subtitle-list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) { showError(subError, data.error); subLoadBtn.disabled = false; subLoadBtn.textContent = t('subtitle.listBtn'); return; }
    subUrlValue = url;
    subTitle.textContent = data.title;
    subManualGroup.classList.toggle('hidden', data.manual.length === 0);
    subManualList.innerHTML = data.manual.map(l => langBtn(l, false)).join('');
    subAutoGroup.classList.toggle('hidden', data.auto.length === 0);
    subAutoList.innerHTML = data.auto.map(l => langBtn(l, true)).join('');
    subResult.classList.remove('hidden');
  } catch (err) {
    showError(subError, err.name === 'AbortError' ? t('common.serverNotResponding') : t('common.errorPrefix') + err.message);
  }
  subLoadBtn.disabled = false; subLoadBtn.textContent = t('subtitle.listBtn');
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.subLangBtn');
  if (!btn) return;
  downloadSubtitle(btn.dataset.lang, btn.dataset.auto === '1');
});

async function downloadSubtitle(lang, auto) {
  hideError(subError);
  subProgress.classList.remove('hidden'); subDone.classList.add('hidden');
  subProgressFill.style.width = '15%'; subProgressText.textContent = t('common.processing');
  try {
    const res = await fetchWithTimeout('/api/subtitle-download', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: subUrlValue, lang, auto })
    }, 60000);
    const data = await res.json();
    if (!res.ok) { subProgressText.textContent = t('common.errorPrefix') + data.error; return; }
    subProgressFill.style.width = '100%'; subProgressText.textContent = t('common.completed');
    subDoneText.textContent = t('subtitle.ready', { lang });
    subDownloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = '/api/download/' + data.file;
      a.download = data.file;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    setTimeout(() => { subProgress.classList.add('hidden'); subProgressFill.style.width = '0%'; subDone.classList.remove('hidden'); }, 400);
  } catch (err) {
    subProgressText.textContent = t('common.errorPrefix') + (err.name === 'AbortError' ? t('common.timeout') : err.message);
  }
}

// ---- TEXT TOOLS ----
document.querySelectorAll('input[name="ttool"]').forEach(r => r.addEventListener('change', () => {
  const tool = document.querySelector('input[name="ttool"]:checked').value;
  document.getElementById('ttJson').classList.toggle('hidden', tool !== 'json');
  document.getElementById('ttBase64').classList.toggle('hidden', tool !== 'base64');
  document.getElementById('ttCount').classList.toggle('hidden', tool !== 'count');
  document.getElementById('ttDiff').classList.toggle('hidden', tool !== 'diff');
}));

// JSON formatter
const ttJsonInput = document.getElementById('ttJsonInput');
const ttJsonOutput = document.getElementById('ttJsonOutput');
const ttJsonError = document.getElementById('ttJsonError');
document.getElementById('ttJsonFormatBtn').addEventListener('click', () => {
  try { ttJsonOutput.value = JSON.stringify(JSON.parse(ttJsonInput.value), null, 2); hideError(ttJsonError); }
  catch (err) { showError(ttJsonError, t('text.invalidJson') + ': ' + err.message); }
});
document.getElementById('ttJsonMinifyBtn').addEventListener('click', () => {
  try { ttJsonOutput.value = JSON.stringify(JSON.parse(ttJsonInput.value)); hideError(ttJsonError); }
  catch (err) { showError(ttJsonError, t('text.invalidJson') + ': ' + err.message); }
});
document.getElementById('ttJsonCopyBtn').addEventListener('click', () => copyToClipboard(ttJsonOutput.value));

// Base64
const ttB64Input = document.getElementById('ttB64Input');
const ttB64Output = document.getElementById('ttB64Output');
const ttB64Error = document.getElementById('ttB64Error');
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}
function b64decode(str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
document.getElementById('ttB64RunBtn').addEventListener('click', () => {
  const mode = document.querySelector('input[name="b64mode"]:checked').value;
  hideError(ttB64Error);
  try { ttB64Output.value = mode === 'encode' ? b64encode(ttB64Input.value) : b64decode(ttB64Input.value); }
  catch (err) { showError(ttB64Error, t('text.invalidBase64')); }
});
document.getElementById('ttB64CopyBtn').addEventListener('click', () => copyToClipboard(ttB64Output.value));

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard && navigator.clipboard.writeText(text).catch(() => {});
}

// Word / char counter
const ttCountInput = document.getElementById('ttCountInput');
const ttCountStats = document.getElementById('ttCountStats');
function updateCountStats() {
  const text = ttCountInput.value;
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, '').length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lines = text ? text.split('\n').length : 0;
  ttCountStats.innerHTML =
    `<span><b style="color:var(--text-primary)">${chars}</b> ${t('text.chars')}</span>` +
    `<span><b style="color:var(--text-primary)">${charsNoSpace}</b> ${t('text.charsNoSpace')}</span>` +
    `<span><b style="color:var(--text-primary)">${words}</b> ${t('text.words')}</span>` +
    `<span><b style="color:var(--text-primary)">${lines}</b> ${t('text.lines')}</span>`;
}
ttCountInput.addEventListener('input', updateCountStats);
updateCountStats();

// Diff
document.getElementById('ttDiffRunBtn').addEventListener('click', () => {
  const a = document.getElementById('ttDiffA').value.split('\n');
  const b = document.getElementById('ttDiffB').value.split('\n');
  const out = document.getElementById('ttDiffOutput');
  const n = a.length, m = b.length;
  let ops;
  if (n * m > 4000000) {
    ops = [];
    const max = Math.max(n, m);
    for (let i = 0; i < max; i++) {
      if (a[i] === b[i]) ops.push(['same', a[i] ?? '']);
      else { if (i < n) ops.push(['del', a[i]]); if (i < m) ops.push(['add', b[i]]); }
    }
  } else {
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    ops = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ops.push(['same', a[i]]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(['del', a[i]]); i++; }
      else { ops.push(['add', b[j]]); j++; }
    }
    while (i < n) { ops.push(['del', a[i]]); i++; }
    while (j < m) { ops.push(['add', b[j]]); j++; }
  }
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  out.innerHTML = ops.map(([type, line]) => {
    const color = type === 'add' ? 'var(--green)' : type === 'del' ? 'var(--red)' : 'var(--text-secondary)';
    const prefix = type === 'add' ? '+ ' : type === 'del' ? '- ' : '  ';
    return `<div style="color:${color}">${prefix}${esc(line)}</div>`;
  }).join('') || `<div style="color:var(--text-secondary)">${t('text.noDiff')}</div>`;
});
