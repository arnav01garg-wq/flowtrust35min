import type { Finding, Invoice, Obligation, Repayment, Scenario, Transaction, Workspace } from './types';

export const INR = (amount: number, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
export const numberIN = (amount: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
export const prettyDate = (date?: string) => date ? new Date(`${date.slice(0,10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0,10)}T00:00:00Z`) - Date.parse(`${a.slice(0,10)}T00:00:00Z`)) / 86400000);
const norm = (s = '') => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function getCashSummary(w: Workspace) {
  const sorted = [...w.transactions].filter(t => t.date >= w.openingCashDate).sort((a,b) => a.date.localeCompare(b.date));
  const inflows = sorted.filter(t => t.direction === 'inflow').reduce((s,t) => s + t.amount, 0);
  const outflows = sorted.filter(t => t.direction === 'outflow').reduce((s,t) => s + t.amount, 0);
  return { inflows, outflows, net: inflows - outflows, availableCash: w.openingCash + inflows - outflows, transactionCount: sorted.length };
}
export function getInvoiceTotals(invoices: Invoice[], now = todayISO()) {
  const outstanding = invoices.reduce((s,i) => s + Math.max(0, i.amount - i.amountPaid), 0);
  const overdue = invoices.filter(i => i.amount - i.amountPaid > 0 && i.dueDate < now).reduce((s,i) => s + Math.max(0, i.amount - i.amountPaid), 0);
  const overdueCount = invoices.filter(i => i.amount - i.amountPaid > 0 && i.dueDate < now).length;
  const invoiced = invoices.reduce((s,i) => s + i.amount, 0);
  const collected = invoices.reduce((s,i) => s + Math.min(i.amount, i.amountPaid), 0);
  return { outstanding, overdue, overdueCount, invoiced, collected, count: invoices.length };
}
export function getObligationTotals(obligations: Obligation[], now = todayISO()) {
  const outstanding = obligations.reduce((s,o) => s + Math.max(0, o.amount - o.amountPaid), 0);
  const overdue = obligations.filter(o => o.amount - o.amountPaid > 0 && o.dueDate < now).reduce((s,o) => s + Math.max(0, o.amount - o.amountPaid), 0);
  return { outstanding, overdue, overdueCount: obligations.filter(o => o.amount - o.amountPaid > 0 && o.dueDate < now).length };
}

export type Match = { invoiceId: string; transactionIds: string[]; matchedAmount: number; expectedAmount: number; status: 'matched'|'partial'|'candidate'|'unmatched'; reason: string };
export function reconcileRecords(invoices: Invoice[], transactions: Transaction[]): Match[] {
  const used = new Set<string>();
  return invoices.map((invoice) => {
    const remaining = Math.max(0, invoice.amountPaid);
    if (remaining <= 0) return { invoiceId: invoice.id, transactionIds: [], matchedAmount: 0, expectedAmount: invoice.amount, status: 'unmatched' as const, reason: 'Invoice is marked unpaid; no payment evidence should be assumed.' };
    const available = transactions.filter(t => t.direction === 'inflow' && t.currency === invoice.currency && !used.has(t.id));
    const refs = available.filter(t => !!(t.referenceId && [invoice.id, invoice.paymentReference || ''].some(r => norm(r) && norm(t.referenceId) === norm(r))));
    let selected = refs;
    let reason = 'Exact invoice/payment reference match.';
    if (!selected.length) {
      const counterparty = available.filter(t => norm(t.counterparty) === norm(invoice.customer));
      const near = counterparty.filter(t => Math.abs(t.amount - remaining) <= Math.max(2, remaining * 0.015) && Math.abs(daysBetween(t.date, invoice.paidDate || invoice.dueDate)) <= 12);
      if (near.length) { selected = [near[0]]; reason = 'Candidate based on counterparty, amount, and date; human confirmation recommended.'; }
    }
    if (!selected.length) return { invoiceId: invoice.id, transactionIds: [], matchedAmount: 0, expectedAmount: invoice.amount, status: 'unmatched' as const, reason: 'No eligible inflow transaction could be linked to the paid amount.' };
    selected.forEach(t => used.add(t.id));
    const matchedAmount = selected.reduce((sum,t) => sum + t.amount, 0);
    const candidate = !refs.length;
    const status = candidate ? 'candidate' : matchedAmount + Math.max(1, invoice.amount * 0.015) < invoice.amount ? 'partial' : 'matched';
    if (candidate) reason = 'Possible match only; the app cannot confirm the relationship automatically.';
    else if (status === 'partial') reason = 'Reference matches, but recorded transaction total is less than the invoice value.';
    return { invoiceId: invoice.id, transactionIds: selected.map(t => t.id), matchedAmount, expectedAmount: invoice.amount, status, reason };
  });
}

