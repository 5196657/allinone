// ========== State ==========
const ADMIN_USERNAME = 'jwad';
let currentUser = null;
let trades = [];
let currentDirection = 'long';
let currentResult = null;
let imageSlots = [null, null, null];
let propImageSlots = [null, null, null];
let weekOffset = 0;
let propWeekOffset = 0;
let suggestedLotValue = null;
let voiceData = null;
let mediaRecorder = null;
let voiceChunks = [];
let appMode = 'journal'; // journal | prop
let propDirection = 'long';
let propResult = null;

// ========== Users / Storage ==========
function getUsers() {
  return JSON.parse(localStorage.getItem('tj_users') || '{}');
}
function saveUsers(users) {
  localStorage.setItem('tj_users', JSON.stringify(users));
}
function ensureAdminExists() {
  const users = getUsers();
  // همیشه ادمین JWAD با رمز مشخص
  users[ADMIN_USERNAME] = {
    password: 'javad1384',
    role: 'admin',
    createdAt: users[ADMIN_USERNAME]?.createdAt || new Date().toISOString()
  };
  // پشتیبانی از حروف بزرگ JWAD
  users['jwad'] = users[ADMIN_USERNAME];
  saveUsers(users);
}
function getPropPhase() {
  try {
    const cfg = getPropConfig();
    if (!cfg || !cfg.phase) return '1';
    const p = String(cfg.phase);
    if (p === '2' || p === 'funded') return p;
    return '1';
  } catch (e) { return '1'; }
}
function tradesKey(username, mode) {
  const m = mode || appMode;
  if (m === 'prop') {
    const ph = getPropPhase();
    // هر مرحله فایل معاملات جدا
    return 'tj_trades_prop_' + username + '_p' + ph;
  }
  return 'tj_trades_' + username;
}
function loadTradesForUser(username) {
  trades = JSON.parse(localStorage.getItem(tradesKey(username, appMode)) || '[]');
}
function saveTrades() {
  if (!currentUser) return;
  try {
    localStorage.setItem(tradesKey(currentUser.username, appMode), JSON.stringify(trades));
  } catch (e) {
    const light = trades.map((t, i) => (i < 15 ? t : { ...t, image: null }));
    localStorage.setItem(tradesKey(currentUser.username, appMode), JSON.stringify(light));
    showToast(langText('storage_full'), 'error');
  }
}
function loadPropPhaseTrades(username, phase) {
  const key = 'tj_trades_prop_' + username + '_p' + phase;
  return JSON.parse(localStorage.getItem(key) || '[]');
}
function getMessages() {
  return JSON.parse(localStorage.getItem('tj_messages') || '[]');
}
function saveMessages(msgs) {
  localStorage.setItem('tj_messages', JSON.stringify(msgs));
}

// ========== Splash + Auth ==========
window.addEventListener('DOMContentLoaded', () => {
  try { ensureAdminExists(); } catch (e) { console.error(e); }
  const splash = document.getElementById('splash');
  const dateEl = document.getElementById('trade-date');
  if (dateEl) try { dateEl.valueAsDate = new Date(); } catch (e) {}

  // ورود مستقیم بدون لاگین
  currentUser = { username: 'trader', role: 'user' };
  try {
    const saved = localStorage.getItem('tj_currentUser');
    if (saved) {
      const u = JSON.parse(saved);
      if (u && u.username) currentUser = u;
    }
  } catch (e) {}
  localStorage.setItem('tj_currentUser', JSON.stringify(currentUser));

  // Splash animation stays visible; user clicks Enter or auto after 3.2s
  function finishSplash() {
    try {
      if (splash) {
        splash.classList.add('hide');
        setTimeout(() => {
          try { splash.style.display = 'none'; } catch (e) {}
        }, 600);
      }
      const login = document.getElementById('login-screen');
      if (login) {
        login.classList.add('hidden');
        login.style.display = 'none';
      }
      showModeScreen();
    } catch (e) {
      console.error(e);
      if (splash) splash.style.display = 'none';
      showModeScreen();
    }
  }
  // Do not auto-skip immediately — let animation play
  window.__finishSplash = finishSplash;
  setTimeout(() => {
    if (splash && !splash.classList.contains('hide') && splash.style.display !== 'none') {
      finishSplash();
    }
  }, 3200);
});

function enterApp() {
  const loginScreen = document.getElementById('login-screen');
  if (loginScreen) {
    loginScreen.classList.add('hidden');
    loginScreen.style.display = 'none';
  }
  document.body.classList.add('logged-in');
  showModeScreen();
}

function showModeScreen() {
  const app = document.getElementById('app');
  if (app) app.classList.add('hidden');
  const ms = document.getElementById('mode-screen');
  if (ms) {
    ms.classList.remove('hidden');
    ms.style.display = '';
  }
  try { applyLanguage(currentLang || 'en'); } catch(e) {}
  try { showMotivational(); } catch(e) {}
}

function openApp(mode) {
  if (mode === 'prop') appMode = 'prop';
  else if (mode === 'games') appMode = 'games';
  else appMode = 'journal';
  const ms = document.getElementById('mode-screen');
  if (ms) {
    ms.classList.add('hidden');
    ms.style.display = 'none';
  }
  const app = document.getElementById('app');
  app.classList.remove('hidden');
  app.classList.remove('mode-journal', 'mode-prop', 'mode-games', 'mode-chat', 'mode-telegram', 'mode-planner', 'mode-finance');
  const modeClass = { prop: 'mode-prop', games: 'mode-games' }[appMode] || 'mode-journal';
  app.classList.add(modeClass);
  document.querySelectorAll('.ws-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.ws === appMode);
  });

  if (currentUser) loadTradesForUser(currentUser.username);

  const badge = document.getElementById('current-user-badge');
  if (badge && currentUser) {
    badge.textContent = currentUser.username || 'trader';
    badge.className = 'user-badge';
  }

  const sb = localStorage.getItem('accountBalance_' + (currentUser?.username || ''));
  const sr = localStorage.getItem('riskPercent_' + (currentUser?.username || ''));
  if (sb && document.getElementById('balance')) document.getElementById('balance').value = sb;
  if (sr && document.getElementById('risk-percent')) document.getElementById('risk-percent').value = sr;

  try {
    if (currentUser) {
      const users = getUsers();
      if (users[currentUser.username]) {
        users[currentUser.username].lastLogin = new Date().toISOString();
        saveUsers(users);
      }
      const online = JSON.parse(localStorage.getItem('tj_online') || '{}');
      online[currentUser.username] = Date.now();
      localStorage.setItem('tj_online', JSON.stringify(online));
    }
  } catch(e) {}

  // switch to default tab for mode
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  if (appMode === 'prop') {
    document.getElementById('tab-prop')?.classList.add('active');
    renderProp();
    renderPropHistory();
    renderPropArchive();
  } else if (appMode === 'games') {
    document.getElementById('tab-games')?.classList.add('active');
    if (typeof showGamesMenu === 'function') showGamesMenu();
  } else {
    document.querySelector('[data-tab="new"]')?.classList.add('active');
    document.getElementById('tab-new')?.classList.add('active');
  }

  updateTraderMood();
  updatePropMedal();
  if (appMode !== 'games') {
    renderAll();
    if (typeof calcRisk === 'function') calcRisk();
  }
  if (mode === 'prop') renderProp();
}

document.getElementById('btn-mode-journal')?.addEventListener('click', () => openApp('journal'));
document.getElementById('btn-mode-prop')?.addEventListener('click', () => openApp('prop'));
document.getElementById('btn-mode-games')?.addEventListener('click', () => openApp('games'));
/* switch mode removed */
/* mode back logout removed */


// Symbol presets
document.querySelectorAll('.sym-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.getElementById('symbol').value = chip.dataset.sym;
    document.querySelectorAll('.sym-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

// ========== Tabs (event delegation) ==========
document.querySelector('.tabs')?.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  if (tab.style.display === 'none' || window.getComputedStyle(tab).display === 'none') return;
  const name = tab.dataset.tab;
  if (!name) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  const panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.add('active');
  if (name === 'summary') { renderSummary(); drawEquityCurve(); }
  if (name === 'history') renderHistory();
  if (name === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
  if (name === 'analytics' && typeof renderAnalytics === 'function') renderAnalytics();
  if (name === 'prop') {
    appMode = 'prop';
    if (currentUser) loadTradesForUser(currentUser.username);
    renderProp(); renderPropHistory(); renderPropArchive();
  }
  if (name === 'new' || name === 'summary' || name === 'history' || name === 'dashboard' || name === 'analytics') {
    if (appMode === 'prop') {
      appMode = 'journal';
      if (currentUser) loadTradesForUser(currentUser.username);
      if (name === 'summary') { renderSummary(); drawEquityCurve(); }
      if (name === 'history') renderHistory();
      if (name === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
      if (name === 'analytics' && typeof renderAnalytics === 'function') renderAnalytics();
    }
  }
  if (name === 'chart') loadTradingViewChart();
  if (name === 'new' && typeof updateDisciplineUI === 'function') updateDisciplineUI();
});

// ========== Direction / Result ==========
document.querySelectorAll('.dir-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDirection = btn.dataset.dir;
  });
});

function estimateDollarMove(entry, exitPrice, lot, symbol) {
  if (isNaN(entry) || isNaN(exitPrice)) return null;
  const dist = Math.abs(exitPrice - entry);
  const useLot = (!isNaN(lot) && lot > 0) ? lot : 0.01;
  const sym = String(symbol || '').toUpperCase();
  let dollarPerLot;
  // طلا / نقره
  if (/XAU|GOLD/.test(sym)) dollarPerLot = dist * 100;
  else if (/XAG|SILVER/.test(sym)) dollarPerLot = dist * 5000;
  // شاخص‌ها
  else if (/NAS|US100|NDX|NASDAQ/.test(sym)) dollarPerLot = dist * 1;
  else if (/US30|DJ|DOW/.test(sym)) dollarPerLot = dist * 1;
  else if (/US500|SPX|SP500/.test(sym)) dollarPerLot = dist * 1;
  // کریپتو (تقریبی روی بسیاری از بروکرها)
  else if (/BTC/.test(sym)) dollarPerLot = dist * 1;
  else if (/ETH/.test(sym)) dollarPerLot = dist * 1;
  // JPY pairs
  else if (/JPY/.test(sym) && entry > 50) dollarPerLot = (dist / 0.01) * 9.5;
  // فارکس استاندارد
  else if (entry < 500) dollarPerLot = (dist / 0.0001) * 10;
  else if (entry < 10000) dollarPerLot = dist * 100;
  else dollarPerLot = dist * 1;
  return useLot * dollarPerLot;
}

function autoFillPnl() {
  const entry = parseFloat(document.getElementById('entry').value);
  const sl = parseFloat(document.getElementById('sl').value);
  const tp = parseFloat(document.getElementById('tp').value);
  const lot = parseFloat(document.getElementById('lot').value);
  const pnlInput = document.getElementById('pnl');
  const rfGroup = document.getElementById('rf-amount-group');
  const hint = document.getElementById('net-pnl-hint');
  const commission = parseFloat(document.getElementById('commission').value) || 0;

  if (rfGroup) rfGroup.style.display = currentResult === 'rf' ? 'block' : 'none';

  if (currentResult === 'manual') {
    if (hint) hint.textContent = 'حالت دستی: مقدار سود/ضرر را خودتان وارد کنید. خالص = ناخالص − کمیسیون';
    return;
  }
  if (currentResult === 'be') {
    pnlInput.value = 0;
    if (hint) hint.textContent = 'سر به سر: سود ناخالص ۰ — خالص = −کمیسیون';
    return;
  }
  if (currentResult === 'rf') {
    const rf = parseFloat(document.getElementById('rf-amount').value);
    if (!isNaN(rf)) pnlInput.value = Math.abs(rf);
    if (hint) hint.textContent = 'ریسک‌فری: سود را وارد کنید. خالص = سود RF − کمیسیون';
    return;
  }
  if (currentResult === 'sl' && !isNaN(entry) && !isNaN(sl)) {
    const est = estimateDollarMove(entry, sl, lot);
    if (est != null) pnlInput.value = (-Math.abs(est)).toFixed(2);
    if (hint) hint.textContent = 'استاپ: ضرر تقریبی از فاصله SL محاسبه شد (قابل ویرایش)';
  } else if (currentResult === 'tp' && !isNaN(entry) && !isNaN(tp)) {
    const est = estimateDollarMove(entry, tp, lot);
    if (est != null) pnlInput.value = Math.abs(est).toFixed(2);
    if (hint) hint.textContent = 'تی‌پی: سود تقریبی از فاصله TP محاسبه شد (قابل ویرایش)';
  }
  updateNetHint();
}

function updateNetHint() {
  const pnl = parseFloat(document.getElementById('pnl').value) || 0;
  const commission = parseFloat(document.getElementById('commission').value) || 0;
  const net = pnl - Math.abs(commission);
  const hint = document.getElementById('net-pnl-hint');
  if (hint) {
    hint.textContent = 'سود خالص ≈ ' + (net >= 0 ? '+' : '') + net.toFixed(2) + ' $ (ناخالص ' + pnl + ' − کمیسیون ' + Math.abs(commission) + ')';
  }
}

document.querySelectorAll('.res-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.res-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentResult = btn.dataset.res;
    autoFillPnl();
  });
});

['entry', 'sl', 'tp', 'lot', 'commission', 'rf-amount'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => {
    if (currentResult && currentResult !== 'manual') autoFillPnl();
    else updateNetHint();
  });
});
document.getElementById('pnl')?.addEventListener('input', updateNetHint);

// ========== Multi image slots (journal + prop) ==========
function bindImageSlots(containerId, storeArr) {
  const root = document.getElementById(containerId);
  if (!root) return;
  root.querySelectorAll('.image-slot').forEach(slot => {
    const i = parseInt(slot.dataset.slot, 10);
    const fileInput = slot.querySelector('.slot-file');
    const preview = slot.querySelector('.slot-preview');
    const ph = slot.querySelector('.slot-placeholder');
    const rm = slot.querySelector('.slot-remove');
    slot.addEventListener('click', (e) => {
      if (e.target.closest('.slot-remove')) return;
      fileInput?.click();
    });
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) { showToast('هر عکس حداکثر ۳ مگابایت', 'error'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        storeArr[i] = reader.result;
        if (preview) { preview.src = storeArr[i]; preview.classList.remove('hidden'); }
        ph?.classList.add('hidden');
        rm?.classList.remove('hidden');
        slot.classList.add('has-img');
      };
      reader.readAsDataURL(file);
    });
    rm?.addEventListener('click', (e) => {
      e.stopPropagation();
      storeArr[i] = null;
      if (preview) { preview.src = ''; preview.classList.add('hidden'); }
      ph?.classList.remove('hidden');
      rm.classList.add('hidden');
      slot.classList.remove('has-img');
      if (fileInput) fileInput.value = '';
    });
  });
}
function clearImageSlots(containerId, storeArr) {
  for (let i = 0; i < storeArr.length; i++) storeArr[i] = null;
  const root = document.getElementById(containerId);
  if (!root) return;
  root.querySelectorAll('.image-slot').forEach(slot => {
    const preview = slot.querySelector('.slot-preview');
    const ph = slot.querySelector('.slot-placeholder');
    const rm = slot.querySelector('.slot-remove');
    const fileInput = slot.querySelector('.slot-file');
    if (preview) { preview.src = ''; preview.classList.add('hidden'); }
    ph?.classList.remove('hidden');
    rm?.classList.add('hidden');
    slot.classList.remove('has-img');
    if (fileInput) fileInput.value = '';
  });
}
function collectImages(storeArr) {
  return storeArr.filter(Boolean);
}
bindImageSlots('image-slots', imageSlots);
bindImageSlots('prop-image-slots', propImageSlots);




// ========== Voice note ==========
const btnVoice = document.getElementById('btn-voice');
const voicePreview = document.getElementById('voice-preview');
const removeVoice = document.getElementById('remove-voice');
const voiceStatus = document.getElementById('voice-status');

function setVoiceFromDataUrl(dataUrl) {
  voiceData = dataUrl;
  if (voicePreview) {
    voicePreview.src = dataUrl;
    voicePreview.classList.remove('hidden');
  }
  removeVoice?.classList.remove('hidden');
  if (voiceStatus) voiceStatus.textContent = '✓ ویس آماده — با ثبت معامله ذخیره می‌شود';
}

btnVoice?.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    try { mediaRecorder.stop(); } catch (e) {}
    btnVoice.classList.remove('recording');
    btnVoice.textContent = '🎤 ضبط ویس';
    if (voiceStatus) voiceStatus.textContent = 'در حال ذخیره ویس...';
    return;
  }
  if (voiceStatus) voiceStatus.textContent = 'درخواست دسترسی میکروفون...';
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceChunks = [];
    let options = {};
    if (typeof MediaRecorder !== 'undefined') {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) options = { mimeType: 'audio/webm;codecs=opus' };
      else if (MediaRecorder.isTypeSupported('audio/webm')) options = { mimeType: 'audio/webm' };
      mediaRecorder = new MediaRecorder(stream, options);
    } else {
      throw new Error('no MediaRecorder');
    }
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) voiceChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      const blob = new Blob(voiceChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      if (blob.size < 100) {
        showToast('ویس خالی بود — دوباره امتحان کن', 'error');
        if (voiceStatus) voiceStatus.textContent = '';
        return;
      }
      if (blob.size > 4 * 1024 * 1024) {
        showToast('ویس خیلی بزرگ است', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setVoiceFromDataUrl(reader.result);
      reader.readAsDataURL(blob);
    };
    mediaRecorder.start(200);
    btnVoice.classList.add('recording');
    btnVoice.textContent = '⏹ توقف ضبط';
    if (voiceStatus) voiceStatus.textContent = 'در حال ضبط... برای پایان دوباره بزن';
  } catch (err) {
    console.error(err);
    btnVoice.classList.remove('recording');
    btnVoice.textContent = '🎤 ضبط ویس';
    if (voiceStatus) voiceStatus.textContent = 'میکروفون در دسترس نیست — از «انتخاب فایل صدا» استفاده کن';
    showToast('اگر اجازه میکروفون داده نشد، فایل صدا انتخاب کن', 'error');
    document.getElementById('voice-file')?.click();
  }
});

document.getElementById('btn-voice-file')?.addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('voice-file')?.click();
});
document.getElementById('voice-file')?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) {
    showToast('فایل صدا حداکثر ۴ مگابایت', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => setVoiceFromDataUrl(reader.result);
  reader.readAsDataURL(file);
});

removeVoice?.addEventListener('click', (e) => {
  e.stopPropagation();
  voiceData = null;
  if (voicePreview) { voicePreview.src = ''; voicePreview.classList.add('hidden'); }
  removeVoice.classList.add('hidden');
  if (voiceStatus) voiceStatus.textContent = 'برای توضیح معامله ویس بگیر';
  const vf = document.getElementById('voice-file');
  if (vf) vf.value = '';
});


// ========== Risk ==========
function calcRisk() {
  const entry = parseFloat(document.getElementById('entry').value);
  const sl = parseFloat(document.getElementById('sl').value);
  const tp = parseFloat(document.getElementById('tp').value);
  const balance = parseFloat(document.getElementById('balance').value);
  const riskPct = parseFloat(document.getElementById('risk-percent').value) || 1;
  const lot = parseFloat(document.getElementById('lot').value);
  const slDistEl = document.getElementById('sl-distance');
  const rrEl = document.getElementById('rr-ratio');
  const sugLotEl = document.getElementById('suggested-lot');
  const potLossEl = document.getElementById('potential-loss');
  const potProfitEl = document.getElementById('potential-profit');
  const applyBtn = document.getElementById('btn-apply-lot');
  suggestedLotValue = null;
  if (applyBtn) applyBtn.classList.add('hidden');

  if (isNaN(entry) || isNaN(sl) || entry === 0) {
    [slDistEl, rrEl, sugLotEl, potLossEl, potProfitEl].forEach(el => { if (el) el.textContent = '—'; });
    return;
  }
  const slDistance = Math.abs(entry - sl);
  if (slDistEl) slDistEl.textContent = slDistance.toFixed(5);

  if (!isNaN(tp) && tp !== 0 && slDistance > 0) {
    const rr = Math.abs(tp - entry) / slDistance;
    if (rrEl) {
      rrEl.textContent = '1 : ' + rr.toFixed(2);
      rrEl.className = 'risk-value ' + (rr >= 1.5 ? 'positive' : rr >= 1 ? '' : 'negative');
    }
  } else if (rrEl) rrEl.textContent = '—';

  if (!isNaN(balance) && balance > 0 && slDistance > 0) {
    const riskAmount = balance * (riskPct / 100);
    let dollarPerLot;
    if (entry < 500) dollarPerLot = (slDistance / 0.0001) * 10;
    else if (entry < 10000) dollarPerLot = slDistance * 100;
    else dollarPerLot = slDistance * 1;

    if (dollarPerLot > 0) {
      suggestedLotValue = Math.max(0.01, Math.round((riskAmount / dollarPerLot) * 100) / 100);
      if (sugLotEl) sugLotEl.textContent = suggestedLotValue.toFixed(2);
      if (applyBtn) applyBtn.classList.remove('hidden');
    }
    const useLot = (!isNaN(lot) && lot > 0) ? lot : suggestedLotValue;
    if (useLot && dollarPerLot) {
      potLossEl.textContent = '-$' + (useLot * dollarPerLot).toFixed(2);
      potLossEl.className = 'risk-value negative';
      if (!isNaN(tp) && tp !== 0) {
        const tpDist = Math.abs(tp - entry);
        let ppl = entry < 500 ? (tpDist / 0.0001) * 10 : entry < 10000 ? tpDist * 100 : tpDist;
        potProfitEl.textContent = '+$' + (useLot * ppl).toFixed(2);
        potProfitEl.className = 'risk-value positive';
      } else potProfitEl.textContent = '—';
    }
  } else {
    if (sugLotEl) sugLotEl.textContent = '—';
    if (potLossEl) potLossEl.textContent = '—';
    if (potProfitEl) potProfitEl.textContent = '—';
  }
  if (currentUser) {
    if (!isNaN(balance)) localStorage.setItem('accountBalance_' + currentUser.username, balance);
    localStorage.setItem('riskPercent_' + currentUser.username, riskPct);
  }
}
['entry', 'sl', 'tp', 'balance', 'risk-percent', 'lot'].forEach(id => {
  const el = document.getElementById(id);
  if (el) { el.addEventListener('input', calcRisk); el.addEventListener('change', calcRisk); }
});
document.getElementById('btn-apply-lot')?.addEventListener('click', () => {
  if (suggestedLotValue != null) {
    document.getElementById('lot').value = suggestedLotValue.toFixed(2);
    calcRisk();
    showToast('لات پیشنهادی اعمال شد', 'success');
  }
});

// ========== Form Submit ==========
document.getElementById('trade-form').addEventListener('submit', (e) => {
  e.preventDefault();
  appMode = 'journal';
  if (currentUser) loadTradesForUser(currentUser.username);
  if (!currentUser) return;
  if (typeof isTradeLocked === 'function' && isTradeLocked()) {
    showToast('ثبت معامله قفل است — حالت انضباط', 'error');
    return;
  }
  const symbol = document.getElementById('symbol').value.trim().toUpperCase();
  const entry = parseFloat(document.getElementById('entry').value);
  const lot = parseFloat(document.getElementById('lot').value) || null;
  const sl = parseFloat(document.getElementById('sl').value) || null;
  const tp = parseFloat(document.getElementById('tp').value) || null;
  let pnl = parseFloat(document.getElementById('pnl').value) || 0;
  const commission = Math.abs(parseFloat(document.getElementById('commission').value) || 0);
  const rfAmount = parseFloat(document.getElementById('rf-amount').value) || null;
  const reason = document.getElementById('reason').value.trim();
  const notes = document.getElementById('notes').value.trim();
  const date = document.getElementById('trade-date').value;
  const balance = parseFloat(document.getElementById('balance').value) || null;
  const riskPercent = parseFloat(document.getElementById('risk-percent').value) || null;
  const strategySelect = (document.getElementById('strategy-select')?.value || '').trim();
  const strategyTags = (document.getElementById('strategy-tags')?.value || '').split(',').filter(Boolean);
  const strategy = strategySelect ? [strategySelect, ...strategyTags.filter(t => t !== strategySelect)] : strategyTags;
  let session = document.getElementById('trade-session')?.value || 'auto';
  const emotion = document.getElementById('trade-emotion')?.value || '';
  const checklist = {};
  document.querySelectorAll('.pre-check').forEach(cb => { checklist[cb.dataset.key] = !!cb.checked; });
  const checklistScore = Object.values(checklist).filter(Boolean).length;

  if (currentResult === 'sl') pnl = -Math.abs(pnl);
  else if (currentResult === 'tp' || currentResult === 'rf') pnl = Math.abs(pnl);
  else if (currentResult === 'be') pnl = 0;
  const netPnl = pnl - commission;

  if (!symbol || isNaN(entry) || !date) {
    showToast('لطفاً فیلدهای ضروری را پر کنید', 'error');
    return;
  }
  if (typeof checkDailyLimits === 'function') {
    const lim = checkDailyLimits(netPnl);
    if (!lim.ok) { showToast(lim.msg, 'error'); return; }
  }
  let riskReward = null;
  if (sl && tp && entry) {
    const slDist = Math.abs(entry - sl);
    const tpDist = Math.abs(tp - entry);
    if (slDist > 0) riskReward = +(tpDist / slDist).toFixed(2);
  }
  if (session === 'auto' && typeof detectSession === 'function') session = detectSession();
  const trade = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    symbol, direction: currentDirection, entry, lot, sl, tp,
    result: currentResult, pnl, commission, netPnl, rfAmount,
    reason, notes, date, images: collectImages(imageSlots), image: imageSlots[0] || null,
    balance, riskPercent, riskReward,
    strategy, session, emotion, checklist, checklistScore,
    user: currentUser.username,
    createdAt: new Date().toISOString()
  };
  trades.unshift(trade);
  saveTrades();
  resetForm();
  showToast('معامله ثبت شد ✓', 'success');
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof updateDisciplineUI === 'function') updateDisciplineUI();
  setTimeout(() => document.querySelector('[data-tab="history"]')?.click(), 300);
});

function resetForm() {
  document.getElementById('trade-form').reset();
  document.getElementById('trade-date').valueAsDate = new Date();
  currentDirection = 'long';
  currentResult = null;
  clearImageSlots('image-slots', imageSlots);
  document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.dir-btn.long')?.classList.add('active');
  document.querySelectorAll('.res-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tag-chip').forEach(b => b.classList.remove('active'));
  const st = document.getElementById('strategy-tags'); if (st) st.value = '';
  document.querySelectorAll('.pre-check').forEach(cb => { cb.checked = false; });
  voiceData = null;
  if (currentUser) {
    const sb = localStorage.getItem('accountBalance_' + currentUser.username);
    const sr = localStorage.getItem('riskPercent_' + currentUser.username);
    if (sb) document.getElementById('balance').value = sb;
    if (sr) document.getElementById('risk-percent').value = sr;
  }
}

// ========== Week helpers ==========
function getWeekRange(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}
function formatWeekLabel(offset) {
  if (offset === 0) return 'این هفته';
  if (offset === -1) return 'هفته قبل';
  if (offset > 0) return offset + ' هفته بعد';
  return Math.abs(offset) + ' هفته قبل';
}
function getTradesInWeek(offset) {
  const { start, end } = getWeekRange(offset);
  return trades.filter(t => {
    const d = new Date(t.date);
    return d >= start && d <= end;
  });
}

function renderSummary() {
  document.getElementById('week-label').textContent = formatWeekLabel(weekOffset);
  const weekTrades = getTradesInWeek(weekOffset);
  const count = weekTrades.length;
  const wins = weekTrades.filter(t => t.result === 'tp' || (t.pnl > 0)).length;
  const winrate = count ? Math.round((wins / count) * 100) : 0;
  const totalPnl = weekTrades.reduce((s, t) => s + (t.netPnl != null ? t.netPnl : (t.pnl || 0)), 0);
  const best = weekTrades.length ? Math.max(...weekTrades.map(t => t.netPnl != null ? t.netPnl : (t.pnl || 0))) : null;
  document.getElementById('stat-count').textContent = count;
  document.getElementById('stat-winrate').textContent = winrate + '%';
  const pnlEl = document.getElementById('stat-pnl');
  pnlEl.textContent = (totalPnl >= 0 ? '+' : '') + totalPnl.toFixed(1);
  pnlEl.className = 'stat-value ' + (totalPnl >= 0 ? 'positive' : 'negative');
  document.getElementById('stat-best').textContent = best !== null ? ((best >= 0 ? '+' : '') + best.toFixed(1)) : '—';
  // رشد حساب (هفته) نسبت به موجودی
  let bal = parseFloat(document.getElementById('balance')?.value);
  if (isNaN(bal) || bal <= 0) {
    const sb = currentUser ? parseFloat(localStorage.getItem('accountBalance_' + currentUser.username)) : NaN;
    bal = !isNaN(sb) && sb > 0 ? sb : 0;
  }
  const growthEl = document.getElementById('stat-growth');
  if (growthEl) {
    if (bal > 0) {
      const g = (totalPnl / bal) * 100;
      growthEl.textContent = (g >= 0 ? '+' : '') + g.toFixed(2) + '%';
      growthEl.className = 'stat-value ' + (g >= 0 ? 'positive' : 'negative');
    } else {
      // اگر موجودی نیست از کل معاملات هفته
      growthEl.textContent = totalPnl ? ((totalPnl >= 0 ? '+' : '') + totalPnl.toFixed(1)) : '0%';
      growthEl.className = 'stat-value ' + (totalPnl >= 0 ? 'positive' : 'negative');
    }
  }
  const list = document.getElementById('week-trades');
  if (!weekTrades.length) {
    list.innerHTML = '<div class="empty-state"><p>هنوز معامله‌ای در این هفته ثبت نشده</p></div>';
    return;
  }
  list.innerHTML = weekTrades.map(t => tradeCardHTML(t)).join('');
  bindTradeCards(list);
  drawEquityCurve();
}
document.getElementById('prev-week')?.addEventListener('click', () => { weekOffset--; renderSummary(); });
document.getElementById('next-week')?.addEventListener('click', () => { weekOffset++; renderSummary(); });

function getFilteredTrades() {
  let list = trades.slice();
  const sym = (document.getElementById('filter-symbol')?.value || '').trim().toUpperCase();
  const res = document.getElementById('filter-result')?.value || '';
  const strat = document.getElementById('filter-strategy')?.value || '';
  const sess = document.getElementById('filter-session')?.value || '';
  const from = document.getElementById('filter-from')?.value || '';
  const to = document.getElementById('filter-to')?.value || '';
  if (sym) list = list.filter(t => (t.symbol || '').includes(sym));
  if (res) list = list.filter(t => t.result === res);
  if (strat) list = list.filter(t => (t.strategy || []).includes(strat));
  if (sess) list = list.filter(t => t.session === sess);
  if (from) list = list.filter(t => (t.date || '') >= from);
  if (to) list = list.filter(t => (t.date || '') <= to);
  return list;
}

function renderHistory() {
  const list = document.getElementById('history-list');
  const filtered = typeof getFilteredTrades === 'function' ? getFilteredTrades() : trades;
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><p>معامله‌ای یافت نشد</p></div>';
    return;
  }
  list.innerHTML = filtered.map(t => tradeCardHTML(t)).join('');
  bindTradeCards(list);
}

function tradeCardHTML(t) {
  const resultLabel = { tp: 'تی‌پی شد', sl: 'استاپ شد', be: 'سر به سر', manual: 'بستن دستی', rf: 'ریسک‌فری' };
  const dirLabel = t.direction === 'long' ? 'لانگ' : 'شورت';
  const net = t.netPnl != null ? t.netPnl : (t.pnl || 0);
  const pnlClass = net >= 0 ? 'positive' : 'negative';
  const pnlText = (net >= 0 ? '+' : '') + Number(net).toFixed(1);
  const tags = (t.strategy || []).map(s => `<span class="trade-tag-badge">${s}</span>`).join('');
  const sessLabel = { asian:'آسیا', london:'لندن', newyork:'نیویورک', overlap:'همپوشانی' }[t.session] || '';
  return `<div class="trade-card" data-id="${t.id}">
    <div class="trade-card-top">
      <div><span class="trade-symbol">${t.symbol}</span>
      <span class="trade-dir ${t.direction}">${dirLabel}</span></div>
      <span class="trade-pnl ${pnlClass}">${pnlText}</span>
    </div>
    <div class="trade-meta">
      <span>📅 ${formatDate(t.date)}</span>
      <span>ورود: ${t.entry}</span>
      ${t.sl ? `<span>SL: ${t.sl}</span>` : ''}
      ${t.tp ? `<span>TP: ${t.tp}</span>` : ''}
      ${t.riskReward ? `<span>R:R 1:${t.riskReward}</span>` : ''}
      ${sessLabel ? `<span>${sessLabel}</span>` : ''}
      ${t.emotion ? `<span>${t.emotion}</span>` : ''}
      ${t.user && currentUser?.role === 'admin' ? `<span>👤 ${t.user}</span>` : ''}
    </div>
    ${tags ? `<div class="trade-tags">${tags}</div>` : ''}
    ${t.result ? `<span class="trade-result ${t.result}">${resultLabel[t.result] || t.result}</span>` : ''}
  </div>`;
}
function bindTradeCards(container) {
  container.querySelectorAll('.trade-card').forEach(card => {
    card.addEventListener('click', () => openModal(card.dataset.id));
  });
}
function formatDate(dateStr) {
  try { return new Date(dateStr).toLocaleDateString('fa-IR'); } catch { return dateStr; }
}

