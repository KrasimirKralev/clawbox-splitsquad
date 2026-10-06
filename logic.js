/** Monetary values are always integer cents. Participant order breaks rounding ties. */
export function parseAmount(value) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter a valid amount with up to 2 decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('Enter an amount greater than $0.00.');
  return cents;
}

export function validateName(value, people) {
  const name = value.trim();
  if (!name) throw new Error('Enter a name to add someone.');
  if (people.some(person => person.toLowerCase() === name.toLowerCase())) throw new Error('That name is already on the trip.');
  return name;
}

export function splitExpense(amount, participants) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer in cents.');
  if (!participants.length || new Set(participants).size !== participants.length) throw new Error('Select at least one unique participant.');
  const base = Math.floor(amount / participants.length);
  const remainder = amount % participants.length;
  return Object.fromEntries(participants.map((person, index) => [person, base + (index < remainder ? 1 : 0)]));
}

export function computeBalances(people, expenses) {
  if (new Set(people).size !== people.length) throw new Error('People must be unique.');
  const balances = Object.fromEntries(people.map(person => [person, 0]));
  for (const expense of expenses) {
    if (!Object.hasOwn(balances, expense.paidBy) || expense.participants.some(person => !Object.hasOwn(balances, person))) throw new Error('Expense contains an unknown person.');
    const shares = splitExpense(expense.amount, expense.participants);
    balances[expense.paidBy] += expense.amount;
    for (const [person, share] of Object.entries(shares)) balances[person] -= share;
    if (Object.values(balances).some(value => !Number.isSafeInteger(value))) throw new Error('Trip amount is too large.');
  }
  return balances;
}

export function canRemovePerson(person, expenses) {
  return !expenses.some(expense => expense.paidBy === person || expense.participants.includes(person));
}

export function tripTotal(expenses) {
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Trip amount is too large.');
  return total;
}

export function settle(balances) {
  const entries = Object.entries(balances);
  if (entries.some(([, amount]) => !Number.isSafeInteger(amount)) || entries.reduce((sum, [, amount]) => sum + amount, 0) !== 0) throw new Error('Balances must be integer cents and sum to zero.');
  const debtors = entries.filter(([, amount]) => amount < 0).map(([name, amount]) => ({ name, amount: -amount }));
  const creditors = entries.filter(([, amount]) => amount > 0).map(([name, amount]) => ({ name, amount }));
  const transfers = [];
  const biggestFirst = (a, b) => b.amount - a.amount;
  while (debtors.length && creditors.length) {
    debtors.sort(biggestFirst);
    creditors.sort(biggestFirst);
    const debtor = debtors[0], creditor = creditors[0];
    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({ from: debtor.name, to: creditor.name, amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (!debtor.amount) debtors.shift();
    if (!creditor.amount) creditors.shift();
  }
  return transfers;
}

/** Quotes per RFC 4180 and neutralises leading formula characters so spreadsheets show text, not formulas. */
function csvCell(value) {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[,"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Export expenses and the computed settlement as CSV, with amounts in USD. */
export function toCSV(people, expenses) {
  const transfers = settle(computeBalances(people, expenses));
  const amount = cents => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
  const rows = [
    ['Expenses', '', '', ''],
    ['Description', 'Amount (USD)', 'Paid by', 'Participants'],
    ...expenses.map(expense => [expense.description, amount(expense.amount), expense.paidBy, expense.participants.join(', ')]),
    ['', '', '', ''],
    ['Settlement', '', '', ''],
    ['From', 'To', 'Amount (USD)', ''],
    ...transfers.map(payment => [payment.from, payment.to, amount(payment.amount), '']),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
