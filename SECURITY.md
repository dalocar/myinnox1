# Security policy

This app handles INNODIGYM account credentials and session tokens: the login
request passes through this project's proxy (`functions/api/[[path]].js`,
`server.py`) on its way to the vendor API. The proxy forwards requests
unchanged and stores and logs nothing. Changes to the proxy, to any code that
reads `localStorage`, or to anything that adds a network destination get
maintainer review.

## Desktop launcher (self-hosted only)

Started through `launcher/`, the app listens on `127.0.0.1` only and `server.py` adds routes under
`/_local/`, including `POST /_local/stop`. That request can only make the app exit; a script on your
computer then decides whether to stop the container engine. All `/_local/` routes require a local `Host`;
the stop request also requires a custom header and a local or absent `Origin`. They do not exist on the hosted site or under plain
`docker compose up`, which is still reachable from your local network, as before.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private vulnerability
reporting (Security tab → "Report a vulnerability") for this repository.

## Trust model

- Hosted instance: you trust the operator not to alter the deployed code.
- Prefer not to? Self-host: `docker compose up --build`. See the README.
