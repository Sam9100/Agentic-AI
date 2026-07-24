/**
 * agent.js — ResearchMind Agent Logic
 *
 * Contains:
 *   - GroqClient    : wrapper around the Groq REST API (OpenAI-compatible)
 *   - ResearchAgent : orchestrates the 4-phase agentic research workflow
 *
 * The agent communicates back to the UI via a callbacks object,
 * keeping business logic completely separate from DOM manipulation.
 */


// ─────────────────────────────────────────────────────────────────────────────
// GROQ CLIENT
// ─────────────────────────────────────────────────────────────────────────────

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Parse seconds-to-retry from a rate-limit error message.
 * @param {string} message
 * @returns {number}
 */
function parseRetryAfter(message) {
  const match = message.match(/retry in ([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1])) : 0;
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class GroqClient {
  /**
   * @param {string}   apiKey    - Groq API key (from console.groq.com)
   * @param {string}   model     - Model ID, e.g. 'llama-3.3-70b-versatile'
   * @param {Function} [onRetry] - Called with (waitSec, attempt) on rate-limit retry
   */
  constructor(apiKey, model, onRetry) {
    if (!apiKey) throw new Error('Groq API key tidak boleh kosong.');
    if (!model)  throw new Error('Model ID tidak boleh kosong.');
    this.apiKey   = apiKey;
    this.model    = model;
    this._onRetry = onRetry ?? null;
  }

  /**
   * Send a prompt and return the text response.
   * Automatically retries on 429 rate-limit errors.
   *
   * @param {string} userPrompt
   * @param {string} [systemContext]
   * @param {number} [attempt]
   * @returns {Promise<string>}
   */
  async generate(userPrompt, systemContext = '', attempt = 1) {
    const MAX_ATTEMPTS = 3;

    const messages = [];
    if (systemContext.trim()) {
      messages.push({ role: 'system', content: systemContext });
    }
    messages.push({ role: 'user', content: userPrompt });

    const res = await fetch(GROQ_ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model:       this.model,
        messages,
        temperature: 0.7,
        max_tokens:  8192,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message ?? `HTTP ${res.status}`;

      // ── Rate limit (429): retry with suggested delay ──
      if (res.status === 429 && attempt < MAX_ATTEMPTS) {
        const waitSec = parseRetryAfter(msg) || (attempt * 10);
        console.warn(`[Groq] Rate limited. Retry ${attempt}/${MAX_ATTEMPTS - 1} setelah ${waitSec}d…`);
        this._onRetry?.(waitSec, attempt);
        await sleep(waitSec * 1000);
        return this.generate(userPrompt, systemContext, attempt + 1);
      }

      throw new Error(`Groq API error: ${msg}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;

    if (!text) throw new Error('Respons Groq API kosong atau tidak valid.');
    return text;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// DEPTH CONFIGURATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Record<string, string>} */
const DEPTH_INSTRUCTIONS = {
  singkat:  'Berikan analisis singkat dan padat dalam 2–3 paragraf yang informatif.',
  standar:  'Berikan analisis yang cukup mendalam dalam 4–5 paragraf dengan contoh relevan.',
  mendalam: 'Berikan analisis yang sangat menyeluruh dalam 6–8 paragraf. Sertakan data, contoh spesifik, perspektif berbeda, dan nuansa penting.',
};


// ─────────────────────────────────────────────────────────────────────────────
// RESEARCH AGENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} AgentCallbacks
 * @property {(msg: string) => void}                                    onLog
 * @property {(subtopics: Array<{id:number,title:string,desc:string}>) => void} onPlanReady
 * @property {(index: number) => void}                                  onSubtopicStart
 * @property {(index: number, title: string, content: string) => void}  onSubtopicDone
 * @property {() => void}                                               onSynthesisDone
 * @property {(reportMd: string, wordCount: number) => void}            onReportReady
 */

/**
 * @typedef {Object} AgentOptions
 * @property {string}          depth     - 'singkat' | 'standar' | 'mendalam'
 * @property {AgentCallbacks}  callbacks
 */

export class ResearchAgent {
  /**
   * @param {GroqClient}   client
   * @param {AgentOptions} options
   */
  constructor(client, options) {
    this.client    = client;
    this.depth     = options.depth ?? 'standar';
    this.callbacks = options.callbacks;
  }

  /** @param {string} msg */
  _log(msg) { this.callbacks.onLog?.(msg); }

  // ── Phase 1: Plan ─────────────────────────────────────────────────────────

  async _plan(topic) {
    this._log(`Merencanakan struktur riset untuk: "${topic}"…`);

    const prompt = `Kamu adalah agen riset profesional. Analisis topik berikut dan pecah menjadi 4–5 sub-topik utama yang perlu dikaji secara mendalam.

Topik: "${topic}"

Kembalikan HANYA array JSON tanpa markdown, tanpa teks tambahan, dalam format:
[
  { "id": 1, "title": "Judul Sub-Topik", "desc": "Apa yang akan dianalisis dalam sub-topik ini" },
  ...
]`;

    const raw = await this.client.generate(prompt);

    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed  = JSON.parse(cleaned);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error();
      return parsed;
    } catch {
      const match = raw.match(/\[[\s\S]*?\]/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Respons perencanaan tidak dapat diparsing sebagai JSON.');
    }
  }

  // ── Phase 2: Analyze ─────────────────────────────────────────────────────

  async _analyzeSubtopic(topic, subtopic) {
    const depthInstruction = DEPTH_INSTRUCTIONS[this.depth] ?? DEPTH_INSTRUCTIONS.standar;

    const prompt = `Kamu adalah analis riset ahli. Lakukan analisis mendalam tentang sub-topik berikut dalam konteks topik utama.

Topik Utama  : "${topic}"
Sub-Topik    : "${subtopic.title}"
Fokus Analisis: ${subtopic.desc}

Instruksi kedalaman: ${depthInstruction}

Tulis dalam bahasa Indonesia akademis yang mudah dipahami. Gunakan markdown (##, ###, paragraf, bullet point). Mulai langsung dengan konten — jangan ulangi judulnya.`;

    return await this.client.generate(prompt);
  }

  // ── Phase 3: Synthesize ──────────────────────────────────────────────────

  async _synthesize(topic, analyses) {
    const summaries = analyses
      .map((a, i) => `[${i + 1}. ${a.title}]\n${a.content.slice(0, 500)}…`)
      .join('\n\n');

    const prompt = `Kamu adalah peneliti senior. Berdasarkan analisis sub-topik di bawah ini, buat bagian "Sintesis & Temuan Utama" yang mengintegrasikan semua temuan menjadi narasi yang kohesif.

Topik Riset: "${topic}"

Ringkasan Analisis:
${summaries}

Tulis sintesis dalam bahasa Indonesia (2–4 paragraf). Hubungkan antar sub-topik, identifikasi pola dan tema utama. Gunakan markdown.`;

    return await this.client.generate(prompt);
  }

  // ── Phase 4: Generate Report ─────────────────────────────────────────────

  async _generateReport(topic, analyses, synthesis) {
    const analysisText = analyses
      .map((a, i) => `\n## ${i + 1}. ${a.title}\n${a.content}`)
      .join('\n\n');

    const prompt = `Kamu adalah penulis akademis berpengalaman. Susun laporan riset komprehensif berdasarkan data berikut.

TOPIK: "${topic}"

ANALISIS SUB-TOPIK:
${analysisText}

SINTESIS:
${synthesis}

Buat laporan dengan struktur:
# [Judul Laporan yang Menarik dan Relevan]

## Pendahuluan
[Latar belakang dan konteks topik]

[Bagian-bagian per sub-topik]

## Sintesis & Temuan Utama
[Integrasikan sintesis]

## Kesimpulan & Rekomendasi
[Ringkasan dan rekomendasi konkret]

Tulis dalam bahasa Indonesia yang akademis, mengalir, dan komprehensif.`;

    return await this.client.generate(prompt);
  }

  // ── Public: Run all phases ────────────────────────────────────────────────

  async run(topic) {
    const { callbacks } = this;

    // Phase 1
    const subtopics = await this._plan(topic);
    this._log(`✓ Rencana selesai — ${subtopics.length} sub-topik ditemukan`);
    callbacks.onPlanReady?.(subtopics);

    // Phase 2
    const analyses = [];
    for (let i = 0; i < subtopics.length; i++) {
      const st = subtopics[i];
      this._log(`Menganalisis sub-topik ${i + 1}/${subtopics.length}: "${st.title}"…`);
      callbacks.onSubtopicStart?.(i);

      const content = await this._analyzeSubtopic(topic, st);
      analyses.push({ title: st.title, content });

      this._log(`✓ Sub-topik ${i + 1} selesai`);
      callbacks.onSubtopicDone?.(i, st.title, content);
    }

    // Phase 3
    this._log('Mensintesis semua temuan…');
    const synthesis = await this._synthesize(topic, analyses);
    this._log('✓ Sintesis selesai');
    callbacks.onSynthesisDone?.();

    // Phase 4
    this._log('Menyusun laporan final…');
    const reportMd  = await this._generateReport(topic, analyses, synthesis);
    const wordCount = reportMd.split(/\s+/).length;
    this._log(`✓ Laporan selesai — ~${wordCount.toLocaleString('id-ID')} kata`);
    callbacks.onReportReady?.(reportMd, wordCount);
  }
}
