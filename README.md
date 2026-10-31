# Smart Bengkel Inventory

Sistem pengurusan stok Bengkel Reka Bentuk dan Teknologi (RBT) sekolah.

**Buka aplikasi:** https://mkhalil1199hajaj-web.github.io/smart-bengkel-inventory/

## Struktur

| Fail | Fungsi |
|---|---|
| `index.html` | Antara muka aplikasi (dihoskan oleh GitHub Pages). `CONFIG.API_URL` menunjuk ke Web App Apps Script. |
| `apps-script/Code.gs` | Backend: API, log masuk, kebenaran peranan, transaksi stok, laporan |
| `apps-script/SetupDatabase.gs` | Sediakan tab Google Sheets dan tetapan awal |
| `apps-script/index.html` | Salinan antara muka untuk dimuatkan dalam projek Apps Script (`API_URL` kosong) |
| `apps-script/appsscript.json` | Konfigurasi projek Apps Script |

## Cara ia berfungsi

- Halaman ini hanya antara muka. Semua data disimpan dalam Google Sheets sekolah melalui Google Apps Script.
- Frontend menghantar `POST` dengan `Content-Type: text/plain` ke Web App Apps Script, jadi tiada isu CORS.
- Tiada rahsia, kata laluan atau token pentadbir dalam fail di repo ini. Log masuk dan kebenaran disemak di pelayan Apps Script.

## Kemas kini

- **Ubah antara muka:** edit `index.html` dalam repo ini. GitHub Pages akan terbit semula dalam 1–2 minit.
- **Ubah backend:** edit kod dalam projek Apps Script, kemudian *Terapkan → Kelola deployment → pensel → Versi baharu → Terapkan*. Link Web App kekal sama, jadi `index.html` tidak perlu diubah.
