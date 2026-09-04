-- Complaints
CREATE TABLE complaints (
    complaint_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id),
    flat_id INT REFERENCES flats(flat_id),
    category VARCHAR(50),
    description TEXT,
    status VARCHAR(20) DEFAULT 'Open',
    assigned_to INT,
    priority VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP
);
