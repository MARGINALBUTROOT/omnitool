const express = require('express');
const { json, download } = require('@distube/yt-dlp');
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

ffmpeg.setFfmpegPath(ffmpegPath);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dls = path.join(__dirname, 'downloads');
const prc = path.join(__dirname, 'processed');
const upl = path.join(__dirname, 'uploads');
[dls, prc, upl].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d); });
const upload = multer({ dest: upl });

const ytFlags = { dumpSingleJson: true, skipDownload: true, noWarnings: true, quiet: true, noPlaylist: true };
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
    return url;
  } catch {}
  return url;
}

function getYtDlpPath() {
  const mp = require.resolve('@distube/yt-dlp');
  const base = path.join(path.dirname(mp), '..', 'bin', 'yt-dlp');
  return process.platform === 'win32' ? base + '.exe' : base;
}

function jsonWithTimeout(url, flags, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Zaman aşımı')), ms);
    json(url, flags).then(r => { clearTimeout(t); resolve(r); }).catch(e => { clearTimeout(t); reject(e); });
  });
}

function sanitize(n) { return (n || 'video').replace(/[^\w\s]/gi, '').trim().substring(0, 50) || 'video'; }
function safeUnlink(p) { try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {} }

function dlSync(url, fmt, outPath) {
  return new Promise((resolve, reject) => {
    const args = [url, '-f', fmt, '-o', outPath, '--merge-output-format', 'mp4', '--ffmpeg-location', ffDir, '--no-playlist', '--no-warnings', '--quiet'];
    const p = spawn(getYtDlpPath(), args);
    let stderr = '';
    p.stderr.on('data', d => stderr += d);
    p.on('close', c => { if (c !== 0) return reject(new Error(stderr || 'İndirme başarısız')); const f = findFile(outPath); if (f) resolve(f); else reject(new Error('Dosya bulunamadı')); });
    p.on('error', reject);
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
    const info = await jsonWithTimeout(url, ytFlags, YT_TIMEOUT);
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
    const info = await jsonWithTimeout(url, ytFlags, YT_TIMEOUT);
    const baseName = sanitize(info.title);
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
      const info = await jsonWithTimeout(url, ytFlags, YT_TIMEOUT);
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

app.post('/api/gif-create', upload.any(), async (req, res) => {
  try {
    const mode = req.body.mode || 'video';
    const baseName = req.body.title ? req.body.title.replace(/[^\w\s]/gi, '').trim().substring(0, 50) : 'gif';
    const fps = parseInt(req.body.fps) || 10;
    const width = parseInt(req.body.width) || 480;
    const outNameBase = `${baseName}_gif_${Date.now()}`;
    const outName = `${outNameBase}.gif`;
    const outPath = path.join(prc, outName);
    const allFiles = req.files || [];

    if (mode === 'text') {
      const text = req.body.text || 'GIF';
      const bgColor = req.body.bgColor || '#3388ff';
      const textColor = req.body.textColor || '#ffffff';
      const fontSize = parseInt(req.body.fontSize) || 48;
      const duration = parseFloat(req.body.duration) || 3;
      const anim = req.body.anim || 'none';
      const tmpGif = path.join(prc, `${outNameBase}_tmp.gif`);

      let drawtext = `drawtext=text='${text.replace(/'/g, "'\\\\\\''")}':fontsize=${fontSize}:fontcolor=${textColor}:x=(w-text_w)/2:y=(h-text_h)/2`;
      if (anim === 'scroll') drawtext = `drawtext=text='${text.replace(/'/g, "'\\\\\\''")}':fontsize=${fontSize}:fontcolor=${textColor}:x=w-mod(t*80\\,w+text_w):y=(h-text_h)/2`;
      else if (anim === 'bounce') drawtext = `drawtext=text='${text.replace(/'/g, "'\\\\\\''")}':fontsize=${fontSize}:fontcolor=${textColor}:x=(w-text_w)/2:y=(h-text_h)/2+20*sin(2*PI*t)`;

      await new Promise((resolve, reject) => {
        const p = spawn(ffmpegPath, ['-f', 'lavfi', '-i', `color=c=${bgColor}:s=${width}x${Math.round(width*0.5625)}:d=${duration}`, '-vf', `${drawtext},fps=${fps}`, '-t', String(duration), '-y', tmpGif]);
        let err = '';
        p.stderr.on('data', d => err += d);
        p.on('close', c => c === 0 ? resolve() : reject(new Error(err || 'GIF oluşturma hatası')));
        p.on('error', reject);
      });
      fs.renameSync(tmpGif, outPath);
    } else if (mode === 'images') {
      const images = allFiles.filter(f => f.fieldname === 'images');
      if (images.length < 1) {
        allFiles.forEach(f => safeUnlink(f.path));
        return res.status(400).json({ error: 'En az 1 resim gerekli' });
      }
      const duration = parseFloat(req.body.duration) || 2;
      const perFrames = Math.max(1, Math.round((duration / images.length) * fps));
      await new Promise((resolve, reject) => {
        const a = [];
        for (const f of images) a.push('-loop', '1', '-frames:v', String(perFrames), '-i', f.path);
        const lbls = images.map((_, i) => `[${i}:v]`).join('');
        a.push('-filter_complex', `${lbls}concat=n=${images.length}:v=1:a=0,scale=${width}:-1,fps=${fps}`, '-t', String(duration), '-y', outPath);
        let err = '';
        const p = spawn(ffmpegPath, a);
        p.stderr.on('data', d => err += d);
        p.on('close', c => {
          images.forEach(f => safeUnlink(f.path));
          c === 0 ? resolve() : reject(new Error(err || 'GIF hatası'));
        });
        p.on('error', reject);
      });
    } else {
      const videoFiles = allFiles.filter(f => f.fieldname === 'video');
      let videoPath;
      if (videoFiles.length > 0) {
        videoPath = videoFiles[0].path;
      } else if (req.body.url) {
        const url = cleanUrl(req.body.url);
        const info = await jsonWithTimeout(url, ytFlags, YT_TIMEOUT);
        videoPath = path.join(dls, `raw_gif_${Date.now()}_vid.mp4`);
        videoPath = await dlSync(url, 'bestvideo+bestaudio/best', videoPath);
      } else {
        return res.status(400).json({ error: 'Video dosyası veya URL gerekli' });
      }
      const start = req.body.start || '00:00:00';
      const duration = parseFloat(req.body.duration) || 3;
      const palPath = path.join(prc, `${outNameBase}_pal.png`);
      await new Promise((resolve, reject) => {
        const p = spawn(ffmpegPath, ['-i', videoPath, '-ss', start, '-t', String(duration), '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen`, '-y', palPath]);
        let err = '';
        p.stderr.on('data', d => err += d);
        p.on('close', c => c === 0 ? resolve() : reject(new Error(err || 'Palette hatası')));
        p.on('error', reject);
      });
      await new Promise((resolve, reject) => {
        const p = spawn(ffmpegPath, ['-i', videoPath, '-i', palPath, '-ss', start, '-t', String(duration), '-lavfi', `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse`, '-y', outPath]);
        let err = '';
        p.stderr.on('data', d => err += d);
        p.on('close', c => {
          safeUnlink(palPath);
          if (videoFiles.length > 0) safeUnlink(videoPath);
          c === 0 ? resolve() : reject(new Error(err || 'GIF hatası'));
        });
        p.on('error', reject);
      });
    }
    res.json({ file: outName, title: baseName });
  } catch (err) {
    res.status(500).json({ error: 'GIF hatası: ' + err.message });
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
      const info = await jsonWithTimeout(url, ytFlags, YT_TIMEOUT);
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

app.get('/api/download/:file', (req, res) => {
  const fp = path.join(prc, req.params.file);
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
  if (!fs.existsSync(ytPath)) {
    const v = await download();
    console.log(`yt-dlp v${v} hazır`);
  }
}

ensureBinary().then(() => ensurePdfFont().then(() => app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`))));
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
