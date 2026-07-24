/**
 * main.js — ResearchMind Application Entry Point
 *
 * Responsibilities:
 *   - Bootstrap the app on DOMContentLoaded
 *   - Handle user interactions (depth selector, API key toggle, start button)
 *   - Orchestrate UI updates in response to agent callbacks
 *   - Detect window.GROQ_API_KEY from config.js
 */

import {
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

import { GroqClient, ResearchAgent } from './agent.js';


// ─────────────────────────────────────────────────────────────────────────────
// APP STATE
// ─────────────────────────────────────────────────────────────────────────────

const state = {
  depth:     'standar',
  isRunning: false,
};


// ─────────────────────────────────────────────────────────────────────────────
// DOM REFERENCES
// ─────────────────────────────────────────────────────────────────────────────

let elApiKeySection;
let elApiKeyInput;
let elToggleKeyBtn;
let elTopicInput;
let elStartBtn;
let elWorkspace;


// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  elApiKeySection = document.getElementById('apiKeySection');
  elApiKeyInput   = document.getElementById('apiKey');
  elToggleKeyBtn  = document.getElementById('toggleKeyBtn');
  elStartBtn      = document.getElementById('startBtn');
  elTopicInput    = document.getElementById('topicInput');
  elWorkspace     = document.getElementById('workspace');

  // ── Sembunyikan form jika key sudah ada di config.js ────────────────────
  const hasConfigKey = window.GROQ_API_KEY && window.GROQ_API_KEY !== 'YOUR_GROQ_API_KEY_HERE';

  if (hasConfigKey) {
    elApiKeySection.style.display = 'none';
  } else {
    const savedKey = sessionStorage.getItem('rm_groq_key');
    if (savedKey) elApiKeyInput.value = savedKey;

    elApiKeyInput?.addEventListener('input', () => {
      sessionStorage.setItem('rm_groq_key', elApiKeyInput.value);
    });
  }

  // ── Events ───────────────────────────────────────────────────────────────
  elToggleKeyBtn?.addEventListener('click', handleToggleKeyVisibility);
  elStartBtn.addEventListener('click', handleStartResearch);

  elTopicInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) handleStartResearch();
  });

  document.querySelectorAll('.depth-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleSetDepth(btn.dataset.depth, btn));
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

function handleSetDepth(depth, btnEl) {
  state.depth = depth;
  document.querySelectorAll('.depth-btn').forEach((b) => {
    b.classList.toggle('selected', b === btnEl);
    b.setAttribute('aria-pressed', String(b === btnEl));
  });
}

function handleToggleKeyVisibility() {
  if (!elApiKeyInput) return;
  elApiKeyInput.type = elApiKeyInput.type === 'password' ? 'text' : 'password';
}

async function handleStartResearch() {
  if (state.isRunning) return;

  // Utamakan key dari config.js, fallback ke form input
  const configKey    = window.GROQ_API_KEY;
  const isConfigValid = configKey && configKey !== 'YOUR_GROQ_API_KEY_HERE';
  const apiKey       = isConfigValid ? configKey : elApiKeyInput?.value.trim();
  const topic        = elTopicInput.value.trim();

  if (!apiKey) {
    showToast('⚠️ Masukkan Groq API Key terlebih dahulu.', 'error');
    elApiKeySection.style.display = '';
    elApiKeyInput?.focus();
    return;
  }
  if (!topic) {
    showToast('⚠️ Masukkan topik riset terlebih dahulu.', 'error');
    elTopicInput.focus();
    return;
  }

  if (!isConfigValid && elApiKeyInput?.value) {
    sessionStorage.setItem('rm_groq_key', elApiKeyInput.value);
  }

  state.isRunning = true;
  setStartTime(Date.now());
  setButtonLoading(true);
  resetWorkspace();

  // ── Build workspace ───────────────────────────────────────────────────────
  const container = elWorkspace.querySelector('.container');

  container.appendChild(buildProgressBoard());

  const logPanel = document.createElement('div');
  logPanel.className = 'log-panel';
  container.appendChild(logPanel);
  setLogPanel(logPanel);

  const planCardSlot = document.createElement('div');
  const resultsSlot  = document.createElement('div');
  container.appendChild(planCardSlot);
  container.appendChild(resultsSlot);

  // ── Client & Agent ────────────────────────────────────────────────────────
  const onRetry = (waitSec, attempt) => {
    addLog(`⏳ Rate limit — tunggu ${waitSec}d lalu retry (${attempt}/2)…`);
    showToast(`⏳ Retry otomatis dalam ${waitSec}d…`);
  };

  let client;
  try {
    client = new GroqClient(apiKey, 'llama-3.3-70b-versatile', onRetry);
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
        setStepState('plan', 'is-done', getElapsed());
        activateStepPill(2);
        setStepState('analyze', 'is-running');
        planCardSlot.appendChild(buildPlanCard(subtopics));
      },

      onSubtopicStart: (index) => setSubtopicState(index, 'is-active'),

      onSubtopicDone: (index, title, contentMd) => {
        setSubtopicState(index, 'is-done');
        resultsSlot.appendChild(
          buildResultSection(index + 1, title, markdownToHtml(contentMd))
        );
      },

      onSynthesisDone: () => {
        setStepState('analyze', 'is-done', getElapsed());
        activateStepPill(3);
        setStepState('synthesize', 'is-running');
        setTimeout(() => {
          setStepState('synthesize', 'is-done', getElapsed());
          activateStepPill(4);
          setStepState('report', 'is-running');
        }, 200);
      },

      onReportReady: (reportMd, wordCount) => {
        setStepState('report', 'is-done', getElapsed());
        activateStepPill(0);

        const report = buildFinalReport(markdownToHtml(reportMd), state.depth, topic, wordCount);
        container.appendChild(report);
        report.scrollIntoView({ behavior: 'smooth', block: 'start' });

        addLog(`🎉 Selesai! Total waktu: ${getElapsed()}`);
        showToast('✅ Laporan riset berhasil dibuat!', 'success');
        finishResearch();
      },
    },
  });

  // ── Run ───────────────────────────────────────────────────────────────────
  activateStepPill(1);
  setStepState('plan', 'is-running');
  addLog(`Agen dimulai · Topik: "${topic}" · Mode: ${state.depth}`);

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

function setButtonLoading(loading) {
  elStartBtn.disabled = loading;
  elStartBtn.classList.toggle('is-loading', loading);
  elStartBtn.querySelector('.btn-label').textContent = loading ? 'Sedang Riset…' : 'Mulai Riset →';
}

function resetWorkspace() {
  elWorkspace.querySelector('.container').innerHTML = '';
}

function finishResearch() {
  state.isRunning = false;
  setButtonLoading(false);
}
