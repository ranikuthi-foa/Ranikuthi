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
