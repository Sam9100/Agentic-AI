/**
 * ui.js — ResearchMind UI Utilities
 *
 * Responsible for all DOM manipulation and UI state updates.
 * Business logic lives in agent.js; orchestration lives in main.js.
 *
 * Exports:
 *   - UI object with methods for each concern
 */

/** @type {HTMLElement|null} */
let _logPanelEl = null;

/** @type {number} */
let _startTime = 0;

// ─── Agent step definitions (order matters) ────────────────────────────────

export const AGENT_STEPS = [
  {
    id:   'plan',
    name: 'Merencanakan Riset',
    desc: 'Memecah topik menjadi sub-topik terstruktur',
  },
  {
    id:   'analyze',
    name: 'Menganalisis Sub-Topik',
    desc: 'Mendalami setiap aspek secara menyeluruh',
  },
  {
    id:   'synthesize',
    name: 'Mensintesis Temuan',
    desc: 'Menggabungkan semua hasil analisis',
  },
  {
    id:   'report',
    name: 'Menyusun Laporan',
    desc: 'Menulis laporan final yang komprehensif',
  },
];


// ─── Toast ─────────────────────────────────────────────────────────────────

/** @type {ReturnType<typeof setTimeout>|null} */
let _toastTimer = null;

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|''} type
 */
export function showToast(message, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;

  if (_toastTimer) clearTimeout(_toastTimer);

  el.textContent = message;
  el.className = `toast is-visible${type ? ` is-${type}` : ''}`;

  _toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
  }, 3200);
}


// ─── Step pills (top indicator row) ────────────────────────────────────────

/**
 * Activate a numbered step pill (1–4). Pass 0 to deactivate all.
 * @param {number} n
 */
export function activateStepPill(n) {
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`spill-${i}`)?.classList.toggle('active', i === n);
  }
}


// ─── Log panel ─────────────────────────────────────────────────────────────

/**
 * Set the log panel element reference.
 * @param {HTMLElement} el
 */
export function setLogPanel(el) {
  _logPanelEl = el;
}

/**
 * Append a timestamped entry to the log panel.
 * @param {string} message
 */
export function addLog(message) {
  if (!_logPanelEl) return;

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML =
    `<span class="log-time">${timestamp}</span>` +
    `<span class="log-msg">${message}</span>`;

  _logPanelEl.appendChild(entry);
  _logPanelEl.scrollTop = _logPanelEl.scrollHeight;
}


// ─── Progress board ─────────────────────────────────────────────────────────

/**
 * Set the start time reference (used for elapsed-time display).
 * @param {number} ms
 */
export function setStartTime(ms) {
  _startTime = ms;
}

/**
 * Return a human-readable elapsed time since _startTime.
 * @returns {string}
 */
export function getElapsed() {
  if (!_startTime) return '';
  const s = Math.round((Date.now() - _startTime) / 1000);
  return s < 60 ? `${s}d` : `${Math.floor(s / 60)}m ${s % 60}d`;
}

/**
 * Build and return the progress board DOM element.
 * @returns {HTMLElement}
 */
export function buildProgressBoard() {
  const board = document.createElement('div');
  board.className = 'progress-board';

  const title = document.createElement('p');
  title.className = 'progress-board-title';
  title.textContent = '🗺 Progres Agen';
  board.appendChild(title);

  const stepsWrap = document.createElement('div');
  stepsWrap.className = 'progress-steps';

  AGENT_STEPS.forEach((step, i) => {
    const row = document.createElement('div');
    row.className = 'progress-step';

    // Left column: dot + connector
    const left = document.createElement('div');
    left.className = 'ps-col-left';

    const dot = document.createElement('div');
    dot.className = 'ps-dot';
    dot.id = `pd-${step.id}`;
    dot.textContent = String(i + 1);
    left.appendChild(dot);

    if (i < AGENT_STEPS.length - 1) {
      const connector = document.createElement('div');
      connector.className = 'ps-connector';
      connector.id = `pc-${step.id}`;
      left.appendChild(connector);
    }

    // Right column: name + desc + elapsed
    const right = document.createElement('div');
    right.className = 'ps-col-right';

    const name = document.createElement('p');
    name.className = 'ps-name';
    name.id = `pn-${step.id}`;
    name.textContent = step.name;

    const desc = document.createElement('p');
    desc.className = 'ps-desc';
    desc.id = `pdesc-${step.id}`;
    desc.textContent = step.desc;

    const elapsed = document.createElement('p');
    elapsed.className = 'ps-elapsed';
    elapsed.id = `pe-${step.id}`;

    right.append(name, desc, elapsed);
    row.append(left, right);
    stepsWrap.appendChild(row);
  });

  board.appendChild(stepsWrap);
  return board;
}

