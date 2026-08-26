const I18N = {
  tr: {
    'app.title': 'OmniTool - Her Şey İçin Tek Araç',
    'header.tagline': 'Video • Ses • PDF • Belge • ZIP • Her Şey',

    'tab.convert': 'Dönüştürücü', 'tab.compress': 'Sıkıştırıcı', 'tab.files': 'Dosya Araçları',
    'tab.pdf': 'PDF Dönüştürücü', 'tab.editor': 'Belge Düzenleyici', 'tab.stream': 'Yayın Araçları',
    'tab.trim': 'Video Kesici', 'tab.slideshow': 'Video Yapıcı',

    'common.getInfo': 'Bilgi Al', 'common.gettingInfo': 'Bilgi alınıyor...',
    'common.format': 'Format', 'common.quality': 'Kalite', 'common.download': 'İndir',
    'common.downloadBtn': '⬇ İndir', 'common.processing': 'İşleniyor...',
    'common.downloading': 'İndiriliyor...', 'common.preparingDownload': 'İndirme hazırlanıyor...',
    'common.completed': '✅ Tamamlandı!', 'common.errorPrefix': 'Hata: ', 'common.timeout': 'Zaman aşımı',
    'common.serverNotRespondingDetailed': 'Sunucu yanıt vermiyor. server.js çalışıyor mu?',
    'common.serverNotResponding': 'Sunucu yanıt vermiyor',
    'common.dragDropVideo': 'Veya video dosyasını sürükle-bırak / tıkla seç',
    'common.dragDropVideo2': 'Video dosyasını sürükle-bırak veya tıkla seç',
    'common.dragDropFile': 'Dosyayı sürükle-bırak veya tıkla seç',
    'common.selectFile': 'Dosya Seç', 'common.remove': 'Kaldır', 'common.operation': 'İşlem',
    'common.video': 'Video', 'common.audio': 'Ses', 'common.save': 'Kaydet',
    'common.trimSettings': '✂ Kesim Ayarları', 'common.trimSettings2': 'Kesim Ayarları',
    'common.start': 'Başlangıç', 'common.end': 'Bitiş', 'common.setCurrentTime': 'Şu Anı Ayarla',
    'common.cancel': '✖ İptal', 'common.cancelled': '⚠ İptal edildi', 'common.cancelling': '⚠ İptal ediliyor...',
    'common.readError': 'Okuma hatası', 'common.loadingEllipsis': 'Yükleniyor...', 'common.other': 'Diğer',
    'common.preparing': 'Hazırlanıyor...',

    'err.urlRequired': 'URL girin',
    'err.selectUrlOrFile': 'Önce bir URL gir veya dosya seç',
    'err.uploadOrSendFromConverter': "Önce bir video yükleyin veya Dönüştürücü'den gönderin",
    'err.selectFileFirst': 'Önce bir dosya seç',
    'err.contentEmpty': 'İçerik boş',
    'err.needTwoPhotos': 'En az 2 fotoğraf seçin',
    'err.needStreamUrl': 'Twitch VOD veya Kick VOD URL girin',

    'convert.title': '🔗 Video & Ses İndirici',
    'convert.desc': "YouTube, Instagram, TikTok, Twitter/X, SoundCloud ve daha fazlasından video/ses indir, MP4 veya MP3 olarak kaydet.",
    'convert.urlPlaceholder': 'YouTube, Instagram, TikTok, Twitter/X, SoundCloud... URL yapıştır',
    'convert.sendToTrim': 'Kesiciye Gönder',

    'compress.title': 'Video Sıkıştır',
    'compress.desc': 'Dosya boyutunu kaliteyi koruyarak küçült. Discord, e-posta, web için ideal.',
    'compress.urlPlaceholder': 'YouTube/Instagram URL veya boş bırak dosya yükle...',
    'compress.levelLabel': 'Sıkıştırma Seviyesi', 'compress.low': 'Düşük', 'compress.medium': 'Orta',
    'compress.high': 'Yüksek', 'compress.veryHigh': 'Çok Y.', 'compress.noFileYet': 'Henüz dosya seçilmedi',
    'compress.compressBtn': '🗜 Sıkıştır', 'compress.compressing': 'Sıkıştırılıyor...',
    'compress.resultShrunk': '✨ {from} → {to} (%{pct} küçüldü)',
    'compress.resultTooSmall': '⚠️ Dosya zaten küçük, çok değişmedi ({size})',
    'compress.original': 'Orijinal: {size}',
    'compress.sizeAfterDownload': 'Dosya boyutu indirme sonrası belli olacak',
    'compress.summary': 'Sıkıştırma: {level} | Orijinal: {from} → {to}',

    'files.title': '📁 Format Dönüştürücü',
    'files.desc': 'Video/audio formatlarını birbirine çevir. ZIP sıkıştır/aç.',
    'files.opConvert': 'Dönüştür', 'files.opZip': 'ZIP Yap', 'files.opUnzip': 'ZIP Aç',
    'files.targetFormat': 'Hedef Format', 'files.processBtn': '🚀 İşle',
    'files.resultZip': '🗜 ZIP yapıldı! {from} → {to} (%{pct} küçüldü)',
    'files.resultUnzip': '📂 ZIP açıldı!', 'files.resultConvert': '✅ {format} dönüştürüldü!',
    'files.fileSizeLabel': 'Dosya: {size}', 'files.zipping': 'ZIP sıkıştırılıyor...',
    'files.unzipping': 'ZIP açılıyor...', 'files.converting': 'Dönüştürülüyor...',
    'files.originalToCompressed': 'Orijinal: {from} → {to}',

    'pdf.title': '📄 PDF Dönüştürücü',
    'pdf.desc': "Resim, metin, Word belgelerini PDF'ye çevir. Tek tıkla.",
    'pdf.convertBtn': "📄 PDF'ye Çevir", 'pdf.creating': 'PDF oluşturuluyor...', 'pdf.ready': '✅ PDF hazır!',
    'pdf.docxPreviewNote': '(DOCX dosyası - içerik sunucuda okunacak)',

    'editor.title': '✏️ Belge Düzenleyici',
    'editor.desc': 'TXT/DOCX yükle, içeriği düzenle, TXT veya DOCX olarak kaydet.',
    'editor.dragDrop': 'Belge dosyasını sürükle-bırak veya tıkla seç (.txt, .docx)',
    'editor.placeholder': 'İçerik burada görünecek...', 'editor.saveBtn': '💾 Kaydet & İndir',
    'editor.saving': 'Kaydediliyor...', 'editor.saved': '✅ {fmt} kaydedildi!',

    'stream.title': '📡 Yayın Kaydı İndirici',
    'stream.desc': "Twitch ve Kick VOD'larını indir, istediğin bölümü kes.",
    'stream.urlPlaceholder': 'Twitch VOD / Kick VOD URL yapıştır...',
    'stream.opTrim': 'Kes & İndir', 'stream.best': 'En iyi', 'stream.audioOnly': 'Sadece ses (MP3)',
    'stream.trimmed': '✅ Kesildi!', 'stream.downloaded': '✅ İndirildi!',

    'trim.uploadTitle': 'Video Yükle', 'trim.trimBtn': '✂ Kes & İndir',
    'trim.fromConverter': '🎬 {title} (önce dönüştürüp dosyayı yükleyin)',
    'trim.uploadFromConverter': "Dönüştürücü'den MP4 indirin, sonra buraya yükleyin",
    'trim.trimming': 'Kesiliyor...', 'trim.downloadingResult': '✅ İndiriliyor!',

    'slideshow.title': '🎬 Video Yapıcı',
    'slideshow.desc': 'Fotoğraflardan geçiş efektli video yap, arka plan müzik ekle, MP4 olarak indir.',
    'slideshow.select': '📷 Seç', 'slideshow.addPhoto': '➕ Fotoğraf Ekle',
    'slideshow.bgMusic': 'Arka plan müzik (opsiyonel)', 'slideshow.selectMusic': '🎵 Müzik Seç',
    'slideshow.transitionLabel': 'Geçiş efekti', 'slideshow.fade': 'Fade (Soldurma)',
    'slideshow.slideLeft': 'Kaydır Sol', 'slideshow.slideRight': 'Kaydır Sağ',
    'slideshow.slideUp': 'Kaydır Yukarı', 'slideshow.slideDown': 'Kaydır Aşağı',
    'slideshow.fadeBlack': 'Fade Siyah', 'slideshow.durationLabel': 'Foto başı (sn)',
    'slideshow.resolutionLabel': 'Çözünürlük', 'slideshow.createBtn': '🎬 Video Oluştur',
    'slideshow.creating': 'Video oluşturuluyor...', 'slideshow.ready': '✅ Video hazır!',
    'slideshow.downloadMp4': '⬇ İndir MP4', 'slideshow.photoN': '{n}. Fotoğraf',

    'footer.sourceCode': "💻 Kaynak kodu GitHub'da",
  },
  en: {
    'app.title': 'OmniTool - The All-in-One Tool',
    'header.tagline': 'Video • Audio • PDF • Documents • ZIP • Everything',

    'tab.convert': 'Converter', 'tab.compress': 'Compressor', 'tab.files': 'File Tools',
    'tab.pdf': 'PDF Converter', 'tab.editor': 'Document Editor', 'tab.stream': 'Stream Tools',
    'tab.trim': 'Video Trimmer', 'tab.slideshow': 'Video Maker',

    'common.getInfo': 'Get Info', 'common.gettingInfo': 'Fetching info...',
    'common.format': 'Format', 'common.quality': 'Quality', 'common.download': 'Download',
    'common.downloadBtn': '⬇ Download', 'common.processing': 'Processing...',
    'common.downloading': 'Downloading...', 'common.preparingDownload': 'Preparing download...',
    'common.completed': '✅ Done!', 'common.errorPrefix': 'Error: ', 'common.timeout': 'Timed out',
    'common.serverNotRespondingDetailed': 'Server is not responding. Is server.js running?',
    'common.serverNotResponding': 'Server is not responding',
    'common.dragDropVideo': 'Or drag & drop a video file / click to select',
    'common.dragDropVideo2': 'Drag & drop a video file or click to select',
    'common.dragDropFile': 'Drag & drop a file or click to select',
    'common.selectFile': 'Select File', 'common.remove': 'Remove', 'common.operation': 'Operation',
    'common.video': 'Video', 'common.audio': 'Audio', 'common.save': 'Save',
    'common.trimSettings': '✂ Trim Settings', 'common.trimSettings2': 'Trim Settings',
    'common.start': 'Start', 'common.end': 'End', 'common.setCurrentTime': 'Use Current Time',
    'common.cancel': '✖ Cancel', 'common.cancelled': '⚠ Cancelled', 'common.cancelling': '⚠ Cancelling...',
    'common.readError': 'Read error', 'common.loadingEllipsis': 'Loading...', 'common.other': 'Other',
    'common.preparing': 'Preparing...',

    'err.urlRequired': 'Enter a URL',
    'err.selectUrlOrFile': 'Enter a URL or select a file first',
    'err.uploadOrSendFromConverter': 'Upload a video first, or send one from the Converter',
    'err.selectFileFirst': 'Select a file first',
    'err.contentEmpty': 'Content is empty',
    'err.needTwoPhotos': 'Select at least 2 photos',
    'err.needStreamUrl': 'Enter a Twitch or Kick VOD URL',

    'convert.title': '🔗 Video & Audio Downloader',
    'convert.desc': 'Download video/audio from YouTube, Instagram, TikTok, Twitter/X, SoundCloud and more, save as MP4 or MP3.',
    'convert.urlPlaceholder': 'Paste a YouTube, Instagram, TikTok, Twitter/X, SoundCloud... URL',
    'convert.sendToTrim': 'Send to Trimmer',

    'compress.title': 'Compress Video',
    'compress.desc': 'Shrink file size while keeping quality. Great for Discord, email, and the web.',
    'compress.urlPlaceholder': 'YouTube/Instagram URL, or leave empty to upload a file...',
    'compress.levelLabel': 'Compression Level', 'compress.low': 'Low', 'compress.medium': 'Medium',
    'compress.high': 'High', 'compress.veryHigh': 'Very High', 'compress.noFileYet': 'No file selected yet',
    'compress.compressBtn': '🗜 Compress', 'compress.compressing': 'Compressing...',
    'compress.resultShrunk': '✨ {from} → {to} ({pct}% smaller)',
    'compress.resultTooSmall': '⚠️ File was already small, not much changed ({size})',
    'compress.original': 'Original: {size}',
    'compress.sizeAfterDownload': 'File size will be known after download',
    'compress.summary': 'Compression: {level} | Original: {from} → {to}',

    'files.title': '📁 Format Converter',
    'files.desc': 'Convert video/audio formats into each other. Zip and unzip files.',
    'files.opConvert': 'Convert', 'files.opZip': 'Zip', 'files.opUnzip': 'Unzip',
    'files.targetFormat': 'Target Format', 'files.processBtn': '🚀 Process',
    'files.resultZip': '🗜 Zipped! {from} → {to} ({pct}% smaller)',
    'files.resultUnzip': '📂 Unzipped!', 'files.resultConvert': '✅ Converted to {format}!',
    'files.fileSizeLabel': 'File: {size}', 'files.zipping': 'Zipping...',
    'files.unzipping': 'Unzipping...', 'files.converting': 'Converting...',
    'files.originalToCompressed': 'Original: {from} → {to}',

    'pdf.title': '📄 PDF Converter',
    'pdf.desc': 'Convert images, text, and Word documents to PDF in one click.',
    'pdf.convertBtn': '📄 Convert to PDF', 'pdf.creating': 'Creating PDF...', 'pdf.ready': '✅ PDF ready!',
    'pdf.docxPreviewNote': '(DOCX file - content will be read on the server)',

    'editor.title': '✏️ Document Editor',
    'editor.desc': 'Upload a TXT/DOCX, edit the content, save as TXT or DOCX.',
    'editor.dragDrop': 'Drag & drop a document or click to select (.txt, .docx)',
    'editor.placeholder': 'Content will appear here...', 'editor.saveBtn': '💾 Save & Download',
    'editor.saving': 'Saving...', 'editor.saved': '✅ {fmt} saved!',

    'stream.title': '📡 Stream VOD Downloader',
    'stream.desc': 'Download Twitch and Kick VODs, trim the part you want.',
    'stream.urlPlaceholder': 'Paste a Twitch VOD / Kick VOD URL...',
    'stream.opTrim': 'Trim & Download', 'stream.best': 'Best', 'stream.audioOnly': 'Audio only (MP3)',
    'stream.trimmed': '✅ Trimmed!', 'stream.downloaded': '✅ Downloaded!',

    'trim.uploadTitle': 'Upload Video', 'trim.trimBtn': '✂ Trim & Download',
    'trim.fromConverter': '🎬 {title} (convert & upload the file first)',
    'trim.uploadFromConverter': 'Download the MP4 from the Converter, then upload it here',
    'trim.trimming': 'Trimming...', 'trim.downloadingResult': '✅ Downloading!',

    'slideshow.title': '🎬 Video Maker',
    'slideshow.desc': 'Make a video from photos with transitions, add background music, download as MP4.',
    'slideshow.select': '📷 Select', 'slideshow.addPhoto': '➕ Add Photo',
    'slideshow.bgMusic': 'Background music (optional)', 'slideshow.selectMusic': '🎵 Select Music',
    'slideshow.transitionLabel': 'Transition effect', 'slideshow.fade': 'Fade',
    'slideshow.slideLeft': 'Slide Left', 'slideshow.slideRight': 'Slide Right',
    'slideshow.slideUp': 'Slide Up', 'slideshow.slideDown': 'Slide Down',
    'slideshow.fadeBlack': 'Fade to Black', 'slideshow.durationLabel': 'Seconds per photo',
    'slideshow.resolutionLabel': 'Resolution', 'slideshow.createBtn': '🎬 Create Video',
    'slideshow.creating': 'Creating video...', 'slideshow.ready': '✅ Video ready!',
    'slideshow.downloadMp4': '⬇ Download MP4', 'slideshow.photoN': 'Photo {n}',

    'footer.sourceCode': '💻 Source code on GitHub',
  }
};

let currentLang = localStorage.getItem('omnitool_lang') || (navigator.language && navigator.language.toLowerCase().startsWith('tr') ? 'tr' : 'en');
if (!I18N[currentLang]) currentLang = 'tr';

function t(key, vars) {
  let str = (I18N[currentLang] && I18N[currentLang][key]) || I18N.tr[key] || key;
  if (vars) for (const k in vars) str = str.split('{' + k + '}').join(vars[k]);
  return str;
}

function applyI18n() {
  document.documentElement.lang = currentLang;
  document.title = t('app.title');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-label]').forEach(el => { el.label = t(el.dataset.i18nLabel); });
  document.querySelectorAll('.ssSlotLabel').forEach(el => { el.textContent = t('slideshow.photoN', { n: el.dataset.n }); });
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === currentLang));
}

function setLang(lang) {
  if (!I18N[lang]) return;
  currentLang = lang;
  localStorage.setItem('omnitool_lang', lang);
  applyI18n();
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });
});
