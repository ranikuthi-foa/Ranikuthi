-- Trial Balance
CREATE TABLE trial_balance (
    account_id INT REFERENCES chart_of_accounts(account_id),
    debit_total NUMERIC(12,2) DEFAULT 0,
    credit_total NUMERIC(12,2) DEFAULT 0,
    closing_balance NUMERIC(12,2),
    as_on_date DATE NOT NULL
);
