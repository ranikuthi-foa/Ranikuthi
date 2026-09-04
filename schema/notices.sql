-- Notices
CREATE TABLE notices (
    notice_id SERIAL PRIMARY KEY,
    subject VARCHAR(100),
    body TEXT,
    issued_by INT REFERENCES users(user_id),
    issued_date DATE NOT NULL,
    expiry_date DATE,
    target VARCHAR(50),
    delivery_mode VARCHAR(50)
);
