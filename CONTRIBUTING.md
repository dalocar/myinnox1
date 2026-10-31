# Contributing

Thanks for helping. This is an unofficial client; it is not affiliated with
INNODIGYM or its vendor.

1. Fork the repo and open a pull request from your fork. Only maintainers can
   merge, and only maintainers can deploy; contributors never get write access.
2. Run locally: `docker compose up --build` (or `python server.py`), then open
   http://localhost:8787.
3. Tests: `node --test static/*.test.js`. Put new logic in `<screen>-core.js`
   with a `.test.js` beside it.
4. New UI text needs entries in every language pack (`static/i18n*.js`).
5. Use the fixtures in `qa/fixtures` for testing. **Never** commit real
   credentials, tokens, account data or screenshots of your own account.
6. CI blocks PRs that add new external hosts or network APIs
   (`scripts/check-external-hosts.js`). Such changes are possible but need an
   explicit maintainer decision.
7. Forked PRs run CI without secrets. Workflows from first-time contributors
   need a maintainer's approval to run.
