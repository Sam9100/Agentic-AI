/**
 * agent.js — ResearchMind Agent Logic
 *
 * Contains two classes:
 *   - GeminiClient  : thin wrapper around the Gemini REST API
 *   - ResearchAgent : orchestrates the 4-phase agentic research workflow
 *
 * The agent communicates back to the UI via a callbacks object,
 * keeping business logic completely separate from DOM manipulation.
 */


// ─────────────────────────────────────────────────────────────────────────────
// GEMINI CLIENT
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Build the generateContent endpoint URL for a given model.
 * @param {string} model
 * @returns {string}
 */
const buildEndpoint = (model) => `${GEMINI_BASE}/${model}:generateContent`;

const DEFAULT_GEN_CONFIG = {
  temperature:     0.7,
  maxOutputTokens: 8192,
};

/**
 * Parse seconds-to-retry from a Gemini rate-limit error message.
 * Returns 0 if no value found.
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

export class GeminiClient {
  /**
   * @param {string}   apiKey   - Gemini API key
   * @param {string}   model    - Model ID, e.g. 'gemini-2.0-flash-lite'
   * @param {Function} [onRetry] - Called with (waitSec, attempt) when a retry is triggered
   */
  constructor(apiKey, model, onRetry) {
    if (!apiKey) throw new Error('API key tidak boleh kosong.');
    if (!model)  throw new Error('Model ID tidak boleh kosong.');
    this.apiKey    = apiKey;
    this.model     = model;
    this._endpoint = buildEndpoint(model);
    this._onRetry  = onRetry ?? null;
  }

  /**
   * Send a prompt (with optional system context) and return the text response.
   * Automatically retries on 429 rate-limit errors with the server-suggested delay.
   *
   * @param {string} userPrompt
   * @param {string} [systemContext]  - Optional assistant context injected before the prompt
   * @param {object} [genConfig]      - Override generation config
   * @param {number} [attempt]        - Internal retry counter (starts at 1)
   * @returns {Promise<string>}
   */
  async generate(userPrompt, systemContext = '', genConfig = {}, attempt = 1) {
    const MAX_ATTEMPTS = 3;

    const contents = [];

    if (systemContext.trim()) {
      contents.push({ role: 'user',  parts: [{ text: systemContext }] });
      contents.push({ role: 'model', parts: [{ text: 'Baik, saya siap.' }] });
    }

    contents.push({ role: 'user', parts: [{ text: userPrompt }] });

    const res = await fetch(`${this._endpoint}?key=${this.apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        contents,
        generationConfig: { ...DEFAULT_GEN_CONFIG, ...genConfig },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message ?? `HTTP ${res.status}`;

      // ── Rate limit (429): retry with suggested delay ──
      if (res.status === 429 && attempt < MAX_ATTEMPTS) {
        const waitSec = parseRetryAfter(msg) || (attempt * 15);
        console.warn(`[Gemini] Rate limited. Retry ${attempt}/${MAX_ATTEMPTS - 1} setelah ${waitSec}d…`);
        this._onRetry?.(waitSec, attempt);
        await sleep(waitSec * 1000);
        return this.generate(userPrompt, systemContext, genConfig, attempt + 1);
      }

      throw new Error(`Gemini API error: ${msg}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error('Respons API kosong atau tidak valid.');
    return text;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// GROQ CLIENT
// ─────────────────────────────────────────────────────────────────────────────

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export class GroqClient {
  /**
   * @param {string}   apiKey    - Groq API key (from console.groq.com)
   * @param {string}   model     - Groq model ID, e.g. 'llama-3.3-70b-versatile'
   * @param {Function} [onRetry] - Called with (waitSec, attempt) on rate-limit retry
   */
  constructor(apiKey, model, onRetry) {
    if (!apiKey) throw new Error('Groq API key tidak boleh kosong.');
    if (!model)  throw new Error('Model ID tidak boleh kosong.');
    this.apiKey    = apiKey;
    this.model     = model;
    this._onRetry  = onRetry ?? null;
  }

  /**
   * Send a prompt and return the text response.
   * Automatically retries on 429 rate-limit errors.
   *
   * @param {string} userPrompt
   * @param {string} [systemContext]
   * @param {object} [_genConfig]   - Unused (kept for interface parity with GeminiClient)
   * @param {number} [attempt]
   * @returns {Promise<string>}
   */
  async generate(userPrompt, systemContext = '', _genConfig = {}, attempt = 1) {
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
        return this.generate(userPrompt, systemContext, _genConfig, attempt + 1);
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
 * @property {(index: number, title: string, html: string) => void}     onSubtopicDone
 * @property {() => void}                                               onSynthesisDone
 * @property {(html: string, wordCount: number) => void}                onReportReady
 */

/**
 * @typedef {Object} AgentOptions
 * @property {string}          depth     - 'singkat' | 'standar' | 'mendalam'
 * @property {AgentCallbacks}  callbacks
 */

export class ResearchAgent {
  /**
   * @param {GeminiClient} client
   * @param {AgentOptions} options
   */
  constructor(client, options) {
    this.client    = client;
    this.depth     = options.depth ?? 'standar';
    this.callbacks = options.callbacks;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /** @param {string} msg */
  _log(msg) {
    this.callbacks.onLog?.(msg);
  }

  // ── Phase 1: Plan ─────────────────────────────────────────────────────────

  /**
   * Ask the model to break the topic into 4–5 structured sub-topics.
   * @param {string} topic
   * @returns {Promise<Array<{id:number, title:string, desc:string}>>}
   */
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

  /**
   * Deeply analyze a single sub-topic in the context of the main topic.
   * @param {string} topic
   * @param {{ title: string, desc: string }} subtopic
   * @returns {Promise<string>} Raw markdown text
   */
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

  /**
   * Synthesize all sub-topic analyses into a coherent narrative.
   * @param {string} topic
   * @param {Array<{title:string, content:string}>} analyses
   * @returns {Promise<string>} Raw markdown text
   */
  async _synthesize(topic, analyses) {
    const summaries = analyses
      .map((a, i) => `[${i + 1}. ${a.title}]\n${a.content.slice(0, 500)}…`)
      .join('\n\n');

    const prompt = `Kamu adalah peneliti senior. Berdasarkan analisis sub-topik di bawah ini, buat bagian "Sintesis & Temuan Utama" yang mengintegrasikan semua temuan menjadi narasi yang kohesif dan bermakna.

Topik Riset: "${topic}"

Ringkasan Analisis:
${summaries}

Tulis sintesis dalam bahasa Indonesia (2–4 paragraf). Hubungkan antar sub-topik, identifikasi pola, implikasi, dan tema utama yang muncul. Gunakan markdown.`;

    return await this.client.generate(prompt);
  }

  // ── Phase 4: Generate Report ─────────────────────────────────────────────

  /**
   * Generate the final comprehensive research report.
   * @param {string} topic
   * @param {Array<{title:string, content:string}>} analyses
   * @param {string} synthesis
   * @returns {Promise<string>} Raw markdown text
   */
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

Buat laporan dengan struktur berikut:
# [Judul Laporan yang Menarik dan Relevan]

## Pendahuluan
[Latar belakang, konteks, dan pentingnya topik ini]

[Bagian-bagian per sub-topik yang sudah dianalisis]

## Sintesis & Temuan Utama
[Integrasikan sintesis di atas]

## Kesimpulan & Rekomendasi
[Ringkasan temuan dan rekomendasi konkret]

Tulis dalam bahasa Indonesia yang akademis, mengalir, dan komprehensif.`;

    return await this.client.generate(prompt);
  }

  // ── Public: Run all phases ────────────────────────────────────────────────

  /**
   * Execute the full 4-phase research workflow.
   * Progress is reported via callbacks throughout.
   *
   * @param {string} topic
   * @returns {Promise<void>}
   */
  async run(topic) {
    const { callbacks } = this;

    /* ── Phase 1: Plan ── */
    const subtopics = await this._plan(topic);
    this._log(`✓ Rencana selesai — ${subtopics.length} sub-topik ditemukan`);
    callbacks.onPlanReady?.(subtopics);

    /* ── Phase 2: Analyze ── */
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

    /* ── Phase 3: Synthesize ── */
    this._log('Mensintesis semua temuan…');
    const synthesis = await this._synthesize(topic, analyses);
    this._log('✓ Sintesis selesai');
    callbacks.onSynthesisDone?.();

    /* ── Phase 4: Report ── */
    this._log('Menyusun laporan final…');
    const reportMd  = await this._generateReport(topic, analyses, synthesis);
    const wordCount = reportMd.split(/\s+/).length;

    this._log(`✓ Laporan selesai — ~${wordCount.toLocaleString('id-ID')} kata`);
    callbacks.onReportReady?.(reportMd, wordCount);
  }
}
