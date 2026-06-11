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
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const YT_TIMEOUT = 40000;
const YT_API_KEY = process.env.YOUTUBE_API_KEY || '';
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
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dls = path.join(__dirname, 'downloads');
const prc = path.join(__dirname, 'processed');
const upl = path.join(__dirname, 'uploads');
[dls, prc, upl].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d); });
const upload = multer({ dest: upl });

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
    if (u.hostname.includes('kick.com')) {
      const m = u.pathname.match(/\/video\/([a-zA-Z0-9]+)/);
      if (m) return `https://kick.com/video/${m[1]}`;
    }
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
  return path.join(__dirname, 'cookies.txt');
}

function ensureCookies() {
  const cp = getCookiePath();
  if (!fs.existsSync(cp)) {
    const cookies = `# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	0	CONSENT	YES+TR
`;
    fs.writeFileSync(cp, cookies);
  }
}

function ytInfo(url, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Zaman aşımı')), ms);
    const ck = fs.existsSync(getCookiePath()) ? ['--cookies', getCookiePath()] : [];
    const strategies = [
      [...ck, '--dump-json', '--skip-download', '--no-warnings', '--no-playlist', '--quiet', '--geo-bypass', '--extractor-args', 'youtube:player_client=android', '--extractor-args', 'youtube:skip=webpage'],
      [...ck, '--dump-json', '--skip-download', '--no-warnings', '--no-playlist', '--quiet', '--geo-bypass', '--extractor-args', 'youtube:player_client=web', '--extractor-args', 'youtube:skip=webpage'],
      [...ck, '--dump-json', '--skip-download', '--no-warnings', '--no-playlist', '--quiet', '--geo-bypass', '--extractor-args', 'youtube:player_client=android,tv', '--extractor-args', 'youtube:skip=webpage'],
      [...ck, '--dump-json', '--skip-download', '--no-warnings', '--no-playlist', '--quiet', '--geo-bypass'],
    ];
    let idx = 0;
    function attempt() {
      if (idx >= strategies.length) { clearTimeout(t); return reject(new Error('Tüm yöntemler başarısız')); }
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
    const ck = fs.existsSync(getCookiePath()) ? ['--cookies', getCookiePath()] : [];
    const strategies = [
      [...ck, '-f', fmt, '-o', outPath, '--merge-output-format', 'mp4', '--ffmpeg-location', ffDir, '--no-playlist', '--no-warnings', '--quiet', '--geo-bypass', '--extractor-args', 'youtube:player_client=android', '--extractor-args', 'youtube:skip=webpage'],
      [...ck, '-f', fmt, '-o', outPath, '--merge-output-format', 'mp4', '--ffmpeg-location', ffDir, '--no-playlist', '--no-warnings', '--quiet', '--geo-bypass', '--extractor-args', 'youtube:player_client=web', '--extractor-args', 'youtube:skip=webpage'],
      [...ck, '-f', fmt, '-o', outPath, '--merge-output-format', 'mp4', '--ffmpeg-location', ffDir, '--no-playlist', '--no-warnings', '--quiet', '--geo-bypass', '--extractor-args', 'youtube:player_client=android,tv', '--extractor-args', 'youtube:skip=webpage'],
      [...ck, '-f', fmt, '-o', outPath, '--merge-output-format', 'mp4', '--ffmpeg-location', ffDir, '--no-playlist', '--no-warnings', '--quiet', '--geo-bypass'],
    ];
    let idx = 0;
    function attempt() {
      if (idx >= strategies.length) return reject(new Error('İndirme başarısız (tüm yöntemler denendi)'));
      const args = [url, ...strategies[idx]];
      const p = spawn(getYtDlpPath(), args);
      let stderr = '';
      p.stderr.on('data', d => stderr += d);
      p.on('close', c => {
        if (c === 0) { const f = findFile(outPath); if (f) resolve(f); else { idx++; attempt(); } return; }
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

app.post('/api/convert', async (req, res) => {
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

app.post('/api/trim', upload.single('video'), async (req, res) => {
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

app.post('/api/convert-file', upload.single('file'), async (req, res) => {
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

        setTimeout(() => { extracted.forEach(f => safeUnlink(path.join(prc, f))); }, 1000);
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

const imgExts = ['jpg','jpeg','png','gif','webp','bmp','tiff','tif','svg'];
const txtExts = ['txt','csv','md','json','xml','log','ini','cfg','yaml','yml','env'];

app.post('/api/pdf-convert', upload.single('file'), async (req, res) => {
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
      return res.status(400).json({ error: `PDF dönüşümü ${ext} için desteklenmiyor. Desteklenen: resim (jpg,png,gif,webp), belge (txt,csv,md,json,docx)` });
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outPath, pdfBytes);
    safeUnlink(inputPath);
    res.json({ file: outName, title: baseName });
  } catch (err) {
    res.status(500).json({ error: 'PDF hatası: ' + err.message });
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

app.post('/api/send-mail', upload.single('attachment'), async (req, res) => {
  try {
    const { host, port, user, pass, fromName, to, subject, body } = req.body;
    if (!host || !user || !pass || !to || !subject || !body) return res.status(400).json({ error: 'Eksik alanlar (host, user, pass, to, subject, body gerekli)' });
    const recipients = to.split(/[\n,;]+/).map(e => e.trim()).filter(e => e.includes('@'));
    if (recipients.length === 0) return res.status(400).json({ error: 'Geçerli e-posta bulunamadı' });
    const transporter = nodemailer.createTransport({ host, port: parseInt(port) || 587, secure: parseInt(port) === 465, auth: { user, pass } });
    await transporter.verify();
    const results = [];
    for (const addr of recipients) {
      try {
        const mailOpts = {
          from: `"${fromName || user}" <${user}>`, to: addr,
          subject, text: body,
          attachments: req.file ? [{ filename: req.file.originalname, path: req.file.path }] : []
        };
        const info = await transporter.sendMail(mailOpts);
        results.push({ email: addr, status: 'ok', id: info.messageId });
      } catch (e) {
        results.push({ email: addr, status: 'hata', error: e.message });
      }
    }
    if (req.file) safeUnlink(req.file.path);
    res.json({ sent: results.filter(r => r.status === 'ok').length, failed: results.filter(r => r.status === 'hata').length, results });
  } catch (err) {
    res.status(500).json({ error: 'SMTP bağlantı hatası: ' + err.message });
  }
});

app.post('/api/cookies', (req, res) => {
  try {
    const { cookies } = req.body;
    if (!cookies) return res.status(400).json({ error: 'Cookie gerekli' });
    fs.writeFileSync(getCookiePath(), cookies);
    console.log('Cookies güncellendi');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/compress', upload.single('video'), async (req, res) => {
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

app.post('/api/slideshow', upload.any(), async (req, res) => {
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
