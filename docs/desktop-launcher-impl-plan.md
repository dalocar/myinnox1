# Implementation plan: desktop launcher

Spec: [`plan-desktop-launcher.md`](plan-desktop-launcher.md). This file adds the work split and the exact contracts between the parts. Where the two differ, this file wins; differences are marked **(refinement)**.

## Work packages

Packages own disjoint files, so they can be built in parallel.

| # | Package | Owns |
|---|---|---|
| 0 | Shared scaffolding (first) | `launcher/compose.launcher.yml`, this file |
| A | Server and button | `server.py`, `Dockerfile`, `launcher/ui/local-stop.js`, `launcher/tests/server/` |
| B | macOS launcher | `launcher/macos/`, `launcher/tests/macos/` |
| C | Windows launcher | `launcher/windows/`, `launcher/tests/windows/` |
| D | Integration (after A to C) | `.github/`, `.gitattributes`, `scripts/`, `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `launcher/README.md`, `launcher/tests/compose/` |
| E | Independent review, container and browser tests | no files; reports findings |

Nothing under `static/` or `functions/` changes.

## Safety rules for building and testing

- Never start, stop or reconfigure the real container engine on the development machine. Engine commands (`docker`, `rdctl`) are exercised only through fake shims.
- Never touch a process listening on port 8787; the developer may be using it.
- No commits or pushes.

## Contract: server (A)

- Launcher mode: environment `MYINNOX1_LAUNCHER` equals `1`.
- Path matching ignores the query string. Everything under `/_local/` is handled locally and never proxied.
- `GET /_local/status`: 200 `{"app": "myinnox1", "launcher": true}`.
- `GET /_local/ui.js`: 200 JavaScript from `launcher/ui/local-stop.js`, `Cache-Control: no-cache`.
- `POST /_local/stop`: 202 `{"stopping": true}`, then shutdown; process exit status 42. Any other exit is not 42.
- Rejections: 403 for a wrong `Host`, a missing or wrong `X-MyInnoX1: stop` header, or a foreign `Origin`. 404 for unknown `/_local/` paths, and for all of them outside launcher mode.
- Allowed `Host`: `localhost:8787`, `127.0.0.1:8787`. Allowed `Origin`: absent, or `http://` plus an allowed host.
- `GET /` and `/index.html` in launcher mode: `<script src="/_local/ui.js"></script>` inserted once before the last `</body>`. Outside launcher mode, behaviour is byte-identical to today.
- No `Access-Control-*` headers, no `OPTIONS` handler.
- Works on Python 3.9 and 3.12, standard library only.

## Contract: launcher scripts (B and C)

Both implement the Start, Watcher, Stop cleanup and Engines sections of the spec.

**Entry point:** `launcher.sh <command>` / `launcher.ps1 <command>` with `start`, `stop`, or `watch <containerId>`. The `.command` / `.cmd` wrappers call `start` or `stop` and keep the window open on failure.

**Exit status:** 0 on success (including "nothing to stop" and "engine left running"), non-zero on failure.

**Compose:** always `docker compose -f <repo>/docker-compose.yml -f <repo>/launcher/compose.launcher.yml`. Service name `innodigym-editor`. Container ID from `ps -a -q innodigym-editor`.

**State:** a `state` file of `key=value` lines in the state directory: `engine` (`docker-desktop`, `rancher-desktop` or `none`), `context`, `engine_started` (`0` or `1`), `container_id`, `container_started_at`, `watcher_pid`. Parse it as data; never execute or `source` it. A `watcher.log` sits beside it.

**Refinements to the spec:**

