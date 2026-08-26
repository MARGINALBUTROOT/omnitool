const express = require('express');
const { download } = require('@distube/yt-dlp');
const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const mammoth = require('mammoth');
const { Document: DocxDoc, Packer, Paragraph, TextRun } = require('docx');

const app = express();
const PORT = process.env.PORT || 3000;
const YT_TIMEOUT = 40000;
const YT_API_KEY = process.env.YOUTUBE_API_KEY || '';
const COOKIE_ADMIN_TOKEN = process.env.COOKIE_ADMIN_TOKEN || '';
let pdfFontBytes = null;

function parseIsoDuration(d) {
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1]||0)*3600) + (parseInt(m[2]||0)*60) + (parseInt(m[3]||0));
}

async function ytApiInfo(videoId) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${YT_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.items || data.items.length === 0) throw new Error('Video bulunamadı');
  const i = data.items[0];
  return {
    title: i.snippet.title,
    duration: parseIsoDuration(i.contentDetails.duration),
    thumbnail: i.snippet.thumbnails?.maxres?.url || i.snippet.thumbnails?.high?.url || i.snippet.thumbnails?.default?.url || '',
    author: i.snippet.channelTitle,
    extractor: 'YouTube',
    webpage_url: `https://www.youtube.com/watch?v=${videoId}`,
    formats: []
  };
}

ffmpeg.setFfmpegPath(ffmpegPath);

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const dls = path.join(__dirname, 'downloads');
const prc = path.join(__dirname, 'processed');
const upl = path.join(__dirname, 'uploads');
[dls, prc, upl].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d); });
const upload = multer({ dest: upl, limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

// ---- Basit bellek-içi IP başına rate limit (ağır endpoint'ler için) ----
const rateBuckets = new Map();
function rateLimit(maxReq, windowMs) {
  return (req, res, next) => {
    const key = req.ip + ':' + req.path;
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.start > windowMs) { bucket = { start: now, count: 0 }; rateBuckets.set(key, bucket); }
    bucket.count++;
    if (bucket.count > maxReq) return res.status(429).json({ error: 'Çok fazla istek, biraz sonra tekrar deneyin.' });
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) if (now - bucket.start > 10 * 60 * 1000) rateBuckets.delete(key);
}, 10 * 60 * 1000).unref();
const heavyLimit = rateLimit(20, 60 * 1000);

// ---- Yarım kalan / unutulan geçici dosyaları periyodik temizle (indirme hataları, kesilen istekler vb.) ----
const MAX_TEMP_AGE_MS = 2 * 60 * 60 * 1000;
function cleanupStaleTemp() {
  for (const dir of [dls, upl, prc]) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch { continue; }
    const now = Date.now();
    for (const name of entries) {
      const fp = path.join(dir, name);
      try {
        const st = fs.statSync(fp);
        if (st.isFile() && now - st.mtimeMs > MAX_TEMP_AGE_MS) fs.unlinkSync(fp);
      } catch {}
    }
  }
}
setInterval(cleanupStaleTemp, 30 * 60 * 1000).unref();

const ffDir = path.dirname(ffmpegPath);

function cleanUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') || u.hostname === 'youtu.be') {
      const vid = u.searchParams.get('v') || (u.hostname === 'youtu.be' ? u.pathname.slice(1).split('/')[0] : '');
      if (vid) return `https://www.youtube.com/watch?v=${vid}`;
    }
    if (u.hostname.includes('instagram.com')) {
      const m = u.pathname.match(/\/p\/([^\/]+)/) || u.pathname.match(/\/reel\/([^\/]+)/) || u.pathname.match(/\/tv\/([^\/]+)/);
      if (m) return `https://www.instagram.com/p/${m[1]}/`;
    }
    if (u.hostname.includes('kick.com')) return url;
    return url;
  } catch {}
  return url;
}

function getYtDlpPath() {
  const mp = require.resolve('@distube/yt-dlp');
  const base = path.join(path.dirname(mp), '..', 'bin', 'yt-dlp');
  return process.platform === 'win32' ? base + '.exe' : base;
}

function getCookiePath() {
  const kick = path.join(__dirname, 'kick.txt');
  if (fs.existsSync(kick) && fs.statSync(kick).size > 10) return kick;
  const cookies = path.join(__dirname, 'cookies.txt');
  if (fs.existsSync(cookies) && fs.statSync(cookies).size > 10) return cookies;
  return cookies;
}
function cookieFlags() { const p = getCookiePath(); return p ? ['--cookies', p] : []; }

function ensureCookies() {
  const cp = getCookiePath();
  if (!fs.existsSync(cp)) {
    const cookies = `# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	0	CONSENT	YES+TR
`;
    fs.writeFileSync(cp, cookies);
  }
}

function isYtUrl(url) {
  try { const u = new URL(url); return u.hostname.includes('youtube.com') || u.hostname === 'youtu.be'; } catch { return false; }
}

