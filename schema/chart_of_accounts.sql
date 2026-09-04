-- Chart of Accounts
CREATE TABLE chart_of_accounts (
    account_id SERIAL PRIMARY KEY,
    account_name VARCHAR(100) NOT NULL,
    account_type VARCHAR(20) CHECK (account_type IN ('Asset','Liability','Income','Expense')),
    parent_account INT,
    opening_balance NUMERIC(12,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active'
);
