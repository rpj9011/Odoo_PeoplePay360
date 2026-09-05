# AMS Payroll — Demo Walkthrough

> **Purpose:** Step-by-step instructions for a judge or evaluator to walk through
> every payroll feature end-to-end on a fresh database, without guessing.  
> All commands assume the repo root is the working directory.

---

## Quick-start

```bash
# 1. Install backend dependencies (expr-eval is now included)
cd backend && npm install

# 2. Seed the database (safe to re-run — idempotent)
node scripts/seed.js

# 3. Start the backend
npm run dev          # or: node server.js

# 4. In a second terminal — start the frontend
cd ../frontend && npm run dev
```

Open `http://localhost:5173` (or whatever Vite reports).

---

## Test credentials

All accounts use the same password: **`Password@123`**

| Role               | Email                        | Payroll access |
|--------------------|------------------------------|----------------|
| Admin              | admin@example.com            | Full (read + write + config) |
| HRPayrollManager   | hrpayrollmgr@example.com     | Full (read + write + config) |
| HRPayrollUser      | hrpayroll@example.com        | Read + write payruns; **read-only** on salary config |
| HRManager          | hrmanager@example.com        | No payroll access (correct by design) |
| Employee (Arjun)   | arjun.nair@example.com       | No payroll access |

---

## Scenario 1 — Employee-to-payslip (full lifecycle)

### Step 1 — Verify the salary structure exists

1. Log in as **Admin** (`admin@example.com / Password@123`).
2. Click **Payroll** in the left sidebar → **Salary Structures**.
3. You should see **Standard Monthly** (`STD_MONTHLY`) with 5 rules and 4 employees.
4. Click **Edit** to inspect the rule order:
   `BASIC (seq 10) → HRA (seq 20) → GROSS (seq 50) → PF (seq 60) → NET (seq 100)`
5. Navigate to **Salary Rules** to see each rule's computation method.

> **Expected:** All 5 rules are visible. Formula rule `NET` shows `GROSS - PF`.

---

### Step 2 — Verify employee contracts

1. Click **Contracts** in the left sidebar.
2. Confirm 10 Running contracts exist (one per seeded employee/intern).
3. Open **Arjun Nair** (EMP-0005) — verify:
   - Status: **Running**
   - Wage: **₹80,000/month**
   - Salary Structure: **Standard Monthly**

> **Expected:** Contract details load with no errors.

---

### Step 3 — Create a new Payrun (wizard)

1. Click **Payroll** → **Dashboard** → then switch to the **Payruns** tab.
2. Click **New Payrun** (top-right button).
3. **Step 1 — Structure & Period:**
   - Salary Structure: select **Standard Monthly**
   - Period Start: first day of the *current* month (e.g. `2026-09-01`)
   - Period End: last day of the *current* month (e.g. `2026-09-30`)
   - Click **Continue** — *nothing is written to the DB yet*
4. **Step 2 — Select Employees:**
   - The wizard calls `GET /api/payroll/employees/eligible` and shows 4 eligible employees (EMP-0005 through EMP-0008).
   - All 4 are pre-selected. You may deselect one to test partial runs.
   - Click **Create Payrun**.

> **Expected:** You are navigated to `/payroll/payruns/:id` (the processing screen).  
> Status shows **Draft**. No payslips yet.

---

### Step 4 — Compute the payrun

On the processing screen:

1. Click **Compute**.  
   The backend calls `payrollComputationService.computePayrun()`, which:
   - Fetches each employee's active contract via `getActiveContractForPeriod`
   - Runs the 5 salary rules in sequence-order
   - Counts worked days from `AttendanceLog`
   - Creates one `Payslip` per employee (status: **Computed**)

2. Wait for the success alert: *"Computation complete. 4 payslip(s) created/updated."*

> **Expected:** Status bar advances to **Computed**. The payslip table populates  
> with Basic, Gross, Deductions, and Net Pay columns.  
> Example for Arjun (₹80,000 wage):  
> - Basic = ₹40,000 (50% of wage)  
> - HRA   = ₹16,000 (40% of Basic)  
> - Gross = ₹80,000 (100% of wage)  
> - PF    = ₹4,800  (12% of Basic)  
> - Net   = ₹75,200 (GROSS − PF)

---

### Step 5 — Validate the payrun

1. Review the Warnings panel (if any warnings appear with a **BLOCKING** badge,  
   they must be resolved before validation is allowed).
2. With no blocking warnings, click **Validate**.  
   The backend transitions: `Computed → Validated` for the payrun and all payslips.

> **Expected:** Status bar advances to **Validated**.  
> If you try to validate a payrun with blocking warnings, you receive a 422 error  
> listing the affected payslips — validation is refused server-side.

---

### Step 6 — Mark as Paid