function openModal(id) {
  let t = trades.find(x => x.id === id);
  if (!t && currentUser?.role === 'admin') {
    // search all users
    const users = getUsers();
    for (const u of Object.keys(users)) {
      const arr = JSON.parse(localStorage.getItem('tj_trades_' + u) || '[]');
      t = arr.find(x => x.id === id);
      if (t) break;
    }
  }
  if (!t) return;
  const resultLabel = { tp: 'تی‌پی شد ✓', sl: 'استاپ شد ✕', be: 'سر به سر', manual: 'بستن دستی', rf: 'ریسک‌فری' };
  const dirLabel = t.direction === 'long' ? 'لانگ ▲' : 'شورت ▼';
  const pnlClass = (t.pnl || 0) >= 0 ? 'positive' : 'negative';
  const pnlText = ((t.pnl || 0) >= 0 ? '+' : '') + (t.pnl || 0).toFixed(2);
  let html = `<h3>${t.symbol}</h3>
    <div class="detail-row"><span>جهت</span><span class="trade-dir ${t.direction}">${dirLabel}</span></div>
    <div class="detail-row"><span>تاریخ</span><span>${formatDate(t.date)}</span></div>
    <div class="detail-row"><span>قیمت ورود</span><span>${t.entry}</span></div>
    ${t.lot ? `<div class="detail-row"><span>حجم</span><span>${t.lot}</span></div>` : ''}
    ${t.sl ? `<div class="detail-row"><span>حد ضرر (SL)</span><span>${t.sl}</span></div>` : ''}
    ${t.tp ? `<div class="detail-row"><span>حد سود (TP)</span><span>${t.tp}</span></div>` : ''}
    ${t.result ? `<div class="detail-row"><span>نتیجه</span><span class="trade-result ${t.result}">${resultLabel[t.result]}</span></div>` : ''}
    <div class="detail-row"><span>سود / ضرر</span><span class="trade-pnl ${pnlClass}">${pnlText}</span></div>
    ${t.riskReward ? `<div class="detail-row"><span>ریسک به ریوارد</span><span>1 : ${t.riskReward}</span></div>` : ''}
    ${t.user ? `<div class="detail-row"><span>کاربر</span><span>${t.user}</span></div>` : ''}`;
  if (t.reason) html += `<div class="detail-reason"><strong>دلیل ورود</strong>${escapeHtml(t.reason)}</div>`;
  if (t.notes) html += `<div class="detail-notes"><strong>یادداشت</strong>${escapeHtml(t.notes)}</div>`;
  const imgs = (t.images && t.images.length) ? t.images : (t.image ? [t.image] : []);
  if (imgs.length) {
    html += '<div class="detail-images">' + imgs.map(src => `<img src="${src}" alt="چارت" />`).join('') + '</div>';
  }
  if (t.voice) html += `<div style="margin-top:12px"><strong>ویس</strong><br/><audio controls src="${t.voice}" style="width:100%;margin-top:6px"></audio></div>`;
  if (currentUser && (t.user === currentUser.username || !t.user)) {
    html += `<button class="btn-primary" style="margin-top:20px;background:linear-gradient(135deg,#ff3d57,#e11d48)" onclick="deleteTrade('${t.id}')">حذف این معامله</button>`;
  }
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal').classList.remove('hidden');
}
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
function closeModal() { document.getElementById('modal').classList.add('hidden'); }
document.getElementById('modal-close')?.addEventListener('click', closeModal);
document.querySelector('.modal-backdrop')?.addEventListener('click', closeModal);

function deleteTrade(id) {
  if (!confirm('حذف شود؟')) return;
  trades = trades.filter(t => t.id !== id);
  saveTrades();
  closeModal();
  renderAll();
  showToast('حذف شد', 'success');
}
document.getElementById('clear-all')?.addEventListener('click', () => {
  if (!trades.length) return;
  if (!confirm('همه معاملات پاک شوند؟')) return;
  trades = [];
  saveTrades();
  renderAll();
  showToast('پاک شد', 'success');
});

// ========== Messages ==========
document.getElementById('btn-send-msg')?.addEventListener('click', () => {
  if (!currentUser) return;
  const text = document.getElementById('msg-text').value.trim();
  if (!text) { showToast('پیام خالی است', 'error'); return; }
  const msgs = getMessages();
  msgs.unshift({
    id: Date.now().toString(36),
    from: currentUser.username,
    to: ADMIN_USERNAME,
    text,
    date: new Date().toISOString(),
    read: false
  });
  saveMessages(msgs);
  document.getElementById('msg-text').value = '';
  showToast('پیام ارسال شد', 'success');
  renderMessages();
});

function renderMessages() {
  if (!currentUser) return;
  const isAdmin = currentUser.role === 'admin' && currentUser.username === ADMIN_USERNAME;
  const all = getMessages();

  if (isAdmin) {
    const inbox = document.getElementById('admin-inbox');
    // group by user conversation: show all messages involving users
    const conv = all.slice().sort((a,b) => new Date(a.date) - new Date(b.date));
    if (!conv.length) {
      inbox.innerHTML = '<div class="empty-state"><p>هنوز پیامی نیست</p></div>';
      return;
    }
    inbox.innerHTML = conv.map(m => {
      const fromAdmin = m.from === ADMIN_USERNAME;
      return `<div class="chat-bubble ${fromAdmin ? 'from-admin' : 'from-user'}">
        <div class="chat-meta">${fromAdmin ? 'شما (ادمین)' : 'کاربر: ' + escapeHtml(m.from)} · ${formatDate(m.date)}</div>
        <div>${escapeHtml(m.text)}</div>
        ${!fromAdmin ? `<div class="chat-reply-box">
          <textarea id="reply-${m.id}" rows="2" placeholder="پاسخ به ${escapeHtml(m.from)}..."></textarea>
          <button type="button" class="btn-primary" style="padding:10px" onclick="replyToUser('${escapeHtml(m.from)}','${m.id}')">ارسال پاسخ</button>
        </div>` : ''}
      </div>`;
    }).join('');
    // mark all as read when admin opens
    let changed = false;
    all.forEach(m => { if (m.to === ADMIN_USERNAME && !m.read) { m.read = true; changed = true; } });
    if (changed) saveMessages(all);
  } else {
    const list = document.getElementById('my-messages');
    const conv = all.filter(m =>
      m.from === currentUser.username || m.to === currentUser.username
    ).sort((a,b) => new Date(a.date) - new Date(b.date));
    if (!conv.length) {
      list.innerHTML = '<div class="empty-state"><p>هنوز گفتگویی ندارید. پیام بفرستید.</p></div>';
      return;
    }
    list.innerHTML = conv.map(m => {
      const fromMe = m.from === currentUser.username;
      return `<div class="chat-bubble ${fromMe ? 'from-admin' : 'from-user'}">
        <div class="chat-meta">${fromMe ? 'شما' : 'ادمین'} · ${formatDate(m.date)}</div>
        <div>${escapeHtml(m.text)}</div>
      </div>`;
    }).join('');
  }
}

window.replyToUser = function(toUser, replyToId) {
  const ta = document.getElementById('reply-' + replyToId);
  const text = (ta?.value || '').trim();
  if (!text) { showToast('متن پاسخ خالی است', 'error'); return; }
  const msgs = getMessages();
  msgs.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,5),
    from: ADMIN_USERNAME,
    to: toUser,
    text,
    date: new Date().toISOString(),
    read: false,
    replyTo: replyToId
  });
  saveMessages(msgs);
  showToast('پاسخ ارسال شد', 'success');
  renderMessages();
  if (typeof renderAdmin === 'function') renderAdmin();
};


window.markRead = function(id) {
  const msgs = getMessages();
  const m = msgs.find(x => x.id === id);
  if (m) { m.read = true; saveMessages(msgs); renderMessages(); renderAdmin(); }
};
window.deleteMsg = function(id) {
  let msgs = getMessages().filter(x => x.id !== id);
  saveMessages(msgs);
  renderMessages();
  renderAdmin();
};

// ========== Admin ==========
function renderAdmin() {
  if (!currentUser || currentUser.role !== 'admin' || currentUser.username !== ADMIN_USERNAME) return;
  const users = getUsers();
  const userList = Object.keys(users);
  document.getElementById('admin-user-count').textContent = userList.length;
  const unread = getMessages().filter(m => m.to === ADMIN_USERNAME && !m.read).length;
  document.getElementById('admin-unread').textContent = unread;

  // آنلاین: ورود در ۱۵ دقیقه اخیر
  const onlineMap = JSON.parse(localStorage.getItem('tj_online') || '{}');
  const now = Date.now();
  const ONLINE_MS = 15 * 60 * 1000;
  const onlineEl = document.getElementById('admin-online');
  if (onlineEl) {
    const recent = userList
      .map(u => ({
        u,
        ts: onlineMap[u] || (users[u].lastLogin ? new Date(users[u].lastLogin).getTime() : 0)
      }))
      .filter(x => x.ts && (now - x.ts) < ONLINE_MS)
      .sort((a,b) => b.ts - a.ts);
    if (!recent.length) {
      onlineEl.innerHTML = '<div class="empty-state"><p>کسی اخیراً وارد نشده</p></div>';
    } else {
      onlineEl.innerHTML = recent.map(({u, ts}) => {
        const mins = Math.max(0, Math.floor((now - ts) / 60000));
        const label = mins < 1 ? 'همین الان' : mins + ' دقیقه پیش';
        return `<div class="admin-user-card">
          <div><div class="name">${escapeHtml(u)} <span class="online-dot"></span></div>
          <div class="role">وارد شده · ${label}</div></div>
        </div>`;
      }).join('');
    }
  }

  const usersEl = document.getElementById('admin-users');
  usersEl.innerHTML = userList.map(u => {
    const info = users[u];
    const userTrades = JSON.parse(localStorage.getItem('tj_trades_' + u) || '[]');
    const last = info.lastLogin ? formatDate(info.lastLogin) : '—';
    const isOn = onlineMap[u] && (now - onlineMap[u]) < ONLINE_MS;
    return `<div class="admin-user-card">
      <div><div class="name">${escapeHtml(u)} ${isOn ? '<span class="online-dot"></span>' : '<span class="online-dot off"></span>'}</div>
      <div class="role">${info.role === 'admin' ? 'ادمین' : 'کاربر'} · ${userTrades.length} معامله · ورود: ${last}</div></div>
    </div>`;
  }).join('');

  // All trades from all users
  let all = [];
  userList.forEach(u => {
    const arr = JSON.parse(localStorage.getItem('tj_trades_' + u) || '[]');
    arr.forEach(t => all.push({ ...t, user: t.user || u }));
  });
  all.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  const tradesEl = document.getElementById('admin-all-trades');
  if (!all.length) {
    tradesEl.innerHTML = '<div class="empty-state"><p>معامله‌ای نیست</p></div>';
  } else {
    tradesEl.innerHTML = all.slice(0, 30).map(t => tradeCardHTML(t)).join('');
    bindTradeCards(tradesEl);
  }
}



// ========== Live Chart (TradingView) ==========
function resolveTvSymbol(raw) {
  const s = (raw || 'EURUSD').trim().toUpperCase().replace('/', '');
  const map = {
    'EURUSD': 'FX:EURUSD',
    'GBPUSD': 'FX:GBPUSD',
    'USDJPY': 'FX:USDJPY',
    'USDCHF': 'FX:USDCHF',
    'AUDUSD': 'FX:AUDUSD',
    'USDCAD': 'FX:USDCAD',
    'NZDUSD': 'FX:NZDUSD',
    'XAUUSD': 'OANDA:XAUUSD',
    'GOLD': 'OANDA:XAUUSD',
    'XAGUSD': 'OANDA:XAGUSD',
    'BTCUSDT': 'BINANCE:BTCUSDT',
    'BTCUSD': 'BINANCE:BTCUSDT',
    'ETHUSDT': 'BINANCE:ETHUSDT',
    'ETHUSD': 'BINANCE:ETHUSDT',
    'US30': 'FOREXCOM:US30',
    'NAS100': 'FOREXCOM:NSXUSD',
    'US500': 'FOREXCOM:SPXUSD'
  };
  if (map[s]) return map[s];
  if (s.includes('USDT') || s.includes('BTC') || s.includes('ETH')) return 'BINANCE:' + s;
  if (s.length === 6) return 'FX:' + s;
  return s.includes(':') ? s : 'FX:' + s;
}

function loadTradingViewChart(sym) {
  const input = document.getElementById('chart-symbol');
  const symbol = resolveTvSymbol(sym || input?.value || 'EURUSD');
  if (input && sym) input.value = (sym || input.value).toUpperCase();
  const container = document.getElementById('tv-chart-container');
  if (!container) return;

  // TradingView widget via iframe (works without extra scripts on many hosts)
  const tvSymbol = encodeURIComponent(symbol);
  container.innerHTML = `<iframe
    src="https://s.tradingview.com/widgetembed/?frameElementId=tv_chart&symbol=${tvSymbol}&interval=15&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=0b0f19&studies=%5B%5D&theme=dark&style=1&timezone=Asia%2FTehran&withdateranges=1&showpopupbutton=1&hideideas=1&hidevolume=0&locale=en"
    allowtransparency="true"
    scrolling="no"
    allowfullscreen
    title="Live Chart"></iframe>`;

  // highlight chip
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', c.dataset.sym === (sym || input?.value || '').toUpperCase());
  });
}

document.getElementById('btn-load-chart')?.addEventListener('click', () => {
  loadTradingViewChart(document.getElementById('chart-symbol').value);
});
document.getElementById('chart-symbol')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') loadTradingViewChart(document.getElementById('chart-symbol').value);
});
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.getElementById('chart-symbol').value = chip.dataset.sym;
    loadTradingViewChart(chip.dataset.sym);
  });
});

// Equity curve from journal
function drawEquityCurve() {
  const canvas = document.getElementById('equity-canvas');
  const empty = document.getElementById('equity-empty');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 400;
  const h = 180;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (!trades || trades.length < 1) {
    if (empty) empty.style.display = 'block';
    canvas.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';
  canvas.style.display = 'block';

  // chronological
  const sorted = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
  let equity = 0;
  const points = [0];
  sorted.forEach(t => {
    equity += (t.netPnl != null ? t.netPnl : (t.pnl || 0));
    points.push(equity);
  });

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = 16;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;

  // zero line
  const zeroY = pad + plotH - ((0 - min) / range) * plotH;
  ctx.strokeStyle = 'rgba(139,155,180,0.3)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad, zeroY);
  ctx.lineTo(w - pad, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // area
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = pad + (i / (points.length - 1 || 1)) * plotW;
    const y = pad + plotH - ((p - min) / range) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  const lastX = pad + plotW;
  const lastY = pad + plotH - ((points[points.length - 1] - min) / range) * plotH;
  ctx.lineTo(lastX, h - pad);
  ctx.lineTo(pad, h - pad);
  ctx.closePath();
  const final = points[points.length - 1];
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  if (final >= 0) {
    grad.addColorStop(0, 'rgba(0,200,83,0.25)');
    grad.addColorStop(1, 'rgba(0,200,83,0)');
    ctx.fillStyle = grad;
  } else {
    grad.addColorStop(0, 'rgba(255,61,87,0.25)');
    grad.addColorStop(1, 'rgba(255,61,87,0)');
    ctx.fillStyle = grad;
  }
  ctx.fill();

  // line
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = pad + (i / (points.length - 1 || 1)) * plotW;
    const y = pad + plotH - ((p - min) / range) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = final >= 0 ? '#00c853' : '#ff3d57';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // end label
  ctx.fillStyle = final >= 0 ? '#00c853' : '#ff3d57';
  ctx.font = '600 12px Vazirmatn, sans-serif';
  ctx.textAlign = 'left';
  const label = (final >= 0 ? '+' : '') + final.toFixed(1);
  ctx.fillText(label, Math.min(lastX - 40, w - 50), Math.max(14, lastY - 8));
}



// ========== Trader Mood / Strength ==========
function getTraderStats() {
  if (!trades || !trades.length) return { total: 0, winrate: 0, count: 0 };
  const total = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const wins = trades.filter(t => (t.pnl || 0) > 0 || t.result === 'tp').length;
  const winrate = Math.round((wins / trades.length) * 100);
  return { total, winrate, count: trades.length };
}

function updateTraderMood() {
  const face = document.getElementById('mood-face');
  const btn = document.getElementById('trader-mood');
  if (!face || !btn) return;
  const { total, count } = getTraderStats();
  btn.classList.remove('good', 'bad', 'neutral');
  if (count === 0) {
    face.textContent = '😐';
    btn.classList.add('neutral');
    btn.dataset.mood = 'neutral';
  } else if (total > 0) {
    face.textContent = '😎';
    btn.classList.add('good');
    btn.dataset.mood = 'good';
  } else if (total < 0) {
    face.textContent = '😤';
    btn.classList.add('bad');
    btn.dataset.mood = 'bad';
  } else {
    face.textContent = '😐';
    btn.classList.add('neutral');
    btn.dataset.mood = 'neutral';
  }
}

document.getElementById('trader-mood')?.addEventListener('click', () => {
  const btn = document.getElementById('trader-mood');
  const mood = btn?.dataset.mood || 'neutral';
  if (mood === 'good') {
    showToast('همین جوری ادامه بده 💪', 'success');
  } else if (mood === 'bad') {
    showToast('آدم باید از اشتباهات درس بگیره 📚', 'error');
  } else {
    showToast('هنوز معامله‌ای نداری، شروع کن!', 'success');
  }
});






// ========== Prop wizard + timer ==========
function openPropWizard() {
  openApp('prop');
}


function updateWizPreview() {
  const el = document.getElementById('wiz-preview');
  if (!el) return;
  const cls = document.getElementById('wiz-class')?.value || 'A';
  const phase = document.getElementById('wiz-phase')?.value || '1';
  const size = parseFloat(document.getElementById('wiz-size')?.value) || 10000;
  const rules = propRules(cls, phase);
  let t = '';
  if (cls === 'A') {
    t = phase === '1' ? 'مهلت مرحله ۱: ۳۰ روز تقویمی' : phase === '2' ? 'مهلت مرحله ۲: ۶۰ روز تقویمی' : 'حساب فاند — بدون تایمر چالش';
  } else {
    t = phase === 'funded' ? 'حساب فاند' : 'پلن B — بدون محدودیت زمانی';
  }
  if (rules.target != null) {
    t += ' | تارگت: ' + (rules.target * 100) + '% ≈ ' + (size * rules.target).toFixed(0) + '$';
  }
  t += ' | حداقل روز: ' + rules.minDays;
  el.textContent = t;
}

['wiz-firm','wiz-class','wiz-phase','wiz-size','wiz-start'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', updateWizPreview);
});

document.getElementById('btn-wiz-back')?.addEventListener('click', () => {
  const wiz = document.getElementById('prop-wizard');
  if (wiz) { wiz.classList.add('hidden'); wiz.style.display = 'none'; }
  showModeScreen();
});

document.getElementById('btn-wiz-confirm')?.addEventListener('click', () => {
  const firm = document.getElementById('wiz-firm').value;
  const cls = document.getElementById('wiz-class').value;
  const phase = document.getElementById('wiz-phase').value;
  const size = parseFloat(document.getElementById('wiz-size').value);
  const start = document.getElementById('wiz-start').value || new Date().toISOString().slice(0, 10);
  const cfg = getPropConfig() || {};
  savePropConfig({
    ...cfg,
    firm,
    class: cls,
    phase,
    size,
    start,
    failed: false,
    confirmedAt: new Date().toISOString()
  });
  // sync main prop form fields
  try {
    document.getElementById('prop-class').value = cls;
    document.getElementById('prop-phase').value = phase;
    document.getElementById('prop-size').value = String(size);
    document.getElementById('prop-start').value = start;
  } catch (e) {}
  const wiz = document.getElementById('prop-wizard');
  if (wiz) { wiz.classList.add('hidden'); wiz.style.display = 'none'; }
  openApp('prop');
  showToast('پراپ تأیید شد — وارد ژورنال پراپ شدید', 'success');
});

function updatePropTimer(cfg, rules) {
  const textEl = document.getElementById('prop-timer-text');
  const subEl = document.getElementById('prop-timer-sub');
  if (!textEl) return;
  cfg = cfg || getPropConfig() || {};
  const cls = cfg.class || 'A';
  const phase = cfg.phase || '1';
  const startStr = cfg.start;
  if (phase === 'funded') {
    textEl.textContent = 'حساب فاند';
    textEl.className = 'prop-timer-text ok';
    if (subEl) subEl.textContent = 'چالش تمام شده — روی حفظ دراودان تمرکز کن';
    return;
  }
  if (cls === 'B') {
    textEl.textContent = 'بدون محدودیت زمان';
    textEl.className = 'prop-timer-text ok';
    if (subEl) subEl.textContent = 'پلن B — فقط تارگت و قوانین ریسک مهم است';
    return;
  }
  // Class A timers
  const limitDays = phase === '2' ? 60 : 30;
  if (!startStr) {
    textEl.textContent = limitDays + ' روز فرصت';
    textEl.className = 'prop-timer-text';
    if (subEl) subEl.textContent = 'تاریخ شروع را در تنظیمات مشخص کن';
    return;
  }
  const start = new Date(startStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0,0,0,0);
  const elapsed = Math.floor((now - start) / 86400000);
  const left = limitDays - elapsed;
  const end = new Date(start);
  end.setDate(end.getDate() + limitDays);
  const endLabel = end.toLocaleDateString('fa-IR');
  if (left < 0) {
    textEl.textContent = 'مهلت تمام شده (' + Math.abs(left) + ' روز گذشته)';
    textEl.className = 'prop-timer-text danger';
    if (subEl) subEl.textContent = 'مهلت ' + limitDays + ' روزه مرحله ' + phase + ' به پایان رسیده — وضعیت را با پراپ چک کن';
  } else if (left <= 5) {
    textEl.textContent = left + ' روز باقی‌مانده';
    textEl.className = 'prop-timer-text warn';
    if (subEl) subEl.textContent = 'مرحله ' + phase + ' · پایان حدود ' + endLabel + ' · روز سپری‌شده: ' + Math.max(0, elapsed) + '/' + limitDays;
  } else {
    textEl.textContent = left + ' روز باقی‌مانده';
    textEl.className = 'prop-timer-text ok';
    if (subEl) subEl.textContent = 'مرحله ' + phase + ' · ' + limitDays + ' روزه · پایان حدود ' + endLabel + ' · سپری‌شده: ' + Math.max(0, elapsed) + ' روز';
  }
}


// ========== Prop SGB ==========
function getPropConfig() {
  const key = currentUser ? 'tj_prop_' + currentUser.username : 'tj_prop';
  return JSON.parse(localStorage.getItem(key) || 'null');
}
function savePropConfig(cfg) {
  const key = currentUser ? 'tj_prop_' + currentUser.username : 'tj_prop';
  localStorage.setItem(key, JSON.stringify(cfg));
}

function getPropArchive() {
  const key = currentUser ? 'tj_prop_archive_' + currentUser.username : 'tj_prop_archive';
  return JSON.parse(localStorage.getItem(key) || '[]');
}
function savePropArchive(list) {
  const key = currentUser ? 'tj_prop_archive_' + currentUser.username : 'tj_prop_archive';
  localStorage.setItem(key, JSON.stringify(list));
}
function snapshotCurrentProp(status) {
  const cfg = getPropConfig() || {};
  const net = trades.reduce((s, t) => s + (t.netPnl != null ? t.netPnl : (t.pnl || 0)), 0);
  const days = new Set(trades.map(t => t.date)).size;
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    status, // 'passed' | 'failed' | 'funded'
    class: cfg.class || 'A',
    phase: cfg.phase || '1',
    size: cfg.size || 10000,
    start: cfg.start || null,
    end: new Date().toISOString().slice(0, 10),
    netPnl: net,
    tradeCount: trades.length,
    days,
    createdAt: new Date().toISOString()
  };
}
function resetPropFromScratch() {
  // ریست کامل چالش جاری
  const fresh = {
    class: document.getElementById('prop-class')?.value || 'A',
    phase: '1',
    size: parseFloat(document.getElementById('prop-size')?.value) || 10000,
    start: new Date().toISOString().slice(0, 10),
    failed: false
  };
  savePropConfig(fresh);
  // پاک کردن معاملات پراپ جاری
  if (currentUser) {
    appMode = 'prop';
    trades = [];
    saveTrades();
  }
  // فرم تنظیمات
  try {
    document.getElementById('prop-phase').value = '1';
    document.getElementById('prop-start').value = fresh.start;
  } catch (e) {}
}
function renderPropArchive() {
  const list = getPropArchive();
  const passed = list.filter(x => x.status === 'passed' || x.status === 'funded');
  const failed = list.filter(x => x.status === 'failed');
  const passedEl = document.getElementById('prop-passed-list');
  const failedEl = document.getElementById('prop-failed-list');
  const card = (x, type) => {
    const label = (x.class || 'A') + ' · $' + (x.size || 0).toLocaleString() + ' · مرحله ' + (x.phase || '1');
    const pnl = (x.netPnl >= 0 ? '+' : '') + (Number(x.netPnl) || 0).toFixed(1) + ' $';
    let badge = type === 'passed' ? (x.status === 'funded' || x.closed ? 'فاند / پاس‌شده' : 'پاس‌شده') : 'فیل‌شده';
    let extra = '';
    if (x.withdrawAmount || x.refund) {
      extra = ` · برداشت: ${x.withdrawAmount || 0}$ · ریفاند: ${x.refund || 0}$`;
    }
    if (x.note) extra += ' · ' + x.note;
    return `<div class="prop-archive-card ${type}">
      <div>
        <div><strong>${label}</strong></div>
        <div class="meta">${x.start || '—'} → ${x.end || '—'} · ${x.tradeCount || 0} معامله · ${x.days || 0} روز · PnL: ${pnl}${extra}</div>
      </div>
      <span class="badge">${badge}</span>
    </div>`;
  };
  if (passedEl) {
    passedEl.innerHTML = passed.length
      ? passed.slice().reverse().map(x => card(x, 'passed')).join('')
      : '<div class="empty-state"><p>هنوز پراپی پاس نشده</p></div>';
  }
  if (failedEl) {
    failedEl.innerHTML = failed.length
      ? failed.slice().reverse().map(x => card(x, 'failed')).join('')
      : '<div class="empty-state"><p>پراپ فیل‌شده‌ای نیست</p></div>';
  }
}


function propRules(cls, phase) {
  // SGB rules
  const daily = 0.05, maxdd = 0.12;
  if (cls === 'A') {
    return {
      target: phase === '2' ? 0.04 : phase === 'funded' ? null : 0.08,
      daily, maxdd,
      minDays: 5,
      label: phase === '1' ? 'A مرحله ۱' : phase === '2' ? 'A مرحله ۲' : 'A فاند'
    };
  }
  return {
    target: phase === '2' ? 0.05 : phase === 'funded' ? null : 0.10,
    daily, maxdd,
    minDays: 3,
    label: phase === '1' ? 'B مرحله ۱' : phase === '2' ? 'B مرحله ۲' : 'B فاند'
  };
}

document.getElementById('btn-save-prop')?.addEventListener('click', () => {
  const prev = getPropConfig() || {};
  const cfg = {
    ...prev,
    firm: document.getElementById('prop-firm')?.value || 'SGB',
    class: document.getElementById('prop-class').value,
    phase: document.getElementById('prop-phase').value,
    size: parseFloat(document.getElementById('prop-size').value),
    start: document.getElementById('prop-start').value || new Date().toISOString().slice(0,10),
    failed: false
  };
  savePropConfig(cfg);
  appMode = 'prop';
  if (currentUser) loadTradesForUser(currentUser.username);
  showToast('پلن پراپ ذخیره شد', 'success');
  renderProp();
  renderPropHistory();
  updatePhaseButtons();
});

function updatePropPlanPreview() {
  const el = document.getElementById('prop-plan-preview');
  if (!el) return;
  const cls = document.getElementById('prop-class')?.value || 'A';
  const phase = document.getElementById('prop-phase')?.value || '1';
  const size = parseFloat(document.getElementById('prop-size')?.value) || 10000;
  const rules = propRules(cls, phase);
  let t = cls === 'A' ? 'پلن A' : 'پلن B';
  if (rules.target != null) t += ' · تارگت این مرحله: ' + (rules.target * 100) + '% ≈ ' + (size * rules.target).toFixed(0) + '$';
  else t += ' · فاند (بدون تارگت چالش)';
  t += ' · دراودان روزانه ۵٪ / کلی ۱۲٪ · حداقل روز: ' + rules.minDays;
  if (cls === 'A' && phase === '1') t += ' · مهلت ۳۰ روز';
  if (cls === 'A' && phase === '2') t += ' · مهلت ۶۰ روز';
  if (cls === 'B' && phase !== 'funded') t += ' · بدون محدودیت زمان';
  el.textContent = t;
}
['prop-firm','prop-class','prop-phase','prop-size'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', updatePropPlanPreview);
});


