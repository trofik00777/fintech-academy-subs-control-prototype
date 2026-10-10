import { TODAY, STORAGE_KEY, createInitialState, getBudget, priceChanged, paymentGate, pay, movePayment, blockPayment, cancelSubscription, addEvent, loadState } from './model.js';
import { icon, logo, vtbLogo } from './icons.js';

let state = loadState(window.localStorage);
const ui = { page: 'overview', filter: 'all', search: '', modal: null, month: 9, year: 2026, historyFilter: 'all' };
let installPrompt = null;
let toastTimer;
let previouslyFocused;
const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
const money = value => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const dateLabel = (date, options = {}) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', ...options }).format(new Date(`${date}T12:00:00Z`));
const shortDate = date => dateLabel(date, { month: 'short' }).replace('.', '');
const dateContext = date => date === TODAY ? 'Сегодня' : date === '2026-10-09' ? 'Завтра' : shortDate(date);
const attentionDate = date => [TODAY, '2026-10-09'].includes(date) ? `${dateContext(date).toLowerCase()}, ${shortDate(date)}` : shortDate(date);
const getSubscription = id => state.subscriptions.find(s => s.id === id);
const active = () => state.subscriptions.filter(s => s.enabled);
const needsAttention = s => s.enabled && s.status === 'scheduled' && (priceChanged(s) || s.amount > s.limit || s.mode === 'confirm');
const button = (label, action, className = 'primary', extra = '') => `<button class="btn ${className}" data-action="${action}" ${extra}>${label}</button>`;

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* The demo remains usable if storage is unavailable. */ }
}

function status(s) {
  if (!s.enabled) return { label: 'Отключена', className: 'neutral', symbol: 'pause' };
  if (s.status === 'blocked') return { label: 'Списание заблокировано', className: 'neutral', symbol: 'lock' };
  if (priceChanged(s)) return { label: 'Новая цена', className: 'orange', symbol: 'arrowUp' };
  if (s.amount > s.limit) return { label: 'Выше лимита', className: 'orange', symbol: 'warning' };
  if (s.mode === 'confirm') return { label: 'С подтверждением', className: 'blue', symbol: 'shield' };
  return { label: 'Автооплата', className: 'green', symbol: 'refresh' };
}

function nav() {
  return [['overview', 'grid', 'Обзор'], ['calendar', 'calendar', 'Календарь'], ['history', 'history', 'История']].map(([page, glyph, name]) => `<button class="nav-item ${ui.page === page ? 'active' : ''}" data-action="navigate" data-page="${page}" ${ui.page === page ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${name}</span>${page === 'overview' ? '<span class="nav-dot"></span>' : ''}</button>`).join('');
}

