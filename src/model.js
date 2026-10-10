export const TODAY = '2026-10-08';
export const STORAGE_KEY = 'vtb-subscriptions-demo-v1';

export function createInitialState() {
  return {
    version: 1,
    budget: { limit: 2500, incomeDate: '2026-10-20' },
    notificationsEnabled: true,
    detectedDismissed: false,
    subscriptions: [
      { id: 'plus', name: 'Яндекс Плюс', category: 'Музыка, кино и кешбэк', logo: 'plus', color: '#ffedee', amount: 449, previousAmount: 299, priceAcknowledged: false, nextDate: '2026-10-09', mode: 'auto', limit: 350, status: 'scheduled', enabled: true },
      { id: 'ivi', name: 'Иви', category: 'Фильмы и сериалы', logo: 'ivi', color: '#fff0f5', amount: 399, nextDate: '2026-10-08', mode: 'confirm', limit: 500, status: 'scheduled', enabled: true },
      { id: 'icloud', name: 'iCloud+', category: 'Облачное хранилище · 50 ГБ', logo: 'cloud', color: '#eaf4ff', amount: 149, nextDate: '2026-10-12', mode: 'auto', limit: 200, status: 'scheduled', enabled: true },
      { id: 'mobile', name: 'МТС', category: 'Мобильная связь', logo: 'mts', color: '#fff0f0', amount: 890, nextDate: '2026-10-14', mode: 'auto', limit: 1000, status: 'scheduled', enabled: true },
      { id: 'fitness', name: 'FitStars', category: 'Тренировки дома', logo: 'fit', color: '#eefaeb', amount: 1190, nextDate: '2026-10-18', mode: 'auto', limit: 1300, status: 'scheduled', enabled: true },
      { id: 'books', name: 'Литрес', category: 'Книги и аудиокниги', logo: 'books', color: '#fff3e9', amount: 299, nextDate: '2026-10-22', mode: 'confirm', limit: 350, status: 'scheduled', enabled: true }
    ],
    history: [
      { id: 'h1', subscriptionId: 'plus', name: 'Яндекс Плюс', logo: 'plus', type: 'paid', amount: 299, date: '2026-09-09', title: 'Автоматическая оплата' },
      { id: 'h2', subscriptionId: 'ivi', name: 'Иви', logo: 'ivi', type: 'paid', amount: 399, date: '2026-09-08', title: 'Оплачено с подтверждением' },
      { id: 'h3', subscriptionId: 'icloud', name: 'iCloud+', logo: 'cloud', type: 'paid', amount: 149, date: '2026-09-12', title: 'Автоматическая оплата' },
      { id: 'h4', subscriptionId: 'mobile', name: 'МТС', logo: 'mts', type: 'paid', amount: 890, date: '2026-09-14', title: 'Автоматическая оплата' },
      { id: 'h5', subscriptionId: 'fitness', name: 'FitStars', logo: 'fit', type: 'paid', amount: 1190, date: '2026-09-18', title: 'Автоматическая оплата' }
    ]
  };
}

export function getBudget(state) {
  const spent = state.history.filter(h => h.type === 'paid' && h.date >= TODAY && h.date < state.budget.incomeDate).reduce((sum, h) => sum + h.amount, 0);
  const planned = state.subscriptions.filter(s => s.enabled && s.status === 'scheduled' && s.nextDate >= TODAY && s.nextDate < state.budget.incomeDate).reduce((sum, s) => sum + s.amount, 0);
  const available = state.budget.limit - spent;
  return { spent, planned, available, remaining: available - planned, monthly: state.subscriptions.filter(s => s.enabled).reduce((sum, s) => sum + s.amount, 0) };
}

export function priceChanged(s) { return !!s.previousAmount && s.amount > s.previousAmount && !s.priceAcknowledged; }
export function nextMonth(date) {
  const [year, month, day] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export function paymentGate(state, s, consent = false) {
  if (!s.enabled) return { code: 'cancelled', message: 'Подписка отключена. Списание не состоится.' };
  if (s.status !== 'scheduled') return { code: 'blocked', message: 'Этот платёж заблокирован. Сначала разрешите списание.' };
  if (!consent && priceChanged(s)) return { code: 'price', message: 'Стоимость выросла. Нужно ваше согласие на новую цену.' };
  if (!consent && s.amount > s.limit) return { code: 'limit', message: 'Сумма выше лимита. Автоматическое списание остановлено.' };
  if (!consent && s.mode === 'confirm') return { code: 'confirm', message: 'Ждём вашего подтверждения. Деньги ещё не списаны.' };
  if (s.amount > getBudget(state).available) return { code: 'budget', message: 'Недостаточно бюджета для этого платежа. Увеличьте бюджет или перенесите списание.' };
  return { code: 'allowed', message: 'Платёж разрешён' };
}

export function addEvent(state, s, type, title, extra = {}) {
  state.history.unshift({ id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, subscriptionId: s.id, name: s.name, logo: s.logo, date: TODAY, type, title, amount: s.amount, ...extra });
}

export function pay(state, id, consent = false) {
  const s = state.subscriptions.find(s => s.id === id);
  if (!s) return { code: 'missing', message: 'Подписка не найдена' };
  const result = paymentGate(state, s, consent);
  if (result.code !== 'allowed') return result;
  addEvent(state, s, 'paid', consent ? 'Оплачено с подтверждением' : 'Автоматическая оплата', { paymentDate: s.nextDate });
  s.nextDate = nextMonth(s.nextDate);
  s.priceAcknowledged = true;
  return { code: 'paid', message: 'Оплата выполнена' };
}

export function movePayment(state, id, date) {
  const s = state.subscriptions.find(s => s.id === id);
  if (!s || !s.enabled) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date <= s.nextDate || date > '2026-12-31') return false;
  const previousDate = s.nextDate;
  s.nextDate = date;
  s.status = 'scheduled';
  addEvent(state, s, 'moved', 'Платёж перенесён', { previousDate, newDate: date });
  return true;
}

export function blockPayment(state, id) {
  const s = state.subscriptions.find(s => s.id === id);
  if (!s || !s.enabled) return;
  s.status = 'blocked';
  addEvent(state, s, 'blocked', 'Ближайшее списание заблокировано');
}

export function cancelSubscription(state, id) {
  const s = state.subscriptions.find(s => s.id === id);
  if (!s) return;
  s.enabled = false;
  s.status = 'cancelled';
  addEvent(state, s, 'cancelled', 'Подписка отключена');
}

export function loadState(storage) {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    if (saved?.version === 1 && Array.isArray(saved.subscriptions) && Array.isArray(saved.history) && Number.isFinite(saved.budget?.limit) && saved.budget.limit > 0 && /^\d{4}-\d{2}-\d{2}$/.test(saved.budget.incomeDate) && saved.subscriptions.every(s => typeof s.id === 'string' && Number.isFinite(s.amount) && Number.isFinite(s.limit) && ['auto', 'confirm'].includes(s.mode) && ['scheduled', 'blocked', 'cancelled'].includes(s.status) && /^\d{4}-\d{2}-\d{2}$/.test(s.nextDate))) return saved;
  } catch { /* A new demo also works without local storage. */ }
  return createInitialState();
}
