-- Vendor Advance
CREATE TABLE vendor_advance (
    advance_id SERIAL PRIMARY KEY,
    vendor_id INT,
    amount NUMERIC(12,2) NOT NULL,
    quotation_ref VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending'
);
