# PBDku

Web app percuma (Google Sheets + Apps Script) untuk sekolah mengedarkan **laporan PBD murid (PDF)** kepada ibu bapa.

- **Admin** muat naik PDF laporan satu kelas terus dari web app. PDF dipecahkan ikut murid (nama & No. KP dibaca pada setiap halaman) dan disimpan **private** dalam Google Drive sekolah.
- **Ibu bapa** log masuk dengan **akaun DELIMa anak** (`…@moe-dl.edu.my`) dan hanya boleh memuat turun laporan anak sendiri.
- Senarai nama & ID DELIMa murid disimpan dalam Google Sheet berasingan.

📖 **Panduan lengkap:** https://g-03355699-tech.github.io/pbdku/

## Fail

| Fail | Keterangan |
|---|---|
| `Code.gs` | Pelayan Apps Script (pengesahan DELIMa, simpan ke Drive, padanan senarai, muat turun) |
| `Index.html` | Antara muka (HTML & CSS) ibu bapa & admin |
| `App.html` | Kod JavaScript app — dimuatkan melalui `kodApp()` (elak pepijat HtmlService). Pecah PDF dalam pelayar menggunakan pdf.js & pdf-lib |
| `appsscript.json` | Manifest: `executeAs: USER_DEPLOYING`, `access: DOMAIN` |
| `docs/` | Halaman panduan (GitHub Pages). Tukar `docs/config.js` kepada URL `…/exec` anda |

## Pemasangan ringkas

> ⚠️ Mesti menggunakan **akaun DELIMa guru** (`g-…@moe-dl.edu.my`). Web app yang dijalankan sebagai pemilik hanya dapat membaca emel pengunjung dalam domain yang sama.

1. Cipta Google Sheet **PBDku** → *Extensions → Apps Script*.
2. Tampal `Code.gs` (tukar `NAMA_SEKOLAH`), tambah HTML `Index` → tampal `Index.html`, tambah HTML `App` → tampal `App.html`, ganti `appsscript.json`.
3. Jalankan fungsi `pasang` → beri kebenaran.
4. *Deploy → New deployment → Web app*: **Execute as: Me**, **Who has access: Anyone within Kementerian Pendidikan Malaysia**.
5. Buka URL `…/exec` → tab **Tetapan** → tampal URL Sheet senarai murid → **Simpan & uji**.

Kemas kini kod: *Deploy → Manage deployments → ✏️ Edit → Version: New version*.

## Lesen

MIT © Ibrahim bin Kadri (9M2IBR)
