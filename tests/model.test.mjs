import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, getBudget, pay, paymentGate, movePayment, blockPayment, cancelSubscription, nextMonth, loadState } from '../src/model.js';

test('forecast includes scheduled payments before income, excludes the income day', () => {
  const state = createInitialState();
  assert.deepEqual(getBudget(state), { spent: 0, planned: 3077, available: 2500, remaining: -577, monthly: 3376 });
  assert.equal(movePayment(state, 'fitness', '2026-10-20'), true);
  assert.equal(getBudget(state).remaining, 613);
  assert.equal(getBudget(state).planned, 1887);
});

test('unconfirmed payment does not move the date or debit the budget', () => {
  const state = createInitialState();
  assert.equal(pay(state, 'ivi').code, 'confirm');
  assert.equal(state.subscriptions.find(s => s.id === 'ivi').nextDate, '2026-10-08');
  assert.equal(getBudget(state).spent, 0);
  assert.equal(pay(state, 'ivi', true).code, 'paid');
  assert.equal(getBudget(state).spent, 399);
  assert.equal(getBudget(state).available, 2101);
  assert.equal(getBudget(state).planned, 2678);
  assert.equal(getBudget(state).remaining, -577);
});

test('automatic payment succeeds within limit and adds one transaction', () => {
  const state = createInitialState();
  const before = state.history.length;
  assert.equal(pay(state, 'icloud').code, 'paid');
  assert.equal(state.history.length, before + 1);
  assert.equal(state.subscriptions.find(s => s.id === 'icloud').nextDate, '2026-11-12');
  assert.equal(getBudget(state).spent, 149);
});

test('price rise prevents automatic payment even with a higher limit', () => {
  const state = createInitialState();
  const s = state.subscriptions.find(s => s.id === 'plus');
  s.limit = 1000;
  assert.equal(pay(state, 'plus').code, 'price');
  assert.equal(getBudget(state).spent, 0);
  assert.equal(pay(state, 'plus', true).code, 'paid');
  assert.equal(s.priceAcknowledged, true);
});

test('limit stops auto payment; explicit one-time consent preserves the limit', () => {
  const state = createInitialState();
  const s = state.subscriptions.find(s => s.id === 'mobile');
  s.limit = 700;
  assert.equal(pay(state, 'mobile').code, 'limit');
  assert.equal(pay(state, 'mobile', true).code, 'paid');
  assert.equal(s.limit, 700);
  assert.equal(paymentGate(state, s).code, 'limit');
});

test('switching from confirmation to automatic permits payment within the limit', () => {
  const state = createInitialState();
  const s = state.subscriptions.find(s => s.id === 'ivi');
  assert.equal(paymentGate(state, s).code, 'confirm');
  s.mode = 'auto';
  assert.equal(pay(state, 'ivi').code, 'paid');
});

test('insufficient available budget blocks automatic and confirmed payments', () => {
  const state = createInitialState();
  state.budget.limit = 100;
  assert.equal(pay(state, 'icloud').code, 'budget');
  assert.equal(pay(state, 'ivi', true).code, 'budget');
  assert.equal(getBudget(state).spent, 0);
});

test('blocking a payment preserves the subscription and monthly costs', () => {
  const state = createInitialState();
  blockPayment(state, 'fitness');
  const s = state.subscriptions.find(s => s.id === 'fitness');
  assert.equal(s.enabled, true);
  assert.equal(getBudget(state).planned, 1887);
  assert.equal(getBudget(state).monthly, 3376);
  assert.equal(pay(state, 'fitness', true).code, 'blocked');
  s.status = 'scheduled';
  assert.equal(getBudget(state).planned, 3077);
});

test('cancellation excludes the subscription from all future costs', () => {
  const state = createInitialState();
  cancelSubscription(state, 'fitness');
  assert.equal(getBudget(state).planned, 1887);
  assert.equal(getBudget(state).monthly, 2186);
  assert.equal(pay(state, 'fitness', true).code, 'cancelled');
});

test('invalid and earlier reschedule dates are rejected without changing the forecast', () => {
  const state = createInitialState();
  for (const date of ['2026-10-17', '2026-10-18', '2026-11-31', '2027-01-01', 'invalid']) assert.equal(movePayment(state, 'fitness', date), false);
  assert.equal(getBudget(state).remaining, -577);
});

test('month boundaries preserve valid dates', () => {
  assert.equal(nextMonth('2026-01-31'), '2026-02-28');
  assert.equal(nextMonth('2028-01-31'), '2028-02-29');
  assert.equal(nextMonth('2026-12-31'), '2027-01-31');
});

test('local state restores and invalid storage falls back to demo defaults', () => {
  const state = createInitialState();
  cancelSubscription(state, 'ivi');
  assert.equal(loadState({ getItem: () => JSON.stringify(state) }).subscriptions.find(s => s.id === 'ivi').enabled, false);
  for (const value of ['broken', '{}', JSON.stringify({ ...state, budget: { limit: -1 } })]) assert.equal(loadState({ getItem: () => value }).subscriptions.length, 6);
  assert.equal(loadState({ getItem: () => { throw new Error('Unavailable'); } }).budget.limit, 2500);
});