function render() {
  const focused = document.activeElement?.id;
  const caret = focused === 'subscription-search' ? document.activeElement.selectionStart : null;
  const unread = state.notificationsEnabled ? state.subscriptions.filter(needsAttention).length : 0;
  app.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-brand">${vtbLogo}<span class="brand-divider"></span><span class="brand-online">Онлайн</span></div>
      <div class="sidebar-service"><span class="service-emblem">${icon('refresh')}</span><div>Контроль<br>подписок</div></div>
      <div class="nav-label">ВАШИ ПОДПИСКИ</div>
      <nav class="desktop-nav" aria-label="Разделы сервиса">${nav()}</nav>
      <div class="sidebar-bottom">
        <button class="sidebar-link" data-action="preferences">${icon('bell')}<span>Уведомления</span></button>
        <button class="sidebar-link" data-action="help">${icon('info')}<span>Как это работает</span></button>
        <div class="sidebar-safety">${icon('shield')}<span>Всё под вашим<br>контролем</span></div>
        <span class="demo-caption">Демонстрационный прототип</span>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="breadcrumbs"><span>Сервисы</span>${icon('chevron')}<span>Контроль подписок</span></div>
        <div class="mobile-brand">${vtbLogo}<span>Онлайн</span></div>
        <div class="topbar-actions">
          <button class="demo-button" data-action="demo" aria-label="Демо-сценарии">${icon('play')}<span>Демо-сценарии</span></button>
          <button class="icon-button notifications-button" data-action="notifications" aria-label="Уведомления${unread ? `: ${unread}` : ''}">${icon('bell')}${unread ? `<span class="notification-dot">${unread}</span>` : ''}</button>
          <button class="avatar" data-action="profile" aria-label="Профиль Алексея">АК</button>
        </div>
      </header>
      <main class="main-content" id="main-content">
        <div class="page-heading"><div><div class="heading-eyebrow">Деньги работают по вашим правилам</div><h1>${ui.page === 'overview' ? 'Контроль подписок' : ui.page === 'calendar' ? 'Календарь платежей' : 'История событий'}</h1><p>${ui.page === 'overview' ? 'Управляйте регулярными платежами без сюрпризов' : ui.page === 'calendar' ? 'Все списания — в одном календаре' : 'Оплаты и изменения ваших подписок'}</p></div><div class="today-pill">${icon('calendar')}8 октября 2026</div></div>
        ${ui.page === 'overview' ? overview() : ui.page === 'calendar' ? calendar() : history()}
        <footer class="page-footer"><span>${icon('shield')}Ваши решения — под защитой ВТБ</span><button data-action="help">О сервисе${icon('arrow')}</button></footer>
      </main>
    </div>
    <nav class="mobile-nav" aria-label="Разделы сервиса">${nav()}</nav>`;
  if (focused === 'subscription-search') {
    const input = document.getElementById(focused);
    input?.focus();
    input?.setSelectionRange(caret, caret);
  }
}

function overview() {
  const b = getBudget(state);
  const attention = active().find(s => s.status === 'scheduled' && (priceChanged(s) || s.amount > s.limit));
  const upcoming = active().filter(s => s.status === 'scheduled').sort((a, b) => a.nextDate.localeCompare(b.nextDate))[0];
  return `
    <section class="summary-grid" aria-label="Бюджет и важные события">
      <article class="budget-card">
        <div class="budget-decoration" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="budget-top"><span>${icon('wallet')}Бюджет на подписки</span><button class="budget-edit" data-action="budget" aria-label="Настроить бюджет">${icon('settings')}</button></div>
        <div class="budget-value">${money(b.available)}</div>
        <div class="budget-period">Доступно до ${dateLabel(state.budget.incomeDate)}<span class="small-dot"></span>поступления дохода</div>
        <div class="budget-progress" role="img" aria-label="Запланировано ${money(b.planned)} при доступном бюджете ${money(b.available)}"><span style="width:${Math.min(100, b.planned / Math.max(b.available, 1) * 100)}%" class="${b.remaining < 0 ? 'over-budget' : ''}"></span></div>
        <div class="budget-stats"><div><span>Ближайшие списания</span><strong>${money(b.planned)}</strong></div><div class="budget-forecast"><span>${b.remaining < 0 ? 'Не хватает' : 'Останется'}</span><strong>${b.remaining < 0 ? icon('warning') : icon('check')}${money(Math.abs(b.remaining))}</strong></div></div>
      </article>
      ${attention ? `<article class="attention-card"><div class="attention-top"><span class="eyebrow orange-text">${icon('warning')}ТРЕБУЕТ ВНИМАНИЯ</span>${logo(attention)}</div><h2>${priceChanged(attention) ? 'Новая цена. <br>Решаете вы.' : 'Сумма выше <br>вашего лимита.'}</h2><p>${escape(attention.name)} · ${attentionDate(attention.nextDate)}</p><div class="price-line">${attention.previousAmount ? `<del>${money(attention.previousAmount)}</del>` : ''}<strong>${money(attention.amount)}</strong>${attention.previousAmount ? `<span class="price-delta">+${money(attention.amount - attention.previousAmount)}</span>` : ''}</div><button class="attention-action" data-action="payment" data-id="${attention.id}">Проверить платёж${icon('arrow')}</button></article>` : `<article class="attention-card all-good"><div class="attention-top"><span class="eyebrow green-text">${icon('check')}ВСЁ В ПОРЯДКЕ</span><span class="good-symbol">${icon('shield')}</span></div><h2>Никаких <br>неожиданных трат.</h2><p>Стоимость подписок под контролем.<br>Вы узнаете, если что-то изменится.</p><button class="attention-action" data-action="preferences">Настроить уведомления${icon('arrow')}</button></article>`}
    </section>
    ${b.remaining < 0 ? `<div class="budget-alert">${icon('info')}<p>Ближайшие платежи превышают бюджет на <strong>${money(-b.remaining)}</strong>. Перенесите часть списаний или увеличьте бюджет.</p><button data-action="budget">Настроить${icon('chevron')}</button></div>` : ''}
    ${upcoming ? `<section class="next-payment"><div class="next-date"><strong>${Number(upcoming.nextDate.slice(-2))}</strong><span>${dateLabel(upcoming.nextDate, { day: undefined, month: 'short' }).replace('.', '')}</span></div><div class="next-payment-text"><span class="eyebrow">БЛИЖАЙШИЙ ПЛАТЁЖ</span><div><strong>${escape(upcoming.name)}</strong><span class="next-separator">·</span><span>${dateContext(upcoming.nextDate)}</span></div></div><strong class="next-payment-amount">${money(upcoming.amount)}</strong>${button(upcoming.mode === 'confirm' || needsAttention(upcoming) ? 'Подтвердить' : 'Подробнее', upcoming.mode === 'confirm' || needsAttention(upcoming) ? 'payment' : 'details', 'soft', `data-id="${upcoming.id}"`)}</section>` : ''}
    <section class="subscriptions-section" aria-label="Список подписок"><div class="section-heading"><div><h2>Мои подписки <span class="count-badge">${active().length}</span></h2><p>Все регулярные платежи в одном месте</p></div>${!state.detectedDismissed && !getSubscription('disk') ? `<button class="discovery-button" data-action="discovery">${icon('sparkles')}Найдена подписка${icon('chevron')}</button>` : `<button class="discovery-button" data-action="discovery">${icon('search')}Поиск подписок</button>`}</div>
      <div class="subscriptions-card"><div class="list-toolbar"><div class="filter-tabs" role="group" aria-label="Фильтр подписок">${[['all', 'Все'], ['attention', 'Требуют внимания'], ['inactive', 'Отключённые']].map(([filter, name]) => `<button class="filter-tab ${ui.filter === filter ? 'active' : ''}" data-action="filter" data-filter="${filter}" aria-pressed="${ui.filter === filter}">${name}${filter === 'attention' && state.subscriptions.filter(needsAttention).length ? `<span>${state.subscriptions.filter(needsAttention).length}</span>` : ''}</button>`).join('')}</div><label class="search-field">${icon('search')}<input id="subscription-search" type="search" placeholder="Найти подписку" value="${escape(ui.search)}" aria-label="Поиск подписки"></label></div>
      <div class="list-column-head"><span>Сервис</span><span>Следующее списание</span><span>Режим оплаты</span><span>Сумма</span><span></span></div>
      <div class="subscription-list">${subscriptionRows()}</div>
      <div class="list-footer"><span>${icon('refresh')}Регулярные расходы в месяц</span><strong>${money(b.monthly)}</strong></div></div>
    </section>
    <div class="protection-note"><span class="protection-icon">${icon('shield')}</span><div><strong>Подписки под защитой</strong><p>Если цена вырастет или сумма превысит лимит, мы остановим автооплату и попросим ваше согласие.</p></div><button class="icon-button" data-action="help" aria-label="Как работает защита">${icon('chevron')}</button></div>`;
}

function subscriptionRows() {
  const subscriptions = state.subscriptions.filter(s => (ui.filter === 'all' || (ui.filter === 'attention' ? needsAttention(s) : !s.enabled)) && s.name.toLowerCase().includes(ui.search.toLowerCase())).sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.nextDate.localeCompare(b.nextDate));
  if (!subscriptions.length) return `<div class="empty-state">${icon(ui.search ? 'search' : 'check')}<h3>${ui.search ? 'Подписка не найдена' : ui.filter === 'inactive' ? 'Нет отключённых подписок' : 'Всё под контролем'}</h3><p>${ui.search ? 'Попробуйте другое название' : ui.filter === 'inactive' ? 'Отключённые сервисы появятся здесь' : 'Нет платежей, требующих вашего решения'}</p></div>`;
  return subscriptions.map(s => {
    const st = status(s);
    return `<button class="subscription-row ${!s.enabled ? 'is-inactive' : ''}" data-action="details" data-id="${s.id}"><span class="service-cell">${logo(s)}<span class="service-name"><strong>${escape(s.name)}</strong><span>${escape(s.category)}</span></span></span><span class="date-cell"><strong>${s.enabled ? shortDate(s.nextDate) : 'Без списаний'}</strong><span>${s.enabled ? s.status === 'blocked' ? 'Не будет списан' : s.nextDate === TODAY ? 'Сегодня' : s.nextDate === '2026-10-09' ? 'Завтра' : s.nextDate < state.budget.incomeDate ? 'До поступления дохода' : 'После поступления дохода' : 'Подписка отключена'}</span></span><span class="mode-cell"><span class="status-badge ${st.className}">${icon(st.symbol)}${st.label}</span></span><span class="amount-cell"><strong>${money(s.amount)}</strong>${priceChanged(s) ? `<del>${money(s.previousAmount)}</del>` : '<span>в месяц</span>'}</span><span class="row-chevron">${icon('chevron')}</span><span class="mobile-row-meta"><span>${s.enabled ? `${dateContext(s.nextDate)} · ` : ''}</span><span class="${st.className}-text">${st.label}</span></span></button>`;
  }).join('');
}

function calendar() {
  const date = new Date(Date.UTC(ui.year, ui.month, 1));
  const offset = (date.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(ui.year, ui.month + 1, 0)).getUTCDate();
  const monthLabel = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(date).replace(' г.', '');
  const prefix = `${ui.year}-${String(ui.month + 1).padStart(2, '0')}-`;
  const payments = state.subscriptions.filter(s => s.enabled && s.nextDate.startsWith(prefix)).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  const total = payments.filter(s => s.status === 'scheduled').reduce((sum, s) => sum + s.amount, 0);
  return `<section class="calendar-layout"><div class="calendar-card"><div class="calendar-header"><h2>${monthLabel}</h2><div><button class="icon-button" data-action="month" data-offset="-1" aria-label="Предыдущий месяц">${icon('back')}</button><button class="calendar-today" data-action="calendar-today">Сегодня</button><button class="icon-button" data-action="month" data-offset="1" aria-label="Следующий месяц">${icon('chevron')}</button></div></div><div class="calendar-weekdays">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => `<span>${day}</span>`).join('')}</div><div class="calendar-grid">${Array.from({ length: offset }, () => '<div class="calendar-day outside"></div>').join('')}${Array.from({ length: days }, (_, i) => {
    const current = prefix + String(i + 1).padStart(2, '0');
    const dayPayments = payments.filter(s => s.nextDate === current);
    return `<div class="calendar-day ${current === TODAY ? 'is-today' : ''} ${current === state.budget.incomeDate ? 'is-income' : ''}"><span class="day-number">${i + 1}</span>${current === state.budget.incomeDate ? '<span class="income-label">Доход</span>' : ''}${dayPayments.map(s => `<button class="calendar-event ${s.status === 'blocked' ? 'is-blocked' : ''}" data-action="details" data-id="${s.id}" aria-label="${escape(s.name)}, ${money(s.amount)}, ${shortDate(s.nextDate)}">${logo(s)}<span>${escape(s.name)}<small>${money(s.amount)}</small></span><i class="event-dot logo-${s.logo}"></i></button>`).join('')}</div>`;
  }).join('')}</div><div class="calendar-legend"><span><i class="legend-dot blue"></i>Сегодня</span><span><i class="legend-dot green"></i>Поступление дохода</span><span>${icon('lock')}Заблокированные платежи не учитываются</span></div></div><aside class="month-summary"><span class="eyebrow">ПЛАН НА МЕСЯЦ</span><h2>${money(total)}</h2><p>${payments.filter(s => s.status === 'scheduled').length} предстоящих платежей</p><div class="month-payment-list">${payments.length ? payments.map(s => `<button data-action="details" data-id="${s.id}">${logo(s)}<span><strong>${escape(s.name)}</strong><small>${shortDate(s.nextDate)}${s.status === 'blocked' ? ' · Заблокирован' : ''}</small></span><strong>${money(s.amount)}</strong></button>`).join('') : '<p class="muted">На этот месяц платежей нет</p>'}</div>${button(`${icon('wallet')}Настроить бюджет`, 'budget', 'soft full')}</aside></section>`;
}

function history() {
  const events = [...state.history].filter(h => ui.historyFilter === 'all' || (ui.historyFilter === 'paid' ? h.type === 'paid' : h.type !== 'paid')).sort((a, b) => b.date.localeCompare(a.date));
  const paid = state.history.filter(h => h.type === 'paid' && h.date.startsWith('2026-10')).reduce((sum, h) => sum + h.amount, 0);
  return `<section class="history-summary"><div><span class="eyebrow">ОПЛАЧЕНО В ОКТЯБРЕ</span><h2>${money(paid)}</h2><p>Все решения сохраняются в истории</p></div><span class="history-illustration">${icon('history')}</span></section><section class="history-card"><div class="filter-tabs history-tabs">${[['all', 'Все события'], ['paid', 'Оплаты'], ['changes', 'Изменения']].map(([filter, label]) => `<button class="filter-tab ${ui.historyFilter === filter ? 'active' : ''}" data-action="history-filter" data-filter="${filter}" aria-pressed="${ui.historyFilter === filter}">${label}</button>`).join('')}</div>${events.length ? events.map((h, index) => `${index === 0 || h.date !== events[index - 1].date ? `<div class="history-date">${dateLabel(h.date)}</div>` : ''}<button class="history-row" data-action="details" data-id="${h.subscriptionId}">${logo(h.logo)}<span class="history-info"><strong>${escape(h.name)}</strong><span>${escape(h.title)}${h.type === 'moved' ? ` · на ${shortDate(h.newDate)}` : ''}</span></span><span class="history-result ${h.type === 'paid' ? '' : 'muted'}">${h.type === 'paid' ? `−${money(h.amount)}` : icon(h.type === 'blocked' ? 'lock' : h.type === 'moved' ? 'calendar' : h.type === 'cancelled' ? 'pause' : 'settings')}</span>${icon('chevron')}</button>`).join('') : `<div class="empty-state">${icon('history')}<h3>Здесь появятся события</h3><p>Оплатите или измените подписку</p></div>`}</section>`;
}

function showModal(type, id = null, data = {}) {
  if (!ui.modal) previouslyFocused = document.activeElement;
  ui.modal = { type, id, ...data };
  renderModal();
}

function closeModal() {
  const dialog = modalRoot.querySelector('dialog');
  if (dialog?.open) dialog.close();
  modalRoot.innerHTML = '';
  ui.modal = null;
  document.body.classList.remove('modal-open');
  if (previouslyFocused?.isConnected) previouslyFocused.focus();
}

function renderModal() {
  const m = ui.modal;
  if (!m) return;
  const s = getSubscription(m.id);
  let title = '';
  let content = '';
  let wide = false;
  if (m.type === 'details' && s) {
    const st = status(s);
    title = 'Детали подписки';
    content = `<div class="detail-service">${logo(s, 'large')}<div><h2>${escape(s.name)}</h2><p>${escape(s.category)}</p></div></div><div class="detail-price"><strong>${money(s.amount)}</strong><span>в месяц</span><span class="status-badge ${st.className}">${icon(st.symbol)}${st.label}</span></div>
      ${priceChanged(s) ? `<div class="inline-notice orange">${icon('warning')}<div><strong>Стоимость выросла с ${money(s.previousAmount)} до ${money(s.amount)}</strong><p>Без вашего согласия новую сумму не спишем. Ваш лимит — ${money(s.limit)}.</p></div></div>` : s.status === 'blocked' ? `<div class="inline-notice">${icon('lock')}<div><strong>Ближайшее списание заблокировано</strong><p>Подписка остаётся активной. Этот платёж исключён из прогноза бюджета.</p></div></div>` : !s.enabled ? `<div class="inline-notice">${icon('pause')}<div><strong>Подписка отключена</strong><p>Все будущие платежи исключены из прогноза.</p></div></div>` : s.amount > s.limit ? `<div class="inline-notice orange">${icon('warning')}<div><strong>Сумма выше лимита ${money(s.limit)}</strong><p>Автооплата остановится. Можно разрешить платёж разово или изменить лимит.</p></div></div>` : ''}
      <div class="detail-facts"><div><span>Следующий платёж</span><strong>${s.enabled ? dateLabel(s.nextDate) : 'Нет запланированных'}</strong></div><div><span>Счёт для списания</span><strong>${icon('card')}Мастер-счёт · 0314</strong></div></div>
      ${s.enabled ? `<div class="settings-section"><div class="settings-title"><h3>Как оплачивать</h3>${icon('shield')}</div><div class="mode-options"><button data-action="set-mode" data-id="${s.id}" data-mode="auto" class="mode-option ${s.mode === 'auto' ? 'selected' : ''}" aria-pressed="${s.mode === 'auto'}">${icon('refresh')}<strong>Автоматически</strong><span>В пределах лимита</span><i>${s.mode === 'auto' ? icon('check') : ''}</i></button><button data-action="set-mode" data-id="${s.id}" data-mode="confirm" class="mode-option ${s.mode === 'confirm' ? 'selected' : ''}" aria-pressed="${s.mode === 'confirm'}">${icon('shield')}<strong>С подтверждением</strong><span>Только с вашего согласия</span><i>${s.mode === 'confirm' ? icon('check') : ''}</i></button></div><button class="setting-row" data-action="limit" data-id="${s.id}"><span><strong>Лимит одного списания</strong><small>Не спишем больше без согласия</small></span><strong>${money(s.limit)}${icon('chevron')}</strong></button></div><div class="detail-actions">${s.status === 'blocked' ? button(`${icon('check')}Разрешить списание`, 'unblock', 'primary full', `data-id="${s.id}"`) : button(`${icon(s.mode === 'confirm' || needsAttention(s) ? 'shield' : 'play')}${s.mode === 'confirm' || needsAttention(s) ? 'Проверить и подтвердить' : 'Проверить автооплату'}`, 'attempt', 'primary full', `data-id="${s.id}"`)}<div class="split-actions">${button(`${icon('calendar')}Перенести`, 'reschedule', 'soft', `data-id="${s.id}"`)}${s.status === 'scheduled' ? button(`${icon('lock')}Заблокировать`, 'block-confirm', 'soft', `data-id="${s.id}"`) : ''}</div><button class="text-button danger-text" data-action="cancel-confirm" data-id="${s.id}">Отключить подписку</button></div>` : `<div class="detail-actions">${button('Подключить снова', 'reactivate', 'primary full', `data-id="${s.id}"`)}</div>`}<p class="modal-footnote">${icon('info')}Демонстрация: платежи и действия с сервисами имитируются.</p>`;
  } else if (m.type === 'payment' && s) {
    title = 'Подтверждение платежа';
    const gate = paymentGate(state, s, true);
    const changed = priceChanged(s);
    const overLimit = s.amount > s.limit;
    content = `<div class="payment-service">${logo(s, 'large')}<h2>${escape(s.name)}</h2><p>Списание ${dateLabel(s.nextDate)}</p><strong class="payment-amount">${money(s.amount)}</strong>${changed ? `<span class="previous-price">Раньше ${money(s.previousAmount)}<span class="price-delta">+${money(s.amount - s.previousAmount)}</span></span>` : ''}</div>
      ${changed || overLimit ? `<div class="inline-notice orange">${icon('shield')}<div><strong>${changed ? 'Новая цена требует вашего согласия' : 'Сумма превышает установленный лимит'}</strong><p>${overLimit ? `Лимит — ${money(s.limit)}. Подтверждение разрешит только этот платёж; лимит останется прежним.` : 'Подтвердите оплату по новой стоимости.'}</p></div></div>` : '<div class="inline-notice">' + icon('shield') + '<div><strong>Без согласия деньги не спишутся</strong><p>Вы управляете каждой оплатой этой подписки.</p></div></div>'}
      <div class="detail-facts"><div><span>Счёт для списания</span><strong>Мастер-счёт · 0314</strong></div><div><span>Доступный бюджет</span><strong>${money(getBudget(state).available)}</strong></div><div><span>После этой оплаты</span><strong class="${gate.code === 'budget' ? 'danger-text' : ''}">${money(getBudget(state).available - s.amount)}</strong></div></div>
      ${gate.code !== 'allowed' ? `<div class="inline-notice orange">${icon('warning')}<div><strong>${gate.code === 'budget' ? 'Не хватает бюджета' : 'Списание недоступно'}</strong><p>${gate.message}</p></div></div>${button(gate.code === 'budget' ? 'Увеличить бюджет' : 'К подписке', gate.code === 'budget' ? 'budget' : 'details', 'primary full', `data-id="${s.id}"`)}` : `<form id="payment-form" data-id="${s.id}">${changed || overLimit ? `<label class="consent-check"><input type="checkbox" name="consent" required><span>Согласен на разовое списание <strong>${money(s.amount)}</strong>${changed ? ' по новой цене' : ' сверх лимита'}</span></label>` : ''}${button(`${icon('check')}Оплатить ${money(s.amount)}`, 'submit-payment', 'primary full', 'type="submit"')}</form>`}
      <div class="split-actions payment-alternatives">${button('Перенести', 'reschedule', 'soft', `data-id="${s.id}"`)}${button('Заблокировать', 'block-confirm', 'soft', `data-id="${s.id}"`)}</div><p class="modal-footnote">Демо-оплата: реальные деньги не списываются.</p>`;
  } else if (m.type === 'budget') {
    title = 'Бюджет на подписки';
    const b = getBudget(state);
    content = `<div class="modal-intro"><span class="modal-symbol">${icon('wallet')}</span><h2>Сколько можно потратить?</h2><p>Выделите сумму на регулярные платежи до следующего поступления дохода.</p></div><form id="budget-form"><label class="form-field"><span>Бюджет на период</span><div class="money-input"><input name="budget" type="number" min="${Math.max(1, b.spent)}" max="1000000" step="1" required value="${state.budget.limit}" inputmode="numeric"><span>₽</span></div></label><div class="amount-presets">${[2500, 4000, 5000].map(value => `<button type="button" data-action="budget-preset" data-value="${value}">${money(value)}</button>`).join('')}</div><label class="form-field"><span>Следующее поступление дохода</span><input name="income" type="date" min="2026-10-09" max="2026-12-31" value="${state.budget.incomeDate}" required></label><div class="budget-preview" id="budget-preview">${budgetPreview(state.budget.limit, state.budget.incomeDate)}</div><p class="field-hint">Бюджет включает ${money(b.spent)} уже оплаченных подписок за текущий период.</p><div class="form-error" role="alert"></div>${button('Сохранить бюджет', 'submit-budget', 'primary full', 'type="submit"')}</form>`;
  } else if (m.type === 'limit' && s) {
    title = 'Лимит списания';
    content = `<div class="detail-service">${logo(s)}<div><h2>${escape(s.name)}</h2><p>Текущая стоимость ${money(s.amount)}</p></div></div><form id="limit-form" data-id="${s.id}"><label class="form-field"><span>Максимальная сумма одного платежа</span><div class="money-input"><input name="limit" type="number" min="1" max="100000" step="1" value="${s.limit}" inputmode="numeric" required><span>₽</span></div></label><div class="inline-notice">${icon('shield')}<div><strong>Выше лимита — только с вашего согласия</strong><p>Если сервис попробует списать больше, автоматическая оплата остановится.</p></div></div>${button('Сохранить лимит', 'submit-limit', 'primary full', 'type="submit"')}</form>`;
  } else if (m.type === 'reschedule' && s) {
    title = 'Перенести платёж';
    const newDate = s.nextDate < state.budget.incomeDate ? state.budget.incomeDate : new Date(new Date(`${s.nextDate}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
    content = `<div class="detail-service">${logo(s)}<div><h2>${escape(s.name)}</h2><p>${money(s.amount)} · сейчас ${shortDate(s.nextDate)}</p></div></div><form id="reschedule-form" data-id="${s.id}"><label class="form-field"><span>Новая дата списания</span><input name="date" type="date" min="${new Date(new Date(`${s.nextDate}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)}" max="2026-12-31" value="${newDate}" required></label>${s.nextDate < state.budget.incomeDate ? `<button type="button" class="date-preset" data-action="after-income" data-date="${state.budget.incomeDate}">${icon('calendar')}После поступления дохода · ${shortDate(state.budget.incomeDate)}${icon('check')}</button>` : ''}<div class="reschedule-preview" id="reschedule-preview">${reschedulePreview(s, newDate)}</div><div class="inline-notice">${icon('info')}<div><strong>Перенос в демонстрационном режиме</strong><p>В прототипе меняется дата платежа. Возможность переноса у внешнего сервиса требует отдельной интеграции.</p></div></div><div class="form-error" role="alert"></div>${button('Перенести платёж', 'submit-reschedule', 'primary full', 'type="submit"')}</form>`;
  } else if (['block-confirm', 'cancel-confirm'].includes(m.type) && s) {
    const block = m.type === 'block-confirm';
    title = block ? 'Заблокировать списание' : 'Отключить подписку';
    content = `<div class="modal-intro"><span class="modal-symbol ${block ? '' : 'danger-symbol'}">${icon(block ? 'lock' : 'pause')}</span><h2>${block ? 'Пропустить этот платёж?' : `Отключить ${escape(s.name)}?`}</h2><p>${block ? `${money(s.amount)} за ${escape(s.name)} ${dateLabel(s.nextDate)} не спишутся. Подписка останется активной.` : 'Будущие списания прекратятся, а подписка будет исключена из прогноза бюджета.'}</p></div><div class="impact-card"><span>${block ? 'Уменьшение ближайших расходов' : 'Экономия каждый месяц'}</span><strong>${money(block && s.nextDate >= state.budget.incomeDate ? 0 : s.amount)}</strong></div><div class="inline-notice">${icon('info')}<div><strong>${block ? 'Блокировка не отменяет подписку' : 'Отмена у внешнего сервиса имитируется'}</strong><p>${block ? 'Доступ к сервису зависит от его правил. Заблокированное списание можно снова разрешить здесь.' : 'В рабочем продукте отмена потребует интеграции с сервисом. В демо отключение применяется сразу.'}</p></div></div>${button(block ? 'Заблокировать платёж' : 'Отключить подписку', block ? 'block' : 'cancel', `${block ? 'primary' : 'danger'} full`, `data-id="${s.id}"`)}${button('Вернуться к подписке', 'details', 'soft full', `data-id="${s.id}"`)}`;
  } else if (m.type === 'success') {
    title = 'Готово';
    content = `<div class="success-content"><span class="success-symbol">${icon('check')}</span><h2>${escape(m.heading)}</h2><p>${escape(m.message)}</p>${m.amount ? `<strong class="success-amount">${money(m.amount)}</strong>` : ''}<div class="success-budget"><span>Прогноз до ${shortDate(state.budget.incomeDate)}</span><strong class="${getBudget(state).remaining < 0 ? 'orange-text' : 'green-text'}">${getBudget(state).remaining < 0 ? 'Не хватает ' + money(-getBudget(state).remaining) : 'Останется ' + money(getBudget(state).remaining)}</strong></div>${button('Понятно', 'close', 'primary full')}${button('Посмотреть историю', 'open-history', 'text full')}</div>`;
  } else if (m.type === 'notifications') {
    title = 'Уведомления';
    const items = state.subscriptions.filter(needsAttention).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    content = `<p class="modal-description">${state.notificationsEnabled ? 'Напоминаем о платежах и сообщаем об изменениях' : 'Напоминания отключены. Платежи для проверки по-прежнему доступны в списке.'}</p>${items.length ? items.map(s => `<button class="notification-item" data-action="payment" data-id="${s.id}">${logo(s)}<span><strong>${priceChanged(s) ? 'Стоимость подписки выросла' : s.amount > s.limit ? 'Сумма выше лимита' : 'Подтвердите оплату'}</strong><span>${escape(s.name)} · ${money(s.amount)} · ${dateContext(s.nextDate).toLowerCase()}</span><small>${priceChanged(s) || s.amount > s.limit ? 'Автооплата остановлена' : 'Ожидает вашего решения'}</small></span>${icon('chevron')}</button>`).join('') : `<div class="empty-state">${icon('check')}<h3>Всё под контролем</h3><p>Новых уведомлений нет</p></div>`}${button('Настроить уведомления', 'preferences', 'soft full')}<p class="modal-footnote">В демо уведомления отображаются внутри приложения.</p>`;
  } else if (m.type === 'preferences') {
    title = 'Настройки уведомлений';
    content = `<div class="modal-intro"><span class="modal-symbol">${icon('bell')}</span><h2>Всегда быть в курсе</h2><p>Напомним перед списанием и сообщим, если стоимость изменится.</p></div><button class="toggle-row" data-action="toggle-notifications" role="switch" aria-checked="${state.notificationsEnabled}"><span><strong>Напоминания о платежах</strong><small>Внутри сервиса «Контроль подписок»</small></span><span class="toggle ${state.notificationsEnabled ? 'on' : ''}"><i></i></span></button><div class="inline-notice">${icon('shield')}<div><strong>Защита работает всегда</strong><p>Лимиты и согласие на новую цену действуют даже при отключённых напоминаниях.</p></div></div>${button('Готово', 'close', 'primary full')}`;
  } else if (m.type === 'discovery') {
    title = 'Найденные подписки';
    content = !getSubscription('disk') && !state.detectedDismissed ? `<div class="modal-intro"><span class="modal-symbol">${icon('sparkles')}</span><h2>Кажется, это подписка</h2><p>Нашли повторяющиеся списания в истории вашего счёта.</p></div><div class="discovered-service">${logo('disk', 'large')}<div><h2>Яндекс 360</h2><p>Облачное хранилище · ${money(159)}/мес.</p></div></div><div class="detected-history"><span class="eyebrow">3 ПОХОЖИХ СПИСАНИЯ</span>${['2026-10-05', '2026-09-05', '2026-08-05'].map(date => `<div><span>${dateLabel(date)}</span><strong>−${money(159)}</strong></div>`).join('')}</div><p class="field-hint">Это тестовая история операций. Следующий платёж — 5 ноября. После добавления вы сможете настроить режим и лимит.</p>${button('Добавить в мои подписки', 'add-discovered', 'primary full')}${button('Это не подписка', 'dismiss-discovered', 'text full')}` : `<div class="empty-state">${icon('check')}<h3>Все подписки найдены</h3><p>Новых повторяющихся списаний пока нет</p></div>${button('Понятно', 'close', 'primary full')}`;
  } else if (m.type === 'demo') {
    title = 'Демо-сценарии';
    wide = true;
    content = `<div class="demo-intro"><span class="demo-chip">${icon('play')}ИНТЕРАКТИВНЫЙ ПРОТОТИП</span><h2>Попробуйте разные ситуации</h2><p>Каждый сценарий начинает демонстрацию заново.<br>Все платежи и данные — тестовые.</p></div><div class="scenario-grid">${[
      ['confirm', 'shield', '01', 'Оплата с подтверждением', 'Получите уведомление и разрешите платёж Иви.'],
      ['price', 'arrowUp', '02', 'Стоимость выросла', 'Новая цена Яндекс Плюса выше лимита. Решите, оплачивать ли её.'],
      ['limit', 'lock', '03', 'Защита лимитом', 'Попробуйте автооплату МТС с лимитом ниже стоимости.'],
      ['budget', 'wallet', '04', 'Не хватает бюджета', 'Перенесите FitStars на день поступления дохода и сравните прогноз.'],
      ['auto', 'refresh', '05', 'Автоматическая оплата', 'Оплатите iCloud+ автоматически в пределах лимита.'],
      ['cancel', 'pause', '06', 'Отказ от подписки', 'Заблокируйте один платёж или отключите FitStars полностью.']
    ].map(([scenario, glyph, number, name, description]) => `<button class="scenario-card" data-action="scenario" data-scenario="${scenario}"><span class="scenario-top">${icon(glyph)}<small>${number}</small></span><strong>${name}</strong><span>${description}</span>${icon('arrow')}</button>`).join('')}</div><div class="demo-bottom"><span>${icon('calendar')}Дата демо: 8 октября 2026</span><button class="text-button" data-action="reset-confirm">${icon('refresh')}Сбросить всё</button></div>${installPrompt ? button(`${icon('download')}Установить приложение`, 'install', 'soft full') : ''}`;
  } else if (m.type === 'reset-confirm') {
    title = 'Сбросить демо';
    content = `<div class="modal-intro"><span class="modal-symbol">${icon('refresh')}</span><h2>Начать заново?</h2><p>Ваши изменения в прототипе будут сброшены. Вернутся исходные подписки, бюджет и тестовая история.</p></div>${button('Сбросить изменения', 'reset', 'primary full')}${button('Сохранить изменения', 'close', 'soft full')}`;
  } else if (m.type === 'help') {
    title = 'О сервисе';
    content = `<div class="modal-intro"><span class="modal-symbol">${icon('shield')}</span><h2>Подписки под контролем</h2><p>Здесь вы решаете, когда и сколько платить.</p></div><div class="help-steps">${[['refresh', 'Автооплата в пределах лимита', 'Платёж проходит, если цена не изменилась и бюджета хватает.'], ['shield', 'Подтверждение перед оплатой', 'Без вашего согласия платёж не считается выполненным.'], ['calendar', 'Планирование до дохода', 'Прогноз учитывает активные платежи до даты дохода. Платёж в день дохода относится к следующему периоду.'], ['lock', 'Блокировка и отключение', 'Блокировка пропускает ближайшее списание. Отключение убирает все будущие платежи подписки.']].map(([glyph, name, description]) => `<div>${icon(glyph)}<span><strong>${name}</strong><p>${description}</p></span></div>`).join('')}</div><div class="inline-notice">${icon('info')}<div><strong>Это демонстрационный прототип</strong><p>Нет связи с банком и внешними сервисами. Данные сохраняются только в этом браузере. Перенос и отмена у поставщика имитируются.</p></div></div>${button('Всё понятно', 'close', 'primary full')}`;
  } else if (m.type === 'profile') {
    title = 'Демо-профиль';
    content = `<div class="modal-intro"><span class="profile-avatar">АК</span><h2>Алексей Кузнецов</h2><p>Тестовый клиент ВТБ<br>Мастер-счёт · 0314</p></div><div class="inline-notice">${icon('info')}<div><strong>Данные вымышленные</strong><p>Прототип показывает только сервис управления подписками.</p></div></div>${button('Открыть демо-сценарии', 'demo', 'primary full')}`;
  }
  if (!content) { closeModal(); return; }
  modalRoot.innerHTML = `<dialog class="modal ${wide ? 'modal-wide' : ''}" aria-labelledby="modal-title"><div class="sheet-handle" aria-hidden="true"></div><header class="modal-header">${['payment', 'limit', 'reschedule', 'block-confirm', 'cancel-confirm'].includes(m.type) && s ? `<button class="icon-button" data-action="details" data-id="${s.id}" aria-label="Назад к подписке">${icon('back')}</button>` : ''}<h2 id="modal-title">${title}</h2><button class="icon-button modal-close" data-action="close" aria-label="Закрыть">${icon('close')}</button></header><div class="modal-body">${content}</div></dialog>`;
  document.body.classList.add('modal-open');
  const dialog = modalRoot.querySelector('dialog');
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeModal(); } });
  dialog.showModal();
  dialog.querySelector('.modal-close')?.focus();
}

