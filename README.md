# OmniTool

Video/ses indirme, dönüştürme ve düzenleme işlerini tek bir sitede toplayan çok amaçlı bir araç seti.
Türkçe/İngilizce dil desteği içerir.

## Özellikler

- **Dönüştürücü** — YouTube, Instagram, TikTok, Twitter/X, SoundCloud vb. platformlardan video/ses indirir, MP4 veya MP3 olarak kaydeder.
- **Sıkıştırıcı** — Video dosyalarını kaliteyi koruyarak küçültür.
- **Dosya Araçları** — Video/ses formatlarını birbirine çevirir, ZIP sıkıştırır/açar.
- **PDF Dönüştürücü** — Resim (jpg/png), metin ve Word belgelerini PDF'ye çevirir.
- **Belge Düzenleyici** — TXT/DOCX belgelerini tarayıcıda düzenler, TXT veya DOCX olarak kaydeder.
- **Yayın Araçları** — Twitch ve Kick VOD'larını indirir, istenen bölümü keser.
- **Video Kesici** — Yüklenen veya indirilen videoları zaman aralığına göre keser.
- **Video Yapıcı** — Fotoğraflardan geçiş efektli slayt videosu oluşturur, arka plan müziği ekler.

## Kurulum

```bash
npm install
npm start
```

Sunucu varsayılan olarak `http://localhost:3000` adresinde çalışır. İlk çalıştırmada `yt-dlp`
ve DejaVu Sans fontu otomatik olarak indirilir.

## Ortam değişkenleri

| Değişken | Zorunlu mu | Açıklama |
|---|---|---|
| `PORT` | Hayır | Sunucu portu (varsayılan `3000`) |
| `YOUTUBE_API_KEY` | Hayır | Verilirse YouTube video bilgisi için resmi API kullanılır (daha hızlı/güvenilir) |
| `COOKIE_ADMIN_TOKEN` | Hayır | Verilirse `/api/cookies` endpoint'i bu token olmadan çağrılamaz |

## Notlar

- `cookies.txt` / `kick.txt` çalışma zamanında oluşturulur ve `.gitignore` içindedir; bu dosyalara
  gerçek çerez verisi **koymayın ve commit etmeyin**.
- Video/ses işleme `ffmpeg` (statik binary olarak paket içinde gelir) ve `yt-dlp` (ilk çalıştırmada
  indirilir) kullanır.
- Railway üzerine deploy için `railway.json` hazır haldedir (`node server.js` ile başlar).

## Teknolojiler

Node.js, Express, yt-dlp, ffmpeg, pdf-lib, mammoth, docx, archiver/adm-zip — vanilla HTML/CSS/JS frontend.
