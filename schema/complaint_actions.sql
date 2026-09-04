-- Complaint Actions
CREATE TABLE complaint_actions (
    action_id SERIAL PRIMARY KEY,
    complaint_id INT REFERENCES complaints(complaint_id),
    admin_id INT REFERENCES users(user_id),
    action_type VARCHAR(20),
    remarks TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);