export function getFindings(w: Workspace, now = todayISO()): Finding[] {
  const findings: Finding[] = [];
  const matches = reconcileRecords(w.invoices, w.transactions);
  const byId = new Map(w.invoices.map(i => [i.id,i]));
  for (const m of matches) {
    const invoice = byId.get(m.invoiceId)!;
    const remaining = Math.max(0, invoice.amount - invoice.amountPaid);
    if (m.status === 'unmatched' && invoice.amountPaid > 0) findings.push({ id:`match-${invoice.id}`, type:'unmatched', severity:'medium', title:`Payment evidence missing for ${invoice.id}`, detail:`${INR(invoice.amountPaid,invoice.currency)} is recorded as paid, but no matching inflow transaction was found in the imported records.`, amount:invoice.amountPaid, relatedIds:[invoice.id], action:'Check transaction coverage, payment reference and settlement date.', status:'open' });
    if (m.status === 'candidate') findings.push({ id:`candidate-${invoice.id}`, type:'candidate', severity:'low', title:`Possible match for ${invoice.id}`, detail:m.reason, amount:m.matchedAmount, relatedIds:[invoice.id,...m.transactionIds], action:'Review counterparty, amount and date before confirming.', status:'open' });
    if (m.status === 'partial' && invoice.amountPaid > 0) findings.push({ id:`partial-${invoice.id}`, type:'data-quality', severity:'medium', title:`Partial transaction coverage for ${invoice.id}`, detail:`The matched transactions total ${INR(m.matchedAmount,invoice.currency)} against invoice value ${INR(invoice.amount,invoice.currency)}.`, amount:Math.max(0,invoice.amount-m.matchedAmount), relatedIds:[invoice.id,...m.transactionIds], action:'Check whether the invoice was paid in multiple instalments or the import is incomplete.', status:'open' });
    if (remaining > 0 && invoice.dueDate < now) findings.push({ id:`overdue-${invoice.id}`, type:'overdue', severity: daysBetween(invoice.dueDate,now)>14 ? 'high':'medium', title:`Overdue receivable: ${invoice.customer}`, detail:`${invoice.id} is ${daysBetween(invoice.dueDate, now)} days past due with ${INR(remaining,invoice.currency)} outstanding.`, amount:remaining, relatedIds:[invoice.id], action:'Follow up with the customer and update payment status when evidence is available.', status:'open' });
  }
  const statementRows=[...w.transactions].filter(t=>t.date>=w.openingCashDate).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  let expectedBalance=w.openingCash;
  for (const t of statementRows) {
    expectedBalance += t.direction==='inflow'?t.amount:-t.amount;
    if (t.balance!==undefined) {
      const tolerance=Math.max(2,Math.abs(t.balance)*0.01);
      if (Math.abs(t.balance-expectedBalance)>tolerance) findings.push({id:`balance-${t.id}`,type:'data-quality',severity:'medium',title:`Running balance differs for ${t.id}`,detail:`The supplied running balance (${INR(t.balance,t.currency)}) differs from the calculated balance (${INR(expectedBalance,t.currency)}). Check ordering, opening balance date, fees, or missing transactions.`,amount:Math.abs(t.balance-expectedBalance),relatedIds:[t.id],action:'Compare the imported running balance to the source statement and confirm the opening balance before relying on cash totals.',status:'open'});
      expectedBalance=t.balance;
    }
    const dup = w.transactions.filter(other => other.id !== t.id && other.date === t.date && other.amount === t.amount && other.direction === t.direction && norm(other.counterparty) === norm(t.counterparty));
    if (dup.length && t.id.localeCompare(dup[0].id) < 0) findings.push({ id:`dup-${t.id}`,type:'duplicate',severity:'medium',title:'Duplicate-looking transactions',detail:`${t.id} and ${dup[0].id} have the same date, amount, direction and counterparty. This may be valid, so review before changing records.`,amount:t.amount,relatedIds:[t.id,dup[0].id],action:'Compare source statements and transaction IDs before resolving.',status:'open' });
  }
  for (const o of w.obligations) {
    const remaining = Math.max(0,o.amount-o.amountPaid);
    if (remaining > 0 && o.dueDate < now) findings.push({id:`bill-${o.id}`,type:'overdue',severity:daysBetween(o.dueDate,now)>14?'high':'medium',title:`Overdue payable: ${o.payee}`,detail:`${o.id} has ${INR(remaining,o.currency)} unpaid and was due ${prettyDate(o.dueDate)}.`,amount:remaining,relatedIds:[o.id],action:'Confirm the bill and prioritise its due date in the cash plan.',status:'open'});
  }
  const available = getCashSummary(w).availableCash;
  if (available < 0) findings.push({id:'cash-negative',type:'cash-risk',severity:'high',title:'Calculated cash position is below zero',detail:'The opening cash plus imported transaction movements produces a negative balance. Check opening balance date and statement completeness.',amount:Math.abs(available),relatedIds:[],action:'Validate the opening balance and transaction import before making decisions.',status:'open'});
  const repaid = w.repayments.filter(r => r.amountPaid >= r.amountDue && r.paidDate);
  const late = repaid.filter(r => (r.paidDate || '') > r.dueDate);
  if (late.length) findings.push({id:'late-repayments',type:'credit',severity:'medium',title:'Late loan repayment records',detail:`${late.length} of ${repaid.length} fully paid recorded instalments were paid after their due date. This describes the uploaded sample only.`,amount:late.reduce((s,r)=>s+r.amountPaid,0),relatedIds:late.map(r=>r.id),action:'Verify repayment dates and review the original lender statement.',status:'open'});
  return findings.sort((a,b) => ({high:0,medium:1,low:2}[a.severity]-({high:0,medium:1,low:2}[b.severity])));
}