function renderProp() {
  let cfg = getPropConfig();
  if (!cfg) {
    cfg = {
      class: document.getElementById('prop-class')?.value || 'A',
      phase: '1',
      size: parseFloat(document.getElementById('prop-size')?.value) || 10000,
      start: document.getElementById('prop-start')?.value || new Date().toISOString().slice(0, 10)
    };
  }
  // همیشه از localStorage بخوان — نه از فرم (جلوگیری از برگشت به مرحله ۱)
  try {
    if (document.getElementById('prop-firm') && cfg.firm) document.getElementById('prop-firm').value = cfg.firm;
    if (document.getElementById('prop-class')) document.getElementById('prop-class').value = cfg.class || 'A';
    if (document.getElementById('prop-phase')) document.getElementById('prop-phase').value = String(cfg.phase || '1');
    if (document.getElementById('prop-size')) document.getElementById('prop-size').value = String(cfg.size || 10000);
    if (cfg.start && document.getElementById('prop-start')) document.getElementById('prop-start').value = cfg.start;
    if (typeof updatePropPlanPreview === 'function') updatePropPlanPreview();
    document.querySelectorAll('.plan-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.plan === (cfg.class || 'A'));
    });
  } catch (e) {}
  const rules = propRules(cfg.class, cfg.phase);
  const size = cfg.size || 10000;
  const net = trades.reduce((s, t) => s + (t.netPnl != null ? t.netPnl : (t.pnl || 0)), 0);
  const targetUsd = rules.target != null ? size * rules.target : null;
  const dailyLimit = size * rules.daily;
  const maxDdLimit = size * rules.maxdd;
  const progress = targetUsd ? Math.max(0, Math.min(100, (net / targetUsd) * 100)) : 0;
  const ddUsed = net < 0 ? Math.min(100, (Math.abs(net) / maxDdLimit) * 100) : 0;

  // trading days
  const days = new Set(trades.map(t => t.date)).size;

  const netEl = document.getElementById('prop-net');
  if (netEl) {
    netEl.textContent = (net >= 0 ? '+' : '') + net.toFixed(1);
    netEl.className = 'stat-value ' + (net >= 0 ? 'positive' : 'negative');
  }
  document.getElementById('prop-progress').textContent = targetUsd != null ? progress.toFixed(0) + '%' : '—';
  document.getElementById('prop-to-target').textContent = targetUsd != null
    ? ((targetUsd - net) >= 0 ? (targetUsd - net).toFixed(0) + ' $' : 'تارگت زده شد ✓')
    : 'فاند — تارگت ندارد';
  document.getElementById('prop-days').textContent = days + ' / ' + rules.minDays;

  const wins = trades.filter(t => (t.netPnl != null ? t.netPnl : t.pnl || 0) > 0).length;
  const count = trades.length;
  const wr = count ? Math.round((wins / count) * 100) : 0;
  const best = count ? Math.max(...trades.map(t => t.netPnl != null ? t.netPnl : (t.pnl || 0))) : null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayNet = trades.filter(t => t.date === todayStr)
    .reduce((s, t) => s + (t.netPnl != null ? t.netPnl : (t.pnl || 0)), 0);

  const wrEl = document.getElementById('prop-winrate');
  if (wrEl) wrEl.textContent = wr + '%';
  const cntEl = document.getElementById('prop-count');
  if (cntEl) cntEl.textContent = count;
  const bestEl = document.getElementById('prop-best');
  if (bestEl) bestEl.textContent = best != null ? ((best >= 0 ? '+' : '') + best.toFixed(1)) : '—';
  const todayEl = document.getElementById('prop-today');
  if (todayEl) {
    todayEl.textContent = (todayNet >= 0 ? '+' : '') + todayNet.toFixed(1);
    todayEl.className = 'stat-value ' + (todayNet >= 0 ? 'positive' : 'negative');
  }

  drawPropEquity();
  if (typeof renderPropWeeklyAnalysis === 'function') renderPropWeeklyAnalysis();
  if (typeof renderPropInvestorPanel === 'function') renderPropInvestorPanel();
  if (typeof renderPropStrategySelect === 'function') renderPropStrategySelect();
  if (typeof renderPropTradingCalendar === 'function') renderPropTradingCalendar();

  document.getElementById('prop-rule-target').textContent = targetUsd != null
    ? (rules.target * 100) + '% = ' + targetUsd.toFixed(0) + ' $'
    : 'حساب فاند';
  document.getElementById('prop-rule-daily').textContent = dailyLimit.toFixed(0) + ' $';
  document.getElementById('prop-rule-max').textContent = maxDdLimit.toFixed(0) + ' $';
  document.getElementById('prop-rule-mindays').textContent = rules.minDays + ' روز (فعلی: ' + days + ')';

  const bar = document.getElementById('prop-bar-fill');
  const ddBar = document.getElementById('prop-dd-fill');
  if (bar) bar.style.width = progress + '%';
  if (ddBar) ddBar.style.width = ddUsed + '%';

  // advice
  let advice = '';
  if (net <= -maxDdLimit) advice = '⚠️ دراودان کلی نقض شده — حساب در خطر رد شدن است.';
  else if (ddUsed > 70) advice = 'احتیاط: بیش از ۷۰٪ از حد ضرر کلی مصرف شده. ریسک را کم کنید.';
  else if (targetUsd && net >= targetUsd && days >= rules.minDays)
    advice = '🎉 تارگت و حداقل روزها تکمیل شد. آماده مرحله بعد / فاند.';
  else if (targetUsd && net >= targetUsd)
    advice = 'تارگت سود زده شده؛ حداقل روز معاملاتی را کامل کنید (' + days + '/' + rules.minDays + ').';
  else {
    const remain = targetUsd ? (targetUsd - net) : 0;
    const riskHint = (size * 0.01).toFixed(0);
    advice = 'پیشنهاد ریسک هر معامله حدود ۱٪ حساب ≈ ' + riskHint + ' $. ' +
      (targetUsd ? ('مانده تا تارگت: ' + remain.toFixed(0) + ' $') : 'حساب فاند — تمرکز روی حفظ دراودان.');
  }
  // daily check
  if (todayNet <= -dailyLimit)
    advice = '⛔ ضرر امروز از حد روزانه ۵٪ (' + dailyLimit.toFixed(0) + '$) گذشته! امروز معامله نکنید.';
  else if (todayNet < 0 && Math.abs(todayNet) > dailyLimit * 0.7)
    advice = 'هشدار: نزدیک حد ضرر روزانه. باقی‌مانده امروز ≈ ' + (dailyLimit + todayNet).toFixed(0) + '$. ' + advice;

  // راهنمای دقیق‌تر
  const risk1 = size * 0.01;
  const risk05 = size * 0.005;
  const roomToTarget = targetUsd != null ? Math.max(0, targetUsd - net) : null;
  const roomToDd = maxDdLimit + Math.min(0, net); // how much loss left before max dd
  if (!cfg.failed && todayNet > -dailyLimit * 0.7 && net > -maxDdLimit * 0.7) {
    const parts = [];
    parts.push('ریسک پیشنهادی هر ترید: ۰.۵٪≈' + risk05.toFixed(0) + '$ تا ۱٪≈' + risk1.toFixed(0) + '$');
    if (roomToTarget != null) parts.push('مانده تا تارگت: ' + roomToTarget.toFixed(0) + '$');
    parts.push('مانده تا دراودان کل: ' + Math.max(0, roomToDd).toFixed(0) + '$');
    const safeTrades = risk1 > 0 ? Math.floor(Math.max(0, roomToDd) / risk1) : 0;
    if (safeTrades > 0 && roomToTarget != null)
      parts.push('با ریسک ۱٪ حدود ' + safeTrades + ' استاپ پشت‌سرهم تا رد حساب فاصله دارید');
    if (days < rules.minDays)
      parts.push('حداقل روز: ' + days + '/' + rules.minDays);
    if (!advice.startsWith('⛔') && !advice.startsWith('🎉'))
      advice = parts.join(' | ');
  }

  const advEl = document.getElementById('prop-advice');
  if (advEl) advEl.textContent = advice;

  // مرحله کامل؟
  const doneBanner = document.getElementById('prop-phase-done');
  const nextBtn = document.getElementById('btn-prop-next');
  const phaseComplete = targetUsd != null && net >= targetUsd && days >= rules.minDays && !cfg.failed;
  if (doneBanner) {
    if (phaseComplete) {
      doneBanner.classList.remove('hidden');
      const txt = document.getElementById('prop-done-text');
      if (txt) {
        if (cfg.phase === '1') txt.textContent = 'تارگت مرحله ۱ و حداقل روزها کامل شد. می‌توانی به مرحله ۲ بروی.';
        else if (cfg.phase === '2') txt.textContent = 'مرحله ۲ کامل شد! می‌توانی به حساب فاند بروید.';
        else txt.textContent = 'مرحله تکمیل است.';
      }
      nextBtn?.classList.remove('hidden');
    } else {
      doneBanner.classList.add('hidden');
      nextBtn?.classList.add('hidden');
    }
  }
  if (cfg.failed) {
    const adv = document.getElementById('prop-advice');
    if (adv) adv.textContent = '❌ این اکانت فیل شده است. می‌توانی تنظیمات را عوض کنی و چالش جدید شروع کنی.';
    doneBanner?.classList.add('hidden');
    nextBtn?.classList.add('hidden');
  }
}






function passPhase1() {
  let cfg = getPropConfig() || {};
  if ((cfg.phase || '1') !== '1') {
    showToast('الان در مرحله ۱ نیستید', 'error');
    return;
  }
  const rules = propRules(cfg.class, '1');
  const size = cfg.size || 10000;
  const net = trades.reduce((s, t) => s + (t.netPnl != null ? t.netPnl : (t.pnl || 0)), 0);
  const targetUsd = rules.target != null ? size * rules.target : null;
  const days = new Set(trades.map(t => t.date)).size;
  if (days < rules.minDays) {
    showToast('هنوز روزهای معاملاتی کامل نشده (' + days + '/' + rules.minDays + '). تا تکمیل حداقل روز نمی‌توانی مرحله بعد بروی.', 'error');
    return;
  }
  if (targetUsd != null && net < targetUsd) {
    showToast('تارگت مرحله ۱ کامل نیست (' + net.toFixed(1) + ' / ' + targetUsd.toFixed(0) + '$)', 'error');
    return;
  }
  if (!confirm('مرحله ۱ پاس شود؟ معاملات این مرحله ذخیره می‌مانند و فقط با برچسب «مرحله ۱» می‌مانند. مرحله ۲ از صفر شروع می‌شود.')) return;

  // ذخیره قطعی معاملات مرحله ۱ در کلید جدا
  if (currentUser) {
    const p1key = 'tj_trades_prop_' + currentUser.username + '_p1';
    localStorage.setItem(p1key, JSON.stringify(trades));
  }
  const snap = snapshotCurrentProp('passed');
  snap.phase = '1';
  snap.note = 'پاس مرحله ۱';
  const arch = getPropArchive();
  arch.push(snap);
  savePropArchive(arch);

  // رفتن به مرحله ۲ — معاملات مرحله ۲ از صفر (کلید p2)
  cfg = { ...cfg, phase: '2', start: new Date().toISOString().slice(0, 10), failed: false, phase1PassedAt: new Date().toISOString() };
  savePropConfig(cfg);
  // کلید p2 را خالی نکن اگر از قبل چیزی بود؛ فقط load می‌شود
  // تأیید ذخیره
  const check = getPropConfig();
  if (!check || String(check.phase) !== '2') {
    savePropConfig({ ...(check || cfg), phase: '2' });
  }

  appMode = 'prop';
  if (currentUser) loadTradesForUser(currentUser.username);
  const phaseSel = document.getElementById('prop-phase');
  if (phaseSel) phaseSel.value = '2';
  showToast('مرحله ۱ پاس شد — الان مرحله ۲ هستید', 'success');
  // مدال فقط بعد از پاس مرحله ۲
  renderProp();
  renderPropHistory();
  renderPropArchive();
  updatePhaseButtons();
}

function passPhase2() {
  let cfg = getPropConfig() || {};
  let phase = String(cfg.phase || '1');
  // اگر مرحله ۱ پاس شده ولی phase درست ذخیره نشده
  if (phase !== '2' && cfg.phase1PassedAt && phase !== 'funded') {
    cfg.phase = '2';
    savePropConfig(cfg);
    phase = '2';
  }
  if (phase !== '2') {
    showToast('الان در مرحله ۲ نیستید (مرحله فعلی: ' + phase + ')', 'error');
    updatePhaseButtons();
    return;
  }
  const rules = propRules(cfg.class, '2');
  const size = cfg.size || 10000;
  const net = trades.reduce((s, t) => s + (t.netPnl != null ? t.netPnl : (t.pnl || 0)), 0);
  const targetUsd = rules.target != null ? size * rules.target : null;
  const days = new Set(trades.map(t => t.date)).size;
  if (days < rules.minDays) {
    showToast('هنوز روزهای معاملاتی کامل نشده (' + days + '/' + rules.minDays + '). تا تکمیل حداقل روز نمی‌توانی فاند شوی.', 'error');
    return;
  }
  if (targetUsd != null && net < targetUsd) {
    showToast('تارگت مرحله ۲ کامل نیست (' + net.toFixed(1) + ' / ' + targetUsd.toFixed(0) + '$)', 'error');
    return;
  }
  if (!confirm('مرحله ۲ پاس و حساب فاند شود؟ معاملات مرحله ۲ ذخیره می‌مانند.')) return;

  const snap = snapshotCurrentProp('funded');
  snap.phase = '2';
  snap.note = 'پاس مرحله ۲ / فاند';
  const arch = getPropArchive();
  arch.push(snap);
  savePropArchive(arch);

  cfg.phase = 'funded';
  cfg.failed = false;
  cfg.fundedAt = new Date().toISOString();
  if (!cfg.fundedAccounts) cfg.fundedAccounts = [];
  cfg.fundedAccounts.push({
    id: Date.now().toString(36),
    size: 100,
    label: 'اکانت فاند ۱۰۰$',
    createdAt: new Date().toISOString()
  });
  savePropConfig(cfg);
  localStorage.setItem('tj_prop_medal', '1');
  updatePropMedal();
  appMode = 'prop';
  loadTradesForUser(currentUser.username);
  try { document.getElementById('prop-phase').value = 'funded'; } catch(e) {}
  showToast('مرحله ۲ پاس شد — پراپ فاند + مدال 🏅', 'success');
  renderProp();
  renderPropHistory();
  renderPropArchive();
}

function advancePropPhase() {
  const cfg = getPropConfig() || {};
  const phase = cfg.phase || '1';
  if (phase === '1') passPhase1();
  else if (phase === '2') passPhase2();
  else showToast('قبلاً فاند شده‌اید', 'success');
}

function passCurrentStage() {
  advancePropPhase();
}

function updatePhaseButtons() {
  const cfg = getPropConfig() || {};
  let phase = String(cfg.phase || '1');
  if (cfg.phase1PassedAt && phase === '1') {
    // اصلاح ناهماهنگی: مرحله ۱ پاس شده ولی phase هنوز 1
    phase = '2';
    cfg.phase = '2';
    savePropConfig(cfg);
  }

  const badge = document.getElementById('prop-journal-badge');
  if (badge) badge.textContent = phase === 'funded' ? 'فاند' : ('مرحله ' + phase);

  const phaseSel = document.getElementById('prop-phase');
  if (phaseSel && phaseSel.value !== phase) phaseSel.value = phase;

  const b1 = document.getElementById('btn-pass-phase1');
  const b2 = document.getElementById('btn-pass-phase2');
  const bf = document.getElementById('btn-pass-funded');
  const hint = document.getElementById('phase-trades-hint');

  const show = (el, on) => {
    if (!el) return;
    el.classList.toggle('hidden', !on);
    el.style.display = on ? '' : 'none';
    el.disabled = !on;
  };
  show(b1, phase === '1');
  show(b2, phase === '2');
  show(bf, phase === 'funded');

  const daysNow = new Set(trades.map(t => t.date)).size;
  const rulesNow = propRules(cfg.class || 'A', phase === 'funded' ? '2' : phase);
  const daysOk = daysNow >= (rulesNow.minDays || 0);

  if (b1 && phase === '1') {
    b1.disabled = !daysOk;
    b1.title = daysOk ? 'پاس مرحله ۱' : ('حداقل ' + rulesNow.minDays + ' روز معاملاتی لازم است (' + daysNow + '/' + rulesNow.minDays + ')');
  }
  if (b2 && phase === '2') {
    b2.disabled = !daysOk;
    b2.title = daysOk ? 'پاس مرحله ۲' : ('حداقل ' + rulesNow.minDays + ' روز معاملاتی لازم است (' + daysNow + '/' + rulesNow.minDays + ')');
  }

  if (hint) {
    if (phase === '1') {
      hint.textContent = 'مرحله ۱ — ' + trades.length + ' معامله · روز معاملاتی: ' + daysNow + '/' + rulesNow.minDays +
        (daysOk ? ' ✓ آماده پاس' : ' — تا تکمیل روزها نمی‌توانی مرحله بعد بروی');
    } else if (phase === '2') {
      const n1 = currentUser ? loadPropPhaseTrades(currentUser.username, '1').length : 0;
      hint.textContent = 'مرحله ۲ — ' + trades.length + ' معامله · روز: ' + daysNow + '/' + rulesNow.minDays +
        ' (مرحله ۱ ذخیره‌شده: ' + n1 + ' معامله)' + (daysOk ? ' ✓' : ' — روزها کامل نیست');
    } else {
      hint.textContent = 'فاند — «برداشت از حساب» برای بستن کامل پراپ.';
    }
  }
}

function closePropAfterWithdraw() {
  const amount = parseFloat(document.getElementById('withdraw-amount')?.value) || 0;
  const refund = parseFloat(document.getElementById('refund-amount')?.value) || 0;
  const other = parseFloat(document.getElementById('other-amount')?.value) || 0;
  const note = document.getElementById('withdraw-note')?.value || '';
  if (!amount && !refund) {
    if (!confirm('مبلغ برداشت وارد نشده. باز هم این پراپ بسته و در «پاس‌شده» ذخیره شود؟')) return;
  } else {
    const items = getWithdrawals();
    items.push({
      id: Date.now().toString(36),
      amount, refund, other, note: note || 'برداشت نهایی',
      date: new Date().toISOString().slice(0, 10),
      closing: true
    });
    saveWithdrawals(items);
  }

  const snap = snapshotCurrentProp('funded');
  snap.status = 'funded';
  snap.note = note || 'برداشت و بستن پراپ';
  snap.withdrawAmount = amount;
  snap.refund = refund;
  snap.other = other;
  snap.closed = true;
  snap.end = new Date().toISOString().slice(0, 10);
  const arch = getPropArchive();
  arch.push(snap);
  savePropArchive(arch);
  localStorage.setItem('tj_prop_medal', '1');
  updatePropMedal();

  // شروع پراپ جدید از صفر
  resetPropFromScratch();
  try {
    const phaseSel = document.getElementById('prop-phase');
    if (phaseSel) phaseSel.value = '1';
  } catch (e) {}

  showToast('در «پراپ‌های پاس‌شده» ذخیره شد — می‌توانی پراپ جدید شروع کنی', 'success');
  ['withdraw-amount','refund-amount','other-amount','withdraw-note'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = id === 'withdraw-note' ? '' : (id.includes('amount') && id !== 'withdraw-amount' ? '0' : '');
  });
  renderProp();
  renderPropHistory();
  renderPropArchive();
  renderWithdrawals();
  // اسکرول به لیست پاس‌شده
  setTimeout(() => {
    document.getElementById('prop-passed-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 200);
}


function failPropAccount() {
  if (!confirm('این اکانت فیل شود؟ بعد از تأیید، در لیست فیل‌شده‌ها ذخیره می‌شود و چالش از اول شروع می‌شود.')) return;
  const snap = snapshotCurrentProp('failed');
  const arch = getPropArchive();
  arch.push(snap);
  savePropArchive(arch);
  resetPropFromScratch();
  showToast('فیل شد — چالش از اول شروع شد', 'error');
  renderProp();
  renderPropHistory();
  renderPropArchive();
}

document.getElementById('btn-prop-fail')?.addEventListener('click', failPropAccount);

document.getElementById('btn-prop-pass')?.addEventListener('click', passCurrentStage);

function getWithdrawals() {
  const key = currentUser ? 'tj_withdraw_' + currentUser.username : 'tj_withdraw';
  return JSON.parse(localStorage.getItem(key) || '[]');
}
function saveWithdrawals(list) {
  const key = currentUser ? 'tj_withdraw_' + currentUser.username : 'tj_withdraw';
  localStorage.setItem(key, JSON.stringify(list));
}
function renderWithdrawals() {
  const list = document.getElementById('withdraw-list');
  if (!list) return;
  const items = getWithdrawals();
  if (!items.length) {
    list.innerHTML = '<div class="empty-state"><p>برداشتی ثبت نشده</p></div>';
    return;
  }
  list.innerHTML = items.slice().reverse().map(w => `
    <div class="prop-archive-card passed">
      <div>
        <div><strong>برداشت ${w.amount}$</strong> · ریفاند ${w.refund}$ · سایر ${w.other}$</div>
        <div class="meta">${w.date} · ${w.note || ''} · خالص: ${((w.amount||0)+(w.refund||0)-(w.other||0)).toFixed(1)}$</div>
      </div>
      <span class="badge">ثبت شد</span>
    </div>`).join('');
}
document.getElementById('btn-record-withdraw')?.addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('withdraw-amount')?.value) || 0;
  const refund = parseFloat(document.getElementById('refund-amount')?.value) || 0;
  const other = parseFloat(document.getElementById('other-amount')?.value) || 0;
  const note = document.getElementById('withdraw-note')?.value || '';
  if (!amount && !refund) {
    showToast('مبلغ برداشت یا ریفاند را وارد کنید', 'error');
    return;
  }
  const items = getWithdrawals();
  items.push({
    id: Date.now().toString(36),
    amount, refund, other, note,
    date: new Date().toISOString().slice(0, 10)
  });
  saveWithdrawals(items);
  renderWithdrawals();
  if (confirm('برداشت ثبت شد. این پراپ بسته شود و در «پراپ‌های پاس‌شده» ذخیره گردد تا پراپ جدید شروع کنی؟')) {
    closePropAfterWithdraw();
  } else {
    showToast('برداشت ثبت شد (پراپ هنوز باز است)', 'success');
  }
});

function updatePropMedal() {
  const medal = document.getElementById('prop-medal');
  if (!medal) return;
  // فقط وقتی مرحله ۱ و ۲ هر دو پاس شده (فاند)
  const arch = getPropArchive();
  const hasFunded = localStorage.getItem('tj_prop_medal') === '1' ||
    arch.some(x => x.status === 'funded' || x.closed === true);
  if (hasFunded) {
    medal.classList.remove('hidden');
    medal.style.display = '';
    medal.title = 'شما پراپ را کامل پاس کردید (مرحله ۱ و ۲)';
  } else {
    medal.classList.add('hidden');
    medal.style.display = 'none';
  }
}

document.getElementById('btn-prop-next')?.addEventListener('click', advancePropPhase);
document.getElementById('btn-prop-next-2')?.addEventListener('click', advancePropPhase);


function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = 'toast ' + type;
  toast.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.add('hidden'), 2800);
}
function renderAll() {
  renderSummary();
  renderHistory();
  updateTraderMood();
  drawEquityCurve();
}

// PWA
if ('serviceWorker' in navigator) {
  const reg = () => navigator.serviceWorker.register('./sw.js').catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(reg, { timeout: 3000 });
  else window.addEventListener('load', () => setTimeout(reg, 1500));
}

// Install prompt
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!window.matchMedia('(display-mode: standalone)').matches) {
    if (!sessionStorage.getItem('installDismissed')) {
      document.getElementById('install-banner')?.classList.remove('hidden');
    }
  }
});
document.getElementById('btn-install')?.addEventListener('click', async () => {
  if (!deferredPrompt) {
    showToast('از منوی مرورگر «نصب برنامه» را بزنید', 'success');
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('install-banner')?.classList.add('hidden');
});
document.getElementById('btn-install-close')?.addEventListener('click', () => {
  document.getElementById('install-banner')?.classList.add('hidden');
  sessionStorage.setItem('installDismissed', '1');
});


// ========== i18n ==========
const I18N = {
  fa: {
    enter_app: 'ورود به برنامه', splash_sub: 'ژورنال · پراپ', mode_start: 'از کجا شروع می‌کنی؟',
    mode_journal: 'ژورنال ترید', mode_journal_sub: 'ثبت معاملات، برایند، نمودار زنده',
    mode_prop: 'سرمایه‌گذار برتر', mode_prop_sub: 'پراپ SGB و مدیریت چالش',
    mode_planner: 'برنامه‌ریز', mode_planner_sub: 'کارها، ورزش، خواب، کتاب، تقویم',
    mode_finance: 'مدیریت مالی', mode_finance_sub: 'درآمد، هزینه و مانده',
    ws_journal: 'ژورنال', ws_prop: 'پراپ', ws_planner: 'برنامه‌ریز', ws_finance: 'مالی',
    tab_new: 'معامله', tab_summary: 'برایند', tab_history: 'تاریخچه', tab_chart: 'نمودار',
    weekly_summary: 'برایند هفتگی', all_trades: 'همه معاملات', clear_all: 'پاک کردن همه',
    chart_prices: 'نمودار و قیمت لحظه‌ای',
    account_balance: 'موجودی حساب', balance_sub: 'مانده واقعی بعد از درآمدها و هزینه‌ها',
    add_tx: 'ثبت تراکنش', add_tx_sub: 'درآمد یا هزینه جدید', tx_list: 'لیست تراکنش‌ها',
    prop_journal: 'ژورنال پراپ', prop_journal_sub: 'جدا از ژورنال اصلی',
    prop_weekly: 'آنالیز هفتگی ژورنال پراپ', prop_title: 'پراپ سرمایه‌گذار برتر',
    challenge_now: 'چالش فعلی', passed_failed: 'پاس‌شده / فیل‌شده',
    label_symbol: 'نماد', label_date: 'تاریخ', label_entry: 'نقطه ورود', label_lot: 'حجم (لات)',
    label_sl: 'حد ضرر (SL)', label_tp: 'حد سود (TP)', label_commission: 'کمیسیون',
    label_result: 'نتیجه', label_pnl: 'سود / ضرر ($)', label_reason: 'دلیل ورود', label_notes: 'یادداشت',
    label_amount: 'مبلغ (تومان)', label_bank: 'نام بانک', label_note: 'توضیح', label_type: 'نوع',
    label_date_jalali: 'تاریخ (شمسی)',
    income: 'درآمد', expense: 'هزینه', save_trade: 'ثبت معامله',
    growth: 'رشد حساب', winrate: 'نرخ برد', net_pnl: 'سود خالص', best_trade: 'بهترین معامله',
    trade_count: 'تعداد معاملات', storage_full: 'فضای ذخیره محدود شد',
    lang_switched: 'زبان: فارسی',
    lang_menu_title: 'زبان',
    dir_long: 'لانگ', dir_short: 'شورت',
    res_tp: 'تی‌پی', res_sl: 'استاپ', res_be: 'سر به سر', res_manual: 'دستی', res_rf: 'ریسک‌فری',
  },
  en: {
    enter_app: 'Enter App', splash_sub: 'Journal · Prop', mode_start: 'Where do you start?',
    mode_journal: 'Trade Journal', mode_journal_sub: 'Log trades, P&L, live chart',
    mode_prop: 'SGB Prop', mode_prop_sub: 'Prop challenge management',
    mode_planner: 'Planner', mode_planner_sub: 'Tasks, sport, sleep, books, calendar',
    mode_finance: 'Finance', mode_finance_sub: 'Income, expenses and balance',
    ws_journal: 'Journal', ws_prop: 'Prop', ws_planner: 'Planner', ws_finance: 'Finance',
    tab_new: 'Trade', tab_summary: 'Summary', tab_history: 'History', tab_chart: 'Chart',
    weekly_summary: 'Weekly summary', all_trades: 'All trades', clear_all: 'Clear all',
    chart_prices: 'Chart & live prices',
    account_balance: 'Account balance', balance_sub: 'Real balance after income & expenses',
    add_tx: 'Add transaction', add_tx_sub: 'New income or expense', tx_list: 'Transactions',
    prop_journal: 'Prop journal', prop_journal_sub: 'Separate from main journal',
    prop_weekly: 'Prop weekly analysis', prop_title: 'SGB Prop',
    challenge_now: 'Current challenge', passed_failed: 'Passed / Failed',
    label_symbol: 'Symbol', label_date: 'Date', label_entry: 'Entry', label_lot: 'Lot size',
    label_sl: 'Stop Loss', label_tp: 'Take Profit', label_commission: 'Commission',
    label_result: 'Result', label_pnl: 'P&L ($)', label_reason: 'Entry reason', label_notes: 'Notes',
    label_amount: 'Amount (Toman)', label_bank: 'Bank name', label_note: 'Note', label_type: 'Type',
    label_date_jalali: 'Date (Jalali)',
    income: 'Income', expense: 'Expense', save_trade: 'Save trade',
    growth: 'Account growth', winrate: 'Win rate', net_pnl: 'Net P&L', best_trade: 'Best trade',
    trade_count: 'Trades', storage_full: 'Storage full',
    lang_switched: 'Language: English',
    lang_menu_title: 'Language',
    dir_long: 'Long', dir_short: 'Short',
    res_tp: 'TP', res_sl: 'SL', res_be: 'BE', res_manual: 'Manual', res_rf: 'Risk-free',
  }
};
let currentLang = 'fa';
localStorage.setItem('tj_lang', 'fa');

function langText(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || (I18N.fa && I18N.fa[key]) || key;
}

function applyLanguage(lang) {
  currentLang = lang === 'en' ? 'en' : 'fa';
  localStorage.setItem('tj_lang', currentLang);
  const root = document.documentElement;
  root.lang = currentLang;
  root.dir = currentLang === 'fa' ? 'rtl' : 'ltr';
  root.setAttribute('data-lang', currentLang);
  document.body && document.body.setAttribute('data-lang', currentLang);

  // All data-i18n nodes
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = langText(key);
    if (!val) return;
    // keep child structure if only text
    if (el.children.length === 0) el.textContent = val;
    else {
      // update last text-like preference: set textContent only for pure text buttons
      const span = el.querySelector('span:last-child');
      if (span && el.classList.contains('tab')) span.textContent = val;
      else if (el.tagName === 'BUTTON' || el.tagName === 'LABEL' || el.tagName === 'H2' || el.tagName === 'H3' || el.tagName === 'STRONG') {
        // if button has only text + svg, update text nodes
        let done = false;
        el.childNodes.forEach(n => {
          if (n.nodeType === 3 && n.textContent.trim()) {
            n.textContent = val;
            done = true;
          }
        });
        if (!done) {
          const s = el.querySelector('span');
          if (s) s.textContent = val;
          else el.textContent = val;
        }
      } else {
        el.textContent = val;
      }
    }
  });

  // placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const val = langText(el.getAttribute('data-i18n-placeholder'));
    if (val) el.setAttribute('placeholder', val);
  });

  // Tabs (fallback)
  const tabMap = { new: 'tab_new', summary: 'tab_summary', history: 'tab_history', chart: 'tab_chart' };
  document.querySelectorAll('.tab').forEach(t => {
    const sp = t.querySelector('span');
    const key = tabMap[t.dataset.tab];
    if (sp && key) sp.textContent = langText(key);
  });

  // Direction / result buttons common
  document.querySelectorAll('.dir-btn.long, .prop-dir-btn.long').forEach(b => {
    const s = b.querySelector('span') || b;
    if (b.querySelector('span')) b.querySelector('span').textContent = langText('dir_long');
  });
  document.querySelectorAll('.dir-btn.short, .prop-dir-btn.short').forEach(b => {
    if (b.querySelector('span')) b.querySelector('span').textContent = langText('dir_short');
  });

  // Finance type buttons
  document.querySelectorAll('.fin-type-btn.income').forEach(b => { b.textContent = langText('income'); });
  document.querySelectorAll('.fin-type-btn.expense').forEach(b => { b.textContent = langText('expense'); });

  // Summary stat labels
  const statPairs = [
    ['#stat-growth', 'growth'],
    ['#stat-count', 'trade_count'],
    ['#stat-winrate', 'winrate'],
    ['#stat-pnl', 'net_pnl'],
    ['#stat-best', 'best_trade']
  ];
  statPairs.forEach(([sel, key]) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const label = el.parentElement?.querySelector('.stat-label');
    if (label) label.textContent = langText(key);
  });

  // Submit buttons
  document.querySelectorAll('#trade-form .btn-primary span, #prop-trade-form .btn-primary span').forEach(s => {
    s.textContent = langText('save_trade');
  });
  const finAdd = document.getElementById('fin-add');
  if (finAdd) finAdd.textContent = langText('add_tx');

  document.querySelectorAll('.lang-icon-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === currentLang);
  });
  const tog = document.getElementById('lang-toggle-icon');
  if (tog) tog.textContent = currentLang === 'fa' ? 'FA' : 'EN';

  // Layout-safe: force LTR numeric inputs remain LTR
  document.querySelectorAll('input[type="number"], input[inputmode="numeric"]').forEach(inp => {
    inp.style.direction = 'ltr';
    inp.style.textAlign = currentLang === 'fa' ? 'right' : 'left';
  });
  if (currentLang === 'en') deepTranslateDom(document.body);
}


// Deep English pass: translate remaining Persian UI strings
const FA_EN_MAP = {
  'سلام تریدر عزیز': 'Hello trader',
  'معامله جدید': 'New trade',
  'برایند': 'Summary',
  'تاریخچه': 'History',
  'نمودار': 'Chart',
  'پراپ': 'Prop',
  'برنامه‌ریز': 'Planner',
  'مالی': 'Finance',
  'ژورنال': 'Journal',
  'ذخیره': 'Save',
  'حذف': 'Delete',
  'ویرایش': 'Edit',
  'بستن': 'Close',
  'بعدی': 'Next',
  'قبلی': 'Previous',
  'امروز': 'Today',
  'هفته': 'Week',
  'ماه': 'Month',
  'سال': 'Year',
  'روز': 'Day',
  'ساعت': 'Hour',
  'دقیقه': 'Minute',
  'انصراف': 'Cancel',
  'تأیید': 'Confirm',
  'تایید': 'Confirm',
  'مرحله': 'Phase',
  'فاند': 'Funded',
  'پاس شده': 'Passed',
  'فیل شده': 'Failed',
  'فیل‌شده': 'Failed',
  'پاس‌شده': 'Passed',
  'حداقل روز': 'Min days',
  'تارگت': 'Target',
  'دراودان': 'Drawdown',
  'پیشرفت تارگت': 'Target progress',
  'فاصله تا تارگت': 'To target',
  'روز معاملاتی': 'Trading days',
  'قوانین': 'Rules',
  'انتخاب پلن و سایز': 'Plan & size',
  'نوع پلن': 'Plan type',
  'مقدار پراپ تهیه‌شده ($)': 'Prop size ($)',
  'پلن A': 'Plan A',
  'پلن B': 'Plan B',
  'عکس‌های معامله (تا ۳ عکس — اختیاری)': 'Trade photos (up to 3, optional)',
  'عکس ۱': 'Photo 1',
  'عکس ۲': 'Photo 2',
  'عکس ۳': 'Photo 3',
  'تی‌پی شد': 'Take profit',
  'استاپ شد': 'Stopped out',
  'سر به سر': 'Break even',
  'بستن دستی': 'Manual close',
  'ریسک‌فری': 'Risk free',
  'لانگ': 'Long',
  'شورت': 'Short',
  'سود/ضرر خالص': 'Net P&L',
  'بهترین معامله': 'Best trade',
  'تعداد معاملات': 'Trades',
  'نرخ برد': 'Win rate',
  'پیشرفت تارگت': 'Target progress',
  'کتاب‌های تمام‌شده': 'Finished books',
  'کتاب‌خوان': 'Reading',
  'خواب و بازیابی': 'Sleep & recovery',
  'ورزش روزانه': 'Daily sport',
  'تقویم': 'Calendar',
  'رویدادها': 'Events',
  'چک‌لیست': 'Checklist',
  'برنامه روزانه': 'Daily plan',
  'موجودی': 'Balance',
  'کل درآمد': 'Total income',
  'کل هزینه': 'Total expense',
  'این ماه': 'This month',
  'درآمد این ماه': 'Income this month',
  'هزینه این ماه': 'Expense this month',
  'تعداد تراکنش': 'Transactions',
  'میانگین هزینه': 'Avg expense',
  'چارت کندلی روند مالی': 'Finance candlestick chart',
  'محور: تومان · گام ۱ میلیون تا ۱۰ میلیون · واریز سبز / هزینه قرمز': 'Toman axis · deposits green / expenses red',
  'کندل مثبت (واریز / رشد مانده)': 'Green candle (deposit / growth)',
  'کندل منفی (هزینه / افت مانده)': 'Red candle (expense / drop)',
  'پرافیت فکتور': 'Profit factor',
  'وین‌ریت هفته': 'Weekly win rate',
  'سود / ضرر هفته': 'Weekly P&L',
  'نمادها · وین‌ریت و سود': 'Symbols · win rate & P&L',
  'لانگ / شورت': 'Long / Short',
  'گراف سود هفتگی ($)': 'Weekly equity ($)',
  'مرحله ۱': 'Phase 1',
  'مرحله ۲': 'Phase 2',
  'برداشت از حساب': 'Withdraw',
  'پاس مرحله ۱': 'Pass phase 1',
  'پاس مرحله ۲': 'Pass phase 2',
};
function deepTranslateDom(root) {
  if (currentLang !== 'en') return;
  const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    let t = node.nodeValue;
    if (!t || !t.trim()) return;
    // skip scripty
    const p = node.parentElement;
    if (!p || ['SCRIPT','STYLE','TEXTAREA','CODE'].includes(p.tagName)) return;
    let out = t;
    Object.keys(FA_EN_MAP).forEach(fa => {
      if (out.includes(fa)) out = out.split(fa).join(FA_EN_MAP[fa]);
    });
    if (out !== t) node.nodeValue = out;
  });
  // placeholders
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
    let ph = el.getAttribute('placeholder') || '';
    Object.keys(FA_EN_MAP).forEach(fa => {
      if (ph.includes(fa)) ph = ph.split(fa).join(FA_EN_MAP[fa]);
    });
    // common placeholders
    ph = ph.replace('مثلاً', 'e.g.').replace('اختیاری', 'optional');
    el.setAttribute('placeholder', ph);
  });
}