function ytInfo(url, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Zaman aşımı')), ms);
    const ck = cookieFlags();
    const isYt = isYtUrl(url);
    const strategies = isYt ? [
      [...ck, '--dump-json', '--skip-download', '--no-warnings', '--no-playlist', '--quiet', '--geo-bypass', '--extractor-args', 'youtube:player_client=android', '--extractor-args', 'youtube:skip=webpage'],
      [...ck, '--dump-json', '--skip-download', '--no-warnings', '--no-playlist', '--quiet', '--geo-bypass', '--extractor-args', 'youtube:player_client=web', '--extractor-args', 'youtube:skip=webpage'],
      [...ck, '--dump-json', '--skip-download', '--no-warnings', '--no-playlist', '--quiet', '--geo-bypass', '--extractor-args', 'youtube:player_client=android,tv', '--extractor-args', 'youtube:skip=webpage'],
      [...ck, '--dump-json', '--skip-download', '--no-warnings', '--no-playlist', '--quiet', '--geo-bypass'],
    ] : [
      [...ck, '--dump-json', '--skip-download', '--no-warnings', '--no-playlist', '--quiet', '--geo-bypass'],
    ];
    let idx = 0;
    let lastErr = '';
    function attempt() {
      if (idx >= strategies.length) { clearTimeout(t); return reject(new Error('Tüm yöntemler başarısız' + (lastErr ? ': ' + lastErr.slice(0, 200) : ''))); }
      const args = [url, ...strategies[idx]];
      const p = spawn(getYtDlpPath(), args);
      let stdout = '', stderr = '';
      p.stdout.on('data', d => stdout += d);
      p.stderr.on('data', d => stderr += d);
      p.on('close', c => {
        if (c === 0) {
          clearTimeout(t);
          try { resolve(JSON.parse(stdout)); }
          catch (e) { idx++; attempt(); }
        } else {
          if (stderr) lastErr = stderr;
          idx++; attempt();
        }
      });
      p.on('error', e => { clearTimeout(t); reject(e); });
    }
    attempt();
  });
}

function sanitize(n) { return (n || 'video').replace(/[^\w\s]/gi, '').trim().substring(0, 50) || 'video'; }
function safeUnlink(p) { try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {} }

function dlSync(url, fmt, outPath) {
  return new Promise((resolve, reject) => {
    const ck = cookieFlags();
    const isYt = isYtUrl(url);
    const strategies = isYt ? [
      [...ck, '-f', fmt, '-o', outPath, '--merge-output-format', 'mp4', '--ffmpeg-location', ffDir, '--no-playlist', '--no-warnings', '--quiet', '--geo-bypass', '--extractor-args', 'youtube:player_client=android', '--extractor-args', 'youtube:skip=webpage'],
      [...ck, '-f', fmt, '-o', outPath, '--merge-output-format', 'mp4', '--ffmpeg-location', ffDir, '--no-playlist', '--no-warnings', '--quiet', '--geo-bypass', '--extractor-args', 'youtube:player_client=web', '--extractor-args', 'youtube:skip=webpage'],
      [...ck, '-f', fmt, '-o', outPath, '--merge-output-format', 'mp4', '--ffmpeg-location', ffDir, '--no-playlist', '--no-warnings', '--quiet', '--geo-bypass', '--extractor-args', 'youtube:player_client=android,tv', '--extractor-args', 'youtube:skip=webpage'],
      [...ck, '-f', fmt, '-o', outPath, '--merge-output-format', 'mp4', '--ffmpeg-location', ffDir, '--no-playlist', '--no-warnings', '--quiet', '--geo-bypass'],
    ] : [
      [...ck, '-f', fmt, '-o', outPath, '--merge-output-format', 'mp4', '--ffmpeg-location', ffDir, '--no-playlist', '--no-warnings', '--quiet', '--geo-bypass'],
    ];
    let idx = 0;
    let lastErr = '';
    function attempt() {
      if (idx >= strategies.length) return reject(new Error('İndirme başarısız (tüm yöntemler denendi)' + (lastErr ? ': ' + lastErr.slice(0, 200) : '')));
      const args = [url, ...strategies[idx]];
      const p = spawn(getYtDlpPath(), args);
      let stderr = '';
      p.stderr.on('data', d => stderr += d);
      p.on('close', c => {
        if (c === 0) { const f = findFile(outPath); if (f) resolve(f); else { if (stderr) lastErr = stderr; idx++; attempt(); } return; }
        if (stderr) lastErr = stderr;
        idx++; attempt();
      });
      p.on('error', reject);
    }
    attempt();
  });
}

function findFile(basePath) {
  const dir = path.dirname(basePath);
  const base = path.basename(basePath);
  if (fs.existsSync(basePath)) return basePath;
  const files = fs.readdirSync(dir).filter(f => f.startsWith(base));
  if (files.length > 0) return path.join(dir, files[0]);
  return null;
}

