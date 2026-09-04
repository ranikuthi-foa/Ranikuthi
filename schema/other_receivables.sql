-- Other Receivables table
CREATE TABLE other_receivables (
    receipt_id SERIAL PRIMARY KEY,
    flat_id INT REFERENCES flats(flat_id),
    category VARCHAR(50) CHECK (category IN ('Puja','Donation','Misc')),
    amount NUMERIC(12,2) NOT NULL,
    date DATE NOT NULL
);