document.getElementById('current-user-badge')?.addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('user-menu')?.classList.toggle('hidden');
});
document.querySelectorAll('.user-menu-item, .lang-icon-btn').forEach(item => {
  item.addEventListener('click', () => {
    if (!item.dataset.lang) return;
    applyLanguage(item.dataset.lang);
    document.getElementById('user-menu')?.classList.add('hidden');
    showToast(langText('lang_switched'), 'success');
    try { if (typeof renderFinance === 'function') renderFinance(); } catch(e) {}
    try { if (typeof renderProp === 'function' && appMode==='prop') renderProp(); } catch(e) {}
  });
});
// Language toggle removed — app is Persian-only
document.addEventListener('click', () => {
  document.getElementById('user-menu')?.classList.add('hidden');
});

// Motivational quotes
const QUOTES_FA = [
  'صبر، سلاح پنهان تریدرهای بزرگ است.',
  'ریسک را مدیریت کن؛ سود خودش می‌آید.',
  'یک معامله خوب بهتر از ده معامله عجولانه است.',
  'ژورنال بنویس تا اشتباهات تکرار نشوند.',
  'امروز فقط یک درصد بهتر از دیروز باش.',
  'بازار همیشه فرصت می‌دهد؛ حساب نه.',
  'انضباط، مرز بین قمار و ترید حرفه‌ای است.'
];
const QUOTES_EN = [
  'Patience is the hidden edge of great traders.',
  'Manage risk; profits follow.',
  'One good trade beats ten rushed ones.',
  'Journal your trades so mistakes do not repeat.',
  'Be just 1% better than yesterday.',
  'The market always offers; your account may not.',
  'Discipline separates gambling from pro trading.'
];

function showMotivational() {
  const el = document.getElementById('motivational-quote');
  if (!el) return;
  const list = currentLang === 'en' ? QUOTES_EN : QUOTES_FA;
  el.textContent = list[Math.floor(Math.random() * list.length)];
  el.classList.remove('hide');
  setTimeout(() => el.classList.add('hide'), 4500);
  setTimeout(() => { el.textContent = ''; }, 5000);
}

/* mode screen hook unified */

// ========== Prop journal form ==========
document.querySelectorAll('.prop-sym-chip').forEach(c => {
  c.addEventListener('click', () => {
    document.getElementById('prop-symbol').value = c.dataset.sym;
  });
});
document.querySelectorAll('.prop-dir-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.prop-dir-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    propDirection = btn.dataset.dir;
  });
});
function updatePropRiskPreview() {
  const entry = parseFloat(document.getElementById('prop-entry')?.value);
  const sl = parseFloat(document.getElementById('prop-sl')?.value);
  const tp = parseFloat(document.getElementById('prop-tp')?.value);
  const lot = parseFloat(document.getElementById('prop-lot')?.value);
  const symbol = (document.getElementById('prop-symbol')?.value || '').trim();
  const elSl = document.getElementById('prop-est-sl');
  const elTp = document.getElementById('prop-est-tp');
  const elRr = document.getElementById('prop-est-rr');
  let risk = null, reward = null;
  if (!isNaN(entry) && !isNaN(sl)) {
    risk = estimateDollarMove(entry, sl, lot, symbol);
    if (elSl) elSl.textContent = risk != null ? ('−' + Math.abs(risk).toFixed(2) + ' $') : '—';
  } else if (elSl) elSl.textContent = '—';
  if (!isNaN(entry) && !isNaN(tp)) {
    reward = estimateDollarMove(entry, tp, lot, symbol);
    if (elTp) elTp.textContent = reward != null ? ('+' + Math.abs(reward).toFixed(2) + ' $') : '—';
  } else if (elTp) elTp.textContent = '—';
  if (risk != null && reward != null && Math.abs(risk) > 0.0001) {
    const rr = Math.abs(reward) / Math.abs(risk);
    if (elRr) elRr.textContent = '1 : ' + rr.toFixed(2);
  } else if (elRr) elRr.textContent = '—';
}

function autoFillPropPnl() {
  updatePropRiskPreview();
  const entry = parseFloat(document.getElementById('prop-entry')?.value);
  const sl = parseFloat(document.getElementById('prop-sl')?.value);
  const tp = parseFloat(document.getElementById('prop-tp')?.value);
  const lot = parseFloat(document.getElementById('prop-lot')?.value);
  const symbol = (document.getElementById('prop-symbol')?.value || '').trim();
  const pnlInput = document.getElementById('prop-pnl');
  const hint = document.getElementById('prop-pnl-hint');
  if (!pnlInput) return;
  if (propResult === 'manual') {
    if (hint) hint.textContent = 'حالت دستی: سود/ضرر را خودت وارد کن';
    return;
  }
  if (propResult === 'rf') {
    if (hint) hint.textContent = 'ریسک‌فری: مقدار سود RF را وارد کن';
    return;
  }
  if (propResult === 'sl' && !isNaN(entry) && !isNaN(sl)) {
    const est = estimateDollarMove(entry, sl, lot, symbol);
    if (est != null) pnlInput.value = (-Math.abs(est)).toFixed(2);
    if (hint) hint.textContent = 'استاپ: ضرر تقریبی از فاصله SL محاسبه شد (قابل ویرایش)';
  } else if (propResult === 'tp' && !isNaN(entry) && !isNaN(tp)) {
    const est = estimateDollarMove(entry, tp, lot, symbol);
    if (est != null) pnlInput.value = Math.abs(est).toFixed(2);
    if (hint) hint.textContent = 'تی‌پی: سود تقریبی از فاصله TP محاسبه شد (قابل ویرایش)';
  } else if (!propResult) {
    if (hint) hint.textContent = 'با انتخاب TP یا SL مقدار سود/ضرر خودکار پر می‌شود';
  }
}

document.querySelectorAll('.prop-res-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.prop-res-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    propResult = btn.dataset.res;
    autoFillPropPnl();
  });
});
['prop-entry','prop-sl','prop-tp','prop-lot','prop-symbol'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => autoFillPropPnl());
  document.getElementById(id)?.addEventListener('change', () => autoFillPropPnl());
});
document.querySelectorAll('.prop-dir-btn').forEach(btn => {
  btn.addEventListener('click', () => setTimeout(autoFillPropPnl, 0));
});
document.querySelectorAll('.prop-sym-chip').forEach(c => {
  c.addEventListener('click', () => setTimeout(autoFillPropPnl, 0));
});

document.getElementById('prop-trade-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!currentUser) return;
  appMode = 'prop';
  loadTradesForUser(currentUser.username);
  const symbol = document.getElementById('prop-symbol').value.trim().toUpperCase();
  const entry = parseFloat(document.getElementById('prop-entry').value);
  const lot = parseFloat(document.getElementById('prop-lot').value) || null;
  const sl = parseFloat(document.getElementById('prop-sl').value) || null;
  const tp = parseFloat(document.getElementById('prop-tp').value) || null;
  let pnl = parseFloat(document.getElementById('prop-pnl').value) || 0;
  const commission = Math.abs(parseFloat(document.getElementById('prop-commission').value) || 0);
  const date = document.getElementById('prop-trade-date').value;
  if (propResult === 'sl') pnl = -Math.abs(pnl);
  else if (propResult === 'tp' || propResult === 'rf') pnl = Math.abs(pnl);
  if (!symbol || isNaN(entry) || !date) {
    showToast(currentLang === 'fa' ? 'فیلدهای ضروری را پر کنید' : 'Fill required fields', 'error');
    return;
  }
  const reason = (document.getElementById('prop-reason')?.value || '').trim();
  const notes = (document.getElementById('prop-notes')?.value || '').trim();
  const strategyName = (document.getElementById('prop-strategy-select')?.value || '').trim();
  const strategy = strategyName ? [strategyName] : [];
  const phase = getPropPhase();
  const netPnl = pnl - commission;
  appMode = 'prop';
  trades.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    symbol, direction: propDirection, entry, lot, sl, tp,
    result: propResult, pnl, commission, netPnl, date,
    reason, notes, strategy,
    images: collectImages(propImageSlots), image: propImageSlots[0] || null,
    user: currentUser.username, createdAt: new Date().toISOString(),
    prop: true, phase
  });
  saveTrades(); // tj_trades_prop_user_p{phase}
  document.getElementById('prop-trade-form').reset();
  document.getElementById('prop-trade-date').valueAsDate = new Date();
  propResult = null;
  propDirection = 'long';
  clearImageSlots('prop-image-slots', propImageSlots);
  document.querySelectorAll('.prop-res-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.prop-dir-btn').forEach(b => b.classList.toggle('active', b.dataset.dir === 'long'));
  if (typeof renderStrategySelect === 'function') {
    renderStrategySelect();
    renderPropStrategySelect();
  }
  showToast('در ژورنال پراپ (مرحله ' + phase + ') ثبت شد', 'success');
  renderProp();
  renderPropHistory();
  if (typeof renderPropInvestorPanel === 'function') renderPropInvestorPanel();
});

function renderPropHistory() {
  const list = document.getElementById('prop-history-list');
  if (!list) return;
  const phase = getPropPhase();
  if (!trades.length) {
    list.innerHTML = '<div class="empty-state"><p>' + (currentLang === 'fa' ? 'معامله‌ای در این مرحله نیست' : 'No trades') + '</p></div>';
  } else {
    list.innerHTML = trades.map(t => tradeCardHTML(t)).join('');
    bindTradeCards(list);
  }
  // نمایش معاملات مرحله قبل (ذخیره‌شده)
  const wrap = document.getElementById('prop-prev-phase-wrap');
  const prevList = document.getElementById('prop-prev-phase-list');
  const prevTitle = document.getElementById('prop-prev-phase-title');
  if (wrap && prevList && currentUser) {
    if (phase === '2' || phase === 'funded') {
      const p1 = loadPropPhaseTrades(currentUser.username, '1');
      if (p1.length) {
        wrap.classList.remove('hidden');
        if (prevTitle) prevTitle.textContent = 'مرحله ۱ (ذخیره‌شده — ' + p1.length + ' معامله)';
        prevList.innerHTML = p1.map(t => tradeCardHTML(t)).join('');
        bindTradeCards(prevList);
      } else {
        wrap.classList.add('hidden');
        prevList.innerHTML = '';
      }
      if (phase === 'funded') {
        const p2 = loadPropPhaseTrades(currentUser.username, '2');
        if (p2.length) {
          // اگر فقط p1 نشان داده شده، p2 را هم اضافه نکن در همان لیست اصلی trades فاند است
        }
      }
    } else {
      wrap.classList.add('hidden');
      prevList.innerHTML = '';
    }
  }
}

// init date for prop form
document.getElementById('prop-trade-date') && (document.getElementById('prop-trade-date').valueAsDate = new Date());
applyLanguage('fa');
// زبان فقط فارسی — دکمه تغییر زبان غیرفعال
document.getElementById('lang-toggle-btn')?.remove();
document.querySelector('.lang-quick-wrap')?.remove();
document.querySelectorAll('.lang-icon-btn, .lang-menu-title, .lang-icon-row').forEach(el => {
  try { el.remove(); } catch (e) {}
});



function drawPropEquity() {
  const canvas = document.getElementById('prop-equity-canvas');
  const empty = document.getElementById('prop-equity-empty');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 400;
  const h = 180;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!trades || trades.length < 1) {
    if (empty) empty.style.display = 'block';
    canvas.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';
  canvas.style.display = 'block';
  const sorted = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
  let equity = 0;
  const points = [0];
  sorted.forEach(t => {
    equity += (t.netPnl != null ? t.netPnl : (t.pnl || 0));
    points.push(equity);
  });
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = 16;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;
  const zeroY = pad + plotH - ((0 - min) / range) * plotH;
  ctx.strokeStyle = 'rgba(148,163,184,0.3)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad, zeroY);
  ctx.lineTo(w - pad, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = pad + (i / (points.length - 1 || 1)) * plotW;
    const y = pad + plotH - ((p - min) / range) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  const lastX = pad + plotW;
  const lastY = pad + plotH - ((points[points.length - 1] - min) / range) * plotH;
  ctx.lineTo(lastX, h - pad);
  ctx.lineTo(pad, h - pad);
  ctx.closePath();
  const final = points[points.length - 1];
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  if (final >= 0) {
    grad.addColorStop(0, 'rgba(34,197,94,0.25)');
    grad.addColorStop(1, 'rgba(34,197,94,0)');
  } else {
    grad.addColorStop(0, 'rgba(244,63,94,0.25)');
    grad.addColorStop(1, 'rgba(244,63,94,0)');
  }
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = pad + (i / (points.length - 1 || 1)) * plotW;
    const y = pad + plotH - ((p - min) / range) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = final >= 0 ? '#22c55e' : '#f43f5e';
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

document.getElementById('btn-pass-phase1')?.addEventListener('click', passPhase1);
document.getElementById('btn-pass-phase2')?.addEventListener('click', passPhase2);
document.getElementById('btn-pass-funded')?.addEventListener('click', () => {
  // اسکرول به پنل برداشت یا بستن مستقیم
  const panel = document.getElementById('funded-panel');
  if (panel) {
    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const amt = document.getElementById('withdraw-amount');
  if (amt) amt.focus();
  showToast('مبلغ برداشت را وارد کن و «بستن کامل این پراپ» را بزن', 'success');
});
document.getElementById('btn-close-prop')?.addEventListener('click', closePropAfterWithdraw);



// Workspace switcher (ژورنال / پراپ / بازی)
document.getElementById('workspace-switch')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.ws-btn');
  if (!btn) return;
  const ws = btn.dataset.ws;
  if (ws === 'prop') openApp('prop');
  else if (ws === 'games') openApp('games');
  else openApp('journal');
});


// Prop subtabs + plan buttons
document.querySelector('.prop-subtabs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.prop-subtab');
  if (!btn) return;
  document.querySelectorAll('.prop-subtab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const ps = btn.dataset.ps;
  document.getElementById('prop-sub-challenge')?.classList.toggle('hidden', ps !== 'challenge');
  document.getElementById('prop-sub-archive')?.classList.toggle('hidden', ps !== 'archive');
  if (ps === 'archive') renderPropArchive();
});

document.querySelectorAll('.plan-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.plan-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const sel = document.getElementById('prop-class');
    if (sel) sel.value = btn.dataset.plan;
    if (typeof updatePropPlanPreview === 'function') updatePropPlanPreview();
    document.querySelectorAll('.plan-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.plan === (cfg.class || 'A'));
    });
  });
});

// sync plan buttons when renderProp sets class
const _origUpdatePhase = typeof updatePhaseButtons === 'function' ? updatePhaseButtons : null;


// ========== Prop image ==========


// ========== Jalali (Shamsi) calendar ==========
function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0,31,59,90,120,151,181,212,243,273,304,334];
  let jy;
  if (gy > 1600) { jy = 979; gy -= 1600; } else { jy = 0; gy -= 621; }
  const gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
  return { jy, jm, jd };
}
function jalaliToGregorian(jy, jm, jd) {
  let gy;
  if (jy > 979) { gy = 1600; jy -= 979; } else { gy = 621; }
  let days = (365 * jy) + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30 + 186));
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [0,31,((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
  let gm;
  for (gm = 1; gm <= 12 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return { gy, gm, gd };
}
function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // esfand
  const { gy, gm, gd } = jalaliToGregorian(jy + 1, 1, 1);
  const prev = new Date(gy, gm - 1, gd);
  prev.setDate(prev.getDate() - 1);
  const j = gregorianToJalali(prev.getFullYear(), prev.getMonth() + 1, prev.getDate());
  return j.jd;
}
const JALALI_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const JALALI_WEEKDAYS = ['ش','ی','د','س','چ','پ','ج']; // شنبه اول

function toGKey(jy, jm, jd) {
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
  return gy + '-' + String(gm).padStart(2,'0') + '-' + String(gd).padStart(2,'0');
}
function gKeyToJalaliStr(gKey) {
  if (!gKey) return '';
  const [y,m,d] = gKey.split('-').map(Number);
  const j = gregorianToJalali(y, m, d);
  return j.jy + '/' + String(j.jm).padStart(2,'0') + '/' + String(j.jd).padStart(2,'0');
}
function formatJalaliDateTime(isoOrLocal) {
  const dt = new Date(isoOrLocal);
  if (isNaN(dt.getTime())) return String(isoOrLocal);
  const j = gregorianToJalali(dt.getFullYear(), dt.getMonth()+1, dt.getDate());
  const t = pad2(dt.getHours()) + ':' + pad2(dt.getMinutes());
  return j.jy + '/' + String(j.jm).padStart(2,'0') + '/' + String(j.jd).padStart(2,'0') + ' ' + t;
}

// Shamsi calendar state
let calJy, calJm;
(function initCalJalali() {
  const n = new Date();
  const j = gregorianToJalali(n.getFullYear(), n.getMonth()+1, n.getDate());
  calJy = j.jy;
  calJm = j.jm;
})();

// ========== Planner ==========
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-11

function plannerKey(dateStr) {
  return 'tj_planner_' + (currentUser?.username || 'trader') + '_' + dateStr;
}
function getPlannerDay(dateStr) {
  try { return JSON.parse(localStorage.getItem(plannerKey(dateStr)) || 'null') || emptyPlannerDay(); }
  catch (e) { return emptyPlannerDay(); }
}
function emptyPlannerDay() {
  return { goals:'', plan:'', todos:[], sports:[], habits:[], sleepBed:'', sleepWake:'' };
}
function savePlannerDay(dateStr, data) {
  localStorage.setItem(plannerKey(dateStr), JSON.stringify(data));
}
function eventsKey() { return 'tj_events_' + (currentUser?.username || 'trader'); }
function getEvents() {
  try { return JSON.parse(localStorage.getItem(eventsKey()) || '[]'); } catch(e) { return []; }
}
function saveEvents(list) { localStorage.setItem(eventsKey(), JSON.stringify(list)); }
function booksKey() { return 'tj_books_' + (currentUser?.username || 'trader'); }
function booksLibKey() { return 'tj_books_lib_' + (currentUser?.username || 'trader'); }
function getBooksLib() {
  try { return JSON.parse(localStorage.getItem(booksLibKey()) || '[]'); } catch(e) { return []; }
}
function saveBooksLib(list) { localStorage.setItem(booksLibKey(), JSON.stringify(list)); }
function bookId() {
  return 'b_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function getBook() {
  try {
    const cur = JSON.parse(localStorage.getItem(booksKey()) || 'null');
    // فقط کتاب فعال و ناتمام
    if (cur && !cur.finished) return cur;
    const lib = getBooksLib();
    const active = lib.find(b => b.active && !b.finished);
    if (active) {
      localStorage.setItem(booksKey(), JSON.stringify(active));
      return active;
    }
    return null;
  } catch(e) { return null; }
}
function saveBook(b) {
  if (!b.id) b.id = bookId();
  if (b.finished) b.active = false;
  else b.active = true;
  // به‌روزرسانی کتابخانه بر اساس id (نه فقط عنوان)
  let lib = getBooksLib();
  let idx = lib.findIndex(x => x.id && b.id && x.id === b.id);
  if (idx < 0) idx = lib.findIndex(x => x.title === b.title && !x.finished);
  // غیرفعال کردن بقیه کتاب‌های ناتمام
  lib = lib.map(x => ({ ...x, active: false }));
  const entry = {
    id: b.id,
    title: b.title,
    total: b.total,
    logs: Array.isArray(b.logs) ? b.logs : [],
    finished: !!b.finished,
    finishedAt: b.finishedAt || null,
    active: !b.finished
  };
  if (idx >= 0) lib[idx] = entry;
  else lib.unshift(entry);
  saveBooksLib(lib);
  if (b.finished) {
    // کتاب تمام‌شده دیگر current نباشد
    localStorage.removeItem(booksKey());
  } else {
    localStorage.setItem(booksKey(), JSON.stringify(entry));
  }
}
function setActiveBook(title) {
  const lib = getBooksLib();
  const b = lib.find(x => x.title === title);
  if (!b) return;
  if (b.finished) {
    showToast('این کتاب تمام شده — فقط در لیست تمام‌شده‌هاست', 'error');
    return;
  }
  // کپی تمیز بدون قاطی‌شدن لاگ
  const clean = {
    id: b.id || bookId(),
    title: b.title,
    total: b.total,
    logs: Array.isArray(b.logs) ? b.logs.slice() : [],
    finished: false,
    active: true
  };
  lib.forEach(x => { x.active = (x.id && clean.id) ? x.id === clean.id : x.title === clean.title; });
  saveBooksLib(lib);
  localStorage.setItem(booksKey(), JSON.stringify(clean));
  renderBookUI();
}

function plannerDate() {
  const el = document.getElementById('planner-date');
  return el?.value || new Date().toISOString().slice(0,10);
}

function renderCheckList(containerId, items, kind) {
  const box = document.getElementById(containerId);
  if (!box) return;
  if (!items.length) {
    box.innerHTML = '<div class="empty-state"><p>موردی نیست</p></div>';
    return;
  }
  box.innerHTML = items.map((it, i) => `
    <div class="check-item ${it.done ? 'done' : ''}">
      <input type="checkbox" data-kind="${kind}" data-i="${i}" ${it.done ? 'checked' : ''} />
      <span>${escapeHtml(it.text)}</span>
      <button type="button" class="del" data-kind="${kind}" data-i="${i}">✕</button>
    </div>`).join('');
}

function loadPlannerUI() {
  const d = plannerDate();
  const data = getPlannerDay(d);
  const p = document.getElementById('planner-plan');
    if (p) p.value = data.plan || '';
  renderCheckList('todo-list', data.todos || [], 'todos');
  renderCheckList('sport-list', data.sports || [], 'sports');
  if (typeof updateSportBadge === 'function') updateSportBadge();
    setTimeBoxes(data.sleepBed || '', 'sleep-bed-h', 'sleep-bed-m', 'bed');
  setTimeBoxes(data.sleepWake || '', 'sleep-wake-h', 'sleep-wake-m', 'wake');
  const bed = document.getElementById('sleep-bed');
  const wake = document.getElementById('sleep-wake');
  if (bed) bed.value = data.sleepBed || '';
  if (wake) wake.value = data.sleepWake || '';
  renderEvents();
  renderSleepChart();
  renderCalendar();
  renderBookUI();
}

function currentPlannerDataFromUI() {
  const d = plannerDate();
  const prev = getPlannerDay(d);
  const { bed, wake } = syncSleepHidden(false);
  return {
    ...prev,
    goals:  '',
    plan: document.getElementById('planner-plan')?.value || '',
    sleepBed: bed,
    sleepWake: wake
  };
}

function initPlanner() {
  const el = document.getElementById('planner-date');
  if (el && !el.value) el.valueAsDate = new Date();
  loadPlannerUI();
}

document.getElementById('planner-date')?.addEventListener('change', loadPlannerUI);

function addListItem(kind, inputId) {
  const input = document.getElementById(inputId);
  const text = (input?.value || '').trim();
  if (!text) return;
  const d = plannerDate();
  const data = getPlannerDay(d);
  if (!data[kind]) data[kind] = [];
  data[kind].push({ text, done: false });
  savePlannerDay(d, data);
  if (input) input.value = '';
  loadPlannerUI();
}
document.getElementById('todo-add')?.addEventListener('click', () => addListItem('todos', 'todo-input'));
document.getElementById('sport-add')?.addEventListener('click', () => addListItem('sports', 'sport-input'));

document.getElementById('tab-planner')?.addEventListener('click', (e) => {
  const cb = e.target.closest('input[type="checkbox"][data-kind]');
  if (cb) {
    const kind = cb.dataset.kind;
    const i = +cb.dataset.i;
    const d = plannerDate();
    const data = getPlannerDay(d);
    if (data[kind] && data[kind][i]) {
      data[kind][i].done = cb.checked;
      savePlannerDay(d, data);
      loadPlannerUI();
    }
    return;
  }
  const del = e.target.closest('.del[data-kind]');
  if (del) {
    const kind = del.dataset.kind;
    const i = +del.dataset.i;
    const d = plannerDate();
    const data = getPlannerDay(d);
    if (data[kind]) {
      data[kind].splice(i, 1);
      savePlannerDay(d, data);
      loadPlannerUI();
    }
  }
});

document.getElementById('sleep-save')?.addEventListener('click', () => {
  const d = plannerDate();
  const synced = syncSleepHidden(true);
  if (!synced.ok || !synced.bed || !synced.wake) return;
  const prev = getPlannerDay(d);
  const data = {
    ...prev,
    goals:  '',
    plan: document.getElementById('planner-plan')?.value || '',
    sleepBed: synced.bed,
    sleepWake: synced.wake
  };
  savePlannerDay(d, data);
  const b12 = from24To12(synced.bed);
  const w12 = from24To12(synced.wake);
  showToast('خواب ذخیره شد: ' + b12.h + ':' + pad2(b12.m) + ' ' + (b12.ampm==='PM'?'ب.ظ':'ق.ظ') + ' تا ' + w12.h + ':' + pad2(w12.m) + ' ' + (w12.ampm==='PM'?'ب.ظ':'ق.ظ'), 'success');
  renderSleepChart();
  renderCalendar();
});

// AM/PM toggle
document.querySelectorAll('.ampm-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const which = btn.dataset.for;
    document.querySelectorAll('.ampm-btn[data-for="' + which + '"]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const hid = document.getElementById(which === 'bed' ? 'sleep-bed-ampm' : 'sleep-wake-ampm');
    if (hid) hid.value = btn.dataset.ampm;
  });
});

// live validate on blur
['sleep-bed-h','sleep-bed-m','sleep-wake-h','sleep-wake-m'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', () => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = parseInt(el.value, 10);
    if (id.endsWith('-h') && (v < 1 || v > 12)) {
      showToast('کجا زندگی می‌کنی داش گلم؟ ساعت فقط ۱ تا ۱۲', 'error');
      el.value = '';
    }
    if (id.endsWith('-m') && (v < 0 || v > 59)) {
      showToast('کجا زندگی می‌کنی داش گلم؟ دقیقه فقط ۰ تا ۵۹', 'error');
      el.value = '';
    }
  });
});

document.getElementById('planner-save-all')?.addEventListener('click', () => {
  const d = plannerDate();
  const prev = getPlannerDay(d);
  const data = {
    ...prev,
    goals:  '',
    plan: document.getElementById('planner-plan')?.value || '',
    sleepBed: syncSleepHidden(false).bed,
    sleepWake: syncSleepHidden(false).wake
  };
  savePlannerDay(d, data);
  showToast('برنامه این روز ذخیره شد', 'success');
  renderCalendar();
});

// Events countdown
function formatCountdown(diff) {
  if (diff <= 0) return { text: 'زمان تمام شد', past: true, parts: null };
  const totalSec = Math.floor(diff / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    past: false,
    parts: { d, h: pad(h), m: pad(m), s: pad(s) },
    text: (d ? d + ' روز ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s)
  };
}

function renderEvents() {
  const box = document.getElementById('event-list');
  if (!box) return;
  const list = getEvents().sort((a,b) => new Date(a.at) - new Date(b.at));
  const now = Date.now();
  if (!list.length) {
    box.innerHTML = '<div class="empty-state"><p>رویدادی نیست</p></div>';
    return;
  }
  // اگر DOM از قبل هست فقط اعداد را آپدیت کن (روان‌تر)
  const existing = box.querySelectorAll('.event-card[data-at]');
  if (existing.length === list.length) {
    let same = true;
    existing.forEach((el, i) => {
      if (el.dataset.at !== list[i].at || el.dataset.title !== list[i].title) same = false;
    });
    if (same) {
      existing.forEach((el, i) => {
        const diff = new Date(list[i].at).getTime() - now;
        const cd = formatCountdown(diff);
        const clock = el.querySelector('.countdown-clock');
        const status = el.querySelector('.countdown-status');
        if (cd.past) {
          if (clock) clock.innerHTML = '<span class="cd-done">پایان یافت</span>';
          if (status) status.textContent = 'رویداد گذشته';
          el.classList.add('past');
        } else {
          el.classList.remove('past');
          if (clock) {
            clock.innerHTML = `
              <div class="cd-unit"><b>${cd.parts.d}</b><small>روز</small></div>
              <span class="cd-sep">:</span>
              <div class="cd-unit"><b>${cd.parts.h}</b><small>ساعت</small></div>
              <span class="cd-sep">:</span>
              <div class="cd-unit"><b>${cd.parts.m}</b><small>دقیقه</small></div>
              <span class="cd-sep">:</span>
              <div class="cd-unit tick"><b>${cd.parts.s}</b><small>ثانیه</small></div>`;
          }
          if (status) status.textContent = 'مانده تا رویداد';
        }
      });
      return;
    }
  }

  box.innerHTML = list.map((ev, idx) => {
    const t = new Date(ev.at).getTime();
    const cd = formatCountdown(t - now);
    const clock = cd.past
      ? '<span class="cd-done">پایان یافت</span>'
      : `<div class="cd-unit"><b>${cd.parts.d}</b><small>روز</small></div>
         <span class="cd-sep">:</span>
         <div class="cd-unit"><b>${cd.parts.h}</b><small>ساعت</small></div>
         <span class="cd-sep">:</span>
         <div class="cd-unit"><b>${cd.parts.m}</b><small>دقیقه</small></div>
         <span class="cd-sep">:</span>
         <div class="cd-unit tick"><b>${cd.parts.s}</b><small>ثانیه</small></div>`;
    return `<div class="event-card ${cd.past ? 'past' : ''}" data-at="${ev.at}" data-title="${escapeHtml(ev.title)}">
      <div class="event-card-top">
        <strong>${escapeHtml(ev.title)}</strong>
        <button type="button" class="del" data-ev="${idx}">حذف</button>
      </div>
      <div class="meta">${formatJalaliDateTime(ev.at)}</div>
      <div class="countdown-status">${cd.past ? 'رویداد گذشته' : 'مانده تا رویداد'}</div>
      <div class="countdown-clock">${clock}</div>
    </div>`;
  }).join('');
}
function parseJalaliDateInput(str) {
  if (!str) return null;
  const clean = str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d/]/g, '');
  const parts = clean.split('/').map(Number);
  if (parts.length !== 3) return null;
  const [jy, jm, jd] = parts;
  if (!jy || !jm || !jd || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  return { jy, jm, jd };
}
document.getElementById('event-add')?.addEventListener('click', () => {
  const title = (document.getElementById('event-title')?.value || '').trim();
  const jy = parseInt(document.getElementById('event-year')?.value, 10);
  const jm = parseInt(document.getElementById('event-month')?.value, 10);
  const jd = parseInt(document.getElementById('event-day')?.value, 10);
  const hour = parseInt(document.getElementById('event-hour')?.value, 10);
  const min = parseInt(document.getElementById('event-min')?.value, 10);
  if (!title) { showToast('عنوان را وارد کن', 'error'); return; }
  if (isNaN(jy) || jy < 1300 || jy > 1500) { showToast('سال شمسی معتبر نیست', 'error'); return; }
  if (isNaN(jm) || jm < 1 || jm > 12) { showToast('ماه باید ۱ تا ۱۲ باشد', 'error'); return; }
  if (isNaN(jd) || jd < 1 || jd > 31) { showToast('روز معتبر نیست', 'error'); return; }
  if (isNaN(hour) || hour < 0 || hour > 23) { showToast('ساعت باید ۰ تا ۲۳ باشد', 'error'); return; }
  if (isNaN(min) || min < 0 || min > 59) { showToast('دقیقه باید ۰ تا ۵۹ باشد', 'error'); return; }
  const maxD = typeof jalaliMonthLength === 'function' ? jalaliMonthLength(jy, jm) : 31;
  if (jd > maxD) { showToast('این ماه فقط ' + maxD + ' روز دارد', 'error'); return; }
  const g = jalaliToGregorian(jy, jm, jd);
  const atDate = new Date(g.gy, g.gm - 1, g.gd, hour, min, 0);
  if (isNaN(atDate.getTime())) { showToast('تاریخ نامعتبر است', 'error'); return; }
  const list = getEvents();
  list.push({ title, at: atDate.toISOString(), jy, jm, jd, hour, min });
  saveEvents(list);
  document.getElementById('event-title').value = '';
  renderEvents();
  showToast('رویداد ثبت شد', 'success');
});
document.getElementById('event-list')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ev]');
  if (!b) return;
  const list = getEvents();
  list.splice(+b.dataset.ev, 1);
  saveEvents(list);
  renderEvents();
});
if (!window.__eventTimer) {
  window.__eventTimer = setInterval(() => {
    if (appMode === 'planner' && !document.getElementById('planner-panel-main')?.classList.contains('hidden')) {
      // events are in main panel - still update if planner mode
    }
    if (appMode === 'planner') renderEvents();
  }, 1000);
}


