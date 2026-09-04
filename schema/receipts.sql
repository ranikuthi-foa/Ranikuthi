-- Receipts table
CREATE TABLE receipts (
    receipt_id SERIAL PRIMARY KEY,
    bill_id INT REFERENCES bills(bill_id),
    payment_date DATE NOT NULL,
    amount_paid NUMERIC(12,2) NOT NULL,
    payment_type VARCHAR(50),
    remarks TEXT
);
