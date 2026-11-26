# Desktop launcher (Windows and macOS)

One double-click starts your container engine if needed, runs MyInnoX1 and opens
http://localhost:8787. It is for people who run the app on their own computer.

## What you need

- This repository (`git clone` is easiest, see "First run").
- Docker Desktop 4.37 or newer, or Rancher Desktop with the **dockerd (moby)** engine.
  Open it once and finish its setup.
- Docker Compose 2.24.4 or newer (included in current versions of both).

With any other engine (OrbStack, Colima...), start it yourself; the launcher then
runs the app and never stops the engine.

## Use

| | Windows | macOS |
|---|---|---|
| Start | `windows\Start MyInnoX1.cmd` | `macos/Start MyInnoX1.command` |
| Stop | button in the app, or `windows\Stop MyInnoX1.cmd` | button in the app, or `macos/Stop MyInnoX1.command` |
| Desktop shortcut | create a shortcut to the `.cmd` | create an alias to the `.command` |

Keep the files inside the repository folder. The first start builds the app and can
take several minutes.

On Windows a minimised window named **MyInnoX1** stays open. It waits for the Stop
button. If you close it, the button still stops the app, but Docker keeps running;
use the Stop shortcut. On macOS you can close the Terminal window.

## When is Docker stopped?

Only if the launcher started it, MyInnoX1 was the thing being stopped, and no other
container is running. In any doubt it is left running and the reason is shown
(or written to `watcher.log`). With Kubernetes enabled it stays running. Docker Desktop
also stays running if the launcher cannot confirm from its settings that Kubernetes is off.
If you restart or recreate the app yourself, or if a Start fails after opening Docker,
Docker is left running.

## Differences from `docker compose up`

The launcher makes the app reachable **from this computer only** (not from your phone)
and the app does not restart when Docker starts. Plain `docker compose up` behaves as
before.

## First run

Files downloaded as a ZIP are flagged by the operating system:

- **macOS:** try to open the file, then go to System Settings → Privacy & Security
  and choose **Open Anyway**.
- **Windows:** if SmartScreen appears, choose **More info → Run anyway**. Company
  computers may block scripts altogether.

`git clone` avoids both. Do not disable Gatekeeper or change the system-wide
PowerShell execution policy.

## Troubleshooting

- **Port 8787 is in use:** close the other program (for example `python server.py`).
- **Update the app:** `git pull`, then Start again.
- **State and log:** `%LOCALAPPDATA%\MyInnoX1\` or
  `~/Library/Application Support/MyInnoX1/`. They hold no credentials.
- **Known limit:** if the Stop button was used while the watcher was not running,
  and you later restart Docker yourself (or reboot and open it) and run Stop before
  Start, Docker can be stopped when no other container is running.