function pad2(n) {
  n = Math.max(0, parseInt(n, 10) || 0);
  return String(n).padStart(2, '0');
}
function validateSleepPart(h, m, label) {
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  if (h === '' || h == null || m === '' || m == null || isNaN(hh) || isNaN(mm)) {
    showToast(label + ': ساعت و دقیقه را کامل وارد کن', 'error');
    return null;
  }
  if (hh < 1 || hh > 12) {
    showToast('کجا زندگی می‌کنی داش گلم؟ ساعت باید بین ۱ تا ۱۲ باشد (' + label + ')', 'error');
    return null;
  }
  if (mm < 0 || mm > 59) {
    showToast('کجا زندگی می‌کنی داش گلم؟ دقیقه باید بین ۰ تا ۵۹ باشد (' + label + ')', 'error');
    return null;
  }
  return { hh, mm };
}
function to24Hour(h12, m, ampm) {
  let h = h12 % 12;
  if (ampm === 'PM') h += 12;
  // 12 AM -> 0, 12 PM -> 12
  if (h12 === 12 && ampm === 'AM') h = 0;
  if (h12 === 12 && ampm === 'PM') h = 12;
  return pad2(h) + ':' + pad2(m);
}
function from24To12(timeStr) {
  if (!timeStr || !timeStr.includes(':')) return { h: '', m: '', ampm: 'AM' };
  let [h, m] = timeStr.split(':').map(x => parseInt(x, 10));
  let ampm = 'AM';
  if (h >= 12) { ampm = 'PM'; }
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return { h: h12, m: m, ampm };
}
function setTimeBoxes(timeStr, hId, mId, which) {
  const { h, m, ampm } = from24To12(timeStr);
  const hEl = document.getElementById(hId);
  const mEl = document.getElementById(mId);
  if (hEl) hEl.value = h === '' ? '' : h;
  if (mEl) mEl.value = m === '' ? '' : m;
  const hidden = document.getElementById(which === 'bed' ? 'sleep-bed-ampm' : 'sleep-wake-ampm');
  if (hidden) hidden.value = ampm;
  document.querySelectorAll('.ampm-btn[data-for="' + which + '"]').forEach(b => {
    b.classList.toggle('active', b.dataset.ampm === ampm);
  });
}
function syncSleepHidden(validate) {
  const bedH = document.getElementById('sleep-bed-h')?.value;
  const bedM = document.getElementById('sleep-bed-m')?.value;
  const wakeH = document.getElementById('sleep-wake-h')?.value;
  const wakeM = document.getElementById('sleep-wake-m')?.value;
  const bedAm = document.getElementById('sleep-bed-ampm')?.value || 'PM';
  const wakeAm = document.getElementById('sleep-wake-ampm')?.value || 'AM';
  if (validate) {
    const vb = validateSleepPart(bedH, bedM, 'خواب');
    if (!vb) return { bed: '', wake: '', ok: false };
    const vw = validateSleepPart(wakeH, wakeM, 'بیداری');
    if (!vw) return { bed: '', wake: '', ok: false };
    const bed = to24Hour(vb.hh, vb.mm, bedAm);
    const wake = to24Hour(vw.hh, vw.mm, wakeAm);
    const bedEl = document.getElementById('sleep-bed');
    const wakeEl = document.getElementById('sleep-wake');
    if (bedEl) bedEl.value = bed;
    if (wakeEl) wakeEl.value = wake;
    return { bed, wake, ok: true };
  }
  // soft sync without toast
  let bed = '', wake = '';
  if (bedH !== '' && bedM !== '') {
    const hh = parseInt(bedH, 10), mm = parseInt(bedM, 10);
    if (hh >= 1 && hh <= 12 && mm >= 0 && mm <= 59) bed = to24Hour(hh, mm, bedAm);
  }
  if (wakeH !== '' && wakeM !== '') {
    const hh = parseInt(wakeH, 10), mm = parseInt(wakeM, 10);
    if (hh >= 1 && hh <= 12 && mm >= 0 && mm <= 59) wake = to24Hour(hh, mm, wakeAm);
  }
  const bedEl = document.getElementById('sleep-bed');
  const wakeEl = document.getElementById('sleep-wake');
  if (bedEl) bedEl.value = bed;
  if (wakeEl) wakeEl.value = wake;
  return { bed, wake, ok: true };
}

function sleepHours(bed, wake) {
  if (!bed || !wake) return null;
  const [bh, bm] = bed.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let mins = (wh * 60 + wm) - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

function renderSleepChart() {
  const canvas = document.getElementById('sleep-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.clientWidth || 400;
  const h = 160;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  // last 7 days — labels شمسی
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const key = dt.toISOString().slice(0,10);
    const data = getPlannerDay(key);
    let label = (dt.getMonth()+1) + '/' + dt.getDate();
    try {
      const j = gregorianToJalali(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
      label = j.jd + ' ' + (JALALI_MONTHS[j.jm - 1] || '').slice(0, 3);
    } catch (e) {}
    days.push({ key, label, hours: sleepHours(data.sleepBed, data.sleepWake) });
  }
  const maxH = Math.max(8, ...days.map(d => d.hours || 0));
  const barW = (w - 40) / 7;
  days.forEach((d, i) => {
    const x = 20 + i * barW;
    const hours = d.hours || 0;
    const bh = (hours / maxH) * (h - 40);
    ctx.fillStyle = hours ? 'rgba(129,140,248,0.7)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(x + 6, h - 24 - bh, barW - 12, bh);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.label, x + barW/2, h - 8);
    if (hours) ctx.fillText(hours.toFixed(1), x + barW/2, h - 28 - bh);
  });
}

function renderCalendar() {
  const grid = document.getElementById('cal-grid');
  const label = document.getElementById('cal-label');
  if (!grid) return;
  if (typeof calJy !== 'number') {
    const n = new Date();
    const j = gregorianToJalali(n.getFullYear(), n.getMonth()+1, n.getDate());
    calJy = j.jy; calJm = j.jm;
  }
  if (label) label.textContent = JALALI_MONTHS[calJm - 1] + ' ' + calJy;
  // first day of jalali month -> weekday (شنبه=0)
  const gFirst = jalaliToGregorian(calJy, calJm, 1);
  const dtFirst = new Date(gFirst.gy, gFirst.gm - 1, gFirst.gd);
  const weekStartSat = (dtFirst.getDay() + 1) % 7; // convert Sun=0 -> Sat=0
  const daysIn = jalaliMonthLength(calJy, calJm);
  let html = JALALI_WEEKDAYS.map(x => `<div class="cal-cell muted" style="aspect-ratio:auto;padding:6px 0;font-size:0.7rem">${x}</div>`).join('');
  for (let i = 0; i < weekStartSat; i++) html += `<div class="cal-cell muted"></div>`;
  for (let day = 1; day <= daysIn; day++) {
    const key = toGKey(calJy, calJm, day);
    const data = getPlannerDay(key);
    const has = !!(data.plan || (data.todos||[]).length || (data.sports||[]).length || data.sleepBed);
    const active = key === plannerDate() ? ' active' : '';
    html += `<div class="cal-cell${has?' has-data':''}${active}" data-day="${key}" title="${gKeyToJalaliStr(key)}">${day}</div>`;
  }
  grid.innerHTML = html;
}
document.getElementById('cal-prev')?.addEventListener('click', () => {
  calJm--; if (calJm < 1) { calJm = 12; calJy--; }
  renderCalendar();
});
document.getElementById('cal-next')?.addEventListener('click', () => {
  calJm++; if (calJm > 12) { calJm = 1; calJy++; }
  renderCalendar();
});
document.getElementById('cal-grid')?.addEventListener('click', (e) => {
  const cell = e.target.closest('[data-day]');
  if (!cell) return;
  const key = cell.dataset.day;
  const dateEl = document.getElementById('planner-date');
  if (dateEl) dateEl.value = key;
  loadPlannerUI();
  const data = getPlannerDay(key);
  const det = document.getElementById('cal-day-detail');
  if (!det) return;
  const lines = [];
    if (data.plan) lines.push('برنامه: ' + data.plan);
  if ((data.todos||[]).length) lines.push('کارها: ' + data.todos.map(t => (t.done?'✓ ':'○ ') + t.text).join('، '));
  if ((data.sports||[]).length) lines.push('ورزش: ' + data.sports.map(t => (t.done?'✓ ':'○ ') + t.text).join('، '));
  if (data.sleepBed) lines.push('خواب: ' + data.sleepBed + ' تا ' + (data.sleepWake||'?'));
  det.innerHTML = lines.length ? '<strong>' + gKeyToJalaliStr(key) + ' (' + key + ')</strong><br/>' + lines.join('<br/>') : 'برای این روز چیزی ثبت نشده (' + gKeyToJalaliStr(key) + ')';
});

// Books
function renderBookUI() {
  const b = getBook();
  if (b) {
    if (document.getElementById('book-title')) document.getElementById('book-title').value = b.title || '';
    if (document.getElementById('book-pages')) document.getElementById('book-pages').value = b.total || '';
  }
  const prog = document.getElementById('book-progress');
  if (prog && b) {
    const read = (b.logs || []).reduce((s, x) => s + (x.pages || 0), 0);
    const pct = b.total ? Math.min(100, Math.round(read / b.total * 100)) : 0;
    prog.textContent = 'پیشرفت «' + b.title + '»: ' + read + ' از ' + (b.total || '?') + ' صفحه (' + pct + '%)';
  } else if (prog) prog.textContent = '';
  const listEl = document.getElementById('book-saved-list');
  const finEl = document.getElementById('book-finished-list');
  const lib = getBooksLib();
  const activeLib = lib.filter(x => !x.finished);
  const finishedLib = lib.filter(x => x.finished);
  if (listEl) {
    if (!activeLib.length) {
      listEl.innerHTML = '<div class="field-hint">کتاب در حال مطالعه‌ای نیست</div>';
    } else {
      listEl.innerHTML = activeLib.map(x => {
        const read = (x.logs || []).reduce((s, l) => s + (l.pages || 0), 0);
        return `<div class="book-saved-item ${x.active || (b && b.title===x.title) ? 'active' : ''}" data-book="${escapeHtml(x.title)}">
          <span>📖 ${escapeHtml(x.title)} · ${read}/${x.total || '?'} صفحه</span>
          <span>${x.active || (b && b.title===x.title) ? 'فعال' : 'انتخاب'}</span>
        </div>`;
      }).join('');
    }
  }
  if (finEl) {
    if (!finishedLib.length) {
      finEl.innerHTML = '<div class="field-hint">هنوز کتابی تمام نشده</div>';
    } else {
      finEl.innerHTML = finishedLib.map(x => {
        const read = (x.logs || []).reduce((s, l) => s + (l.pages || 0), 0);
        return `<div class="book-saved-item finished" data-book="${escapeHtml(x.title)}">
          <span>✅ ${escapeHtml(x.title)} · ${read}/${x.total || '?'} صفحه</span>
          <span>تمام‌شده</span>
        </div>`;
      }).join('');
    }
  }
  renderBookChart();
}
document.getElementById('book-saved-list')?.addEventListener('click', (e) => {
  const item = e.target.closest('[data-book]');
  if (!item) return;
  setActiveBook(item.dataset.book);
  showToast('کتاب «' + item.dataset.book + '» فعال شد', 'success');
});

document.getElementById('book-save')?.addEventListener('click', () => {
  const title = (document.getElementById('book-title')?.value || '').trim();
  const total = parseInt(document.getElementById('book-pages')?.value, 10);
  if (!title || !total || total < 1) { showToast('نام و صفحات کتاب را درست وارد کن', 'error'); return; }
  const lib = getBooksLib();
  // اگر همین عنوان ناتمام وجود دارد، همان را آپدیت کن (لاگ‌های خودش)
  const existing = lib.find(x => x.title === title && !x.finished);
  if (existing) {
    saveBook({
      id: existing.id,
      title,
      total,
      logs: Array.isArray(existing.logs) ? existing.logs : [],
      finished: false
    });
    showToast('کتاب به‌روزرسانی شد (پیشرفت قبلی حفظ شد)', 'success');
  } else {
    // کتاب کاملاً جدید — لاگ خالی
    saveBook({
      id: bookId(),
      title,
      total,
      logs: [],
      finished: false
    });
    // پاک کردن فیلد مطالعه امروز
    const rt = document.getElementById('book-read-today');
    if (rt) rt.value = '';
    showToast('کتاب جدید ذخیره شد — از صفر شروع می‌شود', 'success');
  }
  renderBookUI();
});
document.getElementById('book-log')?.addEventListener('click', () => {
  const pages = parseInt(document.getElementById('book-read-today')?.value, 10) || 0;
  if (pages <= 0) { showToast('تعداد صفحات امروز را وارد کن', 'error'); return; }
  const cur = getBook();
  if (!cur) { showToast('اول کتاب را ثبت کن', 'error'); return; }
  if (cur.finished) { showToast('این کتاب تمام شده — کتاب دیگری انتخاب کن', 'error'); return; }
  // کپی مستقل تا به کتاب دیگر نشت نکند
  const b = {
    id: cur.id || bookId(),
    title: cur.title,
    total: parseInt(cur.total, 10) || 0,
    logs: Array.isArray(cur.logs) ? cur.logs.map(x => ({ ...x })) : [],
    finished: false,
    active: true
  };
  const total = b.total;
  const readSoFar = b.logs.reduce((s, x) => s + (x.pages || 0), 0);
  const remaining = Math.max(0, total - readSoFar);
  if (pages > remaining) {
    showToast('داداش جلدش حساب نیست! حداکثر ' + remaining + ' صفحه مانده (کل: ' + total + ')', 'error');
    return;
  }
  const day = plannerDate();
  const existing = b.logs.find(x => x.date === day);
  if (existing) existing.pages = (existing.pages || 0) + pages;
  else b.logs.push({ date: day, pages });
  const newTotal = b.logs.reduce((s, x) => s + (x.pages || 0), 0);
  if (total > 0 && newTotal >= total) {
    b.finished = true;
    b.finishedAt = new Date().toISOString();
    b.active = false;
    showToast('🎉 کتاب تمام شد و به «کتاب‌های تمام‌شده» منتقل شد', 'success');
    document.getElementById('book-title').value = '';
    document.getElementById('book-pages').value = '';
  } else {
    showToast('مطالعه ثبت شد (' + newTotal + '/' + total + ')', 'success');
  }
  saveBook(b);
  document.getElementById('book-read-today').value = '';
  renderBookUI();
  renderCalendar();
});

function renderBookChart() {
  const canvas = document.getElementById('book-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.clientWidth || 400;
  const h = 160;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  const b = getBook();
  const logs = (b && b.logs) ? [...b.logs].slice(-14) : [];
  if (!logs.length) {
    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.fillText('هنوز مطالعه‌ای ثبت نشده', 20, h/2);
    return;
  }
  const maxP = Math.max(1, ...logs.map(x => x.pages || 0));
  const barW = (w - 40) / logs.length;
  logs.forEach((log, i) => {
    const x = 20 + i * barW;
    const bh = ((log.pages || 0) / maxP) * (h - 40);
    ctx.fillStyle = 'rgba(52,211,153,0.75)';
    ctx.fillRect(x + 4, h - 24 - bh, barW - 8, bh);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(log.pages||0), x + barW/2, h - 28 - bh);
  });
}


// ========== Theme switcher ==========
function applyTheme(name) {
  const allowed = ['midnight','emerald','ocean','sunset','royal','rose','goldblack','crimson','arctic','cyber','amber'];
  let t = name || localStorage.getItem('tj_theme') || 'midnight';
  if (!allowed.includes(t)) t = 'midnight';
  document.documentElement.setAttribute('data-theme', t);
  document.body.setAttribute('data-theme', t);
  if (document.getElementById('app')) document.getElementById('app').setAttribute('data-theme', t);
  localStorage.setItem('tj_theme', t);
  document.querySelectorAll('.theme-opt').forEach(o => {
    o.classList.toggle('active', o.dataset.theme === t);
  });
  // force paint so gradients/vars refresh
  document.documentElement.style.colorScheme = 'dark';
}
applyTheme();

document.getElementById('theme-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('theme-menu')?.classList.toggle('hidden');
});
document.getElementById('theme-menu')?.addEventListener('click', (e) => {
  const opt = e.target.closest('.theme-opt');
  if (!opt) return;
  applyTheme(opt.dataset.theme);
  document.getElementById('theme-menu')?.classList.add('hidden');
  showToast('تم «' + opt.textContent.trim() + '» فعال شد', 'success');
});
document.addEventListener('click', () => {
  document.getElementById('theme-menu')?.classList.add('hidden');
});


// Planner subnav: main vs sport box
document.querySelector('.planner-subnav')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.planner-nav-btn');
  if (!btn) return;
  document.querySelectorAll('.planner-nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const nav = btn.dataset.pnav;
  document.getElementById('planner-panel-main')?.classList.toggle('hidden', nav !== 'main');
  document.getElementById('planner-panel-sport')?.classList.toggle('hidden', nav !== 'sport');
  if (nav === 'sport') updateSportBadge();
});

function updateSportBadge() {
  const badge = document.getElementById('sport-progress-badge');
  if (!badge) return;
  const data = getPlannerDay(plannerDate());
  const list = data.sports || [];
  const done = list.filter(x => x.done).length;
  badge.textContent = done + ' / ' + list.length;
}


// Mode menu click animation
document.querySelectorAll('#mode-screen .mode-card').forEach(card => {
  card.addEventListener('click', function () {
    this.classList.remove('clicked');
    void this.offsetWidth;
    this.classList.add('clicked');
  });
});


// ========== Finance ==========
let finType = 'income';
function financeKey() { return 'tj_finance_' + (currentUser?.username || 'trader'); }
function budgetKey() { return 'tj_budget_' + (currentUser?.username || 'trader'); }
function getFinance() {
  try { return JSON.parse(localStorage.getItem(financeKey()) || '[]'); } catch(e) { return []; }
}
function saveFinance(list) { localStorage.setItem(financeKey(), JSON.stringify(list)); }
function getBudget() {
  const v = parseFloat(localStorage.getItem(budgetKey()));
  return isNaN(v) ? 0 : v;
}
function saveBudget(v) { localStorage.setItem(budgetKey(), String(v)); }

document.querySelectorAll('.fin-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.fin-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    finType = btn.dataset.type;
  });
});



function formatToman(n) {
  const num = Math.round(Number(n) || 0);
  const sign = num < 0 ? '−' : '';
  const abs = Math.abs(num);
  // جداکننده سه‌رقمی فارسی
  try {
    return sign + abs.toLocaleString('fa-IR');
  } catch (e) {
    return sign + String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}
function parseTomanInput(str) {
  if (str == null || str === '') return NaN;
  let s = String(str).trim();
  // ارقام فارسی/عربی → انگلیسی
  s = s.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  s = s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  s = s.replace(/[,\u066C\u060C\s]/g, ''); // ویرگول و فاصله
  s = s.replace(/[^\d.-]/g, '');
  return parseFloat(s);
}

function localDateKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function renderFinanceTrend(list) {
  const canvas = document.getElementById('fin-trend-canvas');
  const empty = document.getElementById('fin-trend-empty');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = Math.max(canvas.clientWidth || 400, 320);
  const h = 240;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const items = (list || []).map(t => ({
    ...t,
    amount: Math.abs(parseFloat(t.amount) || 0),
    date: (t.date || '').slice(0, 10)
  })).filter(t => t.date && t.amount > 0);

  if (!items.length) {
    if (empty) empty.style.display = 'block';
    ctx.fillStyle = 'rgba(148,163,184,0.08)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('تراکنشی برای نمایش نیست', w / 2, h / 2);
    return;
  }
  if (empty) empty.style.display = 'none';

  // last 14 local days + any day with data
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = localDateKey(d);
    days.push({ key, label: (d.getMonth() + 1) + '/' + d.getDate(), in: 0, out: 0 });
  }
  const map = {};
  days.forEach(d => { map[d.key] = d; });
  items.forEach(t => {
    if (!map[t.date]) {
      // extend map for older/newer dates inside window only
      return;
    }
    if (t.type === 'income') map[t.date].in += t.amount;
    else map[t.date].out += t.amount;
  });

  let bal = 0;
  // include history before window
  const firstKey = days[0].key;
  items.forEach(t => {
    if (t.date < firstKey) {
      bal += t.type === 'income' ? t.amount : -t.amount;
    }
  });

  const candles = days.map(d => {
    const open = bal;
    bal = open + d.in - d.out;
    const close = bal;
    const high = Math.max(open, close, open + d.in);
    const low = Math.min(open, close, open - d.out);
    return { ...d, open, close, high, low, bull: close >= open };
  });

  // اگر همه صفر بودند ولی تراکنش امروز هست — اطمینان
  const pad = { t: 20, r: 72, b: 32, l: 10 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  let minV = Math.min(...candles.map(c => c.low));
  let maxV = Math.max(...candles.map(c => c.high));
  if (!isFinite(minV) || !isFinite(maxV)) { minV = 0; maxV = 1; }
  if (minV === maxV) {
    const p = Math.max(Math.abs(minV) * 0.2, 100000);
    minV -= p; maxV += p;
  } else {
    const p = (maxV - minV) * 0.2;
    minV -= p; maxV += p;
  }
  const rng = maxV - minV || 1;
  const yScale = (v) => pad.t + plotH - ((v - minV) / rng) * plotH;
  const slot = plotW / candles.length;
  const bodyW = Math.max(5, Math.min(16, slot * 0.6));

  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, 0, w, h);

  // grid
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const v = minV + (rng * i) / steps;
    const y = yScale(v);
    ctx.strokeStyle = 'rgba(148,163,184,0.12)';
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(formatToman(v), w - pad.r + 4, y + 3);
  }

  candles.forEach((c, i) => {
    const x = pad.l + slot * i + slot / 2;
    const yO = yScale(c.open);
    const yC = yScale(c.close);
    const yH = yScale(c.high);
    const yL = yScale(c.low);
    const col = c.bull ? '#22c55e' : '#ef4444';
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, yH);
    ctx.lineTo(x, yL);
    ctx.stroke();
    const top = Math.min(yO, yC);
    const bh = Math.max(3, Math.abs(yC - yO));
    ctx.fillStyle = col;
    ctx.fillRect(x - bodyW / 2, top, bodyW, bh);
  });

  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  candles.forEach((c, i) => {
    if (i % 2 === 0 || i === candles.length - 1) {
      ctx.fillText(c.label, pad.l + slot * i + slot / 2, h - 10);
    }
  });

  // last price tag
  const last = candles[candles.length - 1];
  const ly = yScale(last.close);
  ctx.fillStyle = last.bull ? '#22c55e' : '#ef4444';
  ctx.fillRect(w - pad.r + 2, ly - 10, pad.r - 6, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(formatToman(last.close), w - pad.r / 2, ly + 3);
}

function formatFinAxis(v) {
  return formatToman(v);
}

function formatFinAxis(v) {
  // برچسب محور با جداکننده سه‌رقمی تومان
  return formatToman(v);
}
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}


function renderFinance() {
  const list = getFinance();
  // تاریخ شمسی پیش‌فرض = امروز
  const fy = document.getElementById('fin-year');
  const fm = document.getElementById('fin-month');
  const fd = document.getElementById('fin-day');
  if (fy && !fy.value) {
    try {
      const n = new Date();
      const j = gregorianToJalali(n.getFullYear(), n.getMonth() + 1, n.getDate());
      fy.value = j.jy;
      if (fm) fm.value = j.jm;
      if (fd) fd.value = j.jd;
    } catch (e) {}
  }
let income = 0, expense = 0, mIn = 0, mOut = 0;
  const now = new Date();
  const ym = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  list.forEach(t => {
    const a = parseFloat(t.amount) || 0;
    if (t.type === 'income') income += a; else expense += a;
    if ((t.date || '').startsWith(ym)) {
      if (t.type === 'income') mIn += a; else mOut += a;
    }
  });
  const bal = income - expense;
  const fmt = (n) => formatToman(n);
  const set = (id, v, color) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = fmt(v);
    if (color) el.style.color = color;
  };
  const balEl = document.getElementById('fin-balance');
  if (balEl) {
    balEl.textContent = fmt(bal);
    balEl.classList.toggle('neg', bal < 0);
  }
  set('fin-income', income);
  set('fin-expense', expense);
  set('fin-month-in', mIn);
  set('fin-month-out', mOut);
  set('fin-month-net', mIn - mOut, (mIn - mOut) >= 0 ? '#34d399' : '#f87171');
  set('fin-count', list.length);
  const expCount = list.filter(t => t.type === 'expense').length;
  set('fin-avg', expCount ? Math.round(expense / expCount) : 0);
  const totalFlow = income + expense || 1;
  const inPct = Math.round(income / totalFlow * 100);
  const outPct = 100 - inPct;
  const barIn = document.getElementById('fin-bar-in');
  const barOut = document.getElementById('fin-bar-out');
  if (barIn) barIn.style.width = inPct + '%';
  if (barOut) barOut.style.width = outPct + '%';
  renderFinanceTrend(list);
  const box = document.getElementById('fin-list');
  if (!box) return;
  if (!list.length) {
    box.innerHTML = '<div class="empty-state"><p>تراکنشی ثبت نشده</p></div>';
    return;
  }
  box.innerHTML = list.map((t, i) => `
    <div class="fin-item">
      <div>
        <strong>${t.type === 'income' ? 'درآمد' : 'هزینه'} · ${escapeHtml(t.bank || t.cat || '')}</strong>
        <div class="meta">${(typeof gKeyToJalaliStr === 'function' && t.date) ? gKeyToJalaliStr(t.date) : (t.date || '')}${t.note ? ' · ' + escapeHtml(t.note) : ''}</div>
      </div>
      <div style="text-align:left">
        <div class="amt ${t.type}">${t.type === 'income' ? '+' : '−'}${fmt(Math.abs(t.amount || 0))}</div>
        <button type="button" class="del" data-fin="${i}" style="border:none;background:transparent;color:var(--red);cursor:pointer;font-size:0.75rem">حذف</button>
      </div>
    </div>`).join('');
}

document.getElementById('fin-add')?.addEventListener('click', () => {
  let amount = parseTomanInput(document.getElementById('fin-amount')?.value);
  amount = Math.abs(amount);
  if (!amount || amount <= 0) { showToast('مبلغ معتبر وارد کن (فقط عدد مثبت)', 'error'); return; }
  const bank = (document.getElementById('fin-bank')?.value || '').trim() || 'نامشخص';
  const jy = parseInt(document.getElementById('fin-year')?.value, 10);
  const jm = parseInt(document.getElementById('fin-month')?.value, 10);
  const jd = parseInt(document.getElementById('fin-day')?.value, 10);
  let date;
  if (!isNaN(jy) && !isNaN(jm) && !isNaN(jd) && jm >= 1 && jm <= 12 && jd >= 1 && jd <= 31) {
    try {
      const g = jalaliToGregorian(jy, jm, jd);
      date = g.gy + '-' + String(g.gm).padStart(2,'0') + '-' + String(g.gd).padStart(2,'0');
    } catch (e) {
      date = localDateKey(new Date());
    }
  } else {
    showToast('تاریخ شمسی را درست وارد کن', 'error');
    return;
  }
  const note = (document.getElementById('fin-note')?.value || '').trim();
  const list = getFinance();
  list.unshift({ id: Date.now().toString(36), type: finType, amount: Math.abs(amount), bank, date, note });
  saveFinance(list);
  document.getElementById('fin-amount').value = '';
  document.getElementById('fin-note').value = '';
  showToast('تراکنش ثبت شد', 'success');
  renderFinance();
});

document.getElementById('fin-list')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-fin]');
  if (!btn) return;
  const list = getFinance();
  list.splice(+btn.dataset.fin, 1);
  saveFinance(list);
  renderFinance();
});

document.getElementById('fin-refresh')?.addEventListener('click', () => {
  renderFinance();
  showToast('موجودی بروزرسانی شد', 'success');
});


// جداکننده سه‌رقمی هنگام تایپ مبلغ
document.getElementById('fin-amount')?.addEventListener('input', (e) => {
  const el = e.target;
  const raw = parseTomanInput(el.value);
  if (isNaN(raw)) return;
  const pos = el.selectionStart;
  const oldLen = el.value.length;
  el.value = formatToman(raw).replace('−', ''); // فقط عدد مثبت در ورودی
  // حفظ تقریبی مکان‌نما
  const newLen = el.value.length;
  try { el.setSelectionRange(pos + (newLen - oldLen), pos + (newLen - oldLen)); } catch (err) {}
});


// ========== Prop Weekly Analysis ==========
function getWeekBounds(offset) {
  const now = new Date();
  const day = now.getDay(); // 0 Sun
  // هفته از شنبه (ایران): Sat=6
  const toSat = (day + 1) % 7; // days since Saturday
  const start = new Date(now);
  start.setHours(0,0,0,0);
  start.setDate(start.getDate() - toSat + (offset * 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23,59,59,999);
  return { start, end };
}

function tradesInPropWeek(offset) {
  const { start, end } = getWeekBounds(offset);
  return (trades || []).filter(t => {
    if (!t.date) return false;
    const d = new Date(t.date + 'T12:00:00');
    return d >= start && d <= end;
  });
}

function netOf(t) {
  return t.netPnl != null ? t.netPnl : (t.pnl || 0);
}

function isWin(t) {
  return netOf(t) > 0 || t.result === 'tp';
}

function renderPropWeeklyAnalysis() {
  const weekTrades = tradesInPropWeek(propWeekOffset);
  const { start, end } = getWeekBounds(propWeekOffset);
  const rangeEl = document.getElementById('pwa-range');
  if (rangeEl) {
    try {
      const a = gregorianToJalali(start.getFullYear(), start.getMonth()+1, start.getDate());
      const b = gregorianToJalali(end.getFullYear(), end.getMonth()+1, end.getDate());
      rangeEl.textContent = a.jy + '/' + a.jm + '/' + a.jd + ' تا ' + b.jy + '/' + b.jm + '/' + b.jd +
        (propWeekOffset === 0 ? ' · این هفته' : propWeekOffset < 0 ? ' · ' + Math.abs(propWeekOffset) + ' هفته قبل' : '');
    } catch (e) {
      rangeEl.textContent = start.toLocaleDateString('fa-IR') + ' تا ' + end.toLocaleDateString('fa-IR');
    }
  }

  const count = weekTrades.length;
  const wins = weekTrades.filter(isWin).length;
  const totalNet = weekTrades.reduce((s, t) => s + netOf(t), 0);
  const grossProfit = weekTrades.filter(t => netOf(t) > 0).reduce((s, t) => s + netOf(t), 0);
  const grossLoss = Math.abs(weekTrades.filter(t => netOf(t) < 0).reduce((s, t) => s + netOf(t), 0));
  const pf = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? Infinity : 0);
  const wr = count ? Math.round((wins / count) * 100) : 0;

  const cfg = getPropConfig() || {};
  const size = parseFloat(cfg.size) || 10000;
  const pct = size > 0 ? (totalNet / size) * 100 : 0;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const pnlEl = document.getElementById('pwa-pnl');
  if (pnlEl) {
    pnlEl.textContent = (totalNet >= 0 ? '+' : '') + totalNet.toFixed(1) + ' $';
    pnlEl.style.color = totalNet >= 0 ? '#34d399' : '#f87171';
  }
  set('pwa-pnl-pct', (pct >= 0 ? '+' : '') + pct.toFixed(2) + '% از سایز حساب');
  set('pwa-wr', wr + '%');
  set('pwa-count', count + ' معامله · ' + wins + ' برد');
  set('pwa-pf', !count ? '—' : (pf === Infinity ? '∞' : pf.toFixed(2)));
  set('pwa-pf-meta', 'سود ' + grossProfit.toFixed(1) + ' / ضرر ' + grossLoss.toFixed(1));

  // best trade
  let best = null;
  weekTrades.forEach(t => { if (!best || netOf(t) > netOf(best)) best = t; });
  if (best) {
    set('pwa-best', (netOf(best) >= 0 ? '+' : '') + netOf(best).toFixed(1) + ' $');
    set('pwa-best-meta', (best.symbol || '—') + ' · ' + (best.direction === 'long' ? 'لانگ' : 'شورت') + ' · ' + (best.date || ''));
  } else {
    set('pwa-best', '—');
    set('pwa-best-meta', 'معامله‌ای در این هفته نیست');
  }

  // per symbol
  const bySym = {};
  weekTrades.forEach(t => {
    const s = (t.symbol || '—').toUpperCase();
    if (!bySym[s]) bySym[s] = { n: 0, wins: 0, pnl: 0 };
    bySym[s].n++;
    bySym[s].pnl += netOf(t);
    if (isWin(t)) bySym[s].wins++;
  });
  const symBox = document.getElementById('pwa-symbols');
  if (symBox) {
    const rows = Object.keys(bySym).sort((a,b) => bySym[b].pnl - bySym[a].pnl);
    if (!rows.length) {
      symBox.innerHTML = '<div class="field-hint">نمادی در این هفته معامله نشده</div>';
    } else {
      symBox.innerHTML = rows.map(s => {
        const x = bySym[s];
        const swr = Math.round((x.wins / x.n) * 100);
        const cls = x.pnl >= 0 ? 'pos' : 'neg';
        return `<div class="pwa-row">
          <span class="sym">${s}</span>
          <span>WR ${swr}% · ${x.n}ت</span>
          <span class="${cls}">${x.pnl >= 0 ? '+' : ''}${x.pnl.toFixed(1)} $</span>
        </div>`;
      }).join('');
    }
  }

  // long / short
  const sideBox = document.getElementById('pwa-sides');
  if (sideBox) {
    const sides = ['long', 'short'].map(dir => {
      const arr = weekTrades.filter(t => t.direction === dir);
      const n = arr.length;
      const w = arr.filter(isWin).length;
      const pnl = arr.reduce((s, t) => s + netOf(t), 0);
      const wrS = n ? Math.round((w / n) * 100) : 0;
      return { dir, n, w, pnl, wrS };
    });
    sideBox.innerHTML = sides.map(s => `
      <div class="pwa-side ${s.dir}">
        <div class="title">${s.dir === 'long' ? '🟢 لانگ' : '🔴 شورت'}</div>
        <div class="meta">
          تعداد: ${s.n} · برد: ${s.w}<br/>
          وین‌ریت: ${s.wrS}%<br/>
          سود/ضرر: <strong style="color:${s.pnl>=0?'#34d399':'#f87171'}">${s.pnl>=0?'+':''}${s.pnl.toFixed(1)} $</strong>
        </div>
      </div>`).join('');
  }

  drawPropWeeklyGraph(weekTrades);
}

