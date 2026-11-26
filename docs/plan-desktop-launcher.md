# Plan: one-click desktop launcher and Stop button (Windows and macOS)

Status: implemented; not yet verified with real engine start and stop, or on Windows. Rules added during implementation and review are in [`desktop-launcher-impl-plan.md`](desktop-launcher-impl-plan.md), which wins where the two differ.

Source: community request. A user built a Windows launcher that starts Docker Desktop, starts the app and opens the browser, plus a dashboard Stop button backed by a small local helper and a desktop shortcut as fallback. They flagged the shutdown mechanism as needing security review.

## Goals

- One double-click: start the container engine if needed, start the app, open the browser.
- Stop from the dashboard or from a shortcut. The engine stops too, but only if the launcher started it and nothing else is using it.
- The same behaviour on Windows and macOS.
- No new listening service on the host.

Not goals: a signed installer, a tray or menu bar app, start at login, installing Docker for the user, Linux.

## Scope: self-hosted only

The hosted site (`myinnox1.carralabs.app`) must not change in any way: no new code, markup, strings or requests. This is guaranteed by where files live, not by a check in the browser.

| Piece | Location | Deployed to Cloudflare |
|---|---|---|
| Button, its styles and translations | `launcher/ui/local-stop.js` | No |
| `/_local/*` routes and script injection | `server.py` | No |
| Compose files and launcher scripts | `docker-compose*.yml`, `launcher/` | No |
| `static/`, `functions/` | unchanged by this feature | Yes |

A CI check fails if anything under `static/` or `functions/` mentions `_local` or `MYINNOX1_LAUNCHER`.

A self-hosted user who runs `docker compose up` without the launcher gets no button and no new routes. Their port binding and restart policy also stay as they are today, because `docker-compose.yml` is not edited.

## Key decision: no host helper

A helper that listens on localhost and can shut down Docker is reachable by any web page the user visits, so it needs its own authentication, origin checks and lifecycle. We avoid it:

1. The dashboard asks **its own server** (same origin) to exit.
2. `server.py` exits with a reserved code, **42**.
3. A launcher script on the host is blocked in `docker wait <container>`. It sees 42 and does the host-side cleanup.

```
browser --POST /_local/stop--> server.py (in container) --exit 42-->
    docker wait (launcher watcher, on host) --> compose down --> stop engine if safe
```

The web side can only ever say "stop this app". What happens to the engine is decided on the host from local state. The container gets no Docker socket and no mounted volume.

| Option | Verdict |
|---|---|
| Local HTTP helper on the host | Rejected: new attack surface that controls Docker |
| Mount the Docker socket into the container | Rejected: gives the proxy control of the host's Docker |
| Custom URL scheme (`myinnox1://stop`) | Rejected: needs per-OS registration, and any page can try to open it |
| Stop shortcut only, no button | Safe, kept as the fallback |
| Exit code watched by the launcher | **Chosen** |

## Changes to the app

### Compose

`docker-compose.yml` is unchanged. All launcher settings, including the loopback restriction, go in a new `launcher/compose.launcher.yml`, applied only by the launcher:

```yaml
services:
  innodigym-editor:
    ports: !override  # replace the base list; without the tag Compose appends to it
      - "127.0.0.1:8787:8787"
    restart: "no"     # otherwise a requested exit is restarted, and the app returns with the engine
    init: true        # forwards SIGTERM, so `compose down` is not a 10 s wait
    environment:
      MYINNOX1_LAUNCHER: "1"
      PYTHONUNBUFFERED: "1" # so `compose logs` shows output when a start fails
```

