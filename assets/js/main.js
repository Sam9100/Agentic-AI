/**
 * main.js — ResearchMind Application Entry Point
 *
 * Responsibilities:
 *   - Bootstrap the app on DOMContentLoaded
 *   - Handle user interactions (depth selector, API key toggle, start button)
 *   - Orchestrate UI updates in response to agent callbacks
 *   - Detect window.GEMINI_API_KEY from config.js (environment injection)
 */

import {
  AGENT_STEPS,
  showToast,
  activateStepPill,
  setLogPanel,
  addLog,
  setStartTime,
  getElapsed,
  buildProgressBoard,
  setStepState,
  buildPlanCard,
  setSubtopicState,
  buildResultSection,
  buildFinalReport,
  markdownToHtml,
} from './ui.js';

import { GeminiClient, GroqClient, ResearchAgent } from './agent.js';


// ─────────────────────────────────────────────────────────────────────────────
// APP STATE
// ─────────────────────────────────────────────────────────────────────────────

const state = {
  depth:     'standar',
  provider:  'groq',
  model:     'llama-3.3-70b-versatile',
  isRunning: false,
};


// ─────────────────────────────────────────────────────────────────────────────
// DOM REFERENCES (resolved after DOMContentLoaded)
// ─────────────────────────────────────────────────────────────────────────────

let elApiKeySection;
let elApiKeyInput;
let elApiKeyLabel;
let elApiKeyNote;
let elApiKeyLink;
let elToggleKeyBtn;
let elTopicInput;
let elModelSelect;
let elStartBtn;
let elWorkspace;


// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Resolve DOM references
  elApiKeySection = document.getElementById('apiKeySection');
  elApiKeyInput   = document.getElementById('apiKey');
  elApiKeyLabel   = document.getElementById('apiKeyLabel');
  elApiKeyNote    = document.getElementById('apiKeyNote');
  elApiKeyLink    = document.getElementById('apiKeyLink');
  elToggleKeyBtn  = document.getElementById('toggleKeyBtn');
  elStartBtn      = document.getElementById('startBtn');
  elTopicInput    = document.getElementById('topicInput');
  elModelSelect   = document.getElementById('modelSelect');
  elWorkspace     = document.getElementById('workspace');

  // ── Handle config.js keys ─────────────────────────────────────────────────────
  // Jika config.js ada dan key sudah diisi, form API key disembunyikan.
  // Key dibaca langsung dari window saat riset dijalankan.
  const hasGroqConfig   = window.GROQ_API_KEY   && window.GROQ_API_KEY   !== 'YOUR_GROQ_API_KEY_HERE';
  const hasGeminiConfig = window.GEMINI_API_KEY  && window.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE';

  if (hasGroqConfig || hasGeminiConfig) {
    elApiKeySection.style.display = 'none';
  }

  // ── Bind events ─────────────────────────────────────────────────────────
  elToggleKeyBtn?.addEventListener('click', handleToggleKeyVisibility);
  elStartBtn.addEventListener('click', handleStartResearch);

  // Provider tabs
  document.querySelectorAll('.provider-tab').forEach((tab) => {
    tab.addEventListener('click', () => handleSetProvider(tab.dataset.provider));
  });

  // Model dropdown
  elModelSelect?.addEventListener('change', () => {
    state.model = elModelSelect.value;
  });

  elTopicInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) handleStartResearch();
  });

  // ── Depth selector ───────────────────────────────────────────────────────
  document.querySelectorAll('.depth-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleSetDepth(btn.dataset.depth, btn));
  });

  // ── Start with Groq selected ──────────────────────────────────────────────
  handleSetProvider('groq');
});


// ─────────────────────────────────────────────────────────────────────────────────
// HANDLERS — PROVIDER SELECTOR
// ─────────────────────────────────────────────────────────────────────────────────

