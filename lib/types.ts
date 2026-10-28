export type Direction = 'inflow' | 'outflow';
export type Transaction = {
  id: string; date: string; description: string; counterparty: string; amount: number;
  direction: Direction; category: string; referenceId?: string; currency: string; balance?: number;
};
export type Invoice = {
  id: string; customer: string; issueDate: string; dueDate: string; amount: number;
  amountPaid: number; paidDate?: string; paymentReference?: string; currency: string;
};
export type Obligation = {
  id: string; dueDate: string; payee: string; amount: number; amountPaid: number;
  category: string; currency: string;
};
export type Repayment = {
  id: string; lender: string; dueDate: string; paidDate?: string; amountDue: number;
  amountPaid: number; outstandingBalance: number; currency: string;
};
export type CreditHistory = {
  id: string; period: string; creditUtilization: number; existingDebt: number;
  outcome: 'on-time' | 'late' | 'default' | 'unknown'; source: string; currency: string;
};
export type Workspace = {
  businessName: string; ownerName: string; currency: string; openingCash: number;
  openingCashDate: string; liquidSavings: number; monthlyEssentialExpenses: number;
  monthlyEssentialExpensesDate: string; monthlyRevenueTarget: number;
  transactions: Transaction[]; invoices: Invoice[]; obligations: Obligation[];
  repayments: Repayment[]; creditHistory: CreditHistory[];
};
export type Finding = {
  id: string; type: 'unmatched' | 'candidate' | 'overdue' | 'duplicate' | 'data-quality' | 'cash-risk' | 'credit';
  severity: 'high' | 'medium' | 'low'; title: string; detail: string; amount?: number;
  relatedIds: string[]; action: string; status: 'open' | 'reviewed' | 'resolved';
};
export type Scenario = { revenueDrop: number; delayDays: number; unexpectedExpense: number; investment: number; collectionRate: number; obligationIncrease: number; horizonDays: number };
