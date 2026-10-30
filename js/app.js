/* =============================================
   EXPENSE & BUDGET VISUALIZER — app.js
   Vanilla JS · LocalStorage · No frameworks
   ============================================= */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  transactions: 'ebv_transactions',
  categories:   'ebv_categories',
  theme:        'ebv_theme',
  limits:       'ebv_limits',
};

const DEFAULT_CATEGORIES = [
  { id: 'food',          name: 'Food',       emoji: '🍔', isDefault: true },
  { id: 'transport',     name: 'Transport',  emoji: '🚌', isDefault: true },
  { id: 'shopping',      name: 'Shopping',   emoji: '🛍️', isDefault: true },
  { id: 'health',        name: 'Health',     emoji: '💊', isDefault: true },
  { id: 'entertainment', name: 'Fun',        emoji: '🎮', isDefault: true },
  { id: 'bills',         name: 'Bills',      emoji: '📄', isDefault: true },
  { id: 'savings',       name: 'Savings',    emoji: '💰', isDefault: true },
  { id: 'other',         name: 'Other',      emoji: '📌', isDefault: true },
];

const EMOJI_PICKER_OPTIONS = [
  '🏠','🚗','✈️','📱','🎵','🎬','🏋️','🐾',
  '🌿','☕','🍕','🎁','📚','💻','🏥','💡',
];

const CHART_COLORS = [
  '#6c63ff','#f093fb','#4facfe','#43e97b','#fa709a',
  '#fee140','#30cfd0','#a18cd1','#fda085','#84fab0',
];

// ─── State ───────────────────────────────────────────────────────────────────

let state = {
  transactions: [],
  categories:   [],
  limits:       {},       // { categoryId: amount }
  activeTab:    'dashboard',
  filterType:   'all',    // all | income | expense
  filterCat:    'all',
  sortBy:       'date',   // date | amount-asc | amount-desc | category
  monthOffset:  0,        // 0 = current month, -1 = prev, etc.
  selectedType: 'expense',
  selectedCat:  null,
  selectedEmoji:'🎯',
  theme:        'light',
};

// ─── Storage helpers ─────────────────────────────────────────────────────────

const save = (key, data) => {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { /* quota */ }
};

const load = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};

// ─── Init ────────────────────────────────────────────────────────────────────

function init() {
  state.transactions = load(STORAGE_KEYS.transactions, []);
  state.limits       = load(STORAGE_KEYS.limits, {});
  state.theme        = load(STORAGE_KEYS.theme, 'light');

  // Merge saved custom categories with defaults (keep defaults always)
  const savedCats = load(STORAGE_KEYS.categories, []);
  const customCats = savedCats.filter(c => !c.isDefault);
  state.categories = [...DEFAULT_CATEGORIES, ...customCats];

  applyTheme(state.theme);
  renderAll();
  attachEventListeners();
}

// ─── Theme ───────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  state.theme = theme;
  save(STORAGE_KEYS.theme, theme);
}

function toggleTheme() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

// ─── Derived data helpers ─────────────────────────────────────────────────────

function getTotals() {
  const income  = state.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = state.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expense, balance: income - expense };
}

function getMonthTransactions(offset = 0) {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + offset;
  // normalise across year boundaries
  const target = new Date(year, month, 1);
  return state.transactions.filter(t => {
    const d = new Date(t.date);
    return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth();
  });
}

function getCategoryTotals(txList) {
  const map = {};
  txList.filter(t => t.type === 'expense').forEach(t => {
    map[t.category] = (map[t.category] || 0) + t.amount;
  });
  return map;
}