`!override` needs [Docker Compose 2.24.4 or newer](https://docs.docker.com/reference/compose-file/merge/). The launcher checks `docker compose version` first and stops with an upgrade message if it is older. It never falls back to starting without the restriction.

### `server.py`

Active only when `MYINNOX1_LAUNCHER=1`; otherwise the routes return 404 and `index.html` is served as is:

| Route | Behaviour |
|---|---|
| `GET /` and `GET /index.html` | `index.html` with `<script src="/_local/ui.js"></script>` added before `</body>` |
| `GET /_local/ui.js` | Serves `launcher/ui/local-stop.js` |
| `GET /_local/status` | `{"app": "myinnox1", "launcher": true}` |
| `POST /_local/stop` | 202, then `server.shutdown()` from a separate thread; the process exits 42 |

The paths are outside `/api/` so they can never be proxied upstream.

The `Dockerfile` adds `COPY launcher/ui ./launcher/ui`.

All `/_local/*` routes require:

- `Host` is exactly `localhost:8787` or `127.0.0.1:8787` (blocks DNS rebinding).
- For the POST: header `X-MyInnoX1: stop`. A cross-site page cannot send it without a CORS preflight, which the server never approves.
- For the POST: if `Origin` is present, it is `http://localhost:8787` or `http://127.0.0.1:8787`.

No CORS headers are ever sent. A token would add nothing: the worst result of a bypass is that the app stops. Other programs on the same computer can call the route, but they can already do more than that.

### Frontend

- A "Stop MyInnoX1" button in the header (`.header-right`, next to the language menu and user bar), so it is reachable from every tab and from the login screen. It is separate from "Log out". `local-stop.js` adds it to the page; `static/index.html` is not edited.
- Confirm dialog that mentions unsaved changes.
- After 202, replace the page with: "MyInnoX1 has stopped. You can close this tab. Docker also closes if the launcher started it and nothing else is running." Browsers do not let a script close a tab it did not open.
- The script carries its own strings for all eight languages, picks one from `window.I18N.lang`, and updates when `<html lang>` changes. The language packs in `static/` are not edited.

## Launcher

### Files

```
launcher/
  compose.launcher.yml
  ui/       local-stop.js
  windows/  Start MyInnoX1.cmd   Stop MyInnoX1.cmd   launcher.ps1
  macos/    Start MyInnoX1.command   Stop MyInnoX1.command   launcher.sh
  README.md
```

Two implementations (PowerShell, and Bash compatible with macOS's 3.2) because neither OS ships a runtime the other has. The `.cmd` and `.command` files are thin wrappers. This document is the shared specification.

### Start

1. Resolve the repository folder from the script's own location. Paths with spaces must work.
2. Find `docker`. If missing, explain how to install an engine and exit. On macOS also look in `/usr/local/bin`, `/opt/homebrew/bin`, `~/.docker/bin`, `~/.rd/bin` and `~/.orbstack/bin`.
3. If `docker info` fails, start the engine (table below), record `engineStartedByLauncher = true`, and poll `docker info` for up to 3 minutes.
4. If the engine was already running: keep the recorded flag if our container is running, otherwise record `false`.
5. Check the Compose version (2.24.4 or newer), then run `docker compose -f docker-compose.yml -f launcher/compose.launcher.yml up -d --build`.
6. Poll `/_local/status` for up to 60 s.
7. Start the watcher for this container ID, unless one is already alive.
8. Open `http://localhost:8787`. Always this spelling: the session lives in `localStorage` per origin, so `127.0.0.1` would look logged out.

On any failure, keep the window open with the error and the last lines of `docker compose logs`.

State (engine name, flag, container ID, watcher PID) lives outside the repository: `%LOCALAPPDATA%\MyInnoX1\` and `~/Library/Application Support/MyInnoX1/`. It holds no credentials.

### Watcher

Runs `docker wait <id>`.

- **42**: run Stop cleanup.
- **Anything else** (crash, engine quit, container recreated, manual `docker stop`): log it and exit. Never touch the engine.

On Windows it is a minimised PowerShell window titled "MyInnoX1", visible on purpose. On macOS it is detached with `nohup`, so the Terminal window can be closed. If the watcher dies (logout, window closed), the dashboard button still stops the app but leaves the engine running; the Stop shortcut covers that.

### Stop cleanup (watcher and Stop shortcut)

1. If the engine is not running, clear state and exit. Never start it just to stop.
2. Note whether our container was running or had exited with 42.
3. `docker compose ... down`.
4. Stop the engine only if **all** are true: step 2 was true, `engineStartedByLauncher` is true, and `docker ps -q` is empty. Otherwise say why it was left running.
5. Clear state.

Every doubtful case leaves the engine running. Docker Desktop can hide Kubernetes containers from `docker ps`, so it is stopped only when its settings say Kubernetes is disabled. On Rancher Desktop they show in `docker ps`, so the engine stays up.

### Engines

| Engine | OS | Start | Stop |
|---|---|---|---|
| Docker Desktop (4.37 or newer) | both | `docker desktop start` | `docker desktop stop` |
| Rancher Desktop (dockerd/moby) | both | `rdctl start` | `rdctl shutdown` |
| OrbStack (later) | macOS | `orb start` | `orb stop` |
| Colima (later) | macOS | `colima start` | `colima stop` |
| Anything else | both | user starts it | never |

Choose by the active context (`docker context show`: `desktop-linux`, `rancher-desktop`, `orbstack`, `colima`). If that is inconclusive (`default`), use the single engine CLI that is installed; if there are several, ask the user to start one. An engine that is already running needs no detection, because the flag is false.

**Changed during implementation** (details in the implementation plan): the container must match the recorded ID and start time to count as ours; an engine that is already open or booting is not claimed; the engine is recorded only after a successful start of the app; Docker Desktop is started with `--detach`.

## Platform notes

| Topic | Windows | macOS |
|---|---|---|
| Downloaded ZIP warnings | SmartScreen may warn; document "More info, Run anyway" | Gatekeeper blocks unsigned files; System Settings, Privacy & Security, Open Anyway. Verify on a real Mac for `.command` |
| Script permissions | `.cmd` calls PowerShell with `-ExecutionPolicy Bypass` for that one file; managed PCs may still block it | Executable bit committed in git; verify it survives the ZIP download |
| Line endings (`.gitattributes`) | `*.cmd`, `*.ps1`: CRLF | `*.command`, `*.sh`: LF |
| Desktop shortcut | User creates a shortcut to the `.cmd` | User creates an alias to the `.command` |

`git clone` avoids the download warnings on both. We do not tell users to disable Gatekeeper or change the system-wide execution policy.

## Security review

| Threat | Mitigation |
|---|---|
| A website stops the app (CSRF) | Custom header, Origin check, no CORS |
| DNS rebinding | Exact `Host` check |
| Another device on the network | Under the launcher, loopback-only port. Plain `docker compose up` stays reachable from the network, as today |
| The web side controls Docker or the host | Not possible: the only signal is an exit code |
| The hosted site gets the button or routes | None of it is in `static/` or `functions/`; CI enforces this |
| Tampered launcher in a contribution | List `/launcher/` explicitly in CODEOWNERS (the `*` rule already covers it); no downloads or remote execution in scripts |

Update `SECURITY.md` to describe the routes. Extend `scripts/check-external-hosts.js` to scan `launcher/`.

## Tests

Automated (new Python `unittest`, added to CI): routes 404 and `index.html` is unmodified without the env var; the script tag is added with it; the merged Compose config publishes only `127.0.0.1:8787`, and the base config is unchanged; wrong `Host`, missing header and foreign `Origin` are rejected; a valid POST ends the process with 42; `/_local/*` is never proxied.

Manual, on both OSes, with Docker Desktop and with Rancher Desktop:

| Scenario | Expected |
|---|---|
| Engine off, start, stop from button | Engine starts, then stops |
| Engine already on, start, stop | Engine stays on |
| Another container running at stop | Engine stays on |
| Start clicked twice | One watcher, browser opens |
| Watcher closed, then button | App stops, engine stays on |
| Stop shortcut with engine off | Nothing starts |
| Reboot while running | App does not come back by itself |
| Port 8787 taken by another program | Clear error |
| Folder path with spaces and non-ASCII characters | Works |
| First run, slow build | Progress visible, no false timeout |

## Delivery order

1. `server.py` routes, Python tests, dashboard button.
2. Windows and macOS launchers with Docker Desktop and Rancher Desktop. Do not release one OS without the other.
3. Later: OrbStack, Colima, a macOS `.app` wrapper with an icon.

## Open questions

- Should the README tell people who run plain `docker compose up` how to limit the port to their own computer?
- Should we also offer a no-Docker mode (`python server.py`, bound to `127.0.0.1`, same exit button)? The server has no dependencies, so it removes the engine problem entirely, but users must install Python on Windows, and usually on macOS.
- Will the requester share their scripts as a pull request? They could seed the Windows side.

## References

- [Docker Desktop CLI](https://docs.docker.com/desktop/features/desktop-cli/)
- [rdctl command reference](https://docs.rancherdesktop.io/references/rdctl-command-reference/)
- [OrbStack headless use](https://docs.orbstack.dev/headless)
- [Sequoia Gatekeeper change](https://mjtsai.com/blog/2024/07/05/sequoia-removes-gatekeeper-contextual-menu-override)