app.post('/api/info', async (req, res) => {
  try {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL girin' });
    url = cleanUrl(url);
    const u = new URL(url);
    const isYt = u.hostname.includes('youtube.com') || u.hostname === 'youtu.be';
    if (isYt && YT_API_KEY) {
      const vid = u.searchParams.get('v') || (u.hostname === 'youtu.be' ? u.pathname.slice(1).split('/')[0] : '');
      if (!vid) return res.status(400).json({ error: 'Video ID bulunamadı' });
      const data = await ytApiInfo(vid);
      return res.json(data);
    }
    const info = await ytInfo(url, YT_TIMEOUT).catch(async (e) => {
      if (isYt && YT_API_KEY) {
        const vid = u.searchParams.get('v') || (u.hostname === 'youtu.be' ? u.pathname.slice(1).split('/')[0] : '');
        if (vid) return await ytApiInfo(vid);
      }
      throw e;
    });
    let formats = (info.formats || []).filter(f => f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none');
    if (formats.length === 0) {
      formats = (info.formats || []).filter(f => f.vcodec && f.vcodec !== 'none')
        .map(f => ({ quality: f.format_note || f.resolution || '?', container: f.ext, size: f.filesize }))
        .filter((f, i, a) => a.findIndex(x => x.quality === f.quality) === i);
    } else {
      formats = formats.map(f => ({ quality: f.format_note || f.resolution || '?', container: f.ext, size: f.filesize }))
        .filter((f, i, a) => a.findIndex(x => x.quality === f.quality) === i);
    }
    res.json({
      title: info.title || 'Video',
      duration: info.duration || 0,
      thumbnail: info.thumbnail || '',
      author: info.uploader || info.channel || '',
      extractor: info.extractor_key || info.extractor || '',
      webpage_url: info.webpage_url || info.original_url || '',
      formats
    });
  } catch (err) {
    res.status(500).json({ error: 'Video bilgisi alınamadı: ' + err.message });
  }
});

app.post('/api/convert', heavyLimit, async (req, res) => {
  try {
    let { url, format, quality } = req.body;
    if (!url) return res.status(400).json({ error: 'URL girin' });
    url = cleanUrl(url);
    const u = new URL(url);
    const isYt = u.hostname.includes('youtube.com') || u.hostname === 'youtu.be';
    let baseName;
    if (isYt && YT_API_KEY) {
      const vid = u.searchParams.get('v') || (u.hostname === 'youtu.be' ? u.pathname.slice(1).split('/')[0] : '');
      if (vid) {
        try { const data = await ytApiInfo(vid); baseName = sanitize(data.title); } catch (e) {}
      }
    }
    if (!baseName) {
      const info = await ytInfo(url, YT_TIMEOUT);
      baseName = sanitize(info.title);
    }
    const ts = Date.now();
    const isMp3 = format === 'mp3';
    const ext = isMp3 ? 'mp3' : 'mp4';
    const rawPath = path.join(dls, `raw_${ts}.${ext}`);
    const outName = `${baseName}_${ts}.${ext}`;
    const outPath = path.join(prc, outName);

    const qMap = { '1080p': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best', '720p': 'bestvideo[height<=720]+bestaudio/best[height<=720]/best', '480p': 'bestvideo[height<=480]+bestaudio/best[height<=480]/best', '360p': 'bestvideo[height<=360]+bestaudio/best[height<=360]/best' };

    if (isMp3) {
      const rawVid = path.join(dls, `raw_${ts}_vid.mp4`);
      const vidPath = await dlSync(url, qMap[quality] || 'bestvideo+bestaudio/best', rawVid);
      ffmpeg(vidPath)
        .audioBitrate(parseInt(quality) || 192)
        .audioCodec('libmp3lame')
        .output(outPath)
        .on('end', () => { safeUnlink(vidPath); res.json({ file: outName, title: baseName }); })
        .on('error', (e) => { safeUnlink(vidPath); res.status(500).json({ error: 'MP3 dönüşüm başarısız: ' + e.message }); })
        .run();
    } else {
      const fmt = qMap[quality] || 'bestvideo+bestaudio/best';
      const dlPath = await dlSync(url, fmt, rawPath);
      try { fs.renameSync(dlPath, outPath); } catch (e) { safeUnlink(dlPath); return res.status(500).json({ error: 'Dosya işlenemedi' }); }
      res.json({ file: outName, title: baseName });
    }
  } catch (err) {
    res.status(500).json({ error: 'Dönüştürme başarısız: ' + err.message });
  }
});

app.post('/api/trim', heavyLimit, upload.single('video'), async (req, res) => {
  try {
    let inputPath, baseName;
    if (req.file) {
      inputPath = req.file.path;
      baseName = path.parse(req.file.originalname).name.replace(/[^\w\s]/gi, '').trim().substring(0, 50) || 'video';
    } else {
      let { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL veya dosya gerekli' });
      url = cleanUrl(url);
      const info = await ytInfo(url, YT_TIMEOUT);
      baseName = sanitize(info.title);
      const ts = Date.now();
      inputPath = path.join(dls, `raw_${ts}.mp4`);
      inputPath = await dlSync(url, 'bestvideo+bestaudio/best', inputPath);
    }
    const { startTime, endTime } = req.body;
    const outName = `${baseName}_kesilmis_${Date.now()}.mp4`;
    const outPath = path.join(prc, outName);
    if (startTime || endTime) {
      const start = startTime || '00:00:00';
      const dur = endTime ? getDuration(start, endTime) : undefined;
      ffmpeg(inputPath)
        .setStartTime(start).duration(dur).output(outPath)
        .on('end', () => { if (!req.file) safeUnlink(inputPath); res.json({ file: outName, title: baseName }); })
        .on('error', (e) => { if (!req.file) safeUnlink(inputPath); res.status(500).json({ error: 'Kesme başarısız: ' + e.message }); })
        .run();
    } else {
      try { fs.renameSync(inputPath, outPath); } catch (e) { safeUnlink(inputPath); return res.status(500).json({ error: 'Dosya işlenemedi' }); }
      res.json({ file: outName, title: baseName });
    }
  } catch (err) {
    res.status(500).json({ error: 'İşlem başarısız: ' + err.message });
  }
});

const extFormatMap = {
  mp4: { vid: 'libx264', aud: 'aac' }, avi: { vid: 'libx264', aud: 'pcm_s16le' },
  mkv: { vid: 'libx264', aud: 'aac' }, mov: { vid: 'libx264', aud: 'aac' },
  webm: { vid: 'libvpx', aud: 'libvorbis' }, mpg: { vid: 'mpeg2video', aud: 'mp2' },
  wmv: { vid: 'wmv2', aud: 'wmav2' }, flv: { vid: 'flv1', aud: 'mp3' }
};
const audioFormatMap = {
  mp3: 'libmp3lame', wav: 'pcm_s16le', flac: 'flac',
  ogg: 'libvorbis', aac: 'aac', m4a: 'aac', wma: 'wmav2'
};

app.post('/api/convert-file', heavyLimit, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Dosya gerekli' });
    const inputPath = req.file.path;
    const originalExt = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    const targetExt = req.body.format || 'mp4';
    const op = req.body.op || 'convert';
    const baseName = path.parse(req.file.originalname).name.replace(/[^\w\s]/gi, '').trim().substring(0, 50) || 'file';

    if (op === 'zip') {
      const outName = `${baseName}_arsiv_${Date.now()}.zip`;
      const outPath = path.join(prc, outName);
      const output = fs.createWriteStream(outPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(output);
      archive.file(inputPath, { name: req.file.originalname });
      await archive.finalize();
      output.on('close', () => {
        safeUnlink(inputPath);
        const size = fs.statSync(outPath).size;
        res.json({ file: outName, title: baseName, original: req.file.size, compressed: size, savings: ((1 - size / req.file.size) * 100).toFixed(0) });
      });
      output.on('error', () => { safeUnlink(inputPath); res.status(500).json({ error: 'ZIP oluşturulamadı' }); });
      return;
    }

    if (op === 'unzip') {
      if (originalExt !== 'zip') { safeUnlink(inputPath); return res.status(400).json({ error: 'Sadece ZIP dosyaları açılır' }); }
      try {
        const zip = new AdmZip(inputPath);
        const entries = zip.getEntries();
        const extracted = [];
        for (const entry of entries) {
          if (entry.isDirectory) continue;
          const ext = path.extname(entry.entryName);
          const inBase = path.parse(entry.entryName).name.replace(/[^\w\s]/gi, '').trim().substring(0, 40) || 'file';
          const outName = `${inBase}_cikarilan_${Date.now()}${ext}`;
          const outPath = path.join(prc, outName);
          fs.writeFileSync(outPath, entry.getData());
          extracted.push(outName);
        }
        safeUnlink(inputPath);
        if (extracted.length === 0) return res.status(400).json({ error: 'ZIP boş' });
        if (extracted.length === 1) return res.json({ file: extracted[0], title: baseName });
        const zipName = baseName + '_cikarilan.zip';
        const zipPath = path.join(prc, zipName);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(output);
        for (const f of extracted) archive.file(path.join(prc, f), { name: f });
        await archive.finalize();
        output.on('close', () => { extracted.forEach(f => safeUnlink(path.join(prc, f))); res.json({ file: zipName, title: baseName }); });
        output.on('error', () => res.status(500).json({ error: 'ZIP hatası' }));
      } catch { safeUnlink(inputPath); return res.status(500).json({ error: 'ZIP açılamadı' }); }
      return;
    }

    if (op === 'convert') {
      const outName = `${baseName}_donusturuldu_${Date.now()}.${targetExt}`;
      const outPath = path.join(prc, outName);
      const isAudioTarget = !!audioFormatMap[targetExt];
      const isAudioSource = !!audioFormatMap[originalExt];
      const isVideoSource = !!extFormatMap[originalExt];

      if (isAudioTarget && isAudioSource) {
        ffmpeg(inputPath).audioCodec(audioFormatMap[targetExt]).format(targetExt)
          .output(outPath)
          .on('end', () => { safeUnlink(inputPath); res.json({ file: outName, title: baseName }); })
          .on('error', (e) => { safeUnlink(inputPath); res.status(500).json({ error: e.message }); })
          .run();
        return;
      }
      if (isAudioTarget && isVideoSource) {
        ffmpeg(inputPath).noVideo().audioCodec(audioFormatMap[targetExt]).format(targetExt)
          .output(outPath)
          .on('end', () => { safeUnlink(inputPath); res.json({ file: outName, title: baseName }); })
          .on('error', (e) => { safeUnlink(inputPath); res.status(500).json({ error: e.message }); })
          .run();
        return;
      }
      if (extFormatMap[targetExt] || targetExt === 'mp4') {
        const codec = extFormatMap[targetExt] || extFormatMap.mp4;
        ffmpeg(inputPath).videoCodec(codec.vid).audioCodec(codec.aud).format(targetExt)
          .output(outPath)
          .on('end', () => { safeUnlink(inputPath); res.json({ file: outName, title: baseName }); })
          .on('error', (e) => { safeUnlink(inputPath); res.status(500).json({ error: e.message }); })
          .run();
        return;
      }
      safeUnlink(inputPath);
      return res.status(400).json({ error: `${originalExt} → ${targetExt} dönüşümü desteklenmiyor` });
    }

    safeUnlink(inputPath);
    res.status(400).json({ error: 'Bilinmeyen işlem: ' + op });
  } catch (err) {
    res.status(500).json({ error: 'Hata: ' + err.message });
  }
});

const imgExts = ['jpg','jpeg','png'];
const txtExts = ['txt','csv','md','json','xml','log','ini','cfg','yaml','yml','env'];

app.post('/api/pdf-convert', heavyLimit, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Dosya gerekli' });
    const inputPath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    const baseName = path.parse(req.file.originalname).name.replace(/[^\w\s]/gi, '').trim().substring(0, 50) || 'file';
    const outName = `${baseName}_pdf_${Date.now()}.pdf`;
    const outPath = path.join(prc, outName);
    const pdfDoc = await PDFDocument.create();
    let page;

    if (imgExts.includes(ext)) {
      const imgBytes = fs.readFileSync(inputPath);
      let img;
      if (ext === 'jpg' || ext === 'jpeg') img = await pdfDoc.embedJpg(imgBytes);
      else img = await pdfDoc.embedPng(imgBytes);
      page = pdfDoc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    } else if (ext === 'docx') {
      const result = await mammoth.extractRawText({ path: inputPath });
      const text = result.value;
      pdfDoc.registerFontkit(fontkit);
      const font = pdfFontBytes ? await pdfDoc.embedFont(pdfFontBytes) : await pdfDoc.embedFont(StandardFonts.Helvetica);
      page = pdfDoc.addPage([612, 792]);
      const lines = text.split('\n');
      let y = 750;
      const fontSize = 11;
      for (const line of lines) {
        if (y < 40) { page = pdfDoc.addPage([612, 792]); y = 750; }
        let textLine = line.trim();
        if (!textLine) { y -= fontSize + 4; continue; }
        const words = textLine.split(' ');
        let currentLine = '';
        for (const word of words) {
          const testLine = currentLine ? currentLine + ' ' + word : word;
          const w = font.widthOfTextAtSize(testLine, fontSize);
          if (w > 520 && currentLine) {
            page.drawText(currentLine, { x: 50, y, size: fontSize, font, color: rgb(0,0,0) });
            y -= fontSize + 4;
            if (y < 40) { page = pdfDoc.addPage([612, 792]); y = 750; }
            currentLine = word;
          } else { currentLine = testLine; }
        }
        if (currentLine) page.drawText(currentLine, { x: 50, y, size: fontSize, font, color: rgb(0,0,0) });
        y -= fontSize + 6;
      }
    } else if (txtExts.includes(ext)) {
      const text = fs.readFileSync(inputPath, 'utf8');
      pdfDoc.registerFontkit(fontkit);
      const font = pdfFontBytes ? await pdfDoc.embedFont(pdfFontBytes) : await pdfDoc.embedFont(StandardFonts.Helvetica);
      page = pdfDoc.addPage([612, 792]);
      const lines = text.split('\n');
      let y = 750;
      const fontSize = 11;
      for (const line of lines) {
        if (y < 40) { page = pdfDoc.addPage([612, 792]); y = 750; }
        let textLine = line.trim();
        if (!textLine) { y -= fontSize + 4; continue; }
        const words = textLine.split(' ');
        let currentLine = '';
        for (const word of words) {
          const testLine = currentLine ? currentLine + ' ' + word : word;
          const w = font.widthOfTextAtSize(testLine, fontSize);
          if (w > 520 && currentLine) {
            page.drawText(currentLine, { x: 50, y, size: fontSize, font, color: rgb(0,0,0) });
            y -= fontSize + 4;
            if (y < 40) { page = pdfDoc.addPage([612, 792]); y = 750; }
            currentLine = word;
          } else { currentLine = testLine; }
        }
        if (currentLine) page.drawText(currentLine, { x: 50, y, size: fontSize, font, color: rgb(0,0,0) });
        y -= fontSize + 6;
      }
    } else {
      safeUnlink(inputPath);
      return res.status(400).json({ error: `PDF dönüşümü ${ext} için desteklenmiyor. Desteklenen: resim (jpg,png), belge (txt,csv,md,json,docx)` });
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outPath, pdfBytes);
    safeUnlink(inputPath);
    res.json({ file: outName, title: baseName });
  } catch (err) {
    res.status(500).json({ error: 'PDF hatası: ' + err.message });
  }
});