export function getMonthlySeries(w: Workspace, count = 6) {
  const start = new Date(); start.setDate(1); start.setMonth(start.getMonth() - (count - 1));
  return Array.from({length:count},(_,i)=>{
    const month = new Date(start); month.setMonth(start.getMonth()+i);
    const key = `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`;
    const list = w.transactions.filter(t => t.date.startsWith(key));
    return { key, label:month.toLocaleDateString('en-IN',{month:'short'}), inflow:list.filter(t=>t.direction==='inflow').reduce((s,t)=>s+t.amount,0), outflow:list.filter(t=>t.direction==='outflow').reduce((s,t)=>s+t.amount,0) };
  });
}

export function getRelationshipProfiles(w: Workspace) {
  const inflows = w.transactions.filter(t => t.direction === 'inflow');
  const outflows = w.transactions.filter(t => t.direction === 'outflow');
  const customerNames = Array.from(new Set([...w.invoices.map(i => i.customer), ...inflows.map(t => t.counterparty)]));
  const customers = customerNames.map(name => {
    const invoices = w.invoices.filter(i => i.customer === name);
    const txs = inflows.filter(t => t.counterparty === name);
    const paid = invoices.filter(i => i.amountPaid > 0);
    const open = invoices.reduce((s, i) => s + Math.max(0, i.amount - i.amountPaid), 0);
    const late = paid.filter(i => i.paidDate && i.paidDate > i.dueDate);
    const withDates = paid.filter(i => i.paidDate);
    const avgDelay = withDates.length ? Math.round(withDates.reduce((s, i) => s + Math.max(0, daysBetween(i.dueDate, i.paidDate!)), 0) / withDates.length) : null;
    return { name, type: 'Customer' as const, records: invoices.length || txs.length, total: invoices.length ? invoices.reduce((s, i) => s + i.amount, 0) : txs.reduce((s, t) => s + t.amount, 0), outstanding: open, overdue: invoices.filter(i => i.amount > i.amountPaid && i.dueDate < todayISO()).reduce((s, i) => s + i.amount - i.amountPaid, 0), lateCount: late.length, avgDelay, subtitle: invoices.length ? `${invoices.length} invoice(s); ${txs.length} recorded inflow(s)` : `${txs.length} recorded inflow(s); no invoice data supplied` };
  });
  const supplierNames = Array.from(new Set([...w.obligations.map(o => o.payee), ...outflows.map(t => t.counterparty)]));
  const suppliers = supplierNames.map(name => {
    const records = w.obligations.filter(o => o.payee === name);
    const txs = outflows.filter(t => t.counterparty === name);
    const open = records.reduce((s, o) => s + Math.max(0, o.amount - o.amountPaid), 0);
    return { name, type: 'Supplier' as const, records: records.length || txs.length, total: records.length ? records.reduce((s, o) => s + o.amount, 0) : txs.reduce((s, t) => s + t.amount, 0), outstanding: open, overdue: records.filter(o => o.amount > o.amountPaid && o.dueDate < todayISO()).reduce((s, o) => s + o.amount - o.amountPaid, 0), lateCount: 0, avgDelay: null, subtitle: records.length ? `${records.length} bill(s); ${txs.length} recorded outflow(s)` : `${txs.length} recorded outflow(s); no bill data supplied` };
  });
  return [...customers, ...suppliers].sort((a, b) => b.outstanding - a.outstanding);
}

