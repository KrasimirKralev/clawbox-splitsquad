import test from 'node:test';
import assert from 'node:assert/strict';
import { splitExpense, computeBalances, settle, parseAmount, validateName, canRemovePerson, tripTotal } from '../logic.js';
const people = ['A', 'B', 'C'];
const expense = (amount, paidBy = 'A', participants = people) => ({ amount, paidBy, participants });

test('splits cents exactly, assigning leftovers in participant order', () => {
  assert.deepEqual(splitExpense(1000, people), { A: 334, B: 333, C: 333 });
  assert.deepEqual(splitExpense(2, ['C', 'A', 'B']), { C: 1, A: 1, B: 0 });
  assert.deepEqual(splitExpense(99, ['A']), { A: 99 });
});
test('rejects invalid splits', () => {
  for (const amount of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => splitExpense(amount, people));
  assert.throws(() => splitExpense(100, []));
  assert.throws(() => splitExpense(100, ['A', 'A']));
});
test('computes paid minus share, without changing inputs', () => {
  const expenses = [expense(3000)];
  const before = JSON.stringify(expenses);
  assert.deepEqual(computeBalances(people, expenses), { A: 2000, B: -1000, C: -1000 });
  assert.equal(JSON.stringify(expenses), before);
  assert.deepEqual(computeBalances([], []), {});
});
test('subset sharing leaves uninvolved people unchanged', () => {
  assert.deepEqual(computeBalances(people, [expense(1001, 'B', ['B', 'C'])]), { A: 0, B: 500, C: -500 });
});
test('payer can cover an expense without sharing it', () => {
  assert.deepEqual(computeBalances(people, [expense(1000, 'A', ['B', 'C'])]), { A: 1000, B: -500, C: -500 });
});
test('settlement has expected two payments for a $30 shared expense', () => {
  assert.deepEqual(settle(computeBalances(people, [expense(3000)])), [
    { from: 'B', to: 'A', amount: 1000 }, { from: 'C', to: 'A', amount: 1000 },
  ]);
});
test('empty, even, and two-person settlements', () => {
  assert.deepEqual(settle({}), []);
  assert.deepEqual(settle({ A: 0, B: 0 }), []);
  assert.deepEqual(settle({ A: -57, B: 57 }), [{ from: 'A', to: 'B', amount: 57 }]);
});
test('greedy matching selects the biggest remaining debtor and creditor', () => {
  const balances = { A: -600, B: -400, C: 500, D: 300, E: 200 };
  const before = { ...balances };
  assert.deepEqual(settle(balances), [
    { from: 'A', to: 'C', amount: 500 },
    { from: 'B', to: 'D', amount: 300 },
    { from: 'B', to: 'E', amount: 100 },
    { from: 'A', to: 'E', amount: 100 },
  ]);
  assert.deepEqual(balances, before);
});
test('many varied trips conserve cents and settle within n−1 payments', () => {
  for (let n = 2; n <= 16; n++) {
    const members = Array.from({ length: n }, (_, index) => `P${index}`);
    const expenses = Array.from({ length: 45 }, (_, i) => expense(1 + ((i * 997 + n * 23) % 10000), members[i % n], members.filter((_, j) => (i + j) % 3 !== 0)));
    const balances = computeBalances(members, expenses);
    assert.equal(Object.values(balances).reduce((a, b) => a + b, 0), 0);
    const transfers = settle(balances);
    assert.ok(transfers.length <= n - 1);
    const result = { ...balances };
    for (const transfer of transfers) {
      assert.ok(Number.isSafeInteger(transfer.amount) && transfer.amount > 0);
      result[transfer.from] += transfer.amount;
      result[transfer.to] -= transfer.amount;
    }
    assert.ok(Object.values(result).every(value => value === 0));
  }
});
test('parses dollar amounts without floating point rounding', () => {
  assert.equal(parseAmount('10.01'), 1001);
  assert.equal(parseAmount(' 0.29 '), 29);
  assert.equal(parseAmount('30'), 3000);
  assert.equal(parseAmount('1.5'), 150);
  for (const value of ['', '0', '-3', 'NaN', 'Infinity', '1e3', '1.005', 'abc', '9007199254740992']) assert.throws(() => parseAmount(value));
});
test('names are trimmed and reject blanks or case-insensitive duplicates', () => {
  assert.equal(validateName('  Alex  ', []), 'Alex');
  assert.throws(() => validateName(' ', []));
  assert.throws(() => validateName(' alex ', ['Alex']));
});
test('removal protects payers and participants', () => {
  const expenses = [expense(100, 'A', ['B'])];
  assert.equal(canRemovePerson('A', expenses), false);
  assert.equal(canRemovePerson('B', expenses), false);
  assert.equal(canRemovePerson('C', expenses), true);
  assert.equal(canRemovePerson('A', []), true);
});
test('unsafe totals and malformed balance data are rejected', () => {
  assert.equal(tripTotal([expense(3000), expense(1001)]), 4001);
  assert.throws(() => tripTotal([expense(Number.MAX_SAFE_INTEGER), expense(1)]));
  assert.throws(() => computeBalances(people, [expense(100, 'Unknown')]));
  assert.throws(() => computeBalances(people, [expense(100, 'A', ['Unknown'])]));
  assert.throws(() => settle({ A: 1, B: 0 }));
  assert.throws(() => settle({ A: 0.5, B: -0.5 }));
});
test('names that match object properties work as ordinary names', () => {
  const names = ['__proto__', 'constructor'];
  assert.deepEqual(computeBalances(names, [expense(100, '__proto__', names)]), { ['__proto__']: 50, constructor: -50 });
});
