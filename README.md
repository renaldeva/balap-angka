# Balap Angka - Game Matematika untuk SD

Game balap edukasi: pemain menjawab soal matematika untuk membuat mobilnya melaju
lebih cepat daripada dua mobil CPU. Tersedia 4 level materi:
- **Level 1 (Kelas 1 SD)**: Bilangan cacah 0-100, penjumlahan & pengurangan dasar (maks 20), operasi 2 digit tanpa simpan/pinjam, dan nilai tempat (puluhan & satuan).
- **Level 2 (Kelas 2 SD)**: Bilangan cacah 0-999, penjumlahan teknik menyimpan, pengurangan teknik meminjam, perkalian dasar 1-5 (maks 50 & penjumlahan berulang), serta pembagian dasar habis dibagi 1-5.
- **Level 3 (Kelas 3 SD)**: Bilangan cacah 0-9.999, perkalian komplit 1-10, perkalian 2 digit × 1 digit bersusun, pembagian porogapit 2 digit ÷ 1 digit tanpa sisa, serta pecahan sederhana berpenyebut sama.
- **Level 4 (Campuran 1-3)**: Kombinasi acak seluruh materi dari Kelas 1, 2, dan 3 SD.

Project ini hanya berisi satu file statis (`index.html`), tanpa build step,
sehingga bisa langsung di-deploy ke Vercel.

## Cara Deploy ke Vercel

### Opsi A — Lewat website Vercel (tanpa command line)
1. Buka https://vercel.com dan login/daftar (bisa pakai akun GitHub, GitLab, atau email).
2. Klik **Add New... > Project**.
3. Pilih **Deploy without Git** / drag-and-drop, lalu seret folder `balap-angka`
   (yang berisi `index.html` ini) ke area upload.
4. Klik **Deploy**. Tunggu beberapa detik, lalu Vercel akan memberi URL publik
   (contoh: `https://balap-angka.vercel.app`).

### Opsi B — Lewat GitHub (disarankan kalau mau update berkala)
1. Buat repository baru di GitHub, lalu upload folder ini (isi minimal: `index.html`).
2. Di Vercel, klik **Add New... > Project**, pilih **Import Git Repository**,
   dan pilih repository tadi.
3. Saat konfigurasi build, biarkan **Framework Preset** = *Other* dan
   **Build Command** kosong (karena tidak perlu proses build), **Output Directory**
   dikosongkan atau isi `.` — Vercel otomatis mendeteksi `index.html` sebagai halaman utama.
4. Klik **Deploy**.

### Opsi C — Lewat Vercel CLI
```bash
npm install -g vercel
cd balap-angka
vercel
```
Ikuti instruksi di terminal (login, pilih scope, konfirmasi project). Setelah selesai,
Vercel akan memberi URL preview, lalu jalankan `vercel --prod` untuk publish ke domain utama.

## Catatan
- Game menyimpan skor terbaik per level di `localStorage` browser pengguna
  (tidak terhubung ke server, jadi rekor hanya tersimpan di perangkat masing-masing).
- Tidak ada dependency eksternal selain Google Fonts (Baloo 2, Nunito), jadi
  project ini ringan dan cepat di-deploy.