1. Click **Mark Paid**.  
   The backend transitions: `Validated → Paid`.  
   The **immutability lock** is now active: any future attempt to roll back status  
   will be rejected with a 409 error at the pre-save hook level.

> **Expected:** Status shows **Paid** with a lock icon.  
> The "Mark Paid" button is disabled. The progress bar is full green.

---

### Step 7 — Print a payslip (PDF)

1. In the payslip table, click the **PDF icon** on any row.  
   The browser opens a new tab with a server-generated PDF (`pdfkit`).
2. The PDF contains: employee name, period, worked days, earnings/deductions table,  
   Net Pay highlighted in dark blue, and an AMS footer.

> **Expected:** PDF opens immediately. File is also saved at  
> `backend/uploads/payslips/<payslipId>.pdf`.

---

### Step 8 — Send payslips by email

> Requires `MAIL_HOST` to be set in `backend/.env`.  
> Without SMTP config, the endpoint runs but emails silently drop (no crash).

1. Click **Send Payslips**.  
   The backend iterates all payslips, generates PDFs, sends each via `mailService`,  
   records `Payslip.emailedAt`, and records `Payrun.payslipsSentAt`.
2. The **Send Results** panel appears below the action bar, showing per-employee  
   success (`✓ Sent to arjun.nair@example.com`) or failure with the error message.

> **Expected:** Each row in the results panel reports independently.  
> One bad email address does **not** abort the remaining sends.

---

## Scenario 2 — Leave allocation-to-request lifecycle

### Step 1 — Verify a Time Off Type exists

1. Click **Time Off** → **Types** (visible to Admin/HRManager).
2. Confirm **Planned** leave type exists with `requiresAllocation: true`.

> **Expected:** Time Off Types list shows 8 types from seed.

---

### Step 2 — Create an Allocation

1. Click **Time Off** → **Allocations**.
2. Click **New Allocation**.
3. Fields:
   - Employee: **Arjun Nair** (EMP-0005)
   - Time Off Type: **Planned**
   - Allocated Amount: `5` days
   - Valid From: `2026-01-01` / Valid To: `2026-12-31`
   - Status: **Draft** (leave as-is for now)
4. Save.

> **Expected:** Allocation appears in the list with status **Draft**.

---

### Step 3 — Confirm the Allocation

1. Open the allocation you just created.
2. Change status to **Confirmed** → Save.

> **Expected:** `Allocation.status = Confirmed`, `takenAmount = 0`,  
> `remainingAmount = 5`.

---

### Step 4 — Submit a Leave Request

1. Log out and log back in as **Arjun Nair** (`arjun.nair@example.com`).
2. Click **Time Off** → **Requests** → **New Request**.
3. Fields:
   - Type: **Planned**
   - Dates: pick 2 future working days
   - Reason: "Annual trip"
4. Submit.

> **Expected:** Request appears with status **Pending**.  
> Balance is NOT yet deducted (deduction happens on approval).

---

### Step 5 — Approve the Leave Request

1. Log in as **Admin** (`admin@example.com`).
2. Click **Time Off** → **Requests**.
3. Find Arjun's pending request → click **Approve**.

> **Expected:**  
> - Request status → **Approved**  
> - `Allocation.takenAmount` increments by 2 (via the approval bridge hook)  
> - `Allocation.remainingAmount` becomes 3  
> - A `LeaveLedger` deduction entry is written

---

### Step 6 — Verify balance decremented

1. Still as Admin, navigate to **Employees** → open Arjun Nair's profile.
2. Check **Leave Balances** — `paid` should have decreased.
   (Or check the Allocations list — `takenAmount` should now be `2`.)

> **Expected:** Balance correctly reflects the approved leave deduction.

---

## Scenario 3 — Dashboard showing real data

1. Log in as **Admin**.
2. Click **Payroll** in the sidebar → **Dashboard** tab.
3. The dashboard loads data from 6 real backend endpoints (no fabricated numbers):
   - **Total Net Salary Paid** — sum from seeded Paid payslips
   - **Attendance Health %** — on-time / total AttendanceLogs for the month
   - **Monthly Trend chart** — real Payslip history for last 6 months
   - **Salary by Department** — pie chart grouped by employee department
   - **Live Alerts** — any Payruns with warnings or blocking payslip warnings
4. Change the Month/Year selectors — all KPIs and charts update via fresh API calls.

> **Expected:** Seed data produces non-zero values in the dashboard.  
> No `Math.random()` or `Math.sin()` values anywhere.

---

## Scenario 4 — Role-based access verification

