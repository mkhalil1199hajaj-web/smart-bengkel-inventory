# Smart Bengkel Inventory

Sistem pengurusan stok Bengkel Reka Bentuk dan Teknologi (RBT) sekolah.

**Buka aplikasi:** https://mkhalil1199hajaj-web.github.io/smart-bengkel-inventory/

**Muat turun APK Android (versi terkini):** https://github.com/mkhalil1199hajaj-web/smart-bengkel-inventory/releases/latest/download/smart-bengkel-inventory.apk

## Pasang sebagai app

### PWA (Android, iPhone, laptop)
- **Android / Chrome / Edge:** buka link aplikasi, kemudian tekan butang **Pasang app di peranti ini** (di bawah borang log masuk atau ikon muat turun di bar atas). Boleh juga melalui menu ⋮ → *Pasang aplikasi* / *Tambah ke skrin utama*.
- **iPhone / iPad (Safari):** butang Kongsi → *Add to Home Screen*.
- App dibuka tanpa bar alamat, ada ikon sendiri, dan kulit aplikasi disimpan dalam peranti supaya dibuka lebih pantas. Data stok tetap diambil terus dari server setiap kali.

### APK hybrid (Android)
- Dibina dengan **Capacitor** oleh GitHub Actions (`.github/workflows/android-apk.yml`) setiap kali `index.html` atau fail berkaitan berubah, dan diterbitkan di tab **Releases**.
- Dalam APK, eksport PDF, Excel dan CSV dibuka melalui menu Kongsi Android (simpan ke Fail/Drive, hantar WhatsApp/Gmail, atau cetak). Butang *Cetak* menjana PDF.
- **Tandatangan:** tanpa secrets, APK ditandatangan dengan kunci debug sementara: setiap versi baharu perlu nyahpasang versi lama dahulu. Untuk kemas kini lancar, tambah 4 secrets di *Settings → Secrets and variables → Actions*: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, kemudian jalankan semula workflow (*Actions → Bina APK Android → Run workflow*).

## Struktur

| Fail | Fungsi |
|---|---|
| `index.html` | Antara muka aplikasi (dihoskan oleh GitHub Pages). `CONFIG.API_URL` menunjuk ke Web App Apps Script. |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA: maklumat app, service worker, ikon |
| `vendor/` | Pustaka JS dan fon Poppins (disimpan dalam repo, bukan CDN) |
| `package.json`, `capacitor.config.json`, `scripts/`, `assets/` | Projek Capacitor untuk APK (folder `android/` dijana semasa build) |
| `.github/workflows/android-apk.yml` | Bina APK dan terbitkan ke Releases |
| `apps-script/Code.gs` | Backend: API, log masuk, kebenaran peranan, transaksi stok, laporan |
| `apps-script/SetupDatabase.gs` | Sediakan tab Google Sheets dan tetapan awal |
| `apps-script/index.html` | Salinan antara muka untuk dimuatkan dalam projek Apps Script (`API_URL` kosong) |
| `apps-script/appsscript.json` | Konfigurasi projek Apps Script |

## Cara ia berfungsi

- Halaman ini hanya antara muka. Semua data disimpan dalam Google Sheets sekolah melalui Google Apps Script.
- Frontend menghantar `POST` dengan `Content-Type: text/plain` ke Web App Apps Script, jadi tiada isu CORS.
- Tiada rahsia, kata laluan atau token pentadbir dalam fail di repo ini. Log masuk dan kebenaran disemak di pelayan Apps Script.

## Kemas kini

- **Ubah antara muka:** edit `index.html` dalam repo ini. GitHub Pages akan terbit semula dalam 1–2 minit, dan APK baharu dibina sendiri (±5 minit).
- Selepas ubah `index.html` atau fail `vendor/`, naikkan `VERSI` dalam `sw.js` (cth `sbi-v2`) supaya peranti yang memasang PWA menerima versi baharu.
- **Ubah backend:** edit kod dalam projek Apps Script, kemudian *Terapkan → Kelola deployment → pensel → Versi baharu → Terapkan*. Link Web App kekal sama, jadi `index.html` tidak perlu diubah.