export function getRepaymentSummary(repayments: Repayment[]) {
  const closed=repayments.filter(r=>r.amountPaid>=r.amountDue && r.paidDate);
  const onTime=closed.filter(r=>r.paidDate!<=r.dueDate).length;
  const late=closed.length-onTime;
  const outstanding=repayments.reduce((s,r)=>s+Math.max(0,r.amountDue-r.amountPaid),0);
  const totalDebt=repayments.reduce((max,r)=>Math.max(max,r.outstandingBalance),0);
  return {closed:closed.length,onTime,late,outstanding,totalDebt,onTimeRate:closed.length?Math.round(onTime/closed.length*100):null};
}

export function simulateCashflow(w: Workspace, scenario: Scenario) {
  const cash=getCashSummary(w).availableCash;
  const now = new Date(); now.setHours(0,0,0,0);
  const horizon = Math.max(7,Math.min(180,scenario.horizonDays));
  const result:{day:number,date:string,baseline:number,stressed:number,receipts:number,obligations:number}[]=[];
  let baseline=cash, stressed=cash;
  for(let day=0;day<=horizon;day++){
    const date=new Date(now);date.setDate(now.getDate()+day); const dateStr=date.toISOString().slice(0,10);
    let baselineReceipts=0, stressedReceipts=0, obligations=0;
    for(const inv of w.invoices){
      const due=Math.max(0,inv.amount-inv.amountPaid);if(due<=0)continue;
      const effectiveDue = inv.dueDate < todayISO() ? todayISO() : inv.dueDate;
      if(effectiveDue===dateStr)baselineReceipts+=due;
      const shifted=new Date(`${effectiveDue}T00:00:00`);shifted.setDate(shifted.getDate()+scenario.delayDays);
      if(shifted.toISOString().slice(0,10)===dateStr)stressedReceipts+=due*(scenario.collectionRate/100);
    }
    for(const ob of w.obligations){const due=Math.max(0,ob.amount-ob.amountPaid);if(due<=0)continue;const effectiveDue=ob.dueDate<todayISO()?todayISO():ob.dueDate;if(effectiveDue===dateStr)obligations+=due;}
    const baselineRevenue = w.monthlyRevenueTarget/30;
    const stressRevenue = baselineRevenue*(scenario.collectionRate/100)*(1-scenario.revenueDrop/100);
    const baseReceiptToday = day>0 ? baselineRevenue : 0;
    const stressReceiptToday = day>0 ? stressRevenue : 0;
    const unexpected = day===Math.min(7,horizon) ? Math.max(0,scenario.unexpectedExpense) : 0;
    const investment = day===Math.min(14,horizon) ? Math.max(0,scenario.investment) : 0;
    const extraObligation = obligations*scenario.obligationIncrease/100;
    baseline += baseReceiptToday + baselineReceipts - obligations;
    stressed += stressReceiptToday + stressedReceipts - obligations - extraObligation - unexpected - investment;
    result.push({day,date:dateStr,baseline,stressed,receipts:stressedReceipts,obligations:obligations+extraObligation});
  }
  const minBase=Math.min(...result.map(p=>p.baseline)); const minStress=Math.min(...result.map(p=>p.stressed));
  const firstNegative=result.find(p=>p.stressed<0)?.date || null;
  return {points:result,currentCash:cash,baselineEnd:result[result.length-1]?.baseline??cash,stressedEnd:result[result.length-1]?.stressed??cash,minBase,minStress,firstNegative,delta:(result[result.length-1]?.stressed??cash)-(result[result.length-1]?.baseline??cash),horizon};
}

