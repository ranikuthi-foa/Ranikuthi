-- Suggestions
CREATE TABLE suggestions (
    suggestion_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id),
    flat_id INT REFERENCES flats(flat_id),
    subject VARCHAR(100),
    details TEXT,
    status VARCHAR(20) DEFAULT 'Pending',
    committee_remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