function formatCurrency(amount) {
  return '$' + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getMonthLabel(offset = 0) {
  const now   = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getCategoryById(id) {
  return state.categories.find(c => c.id === id) || { name: id, emoji: '📌' };
}

function isOverLimit(categoryId, amount) {
  const lim = state.limits[categoryId];
  if (!lim || lim <= 0) return false;
  // sum of all expenses for this category
  const total = state.transactions
    .filter(t => t.type === 'expense' && t.category === categoryId)
    .reduce((s, t) => s + t.amount, 0);
  return total > lim;
}

// ─── Render: Balance Card ─────────────────────────────────────────────────────

function renderBalance() {
  const { income, expense, balance } = getTotals();
  document.getElementById('balance').textContent     = formatCurrency(balance);
  document.getElementById('totalIncome').textContent  = formatCurrency(income);
  document.getElementById('totalExpense').textContent = formatCurrency(expense);
}

// ─── Render: Spending Limit Banner ────────────────────────────────────────────

function renderLimitBanner() {
  const banner   = document.getElementById('limitBanner');
  const exceeded = [];

  for (const [catId, limit] of Object.entries(state.limits)) {
    if (!limit || limit <= 0) continue;
    const total = state.transactions
      .filter(t => t.type === 'expense' && t.category === catId)
      .reduce((s, t) => s + t.amount, 0);
    if (total > limit) {
      const cat = getCategoryById(catId);
      exceeded.push(`${cat.emoji} ${cat.name} (${formatCurrency(total)} / ${formatCurrency(limit)})`);
    }
  }

  if (exceeded.length > 0) {
    banner.innerHTML = `⚠️ Over budget: ${exceeded.join(' · ')}`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// ─── Render: Chart ────────────────────────────────────────────────────────────

function renderChart() {
  const canvas    = document.getElementById('donutChart');
  const legendEl  = document.getElementById('chartLegend');
  const emptyEl   = document.getElementById('chartEmpty');
  const centerAmt = document.getElementById('donutCenterAmount');

  const monthTxs  = getMonthTransactions(0);
  const catTotals = getCategoryTotals(monthTxs);
  const entries   = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const total     = entries.reduce((s, [, v]) => s + v, 0);

  if (total === 0) {
    canvas.parentElement.style.display = 'none';
    emptyEl.style.display = 'flex';
    legendEl.innerHTML = '';
    return;
  }

  canvas.parentElement.style.display = 'block';
  emptyEl.style.display = 'none';
  centerAmt.textContent = formatCurrency(total);

  const ctx  = canvas.getContext('2d');
  const size = 140;
  canvas.width  = size;
  canvas.height = size;

  const cx = size / 2;
  const cy = size / 2;
  const outerR = 60;
  const innerR = 38;

  ctx.clearRect(0, 0, size, size);

  let startAngle = -Math.PI / 2;

  entries.forEach(([catId, amount], i) => {
    const slice = (amount / total) * 2 * Math.PI;
    const color = CHART_COLORS[i % CHART_COLORS.length];

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outerR, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    startAngle += slice;
  });

  // inner cut-out (donut hole)
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#fff';
  ctx.fill();

  // Legend
  legendEl.innerHTML = '';
  entries.slice(0, 5).forEach(([catId, amount], i) => {
    const cat   = getCategoryById(catId);
    const pct   = Math.round((amount / total) * 100);
    const color = CHART_COLORS[i % CHART_COLORS.length];

    const li = document.createElement('div');
    li.className = 'legend-item';
    li.innerHTML = `
      <span class="legend-dot" style="background:${color}"></span>
      <span class="legend-name">${cat.emoji} ${cat.name}</span>
      <span class="legend-pct">${pct}%</span>
    `;
    legendEl.appendChild(li);
  });
}

// ─── Render: Category chips (add form) ────────────────────────────────────────

function renderCategoryChips() {
  const grid = document.getElementById('categoryGrid');
  grid.innerHTML = '';

  state.categories.forEach(cat => {
    const chip = document.createElement('button');
    chip.type      = 'button';
    chip.className = 'cat-chip' + (state.selectedCat === cat.id ? ' selected' : '');
    chip.dataset.id = cat.id;
    chip.innerHTML = `<span class="cat-emoji">${cat.emoji}</span><span>${cat.name}</span>`;
    chip.addEventListener('click', () => {
      state.selectedCat = cat.id;
      renderCategoryChips();
    });
    grid.appendChild(chip);
  });
}

// ─── Render: Transaction List ─────────────────────────────────────────────────

function getFilteredSorted() {
  let list = [...state.transactions];

  // Filter by type
  if (state.filterType !== 'all') list = list.filter(t => t.type === state.filterType);

  // Filter by category
  if (state.filterCat !== 'all') list = list.filter(t => t.category === state.filterCat);

  // Sort
  switch (state.sortBy) {
    case 'date':         list.sort((a, b) => new Date(b.date) - new Date(a.date)); break;
    case 'amount-desc':  list.sort((a, b) => b.amount - a.amount); break;
    case 'amount-asc':   list.sort((a, b) => a.amount - b.amount); break;
    case 'category':     list.sort((a, b) => a.category.localeCompare(b.category)); break;
  }

  return list;
}

function renderTransactions() {
  const list = document.getElementById('transactionList');
  const data = getFilteredSorted();

  if (data.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🧾</div>
        <div>No transactions yet</div>
      </div>`;
    return;
  }

  list.innerHTML = '';
  data.forEach(tx => {
    const cat      = getCategoryById(tx.category);
    const overLim  = tx.type === 'expense' && isOverLimit(tx.category, tx.amount);

    const li = document.createElement('li');
    li.className = 'transaction-item' + (overLim ? ' over-limit' : '');
    li.dataset.id = tx.id;

    li.innerHTML = `
      <div class="tx-icon">${cat.emoji}</div>
      <div class="tx-details">
        <div class="tx-title">${escapeHtml(tx.description)}</div>
        <div class="tx-meta">${cat.name} · ${formatDate(tx.date)}</div>
      </div>
      <div class="tx-right">
        <span class="tx-amount ${tx.type}">
          ${tx.type === 'expense' ? '-' : '+'}${formatCurrency(tx.amount)}
        </span>
        <button class="btn btn-danger" onclick="deleteTransaction('${tx.id}')" aria-label="Delete">✕</button>
      </div>`;

    list.appendChild(li);
  });
}

// ─── Render: Filter chips ─────────────────────────────────────────────────────

function renderFilterBar() {
  const bar = document.getElementById('filterBar');

  const chips = [
    { value: 'all',     label: 'All' },
    { value: 'income',  label: '+ Income' },
    { value: 'expense', label: '- Expense' },
    ...state.categories.map(c => ({ value: c.id, label: `${c.emoji} ${c.name}`, isCat: true })),
  ];

  bar.innerHTML = '';
  chips.forEach(chip => {
    const btn = document.createElement('button');
    btn.className = 'filter-chip' + (
      (!chip.isCat && state.filterType === chip.value) ||
      (chip.isCat && state.filterCat === chip.value)
        ? ' active' : ''
    );
    btn.textContent = chip.label;
    btn.addEventListener('click', () => {
      if (chip.isCat) {
        state.filterCat  = chip.value;
        state.filterType = 'all';
      } else {
        state.filterType = chip.value;
        state.filterCat  = 'all';
      }
      renderFilterBar();
      renderTransactions();
    });
    bar.appendChild(btn);
  });
}

// ─── Render: Monthly Summary ──────────────────────────────────────────────────

function renderMonthlySummary() {
  const txs     = getMonthTransactions(state.monthOffset);
  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net     = income - expense;

  document.getElementById('monthLabel').textContent    = getMonthLabel(state.monthOffset);
  document.getElementById('monthIncome').textContent   = formatCurrency(income);
  document.getElementById('monthExpense').textContent  = formatCurrency(expense);

  const netEl = document.getElementById('monthNet');
  netEl.textContent = (net >= 0 ? '+' : '') + formatCurrency(net);
  netEl.className   = 'msi-value net ' + (net >= 0 ? 'positive' : 'negative');

  const catTotals = getCategoryTotals(txs);
  const catList   = document.getElementById('monthlyCatList');

  const entries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    catList.innerHTML = '<li class="empty-state" style="padding:16px 0"><div class="empty-icon">📊</div><div>No expenses this month</div></li>';
    return;
  }

  const maxVal = entries[0][1];
  catList.innerHTML = '';

  entries.forEach(([catId, amount]) => {
    const cat      = getCategoryById(catId);
    const limit    = state.limits[catId] || 0;
    const pct      = Math.round((amount / maxVal) * 100);
    const over     = limit > 0 && amount > limit;
    const colorIdx = state.categories.findIndex(c => c.id === catId);
    const color    = CHART_COLORS[colorIdx % CHART_COLORS.length] || CHART_COLORS[0];

    const li = document.createElement('li');
    li.className = 'monthly-cat-item';
    li.innerHTML = `
      <div class="monthly-cat-row">
        <span class="monthly-cat-name">
          <span>${cat.emoji}</span>
          <span>${cat.name}</span>
          ${over ? '<span style="color:var(--warning);font-size:.7rem">⚠️ Over</span>' : ''}
        </span>
        <span class="monthly-cat-amount ${over ? 'over' : ''}">${formatCurrency(amount)}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      ${limit > 0 ? `<div style="font-size:.68rem;color:var(--text-muted);text-align:right">Limit: ${formatCurrency(limit)}</div>` : ''}
    `;
    catList.appendChild(li);
  });
}

// ─── Render: Category Manager ─────────────────────────────────────────────────

function renderCategoryManager() {
  const list = document.getElementById('catManagerList');
  list.innerHTML = '';

  state.categories.forEach(cat => {
    const li = document.createElement('li');
    li.className = 'cat-list-item';

    const limitVal = state.limits[cat.id] || '';

    li.innerHTML = `
      <span class="cat-emoji-display">${cat.emoji}</span>
      <span class="cat-name">${escapeHtml(cat.name)}</span>
      <span class="cat-tag ${cat.isDefault ? 'default' : 'custom'}">${cat.isDefault ? 'Default' : 'Custom'}</span>
      <input
        class="cat-limit-input form-control"
        type="number"
        min="0"
        placeholder="Limit $"
        value="${limitVal}"
        data-cat="${cat.id}"
        aria-label="Spending limit for ${cat.name}"
      >
      ${!cat.isDefault ? `<button class="btn btn-danger" onclick="deleteCategory('${cat.id}')" aria-label="Remove ${cat.name}">✕</button>` : ''}
    `;
    list.appendChild(li);
  });

  // Attach limit-change listeners
  list.querySelectorAll('.cat-limit-input').forEach(input => {
    input.addEventListener('change', () => {
      const catId = input.dataset.cat;
      const val   = parseFloat(input.value);
      if (!isNaN(val) && val >= 0) {
        state.limits[catId] = val;
      } else {
        delete state.limits[catId];
      }
      save(STORAGE_KEYS.limits, state.limits);
      renderLimitBanner();
      renderMonthlySummary();
    });
  });
}

// ─── Render: Emoji Picker (add category form) ─────────────────────────────────

function renderEmojiPicker() {
  const wrap = document.getElementById('emojiPickerRow');
  wrap.innerHTML = '';

  EMOJI_PICKER_OPTIONS.forEach(em => {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'emoji-opt' + (state.selectedEmoji === em ? ' selected' : '');
    btn.textContent = em;
    btn.addEventListener('click', () => {
      state.selectedEmoji = em;
      renderEmojiPicker();
    });
    wrap.appendChild(btn);
  });
}

// ─── Render All ───────────────────────────────────────────────────────────────

function renderAll() {
  renderBalance();
  renderLimitBanner();
  renderChart();
  renderCategoryChips();
  renderFilterBar();
  renderTransactions();
  renderMonthlySummary();
  renderCategoryManager();
  renderEmojiPicker();
}

// ─── Actions: Transactions ────────────────────────────────────────────────────

function addTransaction(e) {
  e.preventDefault();

  const description = document.getElementById('txDesc').value.trim();
  const amount      = parseFloat(document.getElementById('txAmount').value);
  const date        = document.getElementById('txDate').value;
  const type        = state.selectedType;
  const category    = state.selectedCat;

  if (!description) { showToast('Please enter a description.'); return; }
  if (isNaN(amount) || amount <= 0) { showToast('Please enter a valid amount.'); return; }
  if (!date) { showToast('Please select a date.'); return; }
  if (!category) { showToast('Please select a category.'); return; }

  const tx = {
    id:          crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
    description,
    amount,
    date,
    type,
    category,
    createdAt: new Date().toISOString(),
  };

  state.transactions.unshift(tx);
  save(STORAGE_KEYS.transactions, state.transactions);

  // Reset form
  document.getElementById('txDesc').value   = '';
  document.getElementById('txAmount').value = '';
  document.getElementById('txDate').value   = new Date().toISOString().split('T')[0];
  state.selectedCat = null;
  renderCategoryChips();

  renderBalance();
  renderLimitBanner();
  renderChart();
  renderFilterBar();
  renderTransactions();
  renderMonthlySummary();

  showToast(type === 'expense' ? '💸 Expense added!' : '💵 Income added!');
}

// exposed globally for inline onclick
window.deleteTransaction = function(id) {
  if (!confirm('Delete this transaction?')) return;
  state.transactions = state.transactions.filter(t => t.id !== id);
  save(STORAGE_KEYS.transactions, state.transactions);
  renderBalance();
  renderLimitBanner();
  renderChart();
  renderFilterBar();
  renderTransactions();
  renderMonthlySummary();
  showToast('Transaction deleted.');
};

// ─── Actions: Categories ──────────────────────────────────────────────────────

function addCategory(e) {
  e.preventDefault();

  const nameInput = document.getElementById('newCatName');
  const name      = nameInput.value.trim();
  if (!name) { showToast('Enter a category name.'); return; }

  const id = 'cat_' + name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();

  if (state.categories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    showToast('Category already exists.'); return;
  }

  const newCat = { id, name, emoji: state.selectedEmoji, isDefault: false };
  state.categories.push(newCat);

  // Save only custom ones
  saveCategoriesCustom();

  nameInput.value = '';
  state.selectedEmoji = '🎯';

  renderAll();
  showToast(`✅ Category "${name}" added!`);
}

window.deleteCategory = function(id) {
  if (!confirm('Delete this category? Transactions using it will show the category ID.')) return;
  state.categories = state.categories.filter(c => c.id !== id);
  saveCategoriesCustom();
  renderAll();
  showToast('Category removed.');
};

function saveCategoriesCustom() {
  save(STORAGE_KEYS.categories, state.categories.filter(c => !c.isDefault));
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────

function switchTab(tabId) {
  state.activeTab = tabId;

  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'tab-' + tabId);
  });

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });

  // Redraw chart when switching to it (canvas may have been hidden)
  if (tabId === 'dashboard') renderChart();
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

function attachEventListeners() {
  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Type toggle (expense / income)
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedType = btn.dataset.type;
      document.querySelectorAll('.type-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === state.selectedType);
        if (b.dataset.type === state.selectedType) {
          b.classList.add(state.selectedType);
        } else {
          b.classList.remove('expense', 'income');
        }
      });
    });
  });

  // Add transaction form
  document.getElementById('addTxForm').addEventListener('submit', addTransaction);

  // Sort select
  document.getElementById('sortSelect').addEventListener('change', e => {
    state.sortBy = e.target.value;
    renderTransactions();
  });

  // Month navigation
  document.getElementById('prevMonth').addEventListener('click', () => {
    state.monthOffset--;
    renderMonthlySummary();
  });

  document.getElementById('nextMonth').addEventListener('click', () => {
    if (state.monthOffset < 0) {
      state.monthOffset++;
      renderMonthlySummary();
    }
  });

  // Add category form
  document.getElementById('addCatForm').addEventListener('submit', addCategory);
}

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