app.post('/api/pdf-merge', heavyLimit, upload.array('files', 30), async (req, res) => {
  const files = req.files || [];
  try {
    if (files.length < 2) { files.forEach(f => safeUnlink(f.path)); return res.status(400).json({ error: 'En az 2 PDF dosyası gerekli' }); }
    const merged = await PDFDocument.create();
    for (const f of files) {
      const bytes = fs.readFileSync(f.path);
      const src = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }
    const outName = `birlestirilmis_${Date.now()}.pdf`;
    const outPath = path.join(prc, outName);
    fs.writeFileSync(outPath, await merged.save());
    files.forEach(f => safeUnlink(f.path));
    res.json({ file: outName, title: 'birlestirilmis' });
  } catch (err) {
    files.forEach(f => safeUnlink(f.path));
    res.status(500).json({ error: 'PDF birleştirme hatası: ' + err.message + ' (dosyaların geçerli PDF olduğundan emin olun)' });
  }
});

app.post('/api/pdf-split', heavyLimit, upload.single('file'), async (req, res) => {
  const inputPath = req.file && req.file.path;
  try {
    if (!req.file) return res.status(400).json({ error: 'Dosya gerekli' });
    const bytes = fs.readFileSync(inputPath);
    const src = await PDFDocument.load(bytes);
    const count = src.getPageCount();
    if (count < 2) { safeUnlink(inputPath); return res.status(400).json({ error: 'Bölmek için en az 2 sayfalı bir PDF gerekli' }); }
    const baseName = path.parse(req.file.originalname).name.replace(/[^\w\s]/gi, '').trim().substring(0, 40) || 'pdf';
    const ts = Date.now();
    const parts = [];
    for (let i = 0; i < count; i++) {
      const doc = await PDFDocument.create();
      const [page] = await doc.copyPages(src, [i]);
      doc.addPage(page);
      const partName = `${baseName}_sayfa${i + 1}_${ts}.pdf`;
      fs.writeFileSync(path.join(prc, partName), await doc.save());
      parts.push(partName);
    }
    safeUnlink(inputPath);
    const zipName = `${baseName}_bolunmus_${ts}.zip`;
    const zipPath = path.join(prc, zipName);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(output);
    for (const p of parts) archive.file(path.join(prc, p), { name: p });
    await archive.finalize();
    output.on('close', () => { parts.forEach(p => safeUnlink(path.join(prc, p))); res.json({ file: zipName, title: baseName, pages: count }); });
    output.on('error', () => res.status(500).json({ error: 'ZIP hatası' }));
  } catch (err) {
    safeUnlink(inputPath);
    res.status(500).json({ error: 'PDF bölme hatası: ' + err.message + ' (dosyanın geçerli bir PDF olduğundan emin olun)' });
  }
});

