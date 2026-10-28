import { describe, expect, it } from 'vitest';
import { getCashSummary, getInvoiceTotals, getObligationTotals, reconcileRecords, simulateCashflow } from '../lib/financial';
import { DEMO_WORKSPACE } from '../lib/demo-data';
import type { Scenario, Transaction, Invoice, Workspace } from '../lib/types';

describe('FlowTrust deterministic financial logic', () => {
  it('calculates recorded cash movements from the transaction ledger', () => {
    const w = { ...DEMO_WORKSPACE, openingCash: 1000, openingCashDate: '2026-01-01', transactions: [
      {id:'a',date:'2026-01-01',description:'in',counterparty:'A',amount:250,direction:'inflow',category:'Sales',currency:'INR'},
      {id:'b',date:'2026-01-02',description:'out',counterparty:'B',amount:70,direction:'outflow',category:'Cost',currency:'INR'},
    ] as Transaction[] };
    expect(getCashSummary(w)).toMatchObject({ inflows:250, outflows:70, net:180, availableCash:1180, transactionCount:2 });
  });
  it('counts outstanding and overdue invoice balances, not full paid values', () => {
    const invoices: Invoice[] = [
      {id:'i1',customer:'A',issueDate:'2026-01-01',dueDate:'2026-01-05',amount:100,amountPaid:60,currency:'INR'},
      {id:'i2',customer:'B',issueDate:'2026-01-01',dueDate:'2026-12-31',amount:200,amountPaid:200,currency:'INR'},
    ];
    expect(getInvoiceTotals(invoices,'2026-01-10')).toMatchObject({outstanding:40,overdue:40,overdueCount:1,invoiced:300,collected:260});
  });
  it('does not include paid supplier bills in outstanding totals', () => {
    expect(getObligationTotals([{id:'a',dueDate:'2026-01-01',payee:'X',amount:100,amountPaid:100,category:'test',currency:'INR'},{id:'b',dueDate:'2026-01-01',payee:'Y',amount:80,amountPaid:30,category:'test',currency:'INR'}],'2026-01-10')).toMatchObject({outstanding:50,overdue:50,overdueCount:1});
  });
  it('matches an invoice by exact payment reference and does not double-assign a transaction', () => {
    const invoices: Invoice[] = [
      {id:'i1',customer:'Acme',issueDate:'2026-01-01',dueDate:'2026-01-10',amount:100,amountPaid:100,paymentReference:'REF1',currency:'INR'},
      {id:'i2',customer:'Acme',issueDate:'2026-01-01',dueDate:'2026-01-10',amount:100,amountPaid:100,paymentReference:'REF1',currency:'INR'},
    ];
    const tx: Transaction[] = [{id:'t1',date:'2026-01-05',description:'Payment',counterparty:'Acme',amount:100,direction:'inflow',category:'Sales',referenceId:'REF1',currency:'INR'}];
    const matches=reconcileRecords(invoices,tx);
    expect(matches[0].transactionIds).toEqual(['t1']);
    expect(matches[1].transactionIds).toEqual([]);
  });
  it('produces a stressed forecast and constrains horizon to 7–180 days', () => {
    const scenario: Scenario = {revenueDrop:50,delayDays:10,unexpectedExpense:100000,investment:50000,collectionRate:60,obligationIncrease:20,horizonDays:60};
    const result=simulateCashflow(DEMO_WORKSPACE as Workspace,scenario);
    expect(result.points).toHaveLength(61);
    expect(result.stressedEnd).toBeLessThan(result.baselineEnd);
    expect(result.horizon).toBe(60);
  });
});
