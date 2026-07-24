/**
 * config.js — ResearchMind Local Configuration
 *
 * ⚠️  File ini ada di .gitignore — TIDAK akan ter-commit ke GitHub.
 *
 * CARA PAKAI:
 *   1. Salin file ini: copy config.example.js config.js
 *   2. Isi API key di bawah
 *   3. Buka index.html — form API key akan otomatis hilang
 *
 * Untuk GitHub Pages:
 *   File ini dibuat otomatis oleh GitHub Actions dari repository secret.
 *   Kamu tidak perlu upload config.js ke GitHub.
 *
 * Dapatkan API key gratis:
 *   - Groq   : https://console.groq.com       (14.400 req/hari, bebas)
 *   - Gemini : https://aistudio.google.com/apikey
 */

// ── Isi salah satu atau keduanya ──────────────────────────────────────────────

window.GROQ_API_KEY   = 'YOUR_GROQ_API_KEY_HERE';
window.GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE';