app.post('/api/subtitle-list', heavyLimit, async (req, res) => {
  try {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL girin' });
    url = cleanUrl(url);
    const info = await ytInfo(url, YT_TIMEOUT);
    const subs = info.subtitles || {};
    const autoSubs = info.automatic_captions || {};
    const manual = Object.keys(subs);
    const auto = Object.keys(autoSubs).filter(k => !manual.includes(k));
    if (manual.length === 0 && auto.length === 0) return res.status(404).json({ error: 'Bu video için altyazı bulunamadı' });
    res.json({ title: info.title || 'video', manual, auto });
  } catch (err) {
    res.status(500).json({ error: 'Altyazı listesi alınamadı: ' + err.message });
  }
});

app.post('/api/subtitle-download', heavyLimit, async (req, res) => {
  try {
    let { url, lang, auto } = req.body;
    if (!url || !lang) return res.status(400).json({ error: 'URL ve dil gerekli' });
    url = cleanUrl(url);
    const info = await ytInfo(url, YT_TIMEOUT).catch(() => null);
    const baseName = sanitize(info && info.title);
    const ts = Date.now();
    const outBase = path.join(dls, `sub_${ts}`);
    const ck = cookieFlags();
    const args = [url, ...ck, '--skip-download', '--no-warnings', '--quiet', '--geo-bypass', '--ffmpeg-location', ffDir,
      auto ? '--write-auto-sub' : '--write-sub', '--sub-langs', lang, '--sub-format', 'srt/best',
      '-o', outBase];
    await new Promise((resolve, reject) => {
      const p = spawn(getYtDlpPath(), args);
      let stderr = '';
      p.stderr.on('data', d => stderr += d);
      p.on('close', c => c === 0 ? resolve() : reject(new Error(stderr.slice(0, 300) || 'yt-dlp hata verdi')));
      p.on('error', reject);
    });
    const found = fs.readdirSync(dls).find(f => f.startsWith(`sub_${ts}`));
    if (!found) return res.status(404).json({ error: 'Bu dil için altyazı bulunamadı' });
    const ext = path.extname(found) || '.srt';
    const outName = `${baseName}_${lang}${ext}`;
    const outPath = path.join(prc, outName);
    fs.renameSync(path.join(dls, found), outPath);
    res.json({ file: outName, title: baseName });
  } catch (err) {
    res.status(500).json({ error: 'Altyazı indirilemedi: ' + err.message });
  }
});