export function getResilience(w: Workspace) {
  const cash = Math.max(0,getCashSummary(w).availableCash) + Math.max(0,w.liquidSavings);
  const expenses = Math.max(0,w.monthlyEssentialExpenses);
  const months = expenses>0 ? cash/expenses : null;
  return {availableResources:cash,monthlyEssentials:expenses,monthsCovered:months,daysCovered:months===null?null:Math.round(months*30),liquidSavings:w.liquidSavings};
}

export function monthlyReportSummary(w:Workspace,month:string){
 const tx=w.transactions.filter(t=>t.date.startsWith(month));const inflow=tx.filter(t=>t.direction==='inflow').reduce((s,t)=>s+t.amount,0);const outflow=tx.filter(t=>t.direction==='outflow').reduce((s,t)=>s+t.amount,0);const invoices=w.invoices.filter(i=>i.issueDate.startsWith(month));return {month,inflow,outflow,net:inflow-outflow,transactionCount:tx.length,invoiceCount:invoices.length,receivables:getInvoiceTotals(w.invoices).outstanding,payables:getObligationTotals(w.obligations).outstanding};
}

export function workspaceAiSummary(w:Workspace) {
 const cash=getCashSummary(w), invoice=getInvoiceTotals(w.invoices), bills=getObligationTotals(w.obligations),repay=getRepaymentSummary(w.repayments),res=getResilience(w),findings=getFindings(w);
 const genericDetail:Record<Finding['type'],string>={
   unmatched:'A document is marked paid, but no eligible cash transaction was linked in the imported data.',
   candidate:'A possible transaction match was found from counterparty, amount, and date signals; it needs human confirmation.',
   overdue:'An unpaid document balance is past its recorded due date.',
   duplicate:'Two transaction rows have similar date, amount, direction, and counterparty fields.',
   'data-quality':'The linked transaction amount does not fully cover the recorded document amount.',
   'cash-risk':'The opening balance and imported cash movements produce a negative calculated cash position.',
   credit:'A recorded loan repayment was paid after its due date.'
 };
 return {currency:w.currency,cash:{opening:w.openingCash,inflows:cash.inflows,outflows:cash.outflows,currentCalculated:cash.availableCash},receivables:invoice,payables:bills,repayments:repay,resilience:res,findings:findings.slice(0,12).map((f,i)=>({type:f.type,severity:f.severity,title:`Review signal ${i+1}`,detail:genericDetail[f.type],amount:f.amount,action:f.action})),dataCoverage:{transactions:w.transactions.length,invoices:w.invoices.length,obligations:w.obligations.length,repayments:w.repayments.length,creditHistory:w.creditHistory.length}};
}