/**
 * Update a progress step's visual state.
 * @param {string} id - Step id (e.g. 'plan')
 * @param {'is-running'|'is-done'|''} state
 * @param {string} [elapsedText]
 */
export function setStepState(id, state, elapsedText = '') {
  const dot       = document.getElementById(`pd-${id}`);
  const name      = document.getElementById(`pn-${id}`);
  const desc      = document.getElementById(`pdesc-${id}`);
  const elapsedEl = document.getElementById(`pe-${id}`);
  const connector = document.getElementById(`pc-${id}`);

  if (!dot) return;

  // Reset classes
  dot.className  = `ps-dot ${state}`;
  name.className = `ps-name ${state}`;
  desc.className = `ps-desc ${state}`;

  if (state === 'is-done') {
    dot.textContent = '✓';
    if (connector) connector.classList.add('is-done');
    if (elapsedText && elapsedEl) elapsedEl.textContent = `✓ ${elapsedText}`;
  }
}


// ─── Plan card ─────────────────────────────────────────────────────────────

/**
 * Build and return a plan card DOM element from subtopics.
 * @param {Array<{id:number, title:string, desc:string}>} subtopics
 * @returns {HTMLElement}
 */
export function buildPlanCard(subtopics) {
  const card = document.createElement('div');
  card.className = 'plan-card';

  card.innerHTML = `
    <div class="plan-card-header">
      <span class="plan-card-icon" aria-hidden="true">🗂</span>
      <div>
        <p class="plan-card-title">Rencana Riset</p>
        <p class="plan-card-subtitle">${subtopics.length} sub-topik akan dianalisis secara mendalam</p>
      </div>
    </div>
    <div class="plan-card-body">
      <ul class="subtopic-list" id="subtopicList">
        ${subtopics.map((st, i) => `
          <li class="subtopic-item" id="st-${i}">
            <span class="subtopic-num">${i + 1}</span>
            <span class="subtopic-text">${st.title}</span>
            <span class="subtopic-badge is-pending" id="ss-${i}">Menunggu</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `;

  return card;
}

/**
 * Update a subtopic item's state.
 * @param {number} index
 * @param {'is-active'|'is-done'} state
 */
export function setSubtopicState(index, state) {
  const item  = document.getElementById(`st-${index}`);
  const badge = document.getElementById(`ss-${index}`);
  if (!item || !badge) return;

  item.className = `subtopic-item ${state}`;

  if (state === 'is-active') {
    badge.className = 'subtopic-badge is-analyzing';
    badge.textContent = 'Menganalisis…';
  } else if (state === 'is-done') {
    badge.className = 'subtopic-badge is-done';
    badge.textContent = '✓ Selesai';
  }
}


// ─── Result section ─────────────────────────────────────────────────────────

/**
 * Build and return a collapsible result section.
 * @param {number} num     - 1-based index
 * @param {string} title
 * @param {string} html    - Already-parsed HTML content
 * @returns {HTMLElement}
 */
export function buildResultSection(num, title, html) {
  const section = document.createElement('div');
  section.className = 'result-section';

  const header = document.createElement('div');
  header.className = 'result-header';
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', 'true');
  header.innerHTML = `
    <div class="result-num" aria-hidden="true">${num}</div>
    <h3 class="result-title">${title}</h3>
    <span class="result-toggle is-open" aria-hidden="true">▾</span>
  `;

  const body = document.createElement('div');
  body.className = 'result-body';
  body.innerHTML = html;

  header.addEventListener('click', () => {
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    header.querySelector('.result-toggle').classList.toggle('is-open', !isOpen);
    header.setAttribute('aria-expanded', String(!isOpen));
  });

  section.append(header, body);
  return section;
}


// ─── Final report ───────────────────────────────────────────────────────────

/**
 * Build and return the final report DOM element.
 * @param {string}  html        - Parsed report HTML
 * @param {string}  depth       - 'singkat' | 'standar' | 'mendalam'
 * @param {string}  topic       - Original topic string
 * @param {number}  wordCount
 * @returns {HTMLElement}
 */
export function buildFinalReport(html, depth, topic, wordCount) {
  const readTime = Math.max(1, Math.round(wordCount / 200));
  const date = new Date().toLocaleDateString('id-ID', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const container = document.createElement('div');
  container.className = 'final-report';

  container.innerHTML = `
    <div class="final-report-header">
      <h2>📄 Laporan Riset Final</h2>
      <div class="final-report-meta">
        <span>📅 ${date}</span>
        <span>📖 ~${readTime} mnt baca</span>
        <span>📝 ~${wordCount.toLocaleString('id-ID')} kata</span>
        <span>🔬 Mode: ${depth}</span>
      </div>
    </div>
    <div class="report-body" id="reportBody">${html}</div>
    <div class="final-report-footer">
      <p class="report-footer-credit">Dibuat oleh ResearchMind Agent · Powered by Gemini AI</p>
      <div class="report-footer-actions">
        <button class="btn-secondary" id="copyReportBtn">📋 Salin</button>
        <button class="btn-secondary" id="printReportBtn">🖨 Cetak</button>
      </div>
    </div>
  `;

  container.querySelector('#copyReportBtn').addEventListener('click', () => {
    const body = container.querySelector('#reportBody');
    navigator.clipboard.writeText(body.innerText)
      .then(() => showToast('✅ Laporan disalin ke clipboard!', 'success'))
      .catch(() => showToast('❌ Gagal menyalin teks', 'error'));
  });

  container.querySelector('#printReportBtn').addEventListener('click', () => {
    window.print();
  });

  return container;
}


// ─── Markdown parser ─────────────────────────────────────────────────────────

/**
 * Convert a limited subset of Markdown to sanitised HTML.
 * Supports: headings h1–h3, bold, italic, blockquote, unordered & ordered lists, paragraphs.
 * @param {string} md
 * @returns {string}
 */
export function markdownToHtml(md) {
  if (!md) return '';

  const lines  = md.split('\n');
  const output = [];
  let inUl = false;
  let inOl = false;

  const closeList = () => {
    if (inUl) { output.push('</ul>'); inUl = false; }
    if (inOl) { output.push('</ol>'); inOl = false; }
  };

  const inline = (text) =>
    text
      .replace(/\*\*(.+?)\*\*/g,  '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,      '<em>$1</em>')
      .replace(/`(.+?)`/g,        '<code>$1</code>');

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (/^### /.test(line)) {
      closeList();
      output.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (/^## /.test(line)) {
      closeList();
      output.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (/^# /.test(line)) {
      closeList();
      output.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (/^> /.test(line)) {
      closeList();
      output.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
    } else if (/^[\-\*] /.test(line)) {
      if (!inUl) { output.push('<ul>'); inUl = true; }
      output.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (/^\d+\. /.test(line)) {
      if (!inOl) { output.push('<ol>'); inOl = true; }
      output.push(`<li>${inline(line.replace(/^\d+\. /, ''))}</li>`);
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      output.push(`<p>${inline(line)}</p>`);
    }
  }

  closeList();
  return output.join('\n');
}
