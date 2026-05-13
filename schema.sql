CREATE DATABASE IF NOT EXISTS products_db;
USE products_db;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed data for testing
INSERT INTO products (name, price, stock) VALUES
  ('Widget A', 29.99, 150),
  ('Widget B', 49.99, 0),
  ('Gadget Pro', 99.99, 30),
  ('Basic Kit', 14.99, 500),
  ('Premium Bundle', 199.99, 12);