| Action | Admin | HRPayrollManager | HRPayrollUser | HRManager | Employee |
|--------|:-----:|:----------------:|:-------------:|:---------:|:--------:|
| View Payroll Dashboard | ✓ | ✓ | ✓ | ✗ | ✗ |
| Create Payrun | ✓ | ✓ | ✓ | ✗ | ✗ |
| Compute / Validate / Mark Paid | ✓ | ✓ | ✓ | ✗ | ✗ |
| Create/Edit Salary Structure | ✓ | ✓ | ✗ | ✗ | ✗ |
| Create/Edit Salary Rule | ✓ | ✓ | ✗ | ✗ | ✗ |
| View Salary Structures (read) | ✓ | ✓ | ✓ | ✗ | ✗ |
| Send Payslips | ✓ | ✓ | ✓ | ✗ | ✗ |

To verify a denied action:
1. Log in as **HRPayrollUser** (`hrpayroll@example.com`).
2. Navigate to `/payroll/salary-structures` → click **New Structure**.
3. Fill in the form and submit.
4. **Expected:** `403 Access denied. Required role: one of [Admin, HRPayrollManager]`

---

## Scenario 5 — Payrun immutability guard (audit item #33)

1. Complete a payrun through to **Paid** status (as in Scenario 1).
2. Using a REST client (e.g. Postman, curl), attempt to call:
   ```
   POST /api/payroll/payruns/:id/compute
   Authorization: Bearer <admin JWT>
   ```
3. **Expected:** `409 Conflict — Payrun "..." is already in Paid status and cannot be rolled back.`

The pre-save hook on `Payrun.js` enforces this at the model level — no route-level
workaround can bypass it.

---

## Scenario 6 — Formula rule safety (audit item #29)

1. Log in as **Admin** → **Payroll** → **Salary Rules** → **New Rule**.
2. Set:
   - Computation Method: **Formula**
   - Formula: `require('fs').readFileSync('/etc/passwd')`
3. Tab out of the formula field — the frontend calls `POST /api/salary-rules/validate-formula`.
4. **Expected:** Validation fails with an error: the `expr-eval` parser rejects
   `require` as an unknown identifier. The form cannot be saved.

The evaluator runs inside `expr-eval`'s sandboxed `Parser` with no access to
Node globals, `require`, `process`, or any prototype chain.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Payrun wizard Step 2 shows 0 eligible employees | No Running contracts for the selected structure + period | Run seed or create a contract manually |
| Compute returns 0 for all amounts | SalaryStructure has no rules or rules are inactive | Check Salary Structures page — ensure rules are attached and `isActive: true` |
| PDF download fails with 404 | Payslip not yet computed | Run Compute first |
| Email send shows "No email address on record" | Employee's `email` field is empty | Check user record in Employees list |
| Dashboard shows all zeros | No Paid payslips exist for the selected period | Run seed or complete a payrun cycle; change the period selector to a month with seeded data |
| `Cannot find module 'expr-eval'` | Dependency not installed | Run `cd backend && npm install` |

---

## File inventory (new payroll files)

### Backend
| File | Purpose |
|------|---------|
| `backend/models/Payrun.js` | Payrun model — immutability guard added |
| `backend/models/Payslip.js` | Payslip model — blocking warning field + immutability guard |
| `backend/routes/payrollRoutes.js` | All payrun/payslip routes including lifecycle + dashboard aggregations |
| `backend/routes/salaryConfigRoutes.js` | SalaryStructure + SalaryRule CRUD |
| `backend/services/payrollComputationService.js` | Computation engine + safe formula evaluator |
| `backend/services/payslipPdfService.js` | pdfkit PDF renderer |
| `backend/scripts/seed.js` | Section 12 added — Payrun + Payslip seed data |
| `backend/server.js` | Model pre-loads + salaryConfigRoutes registration |

### Frontend
| File | Purpose |
|------|---------|
| `frontend/src/pages/PayrollManagementPage.jsx` | Fixed role guard; added Payruns tab + wizard trigger |
| `frontend/src/pages/PayrunProcessingPage.jsx` | Full payrun lifecycle UI |
| `frontend/src/pages/SalaryStructuresPage.jsx` | Salary structure list |
| `frontend/src/pages/SalaryRulesPage.jsx` | Salary rule list |
| `frontend/src/components/payroll/PayrunWizard.jsx` | 2-step payrun creation wizard |
| `frontend/src/components/payroll/PayrunListTab.jsx` | Payruns list inside management page |
| `frontend/src/components/payroll/PayrollDashboard.jsx` | Real-data dashboard (replaces mock) |
| `frontend/src/components/payroll/SalaryStructureForm.jsx` | Add/edit salary structure dialog |
| `frontend/src/components/payroll/SalaryRuleForm.jsx` | Add/edit salary rule dialog with formula validation |
| `frontend/src/App.jsx` | Routes for `/payroll`, `/payroll/payruns/:id`, `/payroll/salary-*` |
| `frontend/src/components/Sidebar.jsx` | Payroll collapsible nav item |
