-- Payments table
CREATE TABLE payments (
    payment_id SERIAL PRIMARY KEY,
    auto_voucher_no VARCHAR(50) UNIQUE NOT NULL,
    manual_voucher_no VARCHAR(50) NOT NULL,
    ref_invoice_no VARCHAR(50),
    invoice_date DATE,
    vendor_id INT,
    vendor_name VARCHAR(100),
    amount NUMERIC(12,2) NOT NULL,
    payment_mode VARCHAR(50),
    narration TEXT
);
