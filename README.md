# Balap Angka - Game Matematika untuk SD

Game balap edukasi: pemain menjawab soal matematika untuk membuat mobilnya melaju
lebih cepat daripada dua mobil CPU. Tersedia pilihan kelas dengan 3 tingkat kesulitan (**Mudah**, **Sedang**, **Sulit**):

- **Kelas 1 SD (0-20)**:
  - 🟢 **Mudah**: Tambah, kurang, pasangan bilangan s.d. 10 & soal cerita.
  - 🟡 **Sedang**: Bilangan 11-20, nilai tempat, bandingkan bilangan, tambah/kurang s.d. 20.
  - 🔴 **Sulit**: Tambah/kurang s.d. 20 melewati 10, bilangan yang hilang, selisih & soal cerita.
- **Kelas 2 SD (0-100)**:
  - 🟢 **Mudah**: Bilangan 21-50, nilai tempat, bandingkan, tambah/kurang 2 digit tanpa simpan/pinjam & soal cerita.
  - 🟡 **Sedang**: Simpan/pinjam 2 digit, perkalian sebagai penjumlahan berulang, setengah, pembagian bagi rata.
  - 🔴 **Sulit**: Simpan/pinjam s.d. 100, perkalian & pembagian 2-5, setengah/seperempat & soal cerita.
- **Kelas 3 SD (0-1.000)**:
  - 🟢 **Mudah**: Nilai tempat & bandingkan bilangan 3 digit, tabel perkalian 1-10 & soal cerita.
  - 🟡 **Sedang**: Tambah/kurang 3 digit (simpan/pinjam), perkalian & pembagian bersusun, bilangan yang hilang.
  - 🔴 **Sulit**: Pecahan berpenyebut sama (+ dan -), perkalian bersusun lebih besar, pembagian & soal cerita.
- **Campuran 1-3**:
  - Tantangan gabungan materi Kelas 1, 2, dan 3 sesuai tingkat kesulitan (Mudah, Sedang, Sulit).

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