function budgetPreview(limit, income) {
  if (!Number.isFinite(limit) || !income) return '';
  const preview = getBudget({ ...state, budget: { limit, incomeDate: income } });
  return `<div><span>Платежи до ${shortDate(income)}</span><strong>${money(preview.planned)}</strong></div><div><span>${preview.remaining < 0 ? 'Не хватает' : 'Прогноз остатка'}</span><strong class="${preview.remaining < 0 ? 'orange-text' : 'green-text'}">${money(Math.abs(preview.remaining))}</strong></div>`;
}

function reschedulePreview(s, date) {
  const next = structuredClone(state);
  const sub = next.subscriptions.find(sub => sub.id === s.id);
  sub.nextDate = date;
  sub.status = 'scheduled';
  const current = getBudget(state);
  const after = getBudget(next);
  return `<span class="eyebrow">ПРОГНОЗ ДО ${shortDate(state.budget.incomeDate).toUpperCase()}</span><div class="forecast-comparison"><div><span>Сейчас</span><strong class="${current.remaining < 0 ? 'orange-text' : ''}">${money(current.remaining)}</strong></div>${icon('arrow')}<div><span>После переноса</span><strong class="${after.remaining < 0 ? 'orange-text' : 'green-text'}">${money(after.remaining)}</strong></div></div>`;
}

