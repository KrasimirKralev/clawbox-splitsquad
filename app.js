import { parseAmount, validateName, computeBalances, settle, canRemovePerson, tripTotal } from './logic.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'splitsquad.v1';
let state = { people: [], expenses: [] };
let storageFailed = false;
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
function error(id, message = '') { $(id).textContent = message; $(id).hidden = !message; }
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function empty(container, icon, title, message) {
  const box = element('div', 'empty');
  const symbol = element('div', 'empty-icon', icon);
  symbol.setAttribute('aria-hidden', 'true');
  box.append(symbol, element('strong', '', title), element('p', '', message));
  container.append(box);
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    $('save-status').replaceChildren(element('span', 'status-dot'), document.createTextNode('Saved on this device'));
    if (storageFailed) { storageFailed = false; error('global-error'); }
  } catch {
    storageFailed = true;
    $('save-status').textContent = 'Changes are not saved';
    error('global-error', 'Device storage is unavailable. Keep this page open to keep your trip.');
  }
}
let raw = null;
try {
  raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved.people) || !Array.isArray(saved.expenses)) throw new Error();
    const checked = [];
    for (const person of saved.people) {
      if (typeof person !== 'string' || validateName(person, checked) !== person) throw new Error();
      checked.push(person);
    }
    for (const expense of saved.expenses) {
      if (typeof expense.id !== 'string' || typeof expense.description !== 'string' || !expense.description.trim() || !Array.isArray(expense.participants)) throw new Error();
    }
    if (new Set(saved.expenses.map(e => e.id)).size !== saved.expenses.length) throw new Error();
    computeBalances(saved.people, saved.expenses);
    tripTotal(saved.expenses);
    state = saved;
  }
} catch {
  let backedUp = false;
  try {
    if (raw) { localStorage.setItem(`${STORAGE_KEY}.backup-${Date.now()}`, raw); backedUp = true; }
  } catch { /* storage unavailable; nothing more to preserve */ }
  error('global-error', backedUp
    ? 'We couldn’t restore saved trip data. A copy of it was kept on this device; you can start a new trip here.'
    : 'We couldn’t restore saved trip data. You can start a new trip here.');
  $('save-status').textContent = 'Saved trip unavailable';
}