function drawPropWeeklyGraph(weekTrades) {
  const canvas = document.getElementById('pwa-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.clientWidth || 400;
  const h = 160;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (!weekTrades.length) {
    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.fillText('داده‌ای برای گراف نیست', 16, h / 2);
    return;
  }

  const sorted = [...weekTrades].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let eq = 0;
  const pts = [0];
  sorted.forEach(t => { eq += netOf(t); pts.push(eq); });
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const pad = 16;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;

  // grid
  ctx.strokeStyle = 'rgba(148,163,184,0.12)';
  for (let i = 0; i < 4; i++) {
    const y = pad + (plotH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
  }

  // zero
  if (min < 0 && max > 0) {
    const y0 = pad + plotH - ((0 - min) / range) * plotH;
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(pad, y0);
    ctx.lineTo(w - pad, y0);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const xAt = (i) => pad + (pts.length === 1 ? plotW / 2 : (i / (pts.length - 1)) * plotW);
  const yAt = (v) => pad + plotH - ((v - min) / range) * plotH;

  // area
  ctx.beginPath();
  pts.forEach((v, i) => {
    const x = xAt(i), y = yAt(v);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(xAt(pts.length - 1), pad + plotH);
  ctx.lineTo(xAt(0), pad + plotH);
  ctx.closePath();
  const last = pts[pts.length - 1];
  const grd = ctx.createLinearGradient(0, pad, 0, pad + plotH);
  if (last >= 0) {
    grd.addColorStop(0, 'rgba(52,211,153,0.3)');
    grd.addColorStop(1, 'rgba(52,211,153,0)');
  } else {
    grd.addColorStop(0, 'rgba(248,113,113,0.3)');
    grd.addColorStop(1, 'rgba(248,113,113,0)');
  }
  ctx.fillStyle = grd;
  ctx.fill();

  // line
  ctx.beginPath();
  ctx.strokeStyle = last >= 0 ? '#34d399' : '#f87171';
  ctx.lineWidth = 2.5;
  pts.forEach((v, i) => {
    const x = xAt(i), y = yAt(v);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // end dot
  ctx.fillStyle = last >= 0 ? '#34d399' : '#f87171';
  ctx.beginPath();
  ctx.arc(xAt(pts.length - 1), yAt(last), 4, 0, Math.PI * 2);
  ctx.fill();
}

document.getElementById('pwa-prev')?.addEventListener('click', () => {
  propWeekOffset--;
  renderPropWeeklyAnalysis();
});
document.getElementById('pwa-next')?.addEventListener('click', () => {
  if (propWeekOffset < 0) {
    propWeekOffset++;
    renderPropWeeklyAnalysis();
  }
});


// ========== Live prices via TradingView embeds (no Yahoo / no CloudFront API) ==========
let tvWidgetsLoaded = false;

function injectTvScript(src, onload) {
  const existing = document.querySelector('script[src="' + src + '"]');
  if (existing) {
    if (onload) setTimeout(onload, 50);
    return;
  }
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  s.onload = onload || null;
  s.onerror = () => {
    const st = document.getElementById('live-prices-status');
    if (st) st.textContent = 'بارگذاری TradingView مسدود شد (CloudFront/فیلتر). از لینک‌های پایین صفحه استفاده کن.';
  };
  document.body.appendChild(s);
}

function mountSingleQuote(containerId, symbol, title) {
  const host = document.getElementById(containerId);
  if (!host || host.dataset.mounted === '1') return;
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'tradingview-widget-container';
  const widget = document.createElement('div');
  widget.className = 'tradingview-widget-container__widget';
  wrap.appendChild(widget);
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js';
  script.async = true;
  script.text = JSON.stringify({
    symbol: symbol,
    width: '100%',
    isTransparent: true,
    colorTheme: 'dark',
    locale: 'en'
  });
  // TradingView reads config from script body as text content before src load — use alternative pattern
  host.appendChild(wrap);
  // Official pattern: script with inner text config
  const cfg = document.createElement('script');
  cfg.type = 'text/javascript';
  cfg.src = 'https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js';
  cfg.async = true;
  cfg.innerHTML = JSON.stringify({
    symbol: symbol,
    width: '100%',
    isTransparent: true,
    colorTheme: 'dark',
    locale: 'en'
  });
  wrap.appendChild(cfg);
  host.dataset.mounted = '1';
}

function mountAdvancedChart() {
  const host = document.getElementById('tv_advanced_host');
  if (!host || host.dataset.mounted === '1') return;
  host.innerHTML = '';
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.async = true;
  script.innerHTML = JSON.stringify({
    autosize: true,
    symbol: 'OANDA:XAUUSD',
    interval: '60',
    timezone: 'Asia/Tehran',
    theme: 'dark',
    style: '1',
    locale: 'en',
    enable_publishing: false,
    allow_symbol_change: true,
    calendar: false,
    support_host: 'https://www.tradingview.com',
    height: 460,
    width: '100%'
  });
  host.appendChild(script);
  host.dataset.mounted = '1';
}

function loadChartTabWidgets() {
  const st = document.getElementById('live-prices-status');
  if (st) st.textContent = 'در حال بارگذاری ویجت‌های TradingView...';
  try {
    mountSingleQuote('tv-mini-xau', 'OANDA:XAUUSD', 'GOLD');
    mountSingleQuote('tv-mini-dji', 'FOREXCOM:DJI', 'DJI');
    mountSingleQuote('tv-mini-ixic', 'NASDAQ:IXIC', 'NASDAQ');
    mountSingleQuote('tv-mini-eur', 'FX:EURUSD', 'EURUSD');
    mountAdvancedChart();
    if (st) st.textContent = 'قیمت لحظه‌ای از TradingView · می‌توانی نماد چارت را عوض کنی';
    tvWidgetsLoaded = true;
  } catch (e) {
    if (st) st.textContent = 'خطا در بارگذاری ویجت. لینک‌های جایگزین را امتحان کن.';
  }
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'chart') {
      setTimeout(loadChartTabWidgets, 150);
    }
  });
});






// Modern global loader helpers
function showGlobalLoader(text) {
  const el = document.getElementById('global-loader');
  if (!el) return;
  const t = el.querySelector('.loader-text');
  if (t && text) t.textContent = text;
  el.classList.remove('hidden');
}
function hideGlobalLoader() {
  document.getElementById('global-loader')?.classList.add('hidden');
}
function withButtonLoading(btn, ms = 700) {
  if (!btn) return;
  btn.classList.add('is-loading');
  setTimeout(() => btn.classList.remove('is-loading'), ms);
}

// Splash enter button — plays exit animation then shows mode menu
(function initSplashEnter() {
  const splash = document.getElementById('splash');
  const mode = document.getElementById('mode-screen');
  const app = document.getElementById('app');
  if (!splash) return;
  mode?.classList.add('hidden');
  app?.classList.add('hidden');
  const go = () => {
    if (splash.classList.contains('hide')) return;
    splash.classList.add('hide');
    setTimeout(() => {
      try { splash.style.display = 'none'; } catch (e) {}
      mode?.classList.remove('hidden');
      mode?.style.removeProperty('display');
      app?.classList.add('hidden');
      try { showMotivational(); } catch (e) {}
      // stagger card entrance
      document.querySelectorAll('#mode-screen .mode-card').forEach((c, i) => {
        c.style.animation = 'none';
        c.offsetHeight;
        c.style.animation = '';
        c.classList.add('mode-card-enter');
        c.style.animationDelay = (0.08 * i) + 's';
      });
    }, 550);
  };
  document.getElementById('splash-enter')?.addEventListener('click', go);
  // sync with auto finish
  window.__finishSplash = go;
})();

// ========== Pro Features Module ==========
function goalsKey() {
  return 'tj_goals_' + (currentUser ? currentUser.username : 'guest');
}
function loadGoals() {
  try { return JSON.parse(localStorage.getItem(goalsKey()) || '{}'); } catch (e) { return {}; }
}
function saveGoals(g) {
  localStorage.setItem(goalsKey(), JSON.stringify(g));
}

function detectSession() {
  const h = new Date().getUTCHours();
  // rough UTC sessions
  if (h >= 0 && h < 7) return 'asian';
  if (h >= 7 && h < 12) return 'london';
  if (h >= 12 && h < 16) return 'overlap';
  if (h >= 16 && h < 21) return 'newyork';
  return 'asian';
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function tradesToday() {
  const d = todayStr();
  return trades.filter(t => (t.date || '').slice(0, 10) === d);
}

function consecutiveLosses() {
  let n = 0;
  for (const t of trades) {
    const net = t.netPnl != null ? t.netPnl : (t.pnl || 0);
    if (net < 0) n++;
    else break;
  }
  return n;
}

function isTradeLocked() {
  const g = loadGoals();
  const streakLimit = parseInt(g.lossStreak, 10) || 0;
  if (streakLimit > 0 && consecutiveLosses() >= streakLimit) return true;
  const maxT = parseInt(g.maxTrades, 10) || 0;
  if (maxT > 0 && tradesToday().length >= maxT) return true;
  const maxLoss = parseFloat(g.dailyLoss) || 0;
  if (maxLoss > 0) {
    const dayPnl = tradesToday().reduce((s, t) => s + (t.netPnl != null ? t.netPnl : (t.pnl || 0)), 0);
    if (dayPnl <= -Math.abs(maxLoss)) return true;
  }
  return false;
}

function checkDailyLimits(incomingNet) {
  const g = loadGoals();
  const maxT = parseInt(g.maxTrades, 10) || 0;
  if (maxT > 0 && tradesToday().length >= maxT) {
    return { ok: false, msg: 'سقف تعداد معامله روزانه پر شده' };
  }
  const maxLoss = parseFloat(g.dailyLoss) || 0;
  if (maxLoss > 0) {
    const dayPnl = tradesToday().reduce((s, t) => s + (t.netPnl != null ? t.netPnl : (t.pnl || 0)), 0);
    if (dayPnl + (incomingNet || 0) <= -Math.abs(maxLoss)) {
      return { ok: false, msg: 'سقف ضرر روزانه رد می‌شود' };
    }
  }
  return { ok: true };
}

function updateDisciplineUI() {
  const locked = isTradeLocked();
  const banner = document.getElementById('discipline-banner');
  const lockMsg = document.getElementById('trade-lock-msg');
  const g = loadGoals();
  let reason = '';
  if ((parseInt(g.lossStreak, 10) || 0) > 0 && consecutiveLosses() >= parseInt(g.lossStreak, 10)) {
    reason = consecutiveLosses() + ' ضرر متوالی — استراحت کن';
  } else if ((parseInt(g.maxTrades, 10) || 0) > 0 && tradesToday().length >= parseInt(g.maxTrades, 10)) {
    reason = 'سقف معاملات امروز پر شده';
  } else {
    reason = 'سقف ضرر روزانه فعال شده';
  }
  if (banner) {
    banner.classList.toggle('hidden', !locked);
    const tx = document.getElementById('discipline-text');
    if (tx) tx.textContent = reason;
  }
  if (lockMsg) lockMsg.classList.toggle('hidden', !locked);
  const submitBtn = document.querySelector('#trade-form button[type="submit"]');
  if (submitBtn) submitBtn.disabled = locked;
}

function renderDashboard() {
  if (!currentUser) return;
  const today = tradesToday();
  const todayPnl = today.reduce((s, t) => s + (t.netPnl != null ? t.netPnl : (t.pnl || 0)), 0);
  const week = typeof getTradesInWeek === 'function' ? getTradesInWeek(0) : [];
  const weekPnl = week.reduce((s, t) => s + (t.netPnl != null ? t.netPnl : (t.pnl || 0)), 0);
  const wins = week.filter(t => (t.netPnl != null ? t.netPnl : (t.pnl || 0)) > 0).length;
  const wr = week.length ? Math.round((wins / week.length) * 100) : 0;

  const el = (id, v, cls) => {
    const n = document.getElementById(id);
    if (!n) return;
    n.textContent = v;
    if (cls) n.className = 'stat-value ' + cls;
  };
  el('dash-today-pnl', (todayPnl >= 0 ? '+' : '') + todayPnl.toFixed(1), todayPnl >= 0 ? 'positive' : 'negative');
  el('dash-today-count', String(today.length));
  el('dash-week-wr', wr + '%');
  el('dash-week-pnl', (weekPnl >= 0 ? '+' : '') + weekPnl.toFixed(1), weekPnl >= 0 ? 'positive' : 'negative');

  const g = loadGoals();
  const gp = document.getElementById('goal-daily-profit');
  const gl = document.getElementById('goal-daily-loss');
  const gm = document.getElementById('goal-max-trades');
  const gs = document.getElementById('goal-loss-streak');
  if (gp && g.dailyProfit != null) gp.value = g.dailyProfit;
  if (gl && g.dailyLoss != null) gl.value = g.dailyLoss;
  if (gm && g.maxTrades != null) gm.value = g.maxTrades;
  if (gs && g.lossStreak != null) gs.value = g.lossStreak;

  const prog = document.getElementById('goal-progress');
  if (prog) {
    const target = parseFloat(g.dailyProfit) || 0;
    const maxLoss = parseFloat(g.dailyLoss) || 0;
    let html = `امروز: ${today.length} معامله · PnL: ${(todayPnl >= 0 ? '+' : '') + todayPnl.toFixed(1)}$`;
    if (target) html += `<br>پیشرفت سود: ${Math.min(100, Math.max(0, (todayPnl / target) * 100)).toFixed(0)}% از هدف ${target}$`;
    if (maxLoss) html += `<br>فاصله تا سقف ضرر: ${(maxLoss + todayPnl).toFixed(1)}$`;
    html += `<br>ضرر متوالی فعلی: ${consecutiveLosses()}`;
    prog.innerHTML = html;
  }
  updateDisciplineUI();
  const greet = document.getElementById('dash-greeting');
  if (greet) greet.textContent = 'سلام ' + (currentUser.username || '') + ' — ' + new Date().toLocaleDateString('fa-IR');
}

function groupStats(list, keyFn) {
  const map = {};
  list.forEach(t => {
    const k = keyFn(t) || '—';
    if (!map[k]) map[k] = { n: 0, wins: 0, pnl: 0 };
    map[k].n++;
    const net = t.netPnl != null ? t.netPnl : (t.pnl || 0);
    map[k].pnl += net;
    if (net > 0) map[k].wins++;
  });
  return Object.entries(map).map(([name, v]) => ({
    name,
    n: v.n,
    wr: v.n ? Math.round((v.wins / v.n) * 100) : 0,
    pnl: v.pnl
  })).sort((a, b) => b.n - a.n);
}

function renderAnTable(elId, rows) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state"><p>داده‌ای نیست</p></div>';
    return;
  }
  el.innerHTML = rows.map(r => `
    <div class="an-row">
      <div><span class="an-name">${escapeHtml(String(r.name))}</span>
      <div class="an-meta">${r.n} معامله · WR ${r.wr}%</div></div>
      <span class="stat-value ${r.pnl >= 0 ? 'positive' : 'negative'}">${(r.pnl >= 0 ? '+' : '') + r.pnl.toFixed(1)}</span>
    </div>`).join('');
}

function renderAnalytics() {
  const list = trades.slice();
  const total = list.length;
  const nets = list.map(t => t.netPnl != null ? t.netPnl : (t.pnl || 0));
  const wins = nets.filter(n => n > 0);
  const losses = nets.filter(n => n < 0);
  const pnl = nets.reduce((a, b) => a + b, 0);
  const wr = total ? Math.round((wins.length / total) * 100) : 0;
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const pf = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : (grossWin > 0 ? '∞' : '—');
  const rrList = list.map(t => t.riskReward).filter(x => x != null && !isNaN(x));
  const avgR = rrList.length ? (rrList.reduce((a, b) => a + b, 0) / rrList.length).toFixed(2) : '—';

  // max drawdown on equity curve (oldest first)
  let peak = 0, equity = 0, maxDd = 0;
  [...list].reverse().forEach(t => {
    equity += (t.netPnl != null ? t.netPnl : (t.pnl || 0));
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  });

  const set = (id, v) => { const n = document.getElementById(id); if (n) n.textContent = v; };
  set('an-total', total);
  set('an-wr', wr + '%');
  set('an-avg-r', avgR);
  set('an-pnl', (pnl >= 0 ? '+' : '') + pnl.toFixed(1));
  set('an-pf', pf);
  set('an-dd', maxDd ? ('-' + maxDd.toFixed(1)) : '0');

  renderAnTable('an-by-symbol', groupStats(list, t => t.symbol));
  const stratRows = [];
  const smap = {};
  list.forEach(t => {
    const tags = (t.strategy && t.strategy.length) ? t.strategy : ['بدون تگ'];
    tags.forEach(tag => {
      if (!smap[tag]) smap[tag] = { n: 0, wins: 0, pnl: 0 };
      smap[tag].n++;
      const net = t.netPnl != null ? t.netPnl : (t.pnl || 0);
      smap[tag].pnl += net;
      if (net > 0) smap[tag].wins++;
    });
  });
  Object.entries(smap).forEach(([name, v]) => {
    stratRows.push({ name, n: v.n, wr: v.n ? Math.round((v.wins / v.n) * 100) : 0, pnl: v.pnl });
  });
  stratRows.sort((a, b) => b.n - a.n);
  renderAnTable('an-by-strategy', stratRows);

  const sessMap = { asian: 'آسیا', london: 'لندن', newyork: 'نیویورک', overlap: 'همپوشانی' };
  renderAnTable('an-by-session', groupStats(list, t => sessMap[t.session] || t.session || 'نامشخص'));

  renderAnTable('an-by-month', groupStats(list, t => (t.date || '').slice(0, 7) || '—'));

  renderAnTable('an-by-hour', groupStats(list, t => {
    if (!t.createdAt) return '—';
    const h = new Date(t.createdAt).getHours();
    return h + ':00';
  }));
}

// Strategy tag chips
document.getElementById('strategy-chips')?.addEventListener('click', (e) => {
  const chip = e.target.closest('.tag-chip');
  if (!chip) return;
  chip.classList.toggle('active');
  const tags = [...document.querySelectorAll('.tag-chip.active')].map(c => c.dataset.tag);
  const hidden = document.getElementById('strategy-tags');
  if (hidden) hidden.value = tags.join(',');
});

// Goals save
document.getElementById('btn-save-goals')?.addEventListener('click', () => {
  const g = {
    dailyProfit: parseFloat(document.getElementById('goal-daily-profit')?.value) || 0,
    dailyLoss: parseFloat(document.getElementById('goal-daily-loss')?.value) || 0,
    maxTrades: parseInt(document.getElementById('goal-max-trades')?.value, 10) || 0,
    lossStreak: parseInt(document.getElementById('goal-loss-streak')?.value, 10) || 0
  };
  saveGoals(g);
  updateDisciplineUI();
  renderDashboard();
  showToast('اهداف ذخیره شد', 'success');
});

// Filters
['filter-symbol', 'filter-result', 'filter-strategy', 'filter-session', 'filter-from', 'filter-to'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => renderHistory());
  document.getElementById(id)?.addEventListener('change', () => renderHistory());
});

