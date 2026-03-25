.PHONY: start lint install fetch test

# Install Node dependencies
install:
	npm install

# Start the local development server (for CORS-free ES6 module testing)
start:
	npm start

# Run the Node.js unit test suite
test:
	npm test

# Run the ESLint code quality checks
lint:
	npm run lint

# Fetch the latest NHL data manually (usually done automatically by GitHub Actions)
fetch:
	node scripts/fetch_nhl_api.mjs
