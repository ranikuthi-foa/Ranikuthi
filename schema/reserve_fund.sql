-- Reserve Fund
CREATE TABLE reserve_fund (
    fund_id SERIAL PRIMARY KEY,
    fund_name VARCHAR(100),
    source_account INT REFERENCES chart_of_accounts(account_id),
    amount NUMERIC(12,2) DEFAULT 0,
    last_updated DATE
);