- **Context pinning (refinement):** `start` records the Docker context. `watch` and `stop` set `DOCKER_CONTEXT` to it, so "no other containers" is asked of the same engine that would be stopped. If the engine type is `none`, never stop it.
- **Engine match (refinement):** only stop an engine whose recorded type matches its recorded context (`desktop-linux` for Docker Desktop; `rancher-desktop`, or `default` on a machine where the launcher chose Rancher Desktop, for Rancher).
- **Port check (refinement):** before `up`, if something answers on `http://localhost:8787` and this project's container is not running, fail with a "port 8787 is in use" message. Port forwarding on some engines does not fail by itself.
- **Failed checks leave the engine alone:** if `docker ps -q` fails, do not stop the engine.
- **Watcher identity:** "already alive" means the recorded PID is running, is this launcher's `watch` process, and `container_id` matches.
- Messages contain no external URLs.
- **Ownership (from review):** stop cleanup treats a container as ours only if both its ID and `.State.StartedAt` match the record. A recorded `engine_started=1` is dropped as soon as Start finds the engine off or the running container does not match.
- **Already open engine (from review):** if the engine's application or status probe shows it open or booting, wait for it and do not claim it. If the check itself fails, do not claim it.
- **Kubernetes (from review):** Docker Desktop can hide Kubernetes containers from `docker ps`, so stop it only when its settings file says Kubernetes is disabled.
- **Start order (from review):** do not redirect the recorded context or container before the Compose version and port checks pass.
- **Ownership is recorded late:** the new engine, context and container are written only after the Compose check, port check, `up` and container ID succeed. If a Start launched the engine and then failed, the engine is later left running.
- No `docker desktop version` precheck; a failed `docker desktop start` explains that 4.37 or newer is needed.

**Test hooks (both scripts):**

| Variable | Meaning | Default |
|---|---|---|
| `MYINNOX1_STATE_DIR` | state directory | per spec |
| `MYINNOX1_ENGINE_TIMEOUT` | seconds to wait for the engine | 180 |
| `MYINNOX1_APP_TIMEOUT` | seconds to wait for the app | 60 |
| `MYINNOX1_NO_BROWSER` | `1` prints the URL and opens nothing | unset |
| `MYINNOX1_DOCKER_APP` | Docker Desktop application path | platform location |
| `MYINNOX1_DOCKER_SETTINGS` | Docker Desktop settings file | platform location |
| `MYINNOX1_PROCESS_CHECK` | Windows: command given a process name; exit 0 present, 1 absent, other error (macOS tests shim `pgrep`) | `Get-Process` |
| `MYINNOX1_EXTRA_PATH` | extra search directories appended to `PATH`; set but empty means none | platform list |

HTTP checks use `curl` (macOS) so tests can shim it. Windows may use a function that tests can replace through `MYINNOX1_CURL` (path to a command that prints the body and exits non-zero when nothing answers).

## Contract: button (A)

Per the spec's Frontend section. Insert into `.header-right` before `#userbar`. Language from `window.I18N.lang` (`en es de fr it ko zh ja`, fallback `en`), re-rendered when `<html lang>` changes. Reuse the app's button styles and theme variables. No external requests. On a failed request, tell the user and leave the page usable.

## Integration (D)

- `.gitattributes` line endings; executable bit on `.sh` and `.command`.
- CI: Python server tests, compose merge test, static/functions guard, macOS shell tests on `macos-latest`, PowerShell tests on `windows-latest`.
- Guard: fail if `static/` or `functions/` mentions `_local` or `MYINNOX1_LAUNCHER`. Network-surface check scans `launcher/`.
- CODEOWNERS, README, SECURITY, CONTRIBUTING, `launcher/README.md`.

## Acceptance

1. All automated tests pass locally, and the existing `node --test` suite and CI scripts still pass.
2. A real image built with the launcher compose file serves the routes, publishes on loopback only and exits 42 on a valid stop. Run on a separate project name and port.
3. The button works in a real browser, in more than one language and at phone width.
4. `git diff` shows no change under `static/` or `functions/`.

Not covered here, needs people with the hardware: the manual matrix in the spec (real engine start and stop, Windows, Docker Desktop, Gatekeeper, SmartScreen).
