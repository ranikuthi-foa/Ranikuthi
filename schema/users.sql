-- Users table
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active'
);

-- Flats table
CREATE TABLE flats (
    flat_id SERIAL PRIMARY KEY,
    owner_id INT REFERENCES users(user_id),
    flat_number VARCHAR(20) UNIQUE NOT NULL,
    sq_ft INT,
    status VARCHAR(20) DEFAULT 'occupied'
);

-- Bills table
CREATE TABLE bills (
    bill_id SERIAL PRIMARY KEY,
    flat_id INT REFERENCES flats(flat_id),
    bill_date DATE NOT NULL,
    due_date DATE NOT NULL,
    bill_amount NUMERIC(12,2) NOT NULL,
    penalty NUMERIC(12,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'unpaid'
);

-- Receipts table
CREATE TABLE receipts (
    receipt_id SERIAL PRIMARY KEY,
    bill_id INT REFERENCES bills(bill_id),
    payment_date DATE NOT NULL,
    amount_paid NUMERIC(12,2) NOT NULL,
    payment_type VARCHAR(50),
    remarks TEXT
);

-- Other Receivables table
CREATE TABLE other_receivables (
    receipt_id SERIAL PRIMARY KEY,
    flat_id INT REFERENCES flats(flat_id),
    category VARCHAR(50) CHECK (category IN ('Puja','Donation','Misc')),
    amount NUMERIC(12,2) NOT NULL,
    date DATE NOT NULL
);

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
