-- Audit Log
CREATE TABLE audit_log (
    audit_id SERIAL PRIMARY KEY,
    action VARCHAR(100),
    admin_id INT REFERENCES users(user_id),
    timestamp TIMESTAMP DEFAULT NOW(),
    note TEXT
);
