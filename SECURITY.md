# Security policy

This app handles INNODIGYM account credentials and session tokens: the login
request passes through this project's proxy (`functions/api/[[path]].js`,
`server.py`) on its way to the vendor API. The proxy forwards requests
unchanged and stores and logs nothing. Changes to the proxy, to any code that
reads `localStorage`, or to anything that adds a network destination get
maintainer review.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private vulnerability
reporting (Security tab → "Report a vulnerability") for this repository.

## Trust model

- Hosted instance: you trust the operator not to alter the deployed code.
- Prefer not to? Self-host: `docker compose up --build`. See the README.
