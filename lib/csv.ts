import type { CreditHistory, Invoice, Obligation, Repayment, Transaction, Workspace } from './types';

type Row = Record<string,string>;
export function parseCSV(text:string): Row[] {
  const rows:string[][]=[]; let row:string[]=[]; let cell=''; let quoted=false;
  for(let i=0;i<text.length;i++) { const c=text[i]; if(c==='"'){ if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted; }
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){ if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell=''; }
    else cell+=c;
  }
  if(cell.length||row.length){row.push(cell);if(row.some(v=>v.trim()))rows.push(row);}
  if(rows.length<2)return [];
  const headers=rows[0].map(h=>h.trim().replace(/^\uFEFF/, '').toLowerCase());
  return rows.slice(1).map(values=>Object.fromEntries(headers.map((h,i)=>[h,(values[i]??'').trim()])));
}
const value=(r:Row,...keys:string[])=>{for(const key of keys){const v=r[key.toLowerCase()];if(v!==undefined&&v!=='')return v;}return '';};
const num=(v:string)=>Number(String(v).replace(/[₹,\s]/g,''));
const date=(v:string)=>{if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10);};
const id=(v:string,prefix:string,i:number)=>v||`${prefix}-${Date.now().toString(36)}-${i+1}`;
export type ImportResult<T>={records:T[];errors:string[];skipped:number};
export function importRecords(type:'transactions'|'invoices'|'obligations'|'repayments'|'creditHistory',csv:string,workspace:Workspace):ImportResult<Transaction|Invoice|Obligation|Repayment|CreditHistory>{
 const rows=parseCSV(csv);const errors:string[]=[];const records:(Transaction|Invoice|Obligation|Repayment|CreditHistory)[]=[]; if(!rows.length)return {records,errors:['No data rows found. Check that the CSV has a header row and at least one data row.'],skipped:0};
 rows.forEach((r,i)=>{const line=i+2;try{
  if(type==='transactions'){
    const dateVal=date(value(r,'date','transaction_date'));const amount=num(value(r,'amount','transaction_amount'));const dir=value(r,'direction','type','credit/debit').toLowerCase();const counterparty=value(r,'counterparty','merchant','party');const transactionId=id(value(r,'id','transaction_id'),'TX',i);const balanceRaw=value(r,'balance','running_balance','closing_balance');const balance=balanceRaw===''?undefined:num(balanceRaw);
    if(!dateVal||!Number.isFinite(amount)||amount<0||!['inflow','outflow','credit','debit','income','expense'].includes(dir)||!counterparty||(balanceRaw!==''&&(!Number.isFinite(balance)||balance!<0)))throw new Error('Need valid date, non-negative amount, counterparty and type/direction; optional balance must also be non-negative.');
    const currency = value(r,'currency')||workspace.currency; if(currency!==workspace.currency)throw new Error(`Currency ${currency} does not match workspace currency ${workspace.currency}; multi-currency conversion is not enabled.`);
    records.push({id:transactionId,date:dateVal,description:value(r,'description','narration')||'Imported transaction',counterparty,amount,direction:['inflow','credit','income'].includes(dir)?'inflow':'outflow',category:value(r,'category')||'Uncategorised',referenceId:value(r,'reference_id','reference','ref'),currency,balance});
  } else if(type==='invoices'){
    const invId=id(value(r,'id','invoice_id'),'INV',i),issueDate=date(value(r,'issue_date','issuedate')),dueDate=date(value(r,'due_date','duedate')),amount=num(value(r,'amount','invoice_amount')),paidRaw=value(r,'amount_paid','paid_amount','amountpaid'),paid=paidRaw===''?(/paid/i.test(value(r,'status'))?amount:0):num(paidRaw),customer=value(r,'customer','counterparty','customer_name');
    if(!issueDate||!dueDate||!Number.isFinite(amount)||amount<0||!Number.isFinite(paid)||paid<0||!customer)throw new Error('Need valid issue/due date, amount, customer and amount_paid (or status).');
    const currency = value(r,'currency')||workspace.currency; if(currency!==workspace.currency)throw new Error(`Currency ${currency} does not match workspace currency ${workspace.currency}; multi-currency conversion is not enabled.`);
    records.push({id:invId,customer,issueDate,dueDate,amount,amountPaid:Math.min(amount,paid),paidDate:date(value(r,'paid_date','payment_date'))||undefined,paymentReference:value(r,'payment_reference','reference_id')||undefined,currency});
  } else if(type==='obligations'){
    const dueDate=date(value(r,'due_date','duedate')),amount=num(value(r,'amount')),paidRaw=value(r,'amount_paid','paid_amount'),amountPaid=paidRaw===''?(/paid/i.test(value(r,'status'))?amount:0):num(paidRaw),payee=value(r,'payee','supplier','counterparty');
    if(!dueDate||!Number.isFinite(amount)||amount<0||!Number.isFinite(amountPaid)||amountPaid<0||!payee)throw new Error('Need valid due date, amount, payee/supplier and amount_paid (or status).');
    const currency = value(r,'currency')||workspace.currency; if(currency!==workspace.currency)throw new Error(`Currency ${currency} does not match workspace currency ${workspace.currency}; multi-currency conversion is not enabled.`);
    records.push({id:id(value(r,'id','obligation_id','bill_id'),'OB',i),dueDate,payee,amount,amountPaid:Math.min(amount,amountPaid),category:value(r,'category')||'Operating expense',currency});
  } else if(type==='repayments'){
    const dueDate=date(value(r,'due_date','duedate')),amountDue=num(value(r,'amount_due','amount','emi_amount')),paidRaw=value(r,'amount_paid','paid_amount'),amountPaid=paidRaw===''?(/paid/i.test(value(r,'status'))?amountDue:0):num(paidRaw),balance=num(value(r,'outstanding_balance','balance')||'0'),lender=value(r,'lender','loan_name','counterparty');
    if(!dueDate||!Number.isFinite(amountDue)||amountDue<0||!Number.isFinite(amountPaid)||amountPaid<0||!lender)throw new Error('Need lender, due date, amount_due and amount_paid.');
    const currency = value(r,'currency')||workspace.currency; if(currency!==workspace.currency)throw new Error(`Currency ${currency} does not match workspace currency ${workspace.currency}; multi-currency conversion is not enabled.`);
    records.push({id:id(value(r,'id','repayment_id'),'LN',i),lender,dueDate,paidDate:date(value(r,'paid_date','payment_date'))||undefined,amountDue,amountPaid:Math.min(amountDue,amountPaid),outstandingBalance:Number.isFinite(balance)?balance:0,currency});
  } else {
    const period=value(r,'period','month'),util=num(value(r,'credit_utilization','utilization')),debt=num(value(r,'existing_debt','debt_balance')||'0'),outcome=value(r,'outcome','repayment_outcome','label').toLowerCase();
    if(!period||!Number.isFinite(util)||util<0||util>100||!Number.isFinite(debt)||debt<0)throw new Error('Need period, credit_utilization (0–100) and a non-negative existing_debt.');
    if(!['on-time','late','default','unknown',''].includes(outcome))throw new Error('outcome must be on-time, late, default, or unknown.');
    const currency = value(r,'currency')||workspace.currency; if(currency!==workspace.currency)throw new Error(`Currency ${currency} does not match workspace currency ${workspace.currency}; multi-currency conversion is not enabled.`);
    records.push({id:id(value(r,'id','history_id'),'CH',i),period,creditUtilization:util,existingDebt:debt,outcome:(outcome||'unknown') as CreditHistory['outcome'],source:value(r,'source')||'Imported dataset',currency});
  }
 }catch(e){errors.push(`Row ${line}: ${e instanceof Error?e.message:'Invalid data'}`);}});
 return {records,errors,skipped:rows.length-records.length};
}
export function toCSV(rows:Record<string,unknown>[]) {
 if(!rows.length)return '';
 const keys=Array.from(new Set(rows.flatMap(r=>Object.keys(r))));
 const esc=(v:unknown)=>{const s=String(v??'');return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
 return [keys.map(esc).join(','),...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\r\n');
}
