-- Ledger Entries
CREATE TABLE ledger_entries (
    entry_id SERIAL PRIMARY KEY,
    voucher_no VARCHAR(50) NOT NULL,
    account_id INT REFERENCES chart_of_accounts(account_id),
    debit NUMERIC(12,2) DEFAULT 0,
    credit NUMERIC(12,2) DEFAULT 0,
    narration TEXT,
    entry_date DATE NOT NULL,
    ref_module VARCHAR(50)
);
