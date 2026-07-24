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

import { GeminiClient, ResearchAgent } from './agent.js';


// ─────────────────────────────────────────────────────────────────────────────
// APP STATE
// ─────────────────────────────────────────────────────────────────────────────

const state = {
  depth:     'standar',
  isRunning: false,
};


// ─────────────────────────────────────────────────────────────────────────────
// DOM REFERENCES (resolved after DOMContentLoaded)
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
  // Resolve DOM references
  elApiKeySection = document.getElementById('apiKeySection');
  elApiKeyInput   = document.getElementById('apiKey');
  elToggleKeyBtn  = document.getElementById('toggleKeyBtn');
  elStartBtn      = document.getElementById('startBtn');
  elTopicInput    = document.getElementById('topicInput');
  elWorkspace     = document.getElementById('workspace');

  // ── Handle environment API key ──────────────────────────────────────────
  // If config.js injected window.GEMINI_API_KEY, hide the input section.
  if (window.GEMINI_API_KEY) {
    elApiKeySection.style.display = 'none';
  } else {
    // Restore key from session storage (convenience — not a security measure)
    const savedKey = sessionStorage.getItem('rm_apikey');
    if (savedKey) elApiKeyInput.value = savedKey;

    elApiKeyInput.addEventListener('input', () => {
      sessionStorage.setItem('rm_apikey', elApiKeyInput.value);
    });
  }

  // ── Bind events ─────────────────────────────────────────────────────────
  elToggleKeyBtn?.addEventListener('click', handleToggleKeyVisibility);
  elStartBtn.addEventListener('click', handleStartResearch);

  elTopicInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) handleStartResearch();
  });

  // ── Depth selector ───────────────────────────────────────────────────────
  document.querySelectorAll('.depth-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleSetDepth(btn.dataset.depth, btn));
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS — DEPTH SELECTOR
// ─────────────────────────────────────────────────────────────────────────────

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

  const apiKey = window.GEMINI_API_KEY || elApiKeyInput?.value.trim();
  const topic  = elTopicInput.value.trim();

  if (!apiKey) {
    showToast('⚠️ Masukkan Gemini API Key terlebih dahulu.', 'error');
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

  // ── Initialise agent ─────────────────────────────────────────────────────
  let client;
  try {
    client = new GeminiClient(apiKey, (waitSec, attempt) => {
      addLog(`⏳ Rate limit — tunggu ${waitSec}d lalu retry (${attempt}/2)…`);
      showToast(`⏳ Rate limit — retry otomatis dalam ${waitSec}d…`);
    });
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