app.post('/api/document-read', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Dosya gerekli' });
    const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    const baseName = path.parse(req.file.originalname).name.replace(/[^\w\s]/gi, '').trim().substring(0, 50) || 'belge';
    let content = '';
    if (ext === 'docx') {
      const result = await mammoth.extractRawText({ path: req.file.path });
      content = result.value;
    } else {
      content = fs.readFileSync(req.file.path, 'utf8');
    }
    safeUnlink(req.file.path);
    res.json({ content, title: baseName, ext });
  } catch (err) {
    res.status(500).json({ error: 'Okuma hatası: ' + err.message });
  }
});

app.post('/api/document-save', upload.none(), async (req, res) => {
  try {
    const { content, title, format } = req.body;
    if (!content) return res.status(400).json({ error: 'İçerik gerekli' });
    const baseName = (title || 'belge').replace(/[^\w\s]/gi, '').trim().substring(0, 50) || 'belge';
    let outName, outPath;
    if (format === 'docx') {
      outName = `${baseName}_duzenlenmis_${Date.now()}.docx`;
      outPath = path.join(prc, outName);
      const doc = new DocxDoc({ sections: [{ children: content.split('\n').map(line => new Paragraph({ children: [new TextRun(line || ' ')] })) }] });
      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(outPath, buffer);
    } else {
      outName = `${baseName}_duzenlenmis_${Date.now()}.txt`;
      outPath = path.join(prc, outName);
      fs.writeFileSync(outPath, content, 'utf8');
    }
    res.json({ file: outName, title: baseName });
  } catch (err) {
    res.status(500).json({ error: 'Kaydetme hatası: ' + err.message });
  }
});

