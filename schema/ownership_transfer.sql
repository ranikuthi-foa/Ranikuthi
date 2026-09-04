-- Ownership Transfer
CREATE TABLE ownership_transfer (
    transfer_id SERIAL PRIMARY KEY,
    flat_id INT REFERENCES flats(flat_id),
    old_owner_id INT REFERENCES users(user_id),
    new_owner_id INT REFERENCES users(user_id),
    dues_amount NUMERIC(12,2),
    decision VARCHAR(20) CHECK (decision IN ('Transfer','Write-Off')),
    committee_remarks TEXT
);