function toast(message) {
  const element = document.querySelector('#toast');
  clearTimeout(toastTimer);
  element.innerHTML = `${icon('check')}<span>${escape(message)}</span>`;
  element.classList.add('visible');
  toastTimer = setTimeout(() => element.classList.remove('visible'), 3500);
}

function changed(message) { save(); render(); if (message) toast(message); }
function success(heading, message, amount) { changed(); showModal('success', null, { heading, message, amount }); }

function attempt(id) {
  const s = getSubscription(id);
  const result = pay(state, id);
  if (result.code === 'paid') success('Подписка оплачена', `${s.name}: автооплата прошла в пределах лимита. Следующий платёж — ${dateLabel(s.nextDate)}.`, s.amount);
  else if (['price', 'limit', 'confirm', 'budget'].includes(result.code)) { showModal('payment', id); toast(result.message); }
  else toast(result.message);
}

document.addEventListener('click', event => {
  const element = event.target.closest('[data-action]');
  if (!element) return;
  const { action, id } = element.dataset;
  const s = getSubscription(id);
  if (action.startsWith('submit-')) return;
  if (action === 'navigate') { closeModal(); ui.page = element.dataset.page; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  else if (action === 'close') closeModal();
  else if (['details', 'payment', 'budget', 'limit', 'reschedule', 'block-confirm', 'cancel-confirm', 'notifications', 'preferences', 'discovery', 'demo', 'reset-confirm', 'help', 'profile'].includes(action)) showModal(action, id);
  else if (action === 'filter') { ui.filter = element.dataset.filter; render(); }
  else if (action === 'history-filter') { ui.historyFilter = element.dataset.filter; render(); }
  else if (action === 'set-mode' && s) { s.mode = element.dataset.mode; addEvent(state, s, 'settings', `Режим: ${s.mode === 'auto' ? 'автоматическая оплата' : 'с подтверждением'}`); changed('Режим оплаты сохранён'); renderModal(); }
  else if (action === 'attempt') attempt(id);
  else if (action === 'block' && s) { blockPayment(state, id); success('Списание заблокировано', `${money(s.amount)} за ${s.name} не спишутся. Подписка остаётся активной — вы можете разрешить платёж позже.`); }
  else if (action === 'cancel' && s) { cancelSubscription(state, id); success('Подписка отключена', `${s.name}: будущие платежи исключены из прогноза. Экономия — ${money(s.amount)} в месяц.`); }
  else if (action === 'unblock' && s) { s.status = 'scheduled'; addEvent(state, s, 'settings', 'Списание снова разрешено'); changed('Платёж снова учтён в бюджете'); showModal('details', id); }
  else if (action === 'reactivate' && s) { s.enabled = true; s.status = 'scheduled'; addEvent(state, s, 'settings', 'Подписка подключена снова'); changed('Подписка подключена'); renderModal(); }
  else if (action === 'budget-preset') { const form = document.querySelector('#budget-form'); form.elements.budget.value = element.dataset.value; updateBudgetPreview(form); }
  else if (action === 'after-income') { const form = document.querySelector('#reschedule-form'); form.elements.date.value = element.dataset.date; document.querySelector('#reschedule-preview').innerHTML = reschedulePreview(getSubscription(form.dataset.id), form.elements.date.value); }
  else if (action === 'toggle-notifications') { state.notificationsEnabled = !state.notificationsEnabled; changed(); renderModal(); }
  else if (action === 'open-history') { closeModal(); ui.page = 'history'; render(); window.scrollTo({ top: 0 }); }
  else if (action === 'add-discovered') { if (getSubscription('disk')) return; state.subscriptions.push({ id: 'disk', name: 'Яндекс 360', category: 'Облачное хранилище', logo: 'disk', amount: 159, nextDate: '2026-11-05', mode: 'confirm', limit: 200, status: 'scheduled', enabled: true }); addEvent(state, getSubscription('disk'), 'settings', 'Подписка найдена и добавлена'); changed('Яндекс 360 добавлен в подписки'); showModal('details', 'disk'); }
  else if (action === 'dismiss-discovered') { state.detectedDismissed = true; changed('Платёж исключён из найденных подписок'); closeModal(); }
  else if (action === 'reset') { state = createInitialState(); ui.filter = 'all'; ui.search = ''; ui.page = 'overview'; changed('Демо возвращено к исходному состоянию'); closeModal(); }
  else if (action === 'scenario') startScenario(element.dataset.scenario);
  else if (action === 'month') { const date = new Date(Date.UTC(ui.year, ui.month + Number(element.dataset.offset), 1)); ui.year = date.getUTCFullYear(); ui.month = date.getUTCMonth(); render(); }
  else if (action === 'calendar-today') { ui.year = 2026; ui.month = 9; render(); }
  else if (action === 'install' && installPrompt) { installPrompt.prompt(); installPrompt = null; }
});

function updateBudgetPreview(form) {
  const limit = Number(form.elements.budget.value);
  const income = form.elements.income.value;
  if (income) document.querySelector('#budget-preview').innerHTML = budgetPreview(limit, income);
}

document.addEventListener('input', event => {
  if (event.target.id === 'subscription-search') { ui.search = event.target.value; render(); }
  if (event.target.closest('#budget-form')) updateBudgetPreview(event.target.closest('form'));
  if (event.target.closest('#reschedule-form') && event.target.value) { const form = event.target.closest('form'); document.querySelector('#reschedule-preview').innerHTML = reschedulePreview(getSubscription(form.dataset.id), form.elements.date.value); }
});

document.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const id = form.dataset.id;
  const s = getSubscription(id);
  if (form.id === 'payment-form') {
    const result = pay(state, id, true);
    if (result.code === 'paid') success('Платёж подтверждён', `${s.name} оплачен. Следующее списание — ${dateLabel(s.nextDate)}.${s.amount > s.limit ? ' Лимит остаётся прежним.' : ''}`, s.amount);
    else { toast(result.message); showModal('payment', id); }
  } else if (form.id === 'budget-form') {
    const limit = Number(form.elements.budget.value);
    const incomeDate = form.elements.income.value;
    if (!Number.isInteger(limit) || limit < Math.max(1, getBudget(state).spent) || limit > 1000000 || incomeDate <= TODAY || incomeDate > '2026-12-31') { form.querySelector('.form-error').textContent = 'Проверьте сумму и дату поступления дохода.'; return; }
    state.budget = { limit, incomeDate };
    changed('Бюджет сохранён. Прогноз обновлён');
    closeModal();
  } else if (form.id === 'limit-form' && s) {
    const limit = Number(form.elements.limit.value);
    if (!Number.isInteger(limit) || limit <= 0 || limit > 100000) return;
    s.limit = limit;
    addEvent(state, s, 'settings', `Лимит списания: ${money(limit)}`);
    changed('Лимит сохранён');
    showModal('details', id);
  } else if (form.id === 'reschedule-form' && s) {
    const date = form.elements.date.value;
    if (!movePayment(state, id, date)) { form.querySelector('.form-error').textContent = 'Выберите дату позже текущего списания, до 31 декабря 2026.'; return; }
    success('Платёж перенесён', `${money(s.amount)} за ${s.name} запланированы на ${dateLabel(date)}. Прогноз бюджета обновлён.`);
  }
});

function startScenario(scenario) {
  state = createInitialState();
  ui.page = 'overview'; ui.filter = 'all'; ui.search = '';
  if (scenario === 'auto') state.budget.limit = 5000;
  if (scenario === 'limit') { const s = getSubscription('mobile'); s.limit = 700; }
  changed();
  const config = { confirm: ['notifications'], price: ['payment', 'plus'], limit: ['details', 'mobile'], budget: ['reschedule', 'fitness'], auto: ['details', 'icloud'], cancel: ['details', 'fitness'] };
  showModal(...config[scenario]);
  window.scrollTo({ top: 0 });
}

window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
render();