// Export JSON
document.getElementById('btn-export-json')?.addEventListener('click', () => {
  const data = {
    exportedAt: new Date().toISOString(),
    user: currentUser ? currentUser.username : null,
    trades,
    goals: loadGoals()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'aio-trades-' + todayStr() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('خروجی JSON آماده شد', 'success');
});

// Export CSV
document.getElementById('btn-export-csv')?.addEventListener('click', () => {
  const headers = ['date', 'symbol', 'direction', 'entry', 'sl', 'tp', 'lot', 'result', 'pnl', 'commission', 'netPnl', 'riskReward', 'strategy', 'session', 'emotion', 'reason'];
  const rows = trades.map(t => headers.map(h => {
    let v = t[h];
    if (h === 'strategy') v = (t.strategy || []).join('|');
    if (v == null) v = '';
    return '"' + String(v).replace(/"/g, '""') + '"';
  }).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'aio-trades-' + todayStr() + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('خروجی CSV آماده شد', 'success');
});

// Import JSON
document.getElementById('import-json-file')?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const incoming = Array.isArray(data) ? data : (data.trades || []);
      if (!incoming.length) { showToast('فایل معامله‌ای ندارد', 'error'); return; }
      if (!confirm(incoming.length + ' معامله وارد شود؟ (به لیست فعلی اضافه می‌شود)')) return;
      const ids = new Set(trades.map(t => t.id));
      let added = 0;
      incoming.forEach(t => {
        if (!t.id) t.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        if (ids.has(t.id)) return;
        trades.push(t);
        ids.add(t.id);
        added++;
      });
      trades.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      saveTrades();
      renderHistory();
      if (typeof renderDashboard === 'function') renderDashboard();
      showToast(added + ' معامله وارد شد', 'success');
    } catch (err) {
      showToast('فایل JSON نامعتبر است', 'error');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

// Print / PDF report
document.getElementById('btn-export-report')?.addEventListener('click', () => {
  const week = typeof getTradesInWeek === 'function' ? getTradesInWeek(0) : trades.slice(0, 50);
  const pnl = week.reduce((s, t) => s + (t.netPnl != null ? t.netPnl : (t.pnl || 0)), 0);
  const wins = week.filter(t => (t.netPnl != null ? t.netPnl : (t.pnl || 0)) > 0).length;
  const wr = week.length ? Math.round((wins / week.length) * 100) : 0;
  const w = window.open('', '_blank');
  if (!w) { showToast('پاپ‌آپ مسدود است', 'error'); return; }
  const rows = week.map(t => {
    const net = t.netPnl != null ? t.netPnl : (t.pnl || 0);
    return `<tr>
      <td>${t.date || ''}</td><td>${t.symbol || ''}</td><td>${t.direction || ''}</td>
      <td>${t.result || ''}</td><td style="color:${net>=0?'green':'red'}">${net.toFixed(1)}</td>
      <td>${(t.strategy || []).join(', ')}</td><td>${t.session || ''}</td>
    </tr>`;
  }).join('');
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>گزارش هفتگی AIO</title>
    <style>body{font-family:Tahoma,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border:1px solid #ddd;padding:8px;font-size:13px;text-align:right}th{background:#f5f5f5}
    h1{margin:0 0 8px}.meta{color:#555;margin-bottom:16px}</style></head><body>
    <h1>گزارش هفتگی — All In One</h1>
    <div class="meta">کاربر: ${currentUser ? currentUser.username : '-'} · تاریخ: ${new Date().toLocaleString('fa-IR')}<br>
    معاملات: ${week.length} · Win rate: ${wr}% · Net P&L: ${pnl.toFixed(1)}</div>
    <table><thead><tr><th>تاریخ</th><th>نماد</th><th>جهت</th><th>نتیجه</th><th>PnL</th><th>استراتژی</th><th>سشن</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7">معامله‌ای نیست</td></tr>'}</tbody></table>
    <p style="margin-top:24px;font-size:12px;color:#888">برای PDF از چاپ مرورگر → Save as PDF استفاده کنید.</p>
    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`);
  w.document.close();
});

// Keyboard shortcut: Ctrl+S save focus on trade form fields already native; Ctrl+N focus symbol
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    const sym = document.getElementById('symbol');
    if (sym && appMode === 'journal') {
      e.preventDefault();
      document.querySelector('[data-tab="new"]')?.click();
      sym.focus();
    }
  }
});

// Init pro UI when app opens
const _proOrigOpenApp = openApp;
openApp = function(mode) {
  _proOrigOpenApp(mode);
  try {
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof updateDisciplineUI === 'function') updateDisciplineUI();
  } catch (e) {}
};

// ========== Fullscreen toggle ==========
function toggleFullscreen() {
  const doc = document;
  if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
    const el = doc.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } else {
    if (doc.exitFullscreen) doc.exitFullscreen();
    else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
  }
}
document.getElementById('btn-fullscreen')?.addEventListener('click', toggleFullscreen);
document.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    e.preventDefault();
    toggleFullscreen();
  }
});
function syncFsButton() {
  const btn = document.getElementById('btn-fullscreen');
  if (!btn) return;
  const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
  btn.textContent = on ? '⛶' : '⛶';
  btn.title = on ? 'خروج از تمام‌صفحه (Esc / F11)' : 'تمام‌صفحه (F11)';
}
document.addEventListener('fullscreenchange', syncFsButton);
document.addEventListener('webkitfullscreenchange', syncFsButton);

// ========== Saved Strategies ==========
function strategiesKey() {
  return 'tj_strategies_' + (currentUser ? currentUser.username : 'trader');
}
function loadStrategies() {
  try {
    const list = JSON.parse(localStorage.getItem(strategiesKey()) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}
function saveStrategies(list) {
  localStorage.setItem(strategiesKey(), JSON.stringify(list));
}
function renderStrategySelect(selected) {
  const sel = document.getElementById('strategy-select');
  if (!sel) return;
  const list = loadStrategies();
  const cur = selected != null ? selected : sel.value;
  sel.innerHTML = '<option value="">— انتخاب استراتژی —</option>' +
    list.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  if (cur && list.includes(cur)) sel.value = cur;
}
function addStrategy(name) {
  name = (name || '').trim();
  if (!name) {
    showToast('نام استراتژی را وارد کن', 'error');
    return false;
  }
  if (name.length > 60) {
    showToast('نام خیلی بلند است', 'error');
    return false;
  }
  const list = loadStrategies();
  if (list.some(s => s.toLowerCase() === name.toLowerCase())) {
    showToast('این استراتژی از قبل هست', 'error');
    return false;
  }
  list.unshift(name);
  saveStrategies(list);
  renderStrategySelect(name);
  showToast('استراتژی ذخیره شد', 'success');
  return true;
}
function deleteSelectedStrategy() {
  const sel = document.getElementById('strategy-select');
  const name = (sel?.value || '').trim();
  if (!name) {
    showToast('اول یک استراتژی انتخاب کن', 'error');
    return;
  }
  if (!confirm('استراتژی «' + name + '» حذف شود؟')) return;
  const list = loadStrategies().filter(s => s !== name);
  saveStrategies(list);
  renderStrategySelect('');
  showToast('حذف شد', 'success');
}
document.getElementById('btn-strategy-save')?.addEventListener('click', () => {
  const input = document.getElementById('strategy-new-name');
  if (addStrategy(input?.value)) {
    if (input) input.value = '';
  }
});
document.getElementById('strategy-new-name')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btn-strategy-save')?.click();
  }
});
document.getElementById('btn-strategy-delete')?.addEventListener('click', deleteSelectedStrategy);
// init list
setTimeout(() => { try { renderStrategySelect(); } catch (e) {} }, 400);

// ========== Prop strategy select (shared list with journal) ==========
function renderPropStrategySelect(selected) {
  const sel = document.getElementById('prop-strategy-select');
  if (!sel) return;
  const list = typeof loadStrategies === 'function' ? loadStrategies() : [];
  const cur = selected != null ? selected : sel.value;
  sel.innerHTML = '<option value="">— انتخاب استراتژی —</option>' +
    list.map(s => '<option value="' + String(s).replace(/"/g, '&quot;') + '">' + String(s).replace(/</g, '&lt;') + '</option>').join('');
  if (cur && list.includes(cur)) sel.value = cur;
}
document.getElementById('btn-prop-strategy-save')?.addEventListener('click', () => {
  const input = document.getElementById('prop-strategy-new-name');
  const name = (input?.value || '').trim();
  if (typeof addStrategy === 'function' && addStrategy(name)) {
    if (input) input.value = '';
    renderPropStrategySelect(name);
    if (typeof renderStrategySelect === 'function') renderStrategySelect(name);
  }
});
document.getElementById('prop-strategy-new-name')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btn-prop-strategy-save')?.click();
  }
});
document.getElementById('btn-prop-strategy-delete')?.addEventListener('click', () => {
  const sel = document.getElementById('prop-strategy-select');
  const name = (sel?.value || '').trim();
  if (!name) { showToast('اول یک استراتژی انتخاب کن', 'error'); return; }
  if (!confirm('استراتژی «' + name + '» حذف شود؟')) return;
  const list = (typeof loadStrategies === 'function' ? loadStrategies() : []).filter(s => s !== name);
  if (typeof saveStrategies === 'function') saveStrategies(list);
  renderPropStrategySelect('');
  if (typeof renderStrategySelect === 'function') renderStrategySelect('');
  showToast('حذف شد', 'success');
});

// ========== Prop Investor Analytics Panel ==========
function renderPropInvestorPanel() {
  const list = trades.slice();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const netOf = (t) => t.netPnl != null ? t.netPnl : (t.pnl || 0);
  const cfg = (typeof getPropConfig === 'function' ? getPropConfig() : null) || {};
  const size = parseFloat(cfg.size) || 10000;
  const phase = cfg.phase || '1';
  const phaseLabel = document.getElementById('inv-phase-label');
  if (phaseLabel) phaseLabel.textContent = 'مرحله ' + phase + ' · سایز حساب ' + size.toLocaleString('en-US') + '$';

  const setBar = (id, pct) => {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%';
  };
  const setRing = (score) => {
    const ring = document.getElementById('inv-ring-fg');
    if (!ring) return;
    const r = 52;
    const c = 2 * Math.PI * r;
    const offset = c - (Math.max(0, Math.min(100, score)) / 100) * c;
    ring.style.strokeDasharray = c + ' ' + c;
    ring.style.strokeDashoffset = String(offset);
  };

  if (!list.length) {
    ['inv-score','inv-rank','inv-pf','inv-avg-win','inv-avg-loss','inv-wl','inv-maxdd','inv-consistency','inv-tpd','inv-avg-rr','inv-net-pnl','inv-net-pct','inv-wr','inv-wr-meta','inv-trades','inv-ev','inv-q-entry','inv-q-risk','inv-q-mental'].forEach(id => set(id, '—'));
    setRing(0);
    document.querySelectorAll('.inv-tier').forEach(t => t.classList.remove('active'));
    ['inv-by-strategy', 'inv-by-symbol', 'inv-results'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="field-hint">هنوز معامله‌ای ثبت نشده</div>';
    });
    const ul = document.getElementById('inv-insights');
    if (ul) ul.innerHTML = '<li>با ثبت معاملات پراپ، میز سرمایه‌گذار تحلیل را فعال می‌کند.</li>';
    return;
  }

  const nets = list.map(netOf);
  const totalNet = nets.reduce((a, b) => a + b, 0);
  const wins = nets.filter(n => n > 0);
  const losses = nets.filter(n => n < 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const wl = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? Infinity : 0);
  const wr = list.length ? wins.length / list.length : 0;
  const ev = list.length ? totalNet / list.length : 0;

  let peak = 0, eq = 0, maxDd = 0;
  [...list].reverse().forEach(t => {
    eq += netOf(t);
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDd) maxDd = dd;
  });

  const byDay = {};
  list.forEach(t => {
    const d = t.date || '';
    if (!byDay[d]) byDay[d] = 0;
    byDay[d] += netOf(t);
  });
  const dayKeys = Object.keys(byDay);
  const posDays = dayKeys.filter(d => byDay[d] > 0).length;
  const consistency = dayKeys.length ? Math.round((posDays / dayKeys.length) * 100) : 0;
  const tpd = dayKeys.length ? (list.length / dayKeys.length) : 0;

  const rrList = list.map(t => t.riskReward).filter(x => x != null && !isNaN(x));
  const avgRrNum = rrList.length ? rrList.reduce((a, b) => a + b, 0) / rrList.length : 0;

  // Quality scores
  const qEntry = Math.round(Math.max(0, Math.min(100, wr * 100)));
  const qRisk = Math.round(Math.max(0, Math.min(100,
    (pf === Infinity ? 90 : Math.min(90, pf * 35)) * 0.6 +
    (maxDd <= 0 ? 40 : Math.max(0, 40 - maxDd / size * 400))
  )));
  const qMental = Math.round(Math.max(0, Math.min(100, consistency * 0.7 + (tpd <= 5 ? 30 : Math.max(0, 30 - (tpd - 5) * 5)))));

  let score = 40;
  score += Math.min(22, (wr * 100 - 35) * 0.55);
  if (pf === Infinity) score += 18;
  else score += Math.min(18, Math.max(-8, (pf - 1) * 10));
  score += Math.min(12, consistency / 8.5);
  score -= Math.min(18, (maxDd / size) * 100 * 1.2);
  score += Math.min(8, list.length / 3);
  score = Math.max(0, Math.min(100, Math.round(score)));

  let rank = 'برنزی', tier = 'bronze';
  if (score >= 80) { rank = 'نخبه'; tier = 'elite'; }
  else if (score >= 65) { rank = 'طلایی'; tier = 'gold'; }
  else if (score >= 45) { rank = 'نقره‌ای'; tier = 'silver'; }

  set('inv-score', String(score));
  set('inv-rank', rank);
  setRing(score);
  const badge = document.getElementById('inv-score-badge');
  if (badge) {
    badge.classList.remove('score-high', 'score-mid', 'score-low');
    badge.classList.add(score >= 70 ? 'score-high' : score >= 45 ? 'score-mid' : 'score-low');
  }
  document.querySelectorAll('.inv-tier').forEach(t => {
    t.classList.toggle('active', t.dataset.tier === tier);
  });

  const netPct = size > 0 ? (totalNet / size) * 100 : 0;
  const netEl = document.getElementById('inv-net-pnl');
  if (netEl) {
    netEl.textContent = (totalNet >= 0 ? '+' : '') + totalNet.toFixed(1) + '$';
    netEl.style.color = totalNet >= 0 ? '#34d399' : '#f87171';
  }
  set('inv-net-pct', (netPct >= 0 ? '+' : '') + netPct.toFixed(2) + '% از سرمایه');
  set('inv-wr', Math.round(wr * 100) + '%');
  set('inv-wr-meta', wins.length + ' برد از ' + list.length);
  set('inv-pf', pf === Infinity ? '∞' : pf.toFixed(2));
  set('inv-consistency', consistency + '%');
  set('inv-avg-win', avgWin ? ('+' + avgWin.toFixed(1) + '$') : '—');
  set('inv-avg-loss', avgLoss ? ('-' + avgLoss.toFixed(1) + '$') : '—');
  set('inv-wl', wl === Infinity ? '∞' : (wl ? wl.toFixed(2) : '—'));
  set('inv-maxdd', maxDd ? ('-' + maxDd.toFixed(1) + '$') : '0');
  set('inv-tpd', tpd ? tpd.toFixed(1) : '—');
  set('inv-avg-rr', avgRrNum ? ('1:' + avgRrNum.toFixed(2)) : '—');
  set('inv-trades', String(list.length));
  set('inv-ev', (ev >= 0 ? '+' : '') + ev.toFixed(2) + '$');
  set('inv-q-entry', qEntry + '%');
  set('inv-q-risk', qRisk + '%');
  set('inv-q-mental', qMental + '%');
  setBar('inv-bar-entry', qEntry);
  setBar('inv-bar-risk', qRisk);
  setBar('inv-bar-mental', qMental);

  function fillGroup(elId, mapFn) {
    const map = {};
    list.forEach(t => {
      const keys = mapFn(t);
      (Array.isArray(keys) ? keys : [keys]).forEach(k => {
        const key = k || '—';
        if (!map[key]) map[key] = { n: 0, wins: 0, pnl: 0 };
        map[key].n++;
        map[key].pnl += netOf(t);
        if (netOf(t) > 0) map[key].wins++;
      });
    });
    const el = document.getElementById(elId);
    if (!el) return;
    const rows = Object.entries(map).sort((a, b) => b[1].pnl - a[1].pnl);
    if (!rows.length) {
      el.innerHTML = '<div class="field-hint">داده‌ای نیست</div>';
      return;
    }
    el.innerHTML = rows.map(([name, v]) => {
      const swr = Math.round((v.wins / v.n) * 100);
      const cls = v.pnl >= 0 ? 'pos' : 'neg';
      const bar = Math.min(100, Math.abs(v.pnl) / (Math.max(...rows.map(r => Math.abs(r[1].pnl))) || 1) * 100);
      return `<div class="inv-row">
        <div class="inv-row-main">
          <span class="inv-name">${String(name).replace(/</g,'&lt;')}</span>
          <span class="inv-meta">WR ${swr}% · ${v.n} معامله</span>
        </div>
        <div class="inv-row-side">
          <span class="${cls}">${v.pnl >= 0 ? '+' : ''}${v.pnl.toFixed(1)}$</span>
          <span class="inv-mini-bar"><i style="width:${bar}%" class="${cls}"></i></span>
        </div>
      </div>`;
    }).join('');
  }

  fillGroup('inv-by-strategy', t => (t.strategy && t.strategy.length) ? t.strategy : ['بدون استراتژی']);
  fillGroup('inv-by-symbol', t => [(t.symbol || '—').toUpperCase()]);
  const resMap = { tp: 'تی‌پی', sl: 'استاپ', be: 'سر‌به‌سر', manual: 'دستی', rf: 'ریسک‌فری' };
  fillGroup('inv-results', t => [resMap[t.result] || t.result || 'نامشخص']);

  const insights = [];
  if (score >= 80) insights.push('عملکرد در سطح نخبه است؛ حفظ انضباط اولویت اول است.');
  if (wr < 0.4) insights.push('وین‌ریت پایین است — فیلتر ستاپ و زمان ورود را سخت‌تر کن.');
  else if (wr >= 0.55) insights.push('وین‌ریت قابل قبول است؛ روی بزرگ‌تر کردن میانگین برد تمرکز کن.');
  if (pf !== Infinity && pf < 1) insights.push('Profit Factor زیر ۱ — یا حد ضرر را نزدیک‌تر کن یا تارگت را منطقی‌تر بگذار.');
  if (pf >= 1.8) insights.push('کیفیت سود عالی است؛ از افزایش ناگهانی لات خودداری کن.');
  if (consistency < 40) insights.push('روزهای منفی زیاد است — سقف ضرر روزانه الزامی است.');
  if (consistency >= 65) insights.push('ثبات روزانه خوب است؛ الگوی فعلی را مستند کن.');
  if (maxDd > 0 && size > 0 && (maxDd / size) > 0.08) insights.push('دراودان نسبت به سایز حساب بالاست — ریسک هر معامله را کاهش بده.');
  if (tpd > 6) insights.push('تعداد معامله در روز زیاد است — احتمال overtrading وجود دارد.');
  if (list.length < 12) insights.push('نمونه آماری هنوز کامل نیست؛ بعد از ۱۵–۲۰ معامله قضاوت دقیق‌تر می‌شود.');
  if (ev > 0) insights.push('انتظار ریاضی مثبت است — لبه آماری به نفع توست.');
  if (ev < 0) insights.push('انتظار ریاضی منفی است — قبل از افزایش حجم، سیستم را اصلاح کن.');
  if (!insights.length) insights.push('عملکرد متعادل است؛ همین چارچوب را ادامه بده.');

  const ul = document.getElementById('inv-insights');
  if (ul) ul.innerHTML = insights.map(t => '<li>' + t + '</li>').join('');
}

// ========== Bug Report Desk ==========
const BUG_KEY = 'tj_bug_reports';
const BUG_EMAIL_KEY = 'tj_bug_dest_email';

function getBugReports() {
  try {
    const list = JSON.parse(localStorage.getItem(BUG_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}
function saveBugReports(list) {
  localStorage.setItem(BUG_KEY, JSON.stringify(list.slice(0, 50)));
}
function severityLabel(s) {
  return ({ low: 'کم', medium: 'متوسط', high: 'زیاد', critical: 'بحرانی' })[s] || s;
}
function sectionLabel(s) {
  return ({ journal: 'ژورنال', prop: 'پراپ', theme: 'تم / ظاهر', data: 'ذخیره داده', other: 'سایر' })[s] || s;
}
function buildBugText(report) {
  return [
    'گزارش باگ — All In One',
    '----------------------------',
    'عنوان: ' + report.title,
    'بخش: ' + sectionLabel(report.section),
    'شدت: ' + severityLabel(report.severity),
    'زمان: ' + report.createdAt,
    '',
    report.desc || '(بدون توضیح)',
    '',
    'نسخه: 2.0 · User: ' + (currentUser?.username || 'trader')
  ].join('\n');
}
function openBugModal() {
  const m = document.getElementById('bug-modal');
  if (!m) return;
  m.classList.remove('hidden');
  const email = localStorage.getItem(BUG_EMAIL_KEY) || '';
  const emailEl = document.getElementById('bug-dest-email');
  if (emailEl) emailEl.value = email;
  try {
    localStorage.setItem('tj_bug_tg_token', typeof getBotToken === 'function' ? getBotToken() : FIXED_BOT_TOKEN);
    localStorage.setItem('tj_bug_tg_chat', typeof getAdminChatId === 'function' ? getAdminChatId() : '7603673933');
  } catch (e) {}
  const st = document.getElementById('bug-tg-status');
  if (st) st.textContent = 'وضعیت: ارسال به @FX_Jwad (Chat ID ثابت)';
  renderBugList();
}
function closeBugModal() {
  document.getElementById('bug-modal')?.classList.add('hidden');
}
function collectBugForm() {
  const title = (document.getElementById('bug-title')?.value || '').trim();
  const desc = (document.getElementById('bug-desc')?.value || '').trim();
  const section = document.getElementById('bug-section')?.value || 'other';
  const severity = document.getElementById('bug-severity')?.value || 'medium';
  const email = (document.getElementById('bug-dest-email')?.value || '').trim();
  if (email) localStorage.setItem(BUG_EMAIL_KEY, email);
  if (!title) {
    showToast('عنوان باگ را بنویس', 'error');
    return null;
  }
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    title, desc, section, severity,
    createdAt: new Date().toLocaleString('fa-IR'),
    email
  };
}
function renderBugList() {
  const box = document.getElementById('bug-list');
  if (!box) return;
  const list = getBugReports();
  if (!list.length) {
    box.innerHTML = '<div class="field-hint">هنوز گزارشی ذخیره نشده</div>';
    return;
  }
  box.innerHTML = list.map((r, i) => `
    <div class="bug-item" data-bug-id="${r.id}">
      <strong>${String(r.title).replace(/</g,'&lt;')}
        <span class="bug-sev ${r.severity}">${severityLabel(r.severity)}</span>
      </strong>
      <div class="bug-meta">${sectionLabel(r.section)} · ${r.createdAt}</div>
      <p>${String(r.desc || '').replace(/</g,'&lt;')}</p>
      <div class="bug-item-actions">
        <button type="button" data-bug-copy="${r.id}">کپی</button>
        <button type="button" data-bug-mail="${r.id}">ایمیل</button>
        <button type="button" data-bug-del="${r.id}">حذف</button>
      </div>
    </div>
  `).join('');
}
function sendBugEmail(report) {
  const to = (report.email || localStorage.getItem(BUG_EMAIL_KEY) || '').trim();
  if (!to) {
    showToast('اول ایمیل دریافت‌کننده را وارد کن', 'error');
    document.getElementById('bug-dest-email')?.focus();
    return;
  }
  const subject = encodeURIComponent('[AIO Bug] ' + report.title);
  const body = encodeURIComponent(buildBugText(report));
  window.location.href = 'mailto:' + encodeURIComponent(to) + '?subject=' + subject + '&body=' + body;
}
async function copyBugText(report) {
  const text = buildBugText(report);
  try {
    await navigator.clipboard.writeText(text);
    showToast('متن گزارش کپی شد', 'success');
  } catch (e) {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('متن گزارش کپی شد', 'success');
  }
}

// bug report removed
document.getElementById('bug-modal-close')?.addEventListener('click', closeBugModal);
document.getElementById('bug-modal-backdrop')?.addEventListener('click', closeBugModal);
document.getElementById('bug-btn-save')?.addEventListener('click', () => {
  const r = collectBugForm();
  if (!r) return;
  const list = getBugReports();
  list.unshift(r);
  saveBugReports(list);
  document.getElementById('bug-title').value = '';
  document.getElementById('bug-desc').value = '';
  renderBugList();
  showToast('گزارش ذخیره شد', 'success');
});
document.getElementById('bug-btn-copy')?.addEventListener('click', async () => {
  const r = collectBugForm();
  if (!r) return;
  await copyBugText(r);
});
document.getElementById('bug-btn-email')?.addEventListener('click', () => {
  const r = collectBugForm();
  if (!r) return;
  // also save
  const list = getBugReports();
  list.unshift(r);
  saveBugReports(list);
  renderBugList();
  sendBugEmail(r);
});
document.getElementById('bug-list')?.addEventListener('click', async (e) => {
  const list = getBugReports();
  const copyId = e.target.getAttribute('data-bug-copy');
  const mailId = e.target.getAttribute('data-bug-mail');
  const delId = e.target.getAttribute('data-bug-del');
  if (copyId) {
    const r = list.find(x => x.id === copyId);
    if (r) await copyBugText(r);
  } else if (mailId) {
    const r = list.find(x => x.id === mailId);
    if (r) sendBugEmail(r);
  } else if (delId) {
    saveBugReports(list.filter(x => x.id !== delId));
    renderBugList();
    showToast('حذف شد', 'success');
  }
});

// ========== Telegram Bot for Bug Reports ==========
const BUG_TG_TOKEN_KEY = 'tj_bug_tg_token';
const BUG_TG_CHAT_KEY = 'tj_bug_tg_chat';

function getTgConfig() {
  const token = (typeof getBotToken === 'function' ? getBotToken() : FIXED_BOT_TOKEN);
  localStorage.setItem(BUG_TG_TOKEN_KEY, token);
  return {
    token: token,
    chatId: (document.getElementById('bug-tg-chat')?.value || localStorage.getItem(BUG_TG_CHAT_KEY) || '').trim()
  };
}
function saveTgConfigFromForm() {
  const token = (document.getElementById('bug-tg-token')?.value || '').trim();
  const chatId = (document.getElementById('bug-tg-chat')?.value || '').trim();
  if (token) localStorage.setItem(BUG_TG_TOKEN_KEY, token);
  if (chatId) localStorage.setItem(BUG_TG_CHAT_KEY, chatId);
  return { token, chatId };
}
function loadTgConfigToForm() {
  const tokenEl = document.getElementById('bug-tg-token');
  const chatEl = document.getElementById('bug-tg-chat');
  if (tokenEl && !tokenEl.value) tokenEl.value = localStorage.getItem(BUG_TG_TOKEN_KEY) || '';
  if (chatEl && !chatEl.value) chatEl.value = localStorage.getItem(BUG_TG_CHAT_KEY) || '';
}
async function telegramTransport(token, method, body) {
  body = body || {};
  // 1) Electron main process — سریع و بدون CORS
  if (window.aioNative && typeof window.aioNative.telegramSend === 'function') {
    return window.aioNative.telegramSend({ token, method, body });
  }

  const url = 'https://api.telegram.org/bot' + token + '/' + method;

  // 2) fetch عادی
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.ok && data && data.ok) return data;
    if (data && data.description) throw new Error(data.description);
    throw new Error('HTTP ' + res.status);
  } catch (err) {
    // 3) برای sendMessage: چند روش موازی (GET)
    if (method === 'sendMessage' && body.chat_id != null && body.text != null) {
      const q = url
        + '?chat_id=' + encodeURIComponent(body.chat_id)
        + '&text=' + encodeURIComponent(String(body.text).slice(0, 3500));
      // Image beacon
      try {
        const img = new Image();
        img.src = q;
      } catch (e) {}
      // fetch no-cors (درخواست ارسال می‌شود حتی اگر پاسخ خوانده نشود)
      try {
        fetch(q, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(() => {});
      } catch (e) {}
      // script tag
      try {
        const s = document.createElement('script');
        s.src = q;
        s.async = true;
        document.head.appendChild(s);
        setTimeout(() => { try { s.remove(); } catch (e) {} }, 3000);
      } catch (e) {}
      return { ok: true, via: 'beacon-fallback' };
    }
    throw new Error((err && err.message) ? err.message : 'Failed to fetch');
  }
}

async function telegramSendMessage(token, chatId, text) {
  if (!token) throw new Error('توکن ربات خالی است');
  if (!chatId) throw new Error('Chat ID ادمین تنظیم نشده');
  return telegramTransport(token, 'sendMessage', {
    chat_id: chatId,
    text: text,
    disable_web_page_preview: true
  });
}
function formatBugTelegram(report) {
  const sev = severityLabel(report.severity);
  const sec = sectionLabel(report.section);
  return (
    '🐛 گزارش باگ — All In One\n' +
    '────────────────\n' +
    '📌 ' + report.title + '\n' +
    '📂 بخش: ' + sec + '\n' +
    '⚡ شدت: ' + sev + '\n' +
    '🕒 ' + report.createdAt + '\n' +
    '👤 ' + (currentUser?.username || 'trader') + '\n\n' +
    (report.desc || '(بدون توضیح)')
  );
}
async function sendBugToTelegram(report) {
  const token = (typeof getBotToken === 'function') ? getBotToken() : (localStorage.getItem('tj_bug_tg_token') || '');
  localStorage.setItem('tj_bug_tg_token', token);
  let chatId = (document.getElementById('bug-tg-chat')?.value || localStorage.getItem('tj_bug_tg_chat') || '').trim();
  if (chatId) localStorage.setItem('tj_bug_tg_chat', chatId);
  if (!chatId && typeof ensureAdminChatId === 'function') {
    chatId = await ensureAdminChatId();
  }
  if (!token || !chatId) {
    showToast('Chat ID ادمین مشخص نیست — در تلگرام به ربات /start بزن', 'error');
    return false;
  }
  try {
    showToast('در حال ارسال به تلگرام...', 'success');
    const ids = (typeof getAdminChatIds === 'function') ? getAdminChatIds() : [chatId];
    let ok = 0;
    let lastErr = null;
    for (const id of ids) {
      try {
        await telegramSendMessage(token, id, formatBugTelegram(report));
        ok++;
      } catch (e) { lastErr = e; }
    }
    if (!ok) throw lastErr || new Error('ارسال ناموفق');
    showToast('گزارش به تلگرام ارسال شد', 'success');
    return true;
  } catch (err) {
    console.error(err);
    showToast('خطای تلگرام: ' + (err.message || 'ناموفق'), 'error');
    return false;
  }
}

// load tg fields when opening modal
const _openBugModalOrig = typeof openBugModal === 'function' ? openBugModal : null;
if (_openBugModalOrig) {
  window.openBugModal = function() {
    _openBugModalOrig();
    loadTgConfigToForm();
  };
  document.getElementById('btn-bug-report')?.removeEventListener?.('click', _openBugModalOrig);
}
// re-bind open with tg load (safe)
document.getElementById('btn-bug-report')?.addEventListener('click', () => {
  loadTgConfigToForm();
});

document.getElementById('bug-tg-test')?.addEventListener('click', async () => {
  const cfg = saveTgConfigFromForm();
  if (!cfg.token || !cfg.chatId) {
    showToast('توکن و Chat ID لازم است', 'error');
    return;
  }
  try {
    await telegramSendMessage(cfg.token, cfg.chatId, '✅ اتصال ربات All In One برقرار است.\nBug Desk آماده دریافت گزارش است.');
    showToast('تست موفق — پیام به تلگرام رسید', 'success');
  } catch (err) {
    showToast('تست ناموفق: ' + (err.message || ''), 'error');
  }
});

document.getElementById('bug-btn-telegram')?.addEventListener('click', async () => {
  const r = collectBugForm();
  if (!r) return;
  const list = getBugReports();
  list.unshift(r);
  saveBugReports(list);
  renderBugList();
  await sendBugToTelegram(r);
});

// history: telegram resend
document.getElementById('bug-list')?.addEventListener('click', async (e) => {
  const tgId = e.target.getAttribute('data-bug-tg');
  if (!tgId) return;
  const r = getBugReports().find(x => x.id === tgId);
  if (r) await sendBugToTelegram(r);
});

// enhance list renderer to include telegram button
const _renderBugListOrig = typeof renderBugList === 'function' ? renderBugList : null;
window.renderBugList = function() {
  const box = document.getElementById('bug-list');
  if (!box) return;
  const list = getBugReports();
  if (!list.length) {
    box.innerHTML = '<div class="field-hint">هنوز گزارشی ذخیره نشده</div>';
    return;
  }
  box.innerHTML = list.map((r) => `
    <div class="bug-item" data-bug-id="${r.id}">
      <strong>${String(r.title).replace(/</g,'&lt;')}
        <span class="bug-sev ${r.severity}">${severityLabel(r.severity)}</span>
      </strong>
      <div class="bug-meta">${sectionLabel(r.section)} · ${r.createdAt}</div>
      <p>${String(r.desc || '').replace(/</g,'&lt;')}</p>
      <div class="bug-item-actions">
        <button type="button" data-bug-copy="${r.id}">کپی</button>
        <button type="button" data-bug-mail="${r.id}">ایمیل</button>
        <button type="button" data-bug-tg="${r.id}">تلگرام</button>
        <button type="button" data-bug-del="${r.id}">حذف</button>
      </div>
    </div>
  `).join('');
};

// ========== In-App Support Bot → Admin Telegram ==========
// توکن ثابت ربات (درون‌برنامه‌ای)
const FIXED_BOT_TOKEN = '8756004913:AAHnYlZF-HWCp0NBx5c7Q-YYqker9ZCTS30';
// فقط @FX_Jwad (Jay) — اتصال پایدار
const FIXED_ADMIN_CHAT_ID = '7603673933';
const FIXED_ADMIN_CHAT_IDS = [FIXED_ADMIN_CHAT_ID];
function getBotToken() {
  return FIXED_BOT_TOKEN;
}
function getAdminChatIds() {
  // همیشه فقط همین اکانت — localStorage اشتباه را نادیده بگیر
  try { localStorage.setItem('tj_bug_tg_chat', FIXED_ADMIN_CHAT_ID); } catch (e) {}
  return [FIXED_ADMIN_CHAT_ID];
}
function getAdminChatId() {
  return FIXED_ADMIN_CHAT_ID;
}
async function ensureAdminChatId() {
  const chatId = String(FIXED_ADMIN_CHAT_ID);
  try { localStorage.setItem('tj_bug_tg_chat', chatId); } catch (e) {}
  if (chatId) return chatId;
  let _legacy = (localStorage.getItem('tj_bug_tg_chat') || '').trim();
  if (_legacy) return _legacy;
  try {
    const data = await tgApi(getBotToken(), 'getUpdates', { timeout: 0, allowed_updates: ['message'] });
    const results = (data.result || []).slice().reverse();
    for (const u of results) {
      const chat = u.message && u.message.chat;
      if (chat && (chat.type === 'private' || chat.type === 'group' || chat.type === 'supergroup')) {
        chatId = String(chat.id);
        localStorage.setItem('tj_bug_tg_chat', chatId);
        localStorage.setItem('tj_bug_tg_token', getBotToken());
        return chatId;
      }
    }
  } catch (e) {
    console.warn('ensureAdminChatId', e);
  }
  return '';
}

const SUPPORT_MSG_KEY = 'tj_support_messages';
const TG_TOKEN_KEY = 'tj_bug_tg_token';
const TG_CHAT_KEY = 'tj_bug_tg_chat';
let supportPollTimer = null;
let supportLastUpdateId = Number(localStorage.getItem('tj_tg_update_id') || 0);

function getSupportMessages() {
  try {
    const list = JSON.parse(localStorage.getItem(SUPPORT_MSG_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}
function saveSupportMessages(list) {
  localStorage.setItem(SUPPORT_MSG_KEY, JSON.stringify(list.slice(-200)));
}
function supportPush(role, text) {
  text = String(text || '').trim();
  if (!text) return;
  const list = getSupportMessages();
  // جلوگیری از پیام تکراری پشت‌سرهم
  const last = list[list.length - 1];
  if (last && last.role === role && last.text === text) {
    renderSupportMessages();
    return;
  }
  list.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    role,
    text,
    at: new Date().toLocaleString('fa-IR')
  });
  saveSupportMessages(list);
  renderSupportMessages();
}
function renderSupportMessages() {
  const box = document.getElementById('support-messages');
  if (!box) return;
  const list = getSupportMessages();
  if (!list.length) {
    box.innerHTML = '<div class="support-bubble system">هنوز پیامی نیست. اولین پیام را برای ادمین بفرست.</div>';
    return;
  }
  box.innerHTML = list.map(m => {
    const cls = m.role === 'user' ? 'user' : (m.role === 'admin' ? 'admin' : 'system');
    const safe = String(m.text || '').replace(/</g, '&lt;');
    return `<div class="support-bubble ${cls}">${safe}<span class="sb-time">${m.at || ''}</span></div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}
function loadSupportTgForm() {
  const tokenEl = document.getElementById('support-tg-token');
  const chatEl = document.getElementById('support-tg-chat');
  if (tokenEl) {
    tokenEl.value = '********';
    tokenEl.disabled = true;
  }
  if (chatEl) {
    chatEl.value = FIXED_ADMIN_CHAT_ID;
    chatEl.disabled = true;
  }
  localStorage.setItem(TG_TOKEN_KEY, getBotToken());
  localStorage.setItem(TG_CHAT_KEY, FIXED_ADMIN_CHAT_ID);
  updateSupportTgStatus();
}
function saveSupportTgForm() {
  const token = (document.getElementById('support-tg-token')?.value || '').trim();
  const chatId = (document.getElementById('support-tg-chat')?.value || '').trim();
  if (token) localStorage.setItem(TG_TOKEN_KEY, token);
  if (chatId) localStorage.setItem(TG_CHAT_KEY, chatId);
  // sync bug form fields if present
  const bt = document.getElementById('bug-tg-token');
  const bc = document.getElementById('bug-tg-chat');
  if (bt) bt.value = token;
  if (bc) bc.value = chatId;
  updateSupportTgStatus();
  return { token, chatId };
}
function updateSupportTgStatus() {
  const el = document.getElementById('support-tg-status');
  if (!el) return;
  el.textContent = 'وضعیت: متصل به @FX_Jwad | Chat ID ' + FIXED_ADMIN_CHAT_ID;
}
async function tgApi(token, method, body) {
  return telegramTransport(token, method, body || {});
}
async function sendToAdminTelegram(text) {
  const token = getBotToken();
  localStorage.setItem(TG_TOKEN_KEY, token);
  const ids = getAdminChatIds();
  if (!ids.length) throw new Error('Chat ID ادمین مشخص نیست');
  localStorage.setItem(TG_CHAT_KEY, ids[0]);
  const payload =
    '💬 پیام از داخل All In One\n' +
    '────────────────\n' +
    '👤 کاربر: ' + (currentUser?.username || 'trader') + '\n' +
    '🕒 ' + new Date().toLocaleString('fa-IR') + '\n\n' +
    text;
  const results = await Promise.allSettled(ids.map(chatId =>
    tgApi(token, 'sendMessage', {
      chat_id: chatId,
      text: payload,
      disable_web_page_preview: true
    })
  ));
  const ok = results.filter(r => r.status === 'fulfilled').length;
  if (!ok) {
    const reason = results.find(r => r.status === 'rejected');
    throw (reason && reason.reason) || new Error('ارسال به هیچ ادمینی موفق نشد');
  }
  try { localStorage.setItem('tj_tg_last_send', String(Date.now())); } catch (e) {}
}
async function pollAdminReplies() {
  // Telegram دریافت پیام‌ها را Electron main process انجام می‌دهد تا
  // فقط یک long-polling فعال باشد و با getUpdates تداخل ایجاد نشود.
  return true;
}

function startSupportPoll() {
  stopSupportPoll();
  if (window.aioNative?.telegramStartListening) {
    const token = getBotToken();
    const allowed = typeof getAdminChatIds === 'function' ? getAdminChatIds() : [];
    window.aioNative.telegramStartListening({
      token,
      allowedChatIds: allowed
    }).then(() => {
      updateSupportTgStatus();
    }).catch(err => {
      showToast('اتصال تلگرام برقرار نشد: ' + (err?.message || ''), 'error');
    });
  }
}

function stopSupportPoll() {
  // اتصال تلگرام عمداً با بسته شدن پنجره چت متوقف نمی‌شود.
  // ربات باید همیشه نقش پل دوطرفه را حفظ کند تا پیام‌های گوشی حتی در
  // زمانی که پنجره پشتیبانی بسته است دریافت شوند و هنگام باز کردن چت نمایش داده شوند.
  return true;
}

if (window.aioNative?.onTelegramMessage) {
  window.aioNative.onTelegramMessage((msg) => {
    if (!msg || !msg.text) return;

    const adminIds = new Set(
      (typeof getAdminChatIds === 'function' ? getAdminChatIds() : []).map(String)
    );
    const cid = String(msg.chat_id || '');
    if (adminIds.size && !adminIds.has(cid)) return;

    // پیام‌هایی که خود برنامه فرستاده نباید دوباره به عنوان پاسخ ادمین نمایش داده شوند.
    if (msg.text.startsWith('💬 پیام از داخل All In One')) return;
    if (msg.text.startsWith('🐛 گزارش باگ')) return;
    if (msg.text.startsWith('✅')) return;
    if (msg.text.startsWith('/start')) return;

    const who = msg.from?.username || msg.from?.first_name || 'تلگرام';
    supportPush('admin', '[' + who + '] ' + msg.text);
    showToast('📩 پیام جدید از تلگرام دریافت شد', 'success');
  });
}

if (window.aioNative?.onTelegramStatus) {
  window.aioNative.onTelegramStatus((status) => {
    if (status?.connected) {
      updateSupportTgStatus();
    }
  });
}

function openSupportModal() {
  const m = document.getElementById('support-modal');
  if (!m) return;
  m.classList.remove('hidden');
  loadSupportTgForm();
  renderSupportMessages();
  const token = localStorage.getItem(TG_TOKEN_KEY);
  const chat = localStorage.getItem(TG_CHAT_KEY);
  const setup = document.getElementById('support-setup');
  if (setup) setup.open = !(token && chat);
  startSupportPoll();
  setTimeout(() => document.getElementById('support-input')?.focus(), 200);
}
function closeSupportModal() {
  document.getElementById('support-modal')?.classList.add('hidden');
  stopSupportPoll();
}

// Support chat removed — bug report only

document.getElementById('support-modal-close')?.addEventListener('click', closeSupportModal);
document.getElementById('support-modal-backdrop')?.addEventListener('click', closeSupportModal);

document.getElementById('support-tg-save')?.addEventListener('click', () => {
  const cfg = saveSupportTgForm();
  if (!cfg.token || !cfg.chatId) {
    showToast('Token و Chat ID را کامل وارد کن', 'error');
    return;
  }
  showToast('تنظیمات ربات ذخیره شد', 'success');
  supportPush('system', 'تنظیمات تلگرام ذخیره شد. می‌توانی پیام بفرستی.');
});

document.getElementById('support-tg-test')?.addEventListener('click', async () => {
  saveSupportTgForm();
  try {
    await sendToAdminTelegram('✅ تست ربات پشتیبانی All In One\nاتصال برقرار است.');
    showToast('پیام تست به تلگرام ادمین ارسال شد', 'success');
    supportPush('system', 'تست ارسال موفق بود.');
  } catch (err) {
    showToast('خطا: ' + (err.message || 'ناموفق'), 'error');
  }
});

async function submitSupportMessage() {
  const input = document.getElementById('support-input');
  const text = (input?.value || '').trim();
  if (!text) {
    showToast('متن پیام خالی است', 'error');
    return;
  }
  localStorage.setItem(TG_TOKEN_KEY, getBotToken());
  let chat = (localStorage.getItem(TG_CHAT_KEY) || '').trim();
  if (!chat) chat = await ensureAdminChatId();
  if (!chat) {
    showToast('اول در تلگرام به ربات /start بزن، بعد دوباره ارسال کن', 'error');
    const setup = document.getElementById('support-setup');
    if (setup) setup.open = true;
    return;
  }
  const btn = document.getElementById('support-send');
  if (btn) btn.disabled = true;
  try {
    await sendToAdminTelegram(text);
    supportPush('user', text);
    if (input) input.value = '';
    showToast('ارسال شد — هر دو اکانت ادمین', 'success');
    setTimeout(() => { try { pollAdminReplies(); } catch (e) {} }, 500);
  } catch (err) {
    showToast('ارسال نشد: ' + (err.message || ''), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}
document.getElementById('support-send')?.addEventListener('click', submitSupportMessage);
document.getElementById('support-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitSupportMessage();
  }
});


// Auto-bind fixed bot token on startup
try {
  localStorage.setItem('tj_bug_tg_token', FIXED_BOT_TOKEN);
  // همیشه Chat ID مربوط به @FX_Jwad
  localStorage.setItem('tj_bug_tg_chat', FIXED_ADMIN_CHAT_ID);
} catch (e) {}



// دریافت پیام‌های تلگرام توسط Electron main process انجام می‌شود.
try {
  setTimeout(() => {
    if (typeof startSupportPoll === 'function') startSupportPoll();
  }, 1200);
} catch (e) {}



// ========== Prop Jalali Trading Calendar ==========
let propCalJy, propCalJm;
(function initPropCal() {
  const n = new Date();
  const j = gregorianToJalali(n.getFullYear(), n.getMonth() + 1, n.getDate());
  propCalJy = j.jy;
  propCalJm = j.jm;
})();

function propNetOf(tr) {
  return tr.netPnl != null ? tr.netPnl : (tr.pnl || 0);
}

function buildPropDayMap() {
  const map = {};
  (trades || []).forEach(tr => {
    if (!tr || !tr.date) return;
    const k = tr.date; // YYYY-MM-DD
    if (!map[k]) map[k] = { pnl: 0, count: 0, wins: 0, losses: 0 };
    const n = propNetOf(tr);
    map[k].pnl += n;
    map[k].count += 1;
    if (n > 0) map[k].wins += 1;
    else if (n < 0) map[k].losses += 1;
  });
  return map;
}

function renderPropTradingCalendar() {
  const grid = document.getElementById('prop-cal-grid');
  const title = document.getElementById('prop-cal-title');
  if (!grid || !title) return;
  if (propCalJy == null) {
    const n = new Date();
    const j = gregorianToJalali(n.getFullYear(), n.getMonth() + 1, n.getDate());
    propCalJy = j.jy; propCalJm = j.jm;
  }
  title.textContent = (JALALI_MONTHS[propCalJm - 1] || '') + ' ' + propCalJy;
  const dayMap = buildPropDayMap();
  const len = jalaliMonthLength(propCalJy, propCalJm);
  // weekday of first day (Saturday=0)
  const g0 = jalaliToGregorian(propCalJy, propCalJm, 1);
  const dt0 = new Date(g0.gy, g0.gm - 1, g0.gd);
  // JS: 0=Sun ... 6=Sat → convert to Sat=0
  const jsDay = dt0.getDay();
  const startPad = (jsDay + 1) % 7;

  const today = new Date();
  const tj = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
  let html = '';
  for (let i = 0; i < startPad; i++) html += '<div class="prop-cal-cell empty"></div>';
  for (let d = 1; d <= len; d++) {
    const gKey = toGKey(propCalJy, propCalJm, d);
    const info = dayMap[gKey];
    const isToday = (tj.jy === propCalJy && tj.jm === propCalJm && tj.jd === d);
    let cls = 'prop-cal-cell';
    let pnlTxt = '';
    let countTxt = '';
    if (info && info.count) {
      if (info.pnl > 0.0001) cls += ' profit';
      else if (info.pnl < -0.0001) cls += ' loss';
      else cls += ' flat';
      pnlTxt = (info.pnl >= 0 ? '+' : '') + info.pnl.toFixed(1);
      countTxt = info.count + ' معامله';
    } else {
      cls += ' none';
    }
    if (isToday) cls += ' today';
    html += `<button type="button" class="${cls}" data-gkey="${gKey}" data-jd="${d}">
      <span class="pcd-num">${d}</span>
      ${pnlTxt ? `<span class="pcd-pnl">${pnlTxt}</span>` : ''}
      ${countTxt ? `<span class="pcd-count">${countTxt}</span>` : ''}
    </button>`;
  }
  grid.innerHTML = html;
}

function showPropCalDayDetail(gKey) {
  const box = document.getElementById('prop-cal-day-detail');
  if (!box) return;
  const dayTrades = (trades || []).filter(tr => tr.date === gKey);
  if (!dayTrades.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  const total = dayTrades.reduce((s, t) => s + propNetOf(t), 0);
  const jstr = gKeyToJalaliStr(gKey);
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="prop-cal-detail-head">
      <strong>${jstr}</strong>
      <span class="${total >= 0 ? 'pos' : 'neg'}">${total >= 0 ? '+' : ''}${total.toFixed(2)} $</span>
    </div>
    <div class="prop-cal-detail-list">
      ${dayTrades.map(t => {
        const n = propNetOf(t);
        return `<div class="prop-cal-detail-row">
          <span>${(t.symbol || '—')} · ${t.direction === 'short' ? 'شورت' : 'لانگ'}</span>
          <span class="${n >= 0 ? 'pos' : 'neg'}">${n >= 0 ? '+' : ''}${n.toFixed(2)}</span>
        </div>`;
      }).join('')}
    </div>`;
}

document.getElementById('prop-cal-prev')?.addEventListener('click', () => {
  propCalJm -= 1;
  if (propCalJm < 1) { propCalJm = 12; propCalJy -= 1; }
  renderPropTradingCalendar();
});
document.getElementById('prop-cal-next')?.addEventListener('click', () => {
  propCalJm += 1;
  if (propCalJm > 12) { propCalJm = 1; propCalJy += 1; }
  renderPropTradingCalendar();
});
document.getElementById('prop-cal-grid')?.addEventListener('click', (e) => {
  const cell = e.target.closest('.prop-cal-cell[data-gkey]');
  if (!cell) return;
  showPropCalDayDetail(cell.dataset.gkey);
});


// ========== Force FX_Jwad + bug-only telegram ==========
(function BUG_TG_FORCE_FXJWAD() {
  const FIXED_CHAT = '7603673933';
  try {
    localStorage.setItem('tj_bug_tg_chat', FIXED_CHAT);
    if (typeof FIXED_BOT_TOKEN !== 'undefined') {
      localStorage.setItem('tj_bug_tg_token', FIXED_BOT_TOKEN);
    }
  } catch (e) {}

  document.getElementById('bug-tg-test')?.addEventListener('click', async () => {
    const st = document.getElementById('bug-tg-status');
    if (st) st.textContent = 'در حال تست...';
    try {
      const token = typeof getBotToken === 'function' ? getBotToken() : FIXED_BOT_TOKEN;
      await telegramSendMessage(token, FIXED_CHAT, '✅ تست گزارش باگ All In One\nاتصال به @FX_Jwad برقرار است.');
      if (st) st.textContent = 'وضعیت: تست موفق — پیام به @FX_Jwad ارسال شد';
      showToast('تست تلگرام موفق بود', 'success');
    } catch (err) {
      const msg = (err && err.message) ? err.message : 'ناموفق';
      if (st) st.textContent = 'وضعیت: خطا — ' + msg + ' (اگر تلگرام فیلتر است از کپی/ایمیل استفاده کن)';
      showToast('تلگرام: ' + msg, 'error');
    }
  });
})();


// ========== Prop Journal PDF ==========
function exportPropJournalPdf() {
  const phase = typeof getPropPhase === 'function' ? getPropPhase() : '1';
  const list = (trades || []).filter(tr => tr && (tr.prop === true || appMode === 'prop'));
  // trades already scoped to prop phase storage when in prop mode
  const rows = (trades || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const totalNet = rows.reduce((s, t) => s + (t.netPnl != null ? t.netPnl : (t.pnl || 0)), 0);
  const wins = rows.filter(t => (t.netPnl != null ? t.netPnl : t.pnl) > 0).length;
  const losses = rows.filter(t => (t.netPnl != null ? t.netPnl : t.pnl) < 0).length;
  const wr = rows.length ? ((wins / rows.length) * 100).toFixed(1) : '0';
  const user = currentUser?.username || 'trader';
  const now = new Date().toLocaleString('fa-IR');

  const tableRows = rows.map((t, i) => {
    const net = t.netPnl != null ? t.netPnl : (t.pnl || 0);
    const cls = net >= 0 ? 'pos' : 'neg';
    const dir = t.direction === 'short' ? 'شورت' : 'لانگ';
    const res = ({ tp: 'TP', sl: 'SL', rf: 'RF', manual: 'دستی' })[t.result] || (t.result || '—');
    const jdate = typeof gKeyToJalaliStr === 'function' ? gKeyToJalaliStr(t.date) : t.date;
    return `<tr>
      <td>${i + 1}</td>
      <td>${jdate || t.date || ''}</td>
      <td>${t.symbol || ''}</td>
      <td>${dir}</td>
      <td>${t.entry != null ? t.entry : ''}</td>
      <td>${t.sl != null ? t.sl : '—'}</td>
      <td>${t.tp != null ? t.tp : '—'}</td>
      <td>${t.lot != null ? t.lot : '—'}</td>
      <td>${res}</td>
      <td class="${cls}">${net >= 0 ? '+' : ''}${Number(net).toFixed(2)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="fa" dir="rtl"><head>
<meta charset="utf-8"/>
<title>ژورنال پراپ — مرحله ${phase}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Tahoma, Vazirmatn, sans-serif; color: #111; background: #fff; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 14px; }
  .kpis { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
  .kpi { border: 1px solid #ddd; border-radius: 10px; padding: 8px 12px; min-width: 110px; }
  .kpi span { display: block; font-size: 11px; color: #666; }
  .kpi strong { font-size: 15px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ddd; padding: 6px 5px; text-align: center; }
  th { background: #f3f4f6; }
  .pos { color: #15803d; font-weight: 700; }
  .neg { color: #b91c1c; font-weight: 700; }
  .foot { margin-top: 16px; font-size: 11px; color: #777; }
</style></head><body>
  <h1>ژورنال پراپ — مرحله ${phase}</h1>
  <div class="meta">کاربر: ${user} · تاریخ خروجی: ${now} · تعداد: ${rows.length} معامله</div>
  <div class="kpis">
    <div class="kpi"><span>سود/ضرر خالص</span><strong class="${totalNet>=0?'pos':'neg'}">${totalNet>=0?'+':''}${totalNet.toFixed(2)} $</strong></div>
    <div class="kpi"><span>وین‌ریت</span><strong>${wr}%</strong></div>
    <div class="kpi"><span>برد / باخت</span><strong>${wins} / ${losses}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>تاریخ</th><th>نماد</th><th>جهت</th><th>ورود</th>
        <th>SL</th><th>TP</th><th>لات</th><th>نتیجه</th><th>خالص</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || '<tr><td colspan="10">معامله‌ای ثبت نشده</td></tr>'}
    </tbody>
  </table>
  <p class="foot">All In One · Prop Journal · برای ذخیره PDF از پنجره چاپ گزینه Save as PDF را انتخاب کنید.</p>
  <script>window.onload=function(){window.print()}<\/script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) {
    showToast('پنجره چاپ مسدود شد — اجازه پاپ‌آپ بده', 'error');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

document.getElementById('btn-prop-pdf')?.addEventListener('click', exportPropJournalPdf);

// ========== Games Zone ==========
function showGamesMenu() {
  document.getElementById('games-menu')?.classList.remove('hidden');
  document.getElementById('game-stage')?.classList.add('hidden');
  const body = document.getElementById('game-stage-body');
  if (body) body.innerHTML = '';
}
function openGame(name) {
  document.getElementById('games-menu')?.classList.add('hidden');
  const stage = document.getElementById('game-stage');
  stage?.classList.remove('hidden');
  const titles = {
    memory: 'حافظه نمادها',
    reaction: 'واکنش سریع',
    guess: 'حدس عدد',
    ttt: 'دوز',
    hokm: 'حکم',
    typing: 'مسابقه تایپ'
  };
  document.getElementById('game-stage-title').textContent = titles[name] || name;
  document.getElementById('game-stage-score').textContent = '';
  const body = document.getElementById('game-stage-body');
  if (!body) return;
  body.innerHTML = '';
  if (name === 'memory') initMemoryGame(body);
  else if (name === 'reaction') initReactionGame(body);
  else if (name === 'guess') initGuessGame(body);
  else if (name === 'ttt') initTttGame(body);
  else if (name === 'hokm') initHokmGame(body);
}

document.getElementById('games-menu')?.addEventListener('click', (e) => {
  const card = e.target.closest('.game-card');
  if (!card) return;
  openGame(card.dataset.game);
});
document.getElementById('game-back')?.addEventListener('click', showGamesMenu);

function initMemoryGame(body) {
  const symbols = ['🥇','💶','💷','₿','📈','📉','🏛️','⚡'];
  let deck = symbols.concat(symbols).sort(() => Math.random() - 0.5);
  let first = null, lock = false, matched = 0, moves = 0;
  const scoreEl = document.getElementById('game-stage-score');
  scoreEl.textContent = 'حرکت: 0';
  const grid = document.createElement('div');
  grid.className = 'mem-grid';
  deck.forEach((sym, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mem-card';
    btn.dataset.sym = sym;
    btn.dataset.idx = String(idx);
    btn.textContent = '?';
    btn.addEventListener('click', () => {
      if (lock || btn.classList.contains('flipped') || btn.classList.contains('matched')) return;
      btn.classList.add('flipped');
      btn.textContent = sym;
      if (!first) { first = btn; return; }
      moves++;
      scoreEl.textContent = 'حرکت: ' + moves;
      if (first.dataset.sym === btn.dataset.sym && first !== btn) {
        first.classList.add('matched');
        btn.classList.add('matched');
        first = null;
        matched += 2;
        if (matched === deck.length) {
          scoreEl.textContent = 'آفرین! با ' + moves + ' حرکت تموم شد';
          showToast('حافظه کامل شد 🎉', 'success');
        }
      } else {
        lock = true;
        const a = first, b = btn;
        first = null;
        setTimeout(() => {
          a.classList.remove('flipped'); a.textContent = '?';
          b.classList.remove('flipped'); b.textContent = '?';
          lock = false;
        }, 650);
      }
    });
    grid.appendChild(btn);
  });
  const restart = document.createElement('button');
  restart.type = 'button';
  restart.className = 'btn-secondary';
  restart.style.cssText = 'display:block;margin:14px auto 0;width:auto';
  restart.textContent = 'شروع دوباره';
  restart.onclick = () => initMemoryGame(body);
  body.appendChild(grid);
  body.appendChild(restart);
}

function initReactionGame(body) {
  const area = document.createElement('div');
  area.className = 'react-area wait';
  area.textContent = 'برای شروع کلیک کن…';
  let phase = 'idle'; // idle | wait | go
  let timer = null, startAt = 0;
  const scoreEl = document.getElementById('game-stage-score');
  scoreEl.textContent = 'بهترین: —';
  let best = Number(localStorage.getItem('aio_react_best') || 0) || null;
  if (best) scoreEl.textContent = 'بهترین: ' + best + 'ms';

  area.addEventListener('click', () => {
    if (phase === 'idle' || phase === 'done' || phase === 'early') {
      phase = 'wait';
      area.className = 'react-area wait';
      area.textContent = 'صبر کن تا سبز شود…';
      clearTimeout(timer);
      timer = setTimeout(() => {
        phase = 'go';
        startAt = performance.now();
        area.className = 'react-area go';
        area.textContent = 'کلیک کن!';
      }, 1200 + Math.random() * 2200);
      return;
    }
    if (phase === 'wait') {
      phase = 'early';
      clearTimeout(timer);
      area.className = 'react-area early';
      area.textContent = 'زود زدی! دوباره کلیک کن';
      return;
    }
    if (phase === 'go') {
      const ms = Math.round(performance.now() - startAt);
      phase = 'done';
      area.className = 'react-area wait';
      area.textContent = ms + ' میلی‌ثانیه — دوباره کلیک کن';
      if (!best || ms < best) {
        best = ms;
        localStorage.setItem('aio_react_best', String(best));
      }
      scoreEl.textContent = 'آخرین: ' + ms + 'ms | بهترین: ' + best + 'ms';
    }
  });
  body.appendChild(area);
}

function initGuessGame(body) {
  let target = 1 + Math.floor(Math.random() * 100);
  let tries = 0;
  const scoreEl = document.getElementById('game-stage-score');
  scoreEl.textContent = 'تلاش: 0';
  const box = document.createElement('div');
  box.className = 'guess-box';
  box.innerHTML = `
    <p>یک عدد بین ۱ تا ۱۰۰ در ذهن دارم</p>
    <input type="number" id="guess-input" min="1" max="100" placeholder="حدست را بنویس" />
    <button type="button" class="btn-primary" id="guess-btn">حدس بزن</button>
    <p class="guess-msg" id="guess-msg"></p>
    <button type="button" class="btn-secondary" id="guess-reset" style="width:auto;margin-top:8px">عدد جدید</button>
  `;
  body.appendChild(box);
  const input = box.querySelector('#guess-input');
  const msg = box.querySelector('#guess-msg');
  function tryGuess() {
    const n = parseInt(input.value, 10);
    if (isNaN(n) || n < 1 || n > 100) {
      msg.textContent = 'عدد معتبر بین ۱ تا ۱۰۰ وارد کن';
      return;
    }
    tries++;
    scoreEl.textContent = 'تلاش: ' + tries;
    if (n === target) {
      msg.textContent = 'درست بود! 🎉 در ' + tries + ' تلاش';
      showToast('آفرین!', 'success');
    } else if (n < target) msg.textContent = 'بزرگ‌تر…';
    else msg.textContent = 'کوچک‌تر…';
  }
  box.querySelector('#guess-btn').onclick = tryGuess;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryGuess(); });
  box.querySelector('#guess-reset').onclick = () => {
    target = 1 + Math.floor(Math.random() * 100);
    tries = 0;
    scoreEl.textContent = 'تلاش: 0';
    msg.textContent = 'عدد جدید انتخاب شد';
    input.value = '';
  };
}

function initTttGame(body) {
  const scoreEl = document.getElementById('game-stage-score');
  scoreEl.textContent = 'تو: X | رایانه: O';
  let board = Array(9).fill('');
  let over = false;
  const status = document.createElement('div');
  status.className = 'ttt-status';
  status.textContent = 'نوبت توست';
  const grid = document.createElement('div');
  grid.className = 'ttt-grid';

  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  function winner(b) {
    for (const [a,c,d] of wins) {
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    }
    if (b.every(Boolean)) return 'draw';
    return null;
  }
  function aiMove() {
    // easy AI: win / block / random
    const empty = board.map((v,i)=>v?null:i).filter(v=>v!=null);
    for (const i of empty) {
      const t = board.slice(); t[i] = 'O';
      if (winner(t) === 'O') return i;
    }
    for (const i of empty) {
      const t = board.slice(); t[i] = 'X';
      if (winner(t) === 'X') return i;
    }
    return empty[Math.floor(Math.random() * empty.length)];
  }
  function render() {
    grid.innerHTML = '';
    board.forEach((v, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ttt-cell';
      btn.textContent = v;
      btn.disabled = !!v || over;
      btn.onclick = () => {
        if (over || board[i]) return;
        board[i] = 'X';
        let w = winner(board);
        if (w) { end(w); render(); return; }
        const ai = aiMove();
        if (ai != null) board[ai] = 'O';
        w = winner(board);
        if (w) end(w);
        else status.textContent = 'نوبت توست';
        render();
      };
      grid.appendChild(btn);
    });
  }
  function end(w) {
    over = true;
    if (w === 'X') { status.textContent = 'بردیا 🎉'; showToast('دوز: بردی!', 'success'); }
    else if (w === 'O') status.textContent = 'رایانه برد';
    else status.textContent = 'مساوی';
  }
  const restart = document.createElement('button');
  restart.type = 'button';
  restart.className = 'btn-secondary';
  restart.style.cssText = 'display:block;margin:12px auto 0;width:auto';
  restart.textContent = 'شروع دوباره';
  restart.onclick = () => { board = Array(9).fill(''); over = false; status.textContent = 'نوبت توست'; render(); };
  body.appendChild(status);
  body.appendChild(grid);
  body.appendChild(restart);
  render();
}


// ========== Hokm (حکم) vs AI ==========
function initHokmGame(body) {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const SUIT_NAMES = { '♠': 'پیک', '♥': 'دل', '♦': 'خشت', '♣': 'گشنیز' };
  const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const RANK_VAL = Object.fromEntries(RANKS.map((r,i)=>[r,i]));
  const NAMES = ['تو', 'حریف راست', 'یار', 'حریف چپ']; // 0 human, 1 right, 2 partner, 3 left
  const TEAM = [0, 1, 0, 1]; // 0 = us, 1 = them

  let deck, hands, trump, hakem, leader, trick, tricksWon, phase, selectedSuit;
  let dealAnim = true; // only animate player hand on new deal

  const scoreEl = document.getElementById('game-stage-score');
  body.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'hokm-root hokm-pro';
  body.appendChild(root);

  function newDeck() {
    const d = [];
    for (const s of SUITS) for (const r of RANKS) d.push({ s, r, id: s + r });
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }
  function sortHand(h) {
    return h.slice().sort((a, b) => {
      if (a.s !== b.s) return SUITS.indexOf(a.s) - SUITS.indexOf(b.s);
      return RANK_VAL[b.r] - RANK_VAL[a.r];
    });
  }
  function faceLabel(r) {
    return ({ J: 'J', Q: 'Q', K: 'K', A: 'A' })[r] || r;
  }
  function faceName(r) {
    return ({ J: 'سرباز', Q: 'بی‌بی', K: 'شاه', A: 'آس' })[r] || '';
  }
  function pipsHTML(rank, suit) {
    const n = rank === 'A' ? 1 : (parseInt(rank, 10) || 0);
    if (!n) {
      // face card
      return `<div class="hk-face">
        <div class="hk-face-badge">${faceLabel(rank)}</div>
        <div class="hk-face-suit">${suit}</div>
        <div class="hk-face-name">${faceName(rank)}</div>
      </div>`;
    }
    // classic-ish pip grid positions 1..10
    const map = {
      1: [5],
      2: [2, 8],
      3: [2, 5, 8],
      4: [1, 3, 7, 9],
      5: [1, 3, 5, 7, 9],
      6: [1, 3, 4, 6, 7, 9],
      7: [1, 3, 4, 5, 6, 7, 9],
      8: [1, 3, 4, 5, 6, 7, 8, 9],
      9: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      10: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    };
    const spots = map[n] || [5];
    let html = '<div class="hk-pips">';
    for (let i = 1; i <= 10; i++) {
      if (spots.includes(i)) html += `<span class="hk-pip p${i}">${suit}</span>`;
      else html += `<span class="hk-pip empty p${i}"></span>`;
    }
    html += '</div>';
    return html;
  }
  function cardInner(c) {
    return `
      <div class="hk-corner top"><span>${c.r}</span><span>${c.s}</span></div>
      ${pipsHTML(c.r, c.s)}
      <div class="hk-corner bot"><span>${c.r}</span><span>${c.s}</span></div>`;
  }
  function cardHTML(c, face = true, opts = {}) {
    const cls = opts.cls || '';
    const anim = opts.anim || '';
    if (!face || !c) {
      return `<div class="hk-card hk-back ${cls} ${anim}" aria-hidden="true">
        <div class="hk-back-inner">
          <div class="hk-back-pattern"></div>
          <span class="hk-back-logo">AIO</span>
        </div>
      </div>`;
    }
    const red = (c.s === '♥' || c.s === '♦') ? ' red' : '';
    return `<div class="hk-card${red} ${cls} ${anim}" data-id="${c.id}">${cardInner(c)}</div>`;
  }
  function cardButtonHTML(c, can, animIdx) {
    const red = (c.s === '♥' || c.s === '♦') ? ' red' : '';
    const dealCls = dealAnim ? ' deal-in' : '';
    const delay = (dealAnim && animIdx != null) ? `style="--d:${animIdx * 0.055}s"` : '';
    return `<button type="button" class="hk-card hk-btn${dealCls}${red}${can?' playable':''}" data-id="${c.id}" ${can?'':'disabled'} ${delay}>
      ${cardInner(c)}
    </button>`;
  }
  function highestInTrick(cards, ledSuit) {
    // cards: [{player, card}]
    let best = null;
    for (const play of cards) {
      if (!best) { best = play; continue; }
      const a = play.card, b = best.card;
      const aTr = a.s === trump, bTr = b.s === trump;
      if (aTr && !bTr) best = play;
      else if (!aTr && bTr) continue;
      else if (aTr && bTr) {
        if (RANK_VAL[a.r] > RANK_VAL[b.r]) best = play;
      } else if (a.s === ledSuit && b.s === ledSuit) {
        if (RANK_VAL[a.r] > RANK_VAL[b.r]) best = play;
      } else if (a.s === ledSuit && b.s !== ledSuit) best = play;
    }
    return best;
  }
  function legalCards(hand, ledSuit) {
    if (!ledSuit) return hand.slice();
    const ofSuit = hand.filter(c => c.s === ledSuit);
    return ofSuit.length ? ofSuit : hand.slice();
  }
  function aiChooseTrump(hand) {
    const counts = { '♠':0,'♥':0,'♦':0,'♣':0 };
    const strength = { '♠':0,'♥':0,'♦':0,'♣':0 };
    hand.forEach(c => {
      counts[c.s]++;
      strength[c.s] += RANK_VAL[c.r];
    });
    return SUITS.slice().sort((a,b) => (counts[b]*10+strength[b]) - (counts[a]*10+strength[a]))[0];
  }
  function aiPlay(hand, ledSuit) {
    const legal = legalCards(hand, ledSuit);
    // simple: if can win with low trump / high of suit, else dump low
    legal.sort((a,b) => RANK_VAL[a.r] - RANK_VAL[b.r]);
    if (!ledSuit) {
      // lead mid-high non-trump preferably
      const non = legal.filter(c => c.s !== trump);
      const pool = non.length ? non : legal;
      return pool[Math.floor(pool.length / 2)];
    }
    const ofLed = legal.filter(c => c.s === ledSuit);
    if (ofLed.length) return ofLed[ofLed.length - 1]; // highest of suit
    const trumps = legal.filter(c => c.s === trump);
    if (trumps.length) return trumps[0]; // low trump
    return legal[0];
  }

  function deal() {
    deck = newDeck();
    hands = [[],[],[],[]];
    for (let i = 0; i < 52; i++) hands[i % 4].push(deck[i]);
    hands = hands.map(sortHand);
    hakem = Math.floor(Math.random() * 4);
    trump = null;
    selectedSuit = null;
    leader = hakem;
    trick = [];
    tricksWon = [0, 0]; // team0, team1
    phase = 'trump';
    dealAnim = true;
    if (hakem === 0) {
      render();
      dealAnim = false;
    } else {
      trump = aiChooseTrump(hands[hakem]);
      phase = 'play';
      render();
      dealAnim = false;
      setTimeout(advancePlay, 550);
    }
  }

  function render(winnerPlayer) {
    const us = tricksWon[0], them = tricksWon[1];
    scoreEl.textContent = `ما ${us}  |  ${them} آن‌ها` + (trump ? `  ·  حکم ${trump} ${SUIT_NAMES[trump]}` : '');
    let html = '';
    // opponents top = partner (2)
    html += `<div class="hokm-row opp"><div class="hokm-label">${NAMES[2]} ${hakem===2?'👑':''}</div><div class="hokm-hand mini">`;
    html += hands[2].map(() => cardHTML(null, false)).join('');
    html += `</div></div>`;
    // middle row: left opp, table, right opp
    html += `<div class="hokm-mid">`;
    html += `<div class="hokm-side"><div class="hokm-label">${NAMES[3]} ${hakem===3?'👑':''}</div><div class="hokm-hand vert">`;
    html += hands[3].map(() => cardHTML(null, false)).join('');
    html += `</div></div>`;
    html += `<div class="hokm-table hokm-felt">`;
    if (phase === 'trump' && hakem === 0) {
      html += `<div class="hokm-trump-pick"><div class="hokm-trump-badge">👑 حاکم</div><p>خال حکم را انتخاب کن</p><div class="hokm-suits">`;
      for (const s of SUITS) {
        html += `<button type="button" class="hokm-suit-btn" data-suit="${s}">${s}<small>${SUIT_NAMES[s]}</small></button>`;
      }
      html += `</div></div>`;
    } else {
      const slots = [null, null, null, null];
      trick.forEach(p => { slots[p.player] = p.card; });
      html += `<div class="hokm-trick">`;
      html += `<div class="ht-slot top">${slots[2] ? cardHTML(slots[2], true, {cls:'on-table from-top' + (winnerPlayer===2?' win':'')}) : '<div class="hk-slot-empty"></div>'}</div>`;
      html += `<div class="ht-row"><div class="ht-slot">${slots[3] ? cardHTML(slots[3], true, {cls:'on-table from-left' + (winnerPlayer===3?' win':'')}) : '<div class="hk-slot-empty"></div>'}</div>`;
      html += `<div class="ht-slot center-info">${trump ? 'حکم '+trump : '…'}</div>`;
      html += `<div class="ht-slot">${slots[1] ? cardHTML(slots[1], true, {cls:'on-table from-right' + (winnerPlayer===1?' win':'')}) : '<div class="hk-slot-empty"></div>'}</div></div>`;
      html += `<div class="ht-slot bottom">${slots[0] ? cardHTML(slots[0], true, {cls:'on-table from-bottom' + (winnerPlayer===0?' win':'')}) : '<div class="hk-slot-empty"></div>'}</div>`;
      html += `</div>`;
    }
    html += `</div>`;
    html += `<div class="hokm-side"><div class="hokm-label">${NAMES[1]} ${hakem===1?'👑':''}</div><div class="hokm-hand vert">`;
    html += hands[1].map(() => cardHTML(null, false)).join('');
    html += `</div></div></div>`;
    // human hand
    const led = trick.length ? trick[0].card.s : null;
    const legal = phase === 'play' ? legalCards(hands[0], led).map(c => c.id) : [];
    html += `<div class="hokm-row me"><div class="hokm-label">${NAMES[0]} ${hakem===0?'👑':''}</div><div class="hokm-hand me-hand">`;
    hands[0].forEach((c, i) => {
      const can = phase === 'play' && legal.includes(c.id) && isHumanTurn();
      html += cardButtonHTML(c, can, i);
    });
    html += `</div></div>`;
    html += `<div class="hokm-status" id="hokm-status"></div>`;
    html += `<button type="button" class="btn-secondary" id="hokm-new" style="width:auto;margin:10px auto;display:block">دست جدید</button>`;
    root.innerHTML = html;

    const st = root.querySelector('#hokm-status');
    if (phase === 'done') {
      const msg = tricksWon[0] >= 7 ? 'بردید! 🎉' : 'باختید';
      st.textContent = msg + ` (ما ${tricksWon[0]} — ${tricksWon[1]} آن‌ها)`;
    } else if (phase === 'trump' && hakem === 0) {
      st.textContent = 'یک خال را به‌عنوان حکم انتخاب کن';
    } else if (isHumanTurn()) {
      st.textContent = 'نوبت تو — یک کارت مجاز بازی کن';
    } else {
      st.textContent = 'نوبت حریف…';
    }

    root.querySelectorAll('.hokm-suit-btn').forEach(btn => {
      btn.onclick = () => {
        trump = btn.dataset.suit;
        phase = 'play';
        render();
        setTimeout(advancePlay, 700);
      };
    });
    root.querySelectorAll('.hk-btn.playable').forEach(btn => {
      btn.onclick = () => humanPlay(btn.dataset.id);
    });
    root.querySelector('#hokm-new')?.addEventListener('click', () => { deal(); });
  }

  function isHumanTurn() {
    if (phase !== 'play') return false;
    const next = (leader + trick.length) % 4;
    return next === 0;
  }

  function humanPlay(cardId) {
    if (!isHumanTurn()) return;
    const idx = hands[0].findIndex(c => c.id === cardId);
    if (idx < 0) return;
    const led = trick.length ? trick[0].card.s : null;
    const legal = legalCards(hands[0], led);
    const card = hands[0][idx];
    if (!legal.some(c => c.id === card.id)) return;
    hands[0].splice(idx, 1);
    trick.push({ player: 0, card });
    render();
    setTimeout(advancePlay, 420);
  }

  function advancePlay() {
    if (phase !== 'play') return;
    if (trick.length === 4) {
      const ledSuit = trick[0].card.s;
      const win = highestInTrick(trick, ledSuit);
      // highlight winner briefly
      render(win.player);
      tricksWon[TEAM[win.player]]++;
      const nextLeader = win.player;
      setTimeout(() => {
        leader = nextLeader;
        trick = [];
        if (tricksWon[0] >= 7 || tricksWon[1] >= 7 || hands.every(h => h.length === 0)) {
          phase = 'done';
          render();
          if (tricksWon[0] >= 7) showToast('حکم: بردید!', 'success');
          return;
        }
        render();
        setTimeout(advancePlay, 500);
      }, 750);
      return;
    }
    const next = (leader + trick.length) % 4;
    if (next === 0) {
      render();
      return; // wait human
    }
    // AI plays
    const led = trick.length ? trick[0].card.s : null;
    const card = aiPlay(hands[next], led);
    const ix = hands[next].findIndex(c => c.id === card.id);
    if (ix >= 0) hands[next].splice(ix, 1);
    trick.push({ player: next, card });
    render();
    setTimeout(advancePlay, 550);
  }

  deal();
}