function renderParticipants(selected = new Set(state.people)) {
  $('participants').replaceChildren();
  for (const person of state.people) {
    const label = element('label', 'participant');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = person;
    checkbox.checked = $('everyone').checked || selected.has(person);
    checkbox.addEventListener('change', syncEveryone);
    label.append(checkbox, document.createTextNode(person));
    $('participants').append(label);
  }
  syncEveryone();
}
function syncEveryone() {
  const inputs = [...$('participants').querySelectorAll('input')];
  if (!inputs.length) return;
  const count = inputs.filter(input => input.checked).length;
  $('everyone').checked = inputs.length > 0 && count === inputs.length;
  $('everyone').indeterminate = count > 0 && count < inputs.length;
}
function focusAfterRemoval(selector, index, fallbackId) {
  const buttons = document.querySelectorAll(selector);
  const target = buttons[Math.min(index, buttons.length - 1)];
  (target || $(fallbackId)).focus();
}
function render() {
  const selected = new Set([...$('participants').querySelectorAll('input:checked')].map(input => input.value));
  const oldPayer = $('payer').value;
  $('people-count').textContent = state.people.length;
  $('expense-count').textContent = state.expenses.length;
  $('tab-count').textContent = `${state.expenses.length} expense${state.expenses.length === 1 ? '' : 's'}`;
  $('people-list').replaceChildren();
  $('payer').replaceChildren();
  if (!state.people.length) $('payer').append(new Option('Add people first', ''));
  for (const [personIndex, person] of state.people.entries()) {
    const chip = element('div', 'chip');
    const remove = element('button', '', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${person}`);
    remove.addEventListener('click', () => {
      if (!canRemovePerson(person, state.expenses)) {
        error('person-error', `${person} is part of an expense. Delete their expenses before removing them.`);
        return;
      }
      state.people = state.people.filter(name => name !== person);
      error('person-error');
      persist(); render();
      focusAfterRemoval('#people-list button', personIndex, 'person-name');
    });
    chip.append(element('span', 'chip-name', person), remove);
    $('people-list').append(chip);
    $('payer').append(new Option(person, person));
  }
  if (state.people.includes(oldPayer)) $('payer').value = oldPayer;
  renderParticipants(selected);
  $('people-hint').hidden = state.people.length >= 2;
  const total = tripTotal(state.expenses);
  $('total').textContent = money(total);
  $('average').textContent = money(state.people.length ? Math.round(total / state.people.length) : 0);
  const balances = computeBalances(state.people, state.expenses);
  $('balance-area').hidden = !state.people.length;
  $('balances').replaceChildren();
  for (const [person, balance] of Object.entries(balances)) {
    const row = element('div', 'balance-row');
    row.append(element('span', '', person), element('strong', balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'neutral', `${balance > 0 ? '+' : balance < 0 ? '−' : ''}${money(Math.abs(balance))}`));
    $('balances').append(row);
  }
  $('expense-list').replaceChildren();
  if (!state.expenses.length) empty($('expense-list'), '▤', 'The adventure starts here', 'Add your first expense and we’ll handle the math.');
  for (const [expenseIndex, expense] of [...state.expenses].reverse().entries()) {
    const row = element('div', 'expense-row');
    const detail = element('div', 'expense-detail');
    detail.append(element('strong', '', expense.description), element('small', '', `${expense.paidBy} paid · Shared by ${expense.participants.join(', ')}`));
    const remove = element('button', 'delete-expense', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Delete expense: ${expense.description}`);
    remove.addEventListener('click', () => {
      state.expenses = state.expenses.filter(item => item.id !== expense.id);
      persist(); render();
      focusAfterRemoval('#expense-list .delete-expense', expenseIndex, 'description');
    });
    row.append(detail, element('strong', 'expense-value', money(expense.amount)), remove);
    $('expense-list').append(row);
  }
  $('settlements').replaceChildren();
  const transfers = settle(balances);
  if (!transfers.length) {
    empty($('settlements'), '✓', state.expenses.length ? 'Everyone’s square!' : 'Nothing to settle. Yet.', state.expenses.length ? 'All balances are even. On to the next adventure.' : 'Once expenses are in, see who pays whom here.');
  }
  for (const payment of transfers) {
    const row = element('div', 'payment');
    const route = element('div', 'payment-route');
    route.append(element('strong', '', payment.from), element('span', '', '→'), element('strong', '', payment.to));
    row.append(route, element('span', 'payment-amount', money(payment.amount)));
    row.setAttribute('aria-label', `${payment.from} pays ${payment.to} ${money(payment.amount)}`);
    $('settlements').append(row);
  }
}
$('person-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const name = validateName($('person-name').value, state.people);
    state.people.push(name);
    $('person-name').value = '';
    error('person-error'); persist(); render(); $('person-name').focus();
  } catch (cause) { error('person-error', cause.message); }
});
$('everyone').addEventListener('change', () => {
  $('everyone').indeterminate = false;
  for (const input of $('participants').querySelectorAll('input')) input.checked = $('everyone').checked;
});
$('expense-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    if (!state.people.length) throw new Error('Add people to the squad before adding an expense.');
    const description = $('description').value.trim();
    if (!description) throw new Error('Give this expense a short description.');
    const amount = parseAmount($('amount').value);
    const participants = [...$('participants').querySelectorAll('input:checked')].map(input => input.value);
    if (!participants.length) throw new Error('Select at least one person to share this expense.');
    const expense = { id: crypto.randomUUID(), description, amount, paidBy: $('payer').value, participants };
    const expenses = [...state.expenses, expense];
    tripTotal(expenses); computeBalances(state.people, expenses);
    state.expenses = expenses;
    $('description').value = ''; $('amount').value = ''; $('everyone').checked = true;
    error('expense-error'); persist(); render();
  } catch (cause) { error('expense-error', cause.message); }
});
$('reset').addEventListener('click', () => {
  if (!window.confirm('Reset this trip? All people and expenses will be removed.')) return;
  state = { people: [], expenses: [] };
  $('person-form').reset(); $('expense-form').reset();
  error('person-error'); error('expense-error'); error('global-error');
  persist(); render();
});
render();
