-- Clear and reseed products table
truncate table keywords cascade;
truncate table research_sessions cascade;
truncate table products cascade;

-- Insert exactly 20 products (17 live + 3 in-progress)
insert into products (name, collection, portfolio_level, stage, confidence, created_at, updated_at) values

-- Mom Chapter (5 live)
('New Chapter Same Chaos Shirt', 'Mom Chapter', 'Core', 'Live', 'High', now(), now()),
('Comfortable Mama Tee', 'Mom Chapter', 'Core', 'Live', 'High', now(), now()),
('mom. mom. mom. MOM! (90s version)', 'Mom Chapter', 'Core', 'Live', 'High', now(), now()),
('mom. mom. mom. MOM! (dopamine stripe)', 'Mom Chapter', 'Core', 'Live', 'High', now(), now()),
('Camp Mom Chaos Coordinator Tee', 'Mom Chapter', 'Seasonal', 'Live', 'High', now(), now()),

-- Reader Chapter (4 live)
('Morally Gray Book Club Badge Tee', 'Reader Chapter', 'Core', 'Live', 'High', now(), now()),
('Morally Gray Book Lover Tee', 'Reader Chapter', 'Core', 'Live', 'High', now(), now()),
('Spicy Book Lover Shirt', 'Reader Chapter', 'Core', 'Live', 'High', now(), now()),
('Spicy Book Lover Sweatshirt', 'Reader Chapter', 'Core', 'Live', 'High', now(), now()),

-- Elder Millennial (1 live)
('Elder Millennial Sweatshirt', 'Mom Chapter', 'Growth', 'Live', 'High', now(), now()),

-- Kids Chapter (4 live)
('Funny Book Lover Kids Tee', 'Kids Chapter', 'Growth', 'Live', 'High', now(), now()),
('Kids Bookworm Shirt', 'Kids Chapter', 'Growth', 'Live', 'High', now(), now()),
('Coquette Book Lover Tee', 'Kids Chapter', 'Growth', 'Live', 'High', now(), now()),
('Dinosaur Bookworm Tee', 'Kids Chapter', 'Growth', 'Live', 'High', now(), now()),

-- Patriotic / Seasonal (2 live)
('Vintage American Flag Tee', 'Mom Chapter', 'Seasonal', 'Live', 'High', now(), now()),
('Patriotic Family Matching Tee', 'Mom Chapter', 'Seasonal', 'Live', 'High', now(), now()),

-- Digital (1 live)
('Passive Income Guide', 'Mom Chapter', 'Core', 'Live', 'High', now(), now()),

-- In Progress (3)
('Raising Kids Like It''s 1997', 'Mom Chapter', 'Core', 'SEO Ready', 'High', now(), now()),
('Late Bloomers Club Badge', 'Mom Chapter', 'Growth', 'Design Phase', 'Medium', now(), now()),
('Camp Mom Tee', 'Mom Chapter', 'Seasonal', 'Ready to Publish', 'High', now(), now());
