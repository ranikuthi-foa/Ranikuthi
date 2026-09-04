-- Flats table
CREATE TABLE flats (
    flat_id SERIAL PRIMARY KEY,
    owner_id INT REFERENCES users(user_id),
    flat_number VARCHAR(20) UNIQUE NOT NULL,
    sq_ft INT,
    status VARCHAR(20) DEFAULT 'occupied'
);