const PROVIDER_CONFIG = {
  groq: {
    label:       'Groq API Key',
    placeholder: 'Masukkan Groq API Key kamu…',
    noteText:    '🔒 Key hanya di sesi browser ini. Groq gratis, limit 14.400 req/hari. · ',
    linkText:    'Daftar Groq gratis →',
    linkHref:    'https://console.groq.com',
    sessionKey:  'rm_groq_key',
    models: [
      { value: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b — Terbaik ★' },
      { value: 'llama-3.1-8b-instant',    label: 'llama-3.1-8b — Tercepat' },
      { value: 'mixtral-8x7b-32768',      label: 'mixtral-8x7b — Seimbang' },
      { value: 'llama3-70b-8192',         label: 'llama3-70b — Stabil' },
    ],
  },
  gemini: {
    label:       'Gemini API Key',
    placeholder: 'Masukkan Gemini API Key kamu…',
    noteText:    '🔒 Key hanya di sesi browser ini. Dikirim langsung ke Google. · ',
    linkText:    'Dapatkan Gemini key gratis →',
    linkHref:    'https://aistudio.google.com/apikey',
    sessionKey:  'rm_gemini_key',
    models: [
      { value: 'gemini-2.0-flash-lite', label: 'gemini-2.0-flash-lite — Gratis ★' },
      { value: 'gemini-2.0-flash',      label: 'gemini-2.0-flash — Gratis' },
      { value: 'gemini-1.5-flash',      label: 'gemini-1.5-flash — Gratis' },
      { value: 'gemini-1.5-flash-8b',   label: 'gemini-1.5-flash-8b — Gratis, Cepat' },
    ],
  },
};

/**
 * Switch the active provider and update all dependent UI elements.
 * @param {'groq'|'gemini'} provider
 */
function handleSetProvider(provider) {
  state.provider = provider;
  const cfg = PROVIDER_CONFIG[provider];

  // ── Update tabs ──
  document.querySelectorAll('.provider-tab').forEach((tab) => {
    const active = tab.dataset.provider === provider;
    tab.classList.toggle('selected', active);
    tab.setAttribute('aria-selected', String(active));
  });

  // ── Update API key field ──
  if (elApiKeyLabel)  elApiKeyLabel.textContent    = cfg.label;
  if (elApiKeyInput)  elApiKeyInput.placeholder     = cfg.placeholder;
  if (elApiKeyLink) {
    elApiKeyLink.textContent = cfg.linkText;
    elApiKeyLink.href        = cfg.linkHref;
  }

  // Restore saved key for this provider (only if section is visible)
  const configKey = provider === 'groq' ? window.GROQ_API_KEY : window.GEMINI_API_KEY;
  const isConfigValid = configKey && configKey !== 'YOUR_GROQ_API_KEY_HERE' && configKey !== 'YOUR_GEMINI_API_KEY_HERE';

  if (isConfigValid) {
    // Key dari config.js — sembunyikan form
    elApiKeySection.style.display = 'none';
  } else {
    // Tidak ada config key — tampilkan form, restore dari session
    elApiKeySection.style.display = '';
    const savedKey = sessionStorage.getItem(cfg.sessionKey);
    if (elApiKeyInput) elApiKeyInput.value = savedKey ?? '';
  }

  // ── Rebuild model dropdown ──
  if (elModelSelect) {
    elModelSelect.innerHTML = cfg.models
      .map((m) => `<option value="${m.value}">${m.label}</option>`)
      .join('');
    state.model = cfg.models[0].value;
  }
}


// ─────────────────────────────────────────────────────────────────────────────────
// HANDLERS — DEPTH SELECTOR
// ─────────────────────────────────────────────────────────────────────────────────

/**
 * @param {string}      depth  - 'singkat' | 'standar' | 'mendalam'
 * @param {HTMLElement} btnEl
 */
function handleSetDepth(depth, btnEl) {
  state.depth = depth;
  document.querySelectorAll('.depth-btn').forEach((b) => {
    b.classList.toggle('selected', b === btnEl);
    b.setAttribute('aria-pressed', String(b === btnEl));
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS — API KEY VISIBILITY TOGGLE
// ─────────────────────────────────────────────────────────────────────────────

function handleToggleKeyVisibility() {
  if (!elApiKeyInput) return;
  elApiKeyInput.type = elApiKeyInput.type === 'password' ? 'text' : 'password';
}


// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS — START RESEARCH
// ─────────────────────────────────────────────────────────────────────────────

async function handleStartResearch() {
  if (state.isRunning) return;

  // Ambil API key: utamakan dari config.js, fallback ke input form
  const configKey = state.provider === 'groq' ? window.GROQ_API_KEY : window.GEMINI_API_KEY;
  const isConfigValid = configKey && configKey !== 'YOUR_GROQ_API_KEY_HERE' && configKey !== 'YOUR_GEMINI_API_KEY_HERE';
  const apiKey = isConfigValid ? configKey : elApiKeyInput?.value.trim();
  const topic  = elTopicInput.value.trim();

  if (!apiKey) {
    showToast('⚠️ Masukkan API Key terlebih dahulu.', 'error');
    elApiKeyInput?.focus();
    return;
  }
  if (!topic) {
    showToast('⚠️ Masukkan topik riset terlebih dahulu.', 'error');
    elTopicInput.focus();
    return;
  }

  state.isRunning = true;
  setStartTime(Date.now());
  setButtonLoading(true);
  resetWorkspace();

  // ── Build workspace layout ───────────────────────────────────────────────
  const container = elWorkspace.querySelector('.container');

  const progressBoard = buildProgressBoard();
  container.appendChild(progressBoard);

  const logPanel = document.createElement('div');
  logPanel.className = 'log-panel';
  container.appendChild(logPanel);
  setLogPanel(logPanel);

  // Placeholders for plan card and results
  const planCardSlot    = document.createElement('div');
  const resultsSlot     = document.createElement('div');
  container.appendChild(planCardSlot);
  container.appendChild(resultsSlot);

  // Save API key to session for this provider
  const cfg = PROVIDER_CONFIG[state.provider];
  if (cfg && elApiKeyInput?.value) {
    sessionStorage.setItem(cfg.sessionKey, elApiKeyInput.value);
  }

  // ── Initialise client ───────────────────────────────────────────────────────
  const onRetry = (waitSec, attempt) => {
    addLog(`⏳ Rate limit — tunggu ${waitSec}d lalu retry (${attempt}/2)…`);
    showToast(`⏳ Rate limit — retry otomatis dalam ${waitSec}d…`);
  };

  let client;
  try {
    if (state.provider === 'groq') {
      client = new GroqClient(apiKey, state.model, onRetry);
    } else {
      client = new GeminiClient(apiKey, state.model, onRetry);
    }
  } catch (err) {
    showToast(`❌ ${err.message}`, 'error');
    finishResearch();
    return;
  }

  const agent = new ResearchAgent(client, {
    depth: state.depth,
    callbacks: {

      onLog: (msg) => addLog(msg),

      onPlanReady: (subtopics) => {
        // Phase 1 done
        setStepState('plan', 'is-done', getElapsed());
        activateStepPill(2);
        setStepState('analyze', 'is-running');

        const planCard = buildPlanCard(subtopics);
        planCardSlot.appendChild(planCard);
      },

      onSubtopicStart: (index) => {
        setSubtopicState(index, 'is-active');
      },

      onSubtopicDone: (index, title, contentMd) => {
        setSubtopicState(index, 'is-done');
        const html    = markdownToHtml(contentMd);
        const section = buildResultSection(index + 1, title, html);
        resultsSlot.appendChild(section);
      },

      onSynthesisDone: () => {
        setStepState('analyze', 'is-done', getElapsed());
        activateStepPill(3);
        setStepState('synthesize', 'is-running');
        // Synthesis is internal; no separate card needed
        setTimeout(() => {
          setStepState('synthesize', 'is-done', getElapsed());
          activateStepPill(4);
          setStepState('report', 'is-running');
        }, 200);
      },

      onReportReady: (reportMd, wordCount) => {
        setStepState('report', 'is-done', getElapsed());
        activateStepPill(0);

        const html   = markdownToHtml(reportMd);
        const report = buildFinalReport(html, state.depth, topic, wordCount);
        container.appendChild(report);
        report.scrollIntoView({ behavior: 'smooth', block: 'start' });

        addLog(`🎉 Selesai! Total waktu: ${getElapsed()}`);
        showToast('✅ Laporan riset berhasil dibuat!', 'success');
        finishResearch();
      },
    },
  });

  // ── Execute ───────────────────────────────────────────────────────────────
  activateStepPill(1);
  setStepState('plan', 'is-running');
  addLog(`Agen dimulai · Topik: "${topic}" · Model: ${state.model} · Mode: ${state.depth}`);
  try {
    await agent.run(topic);
  } catch (err) {
    addLog(`❌ Error: ${err.message}`);
    showToast(`❌ ${err.message}`, 'error');
    finishResearch();
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Toggle the start button between its normal and loading states.
 * @param {boolean} loading
 */
function setButtonLoading(loading) {
  elStartBtn.disabled = loading;
  elStartBtn.classList.toggle('is-loading', loading);
  elStartBtn.querySelector('.btn-label').textContent = loading ? 'Sedang Riset…' : 'Mulai Riset →';
}

/**
 * Clear the workspace and show the empty state placeholder.
 */
function resetWorkspace() {
  const container = elWorkspace.querySelector('.container');
  container.innerHTML = '';
}

/**
 * Called when the agent finishes (success or error).
 */
function finishResearch() {
  state.isRunning = false;
  setButtonLoading(false);
}