app.post('/api/cookies', (req, res) => {
  try {
    if (COOKIE_ADMIN_TOKEN && req.get('x-admin-token') !== COOKIE_ADMIN_TOKEN) {
      return res.status(403).json({ error: 'Yetkisiz' });
    }
    const { cookies } = req.body;
    if (!cookies) return res.status(400).json({ error: 'Cookie gerekli' });
    fs.writeFileSync(getCookiePath(), cookies);
    console.log('Cookies güncellendi');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/compress', heavyLimit, upload.single('video'), async (req, res) => {
  try {
    let inputPath, baseName, origSize;
    if (req.file) {
      inputPath = req.file.path;
      baseName = path.parse(req.file.originalname).name.replace(/[^\w\s]/gi, '').trim().substring(0, 50) || 'video';
      origSize = req.file.size;
    } else {
      let { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL veya dosya gerekli' });
      url = cleanUrl(url);
      const info = await ytInfo(url, YT_TIMEOUT);
      baseName = sanitize(info.title);
      const ts = Date.now();
      inputPath = path.join(dls, `raw_${ts}.mp4`);
      inputPath = await dlSync(url, 'bestvideo+bestaudio/best', inputPath);
      origSize = fs.statSync(inputPath).size;
    }
    const { level } = req.body;
    const crfMap = { dusuk: 32, orta: 26, yuksek: 20, cyuksek: 16 };
    const crf = crfMap[level] || 26;
    const labelMap = { dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek', cyuksek: 'Çok Yüksek' };
    const outName = `${baseName}_sikistirilmis_${Date.now()}.mp4`;
    const outPath = path.join(prc, outName);
    ffmpeg(inputPath)
      .videoCodec('libx264').audioCodec('aac')
      .outputOptions(['-crf', String(crf), '-preset', 'medium'])
      .output(outPath)
      .on('end', () => {
        if (!req.file) safeUnlink(inputPath);
        const newSize = fs.statSync(outPath).size;
        const pct = ((1 - newSize / origSize) * 100).toFixed(0);
        res.json({ file: outName, title: baseName, original: origSize, compressed: newSize, savings: pct, level: labelMap[level] || 'Orta' });
      })
      .on('error', (e) => { if (!req.file) safeUnlink(inputPath); res.status(500).json({ error: 'Sıkıştırma başarısız: ' + e.message }); })
      .run();
  } catch (err) {
    res.status(500).json({ error: 'İşlem başarısız: ' + err.message });
  }
});

app.post('/api/slideshow', heavyLimit, upload.any(), async (req, res) => {
  try {
    const images = (req.files || []).filter(f => f.fieldname === 'images');
    if (images.length < 2) { return res.status(400).json({ error: 'En az 2 fotoğraf gerekli' }); }
    const audio = (req.files || []).find(f => f.fieldname === 'audio');
    const transition = req.body.transition || 'fade';
    const dur = parseFloat(req.body.duration) || 3;
    const reso = req.body.resolution || '1280x720';
    const [w, h] = reso.split('x').map(Number);
    const transDur = 0.5;
    const baseName = ('slideshow_' + Date.now()).substring(0, 50);
    const outName = `${baseName}.mp4`;
    const outPath = path.join(prc, outName);
    const tempVids = [];

    // Create individual video segments from each image
    for (let i = 0; i < images.length; i++) {
      const segPath = path.join(prc, `seg_${baseName}_${i}.mp4`);
      await new Promise((resolve, reject) => {
        const p = spawn(ffmpegPath, ['-loop', '1', '-t', String(dur + transDur), '-i', images[i].path, '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,fps=24`, '-c:v', 'libx264', '-crf', '23', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-y', segPath]);
        let err = '';
        p.stderr.on('data', d => err += d);
        p.on('close', c => c === 0 ? resolve() : reject(new Error('Segment hatası: ' + err)));
        p.on('error', reject);
      });
      tempVids.push(segPath);
    }

    // Build xfade chain
    const filterParts = [];
    const step = dur - transDur; // time between segment starts
    for (let i = 0; i < tempVids.length; i++) {
      filterParts.push(`[${i}]settb=AVTB,setpts=PTS-STARTPTS+${i * step}/TB[${i}v]`);
    }
    const maxOff = tempVids.length * step + transDur;
    let prev = '0v';
    for (let i = 0; i < tempVids.length - 1; i++) {
      const xfadeOff = (i + 1) * step;
      const outLabel = i === tempVids.length - 2 ? 'out' : `t${i}`;
      filterParts.push(`[${prev}][${i+1}v]xfade=transition=${transition}:duration=${transDur}:offset=${xfadeOff},format=yuv420p${outLabel === 'out' ? '[out]' : `[${outLabel}]`}`);
      prev = outLabel;
    }
    if (tempVids.length === 1) filterParts.push('[0]copy[out]');

    const tempConcat = path.join(prc, `concat_${baseName}.mp4`);
    const fcArgs = [];
    for (const v of tempVids) fcArgs.push('-i', v);
    fcArgs.push('-filter_complex', filterParts.join(';'), '-map', '[out]', '-c:v', 'libx264', '-crf', '23', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-t', String(maxOff), '-y', tempConcat);
    await new Promise((resolve, reject) => {
      const p = spawn(ffmpegPath, fcArgs);
      let err = '';
      p.stderr.on('data', d => err += d);
      p.on('close', c => c === 0 ? resolve() : reject(new Error('Xfade hatası: ' + err)));
      p.on('error', reject);
    });

    // Add audio overlay if provided
    if (audio) {
      await new Promise((resolve, reject) => {
        const p = spawn(ffmpegPath, ['-i', tempConcat, '-i', audio.path, '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-y', outPath]);
        let err = '';
        p.stderr.on('data', d => err += d);
        p.on('close', c => {
          tempVids.forEach(f => safeUnlink(f)); safeUnlink(tempConcat); safeUnlink(audio.path);
          c === 0 ? resolve() : reject(new Error('Ses hatası: ' + err));
        });
        p.on('error', reject);
      });
    } else {
      await fs.promises.rename(tempConcat, outPath).catch(() => {});
      tempVids.forEach(f => safeUnlink(f));
    }
    images.forEach(f => safeUnlink(f.path));
    res.json({ file: outName, title: 'Slayt' });
  } catch (err) {
    res.status(500).json({ error: 'Slayt hatası: ' + err.message });
  }
});

app.get('/api/download/:file', (req, res) => {
  const name = path.basename(req.params.file);
  const fp = path.join(prc, name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Dosya bulunamadı' });
  res.download(fp, () => { setTimeout(() => safeUnlink(fp), 60000); });
});

app.use((req, res) => { res.status(404).json({ error: 'Bulunamadı' }); });

// Merkezi hata yakalayıcı: bozuk JSON body, çok büyük dosya/istek vb. her zaman JSON döner
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Geçersiz istek gövdesi (JSON)' });
  if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Dosya/istek çok büyük' });
  console.error(err);
  res.status(500).json({ error: err.message || 'Sunucu hatası' });
});

function getDuration(start, end) {
  const s = start.split(':').map(Number);
  const e = end.split(':').map(Number);
  return Math.max((e[0]*3600+e[1]*60+e[2]) - (s[0]*3600+s[1]*60+s[2]), 0);
}

async function ensureBinary() {
  const ytPath = getYtDlpPath();
  if (process.platform === 'win32') {
    if (!fs.existsSync(ytPath)) {
      const v = await download();
      console.log(`yt-dlp v${v} hazır`);
    }
    return;
  }
  // Linux: download standalone binary (not Python zipapp)
  const binDir = path.dirname(ytPath);
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
  const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
  console.log('yt-dlp standalone indiriliyor...');
  const res = await fetch(url);
  if (!res.ok) throw new Error('yt-dlp indirilemedi: ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(ytPath, buf);
  fs.chmodSync(ytPath, 0o755);
  console.log('yt-dlp hazır (' + (buf.length / 1024 / 1024).toFixed(1) + ' MB)');
}

ensureBinary().then(() => { ensureCookies(); ensurePdfFont().then(() => app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`))); });
async function ensurePdfFont() {
  const fontPath = path.join(__dirname, 'DejaVuSans.ttf');
  if (fs.existsSync(fontPath)) { pdfFontBytes = fs.readFileSync(fontPath); console.log('Font hazır'); return; }
  try {
    const url = 'https://mirrors.ibiblio.org/pub/mirrors/CTAN/fonts/dejavu/truetype/DejaVuSans.ttf';
    const res = await fetch(url);
    if (!res.ok) { console.warn('Font indirilemedi, ASCII fallback'); return; }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(fontPath, buf);
    pdfFontBytes = buf;
    console.log('DejaVuSans.ttf indirildi (' + (buf.length / 1024).toFixed(0) + ' KB)');
  } catch { console.warn('Font hatası, ASCII fallback'); }
}
ensurePdfFont();
