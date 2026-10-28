# FlowTrust

**Beyond Balance. Into Resilience.**

FlowTrust is a deployable MVP for evidence-aware financial intelligence for small businesses. It combines transaction and invoice reconciliation, cash-flow stress scenarios, payment relationship summaries, repayment history, liquidity resilience, reports, and an AI-assisted copilot.

## What's included

- Financial dashboard with calculated cash position, inflows/outflows, receivables/payables, trends, and review signals.
- CSV import and validation for five datasets: transactions, invoices, supplier obligations, loan repayments, and historical credit-risk context.
- Manual entry for transactions, invoices, bills, and repayment rows; partial payments are supported.
- Deterministic invoice-to-transaction reconciliation with exact matches and clearly labelled possible matches.
- Customer and supplier profiles built only from available records.
- Interactive cash-flow scenario simulator for revenue decline, customer delays, collection rate, additional obligations, unexpected costs, proposed investment, and a 30–180 day horizon.
- Credit and resilience page showing repayment observations, inputted liquidity resources, and historical credit labels.
- AI copilot using a server-side OpenAI Responses API route when configured; otherwise uses deterministic demo insights and labels them as such.
- Weekly/monthly/risk/customer/supplier reporting, browser Print / Save as PDF, CSV exports, and JSON workspace backups.
- Local browser persistence out of the box. Optional Supabase email/password authentication and per-user workspace syncing.
- Responsive light/dark UI and fictional demo datasets.

## Run locally

Requirements: Node.js 20.9+ (Node 22 recommended) and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The demo works without API keys. Click **Reload demo workspace** in the sidebar if you need to restore synthetic records.

## Enable live AI

In `.env.local` add:

```env
OPENAI_API_KEY=your_server_side_key
OPENAI_MODEL=gpt-5.5
```

Restart the development server. The key is read only in the server-side route and is never meant to be placed in a `NEXT_PUBLIC_` variable. The selected model must be available to the API project/account. If no key exists, the copilot returns clearly labelled deterministic demo insights; it does not pretend to call a live model.

## Optional Supabase login and cloud workspace sync

The app works in local browser mode without Supabase. For cross-device persistence and authentication:

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL Editor. It creates `flowtrust_workspaces` and enables Row Level Security.
3. Add the project's URL and publishable/anon key to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
```

4. Restart the dev server. Open **Settings → Account & cloud sync**, then create an account or sign in.
5. In Vercel, configure the same environment variables under Project Settings → Environment Variables, then redeploy.

Only the public anon/publishable key belongs in the browser. Never add a service-role key to a `NEXT_PUBLIC_` variable. Keep RLS enabled. The SQL policies limit each authenticated user to their own workspace row.

## Deploy to Vercel

1. Put the project in a Git repository and push it to GitHub.
2. In Vercel, import the repository.
3. Use the default Next.js build settings. Build command: `npm run build`; output settings are managed by Next.js.
4. Add `OPENAI_API_KEY` and `OPENAI_MODEL` for live AI. Add Supabase variables only if cloud accounts are needed.
5. Deploy and test the production URL with demo data before uploading real information.

## CSV formats

Templates are included under `public/sample-data/`:

- `demo-transactions.csv`: `transaction_id,date,description,counterparty,amount,type,category,reference_id,currency`
- `demo-invoices.csv`: `invoice_id,customer,issue_date,due_date,amount,amount_paid,paid_date,payment_reference,currency`
- `demo-obligations.csv`: `obligation_id,due_date,payee,amount,amount_paid,category,currency`
- `demo-repayments.csv`: `repayment_id,lender,due_date,paid_date,amount_due,amount_paid,outstanding_balance,currency`
- `demo-credit-history.csv`: `history_id,period,credit_utilization,existing_debt,outcome,source,currency`

Accepted transaction types include `inflow`, `outflow`, `credit`, `debit`, `income`, and `expense`. Invoices and obligations accept `amount_paid`; a status value of `paid` is also used as a fallback when amount paid is blank.

## Financial logic and limitations

- Calculated cash = configured opening cash + imported inflows − imported outflows dated on or after the opening cash date. Make sure the opening cash date is consistent with the statement period; do not include cash movements already reflected in the opening balance. The MVP blocks imports in a different currency rather than silently adding unlike currencies.
- Outstanding receivables/payables = document amount less recorded paid amount.
- Reconciliation uses exact references first. Possible matches are suggestions and are not automatically treated as verified.
- Cash scenarios are deterministic, assumption-driven projections. Results depend on data quality and a simplified monthly revenue run-rate; they are not guaranteed forecasts.
- Repayment/credit-history data is descriptive. This MVP does not train a machine-learning default model, access credit bureaus, or make lending decisions.
- Matching a transaction does not independently authenticate an invoice or prove the underlying transaction is genuine.
- All provided sample data is fictional. Browser-local data is stored only in the current browser. Export a JSON backup before clearing browser data. Cloud mode requires Supabase configuration and successful sign-in.
- Multi-currency totals are not converted using exchange rates. Keep imports in the configured currency for meaningful totals.

## Checks

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

If the code has been modified or package versions change, rerun these checks before hosting.
