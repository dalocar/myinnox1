#!/bin/bash
# MyInnoX1 desktop launcher for macOS. Must stay compatible with /bin/bash 3.2.
#
#   launcher.sh start                 start the engine if needed, the app, the browser
#   launcher.sh stop                  stop the app, and the engine only if that is safe
#   launcher.sh watch <containerId>   wait for the app to exit; exit code 42 means "stop"
#
# Spec: docs/plan-desktop-launcher.md and docs/desktop-launcher-impl-plan.md.
# Rule for every change: in any doubtful case, leave the engine running.

set -u
unset CDPATH

APP_URL="http://localhost:8787"
SERVICE="innodigym-editor"
STOP_CODE=42

say() { printf '%s\n' "$*"; }
warn() { printf '%s\n' "$*" >&2; }
die() { warn ""; warn "ERROR: $*"; exit 1; }
log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# --- Own location (the current directory can be anything) ---------------------

self=${BASH_SOURCE[0]}
while [ -h "$self" ]; do
  target=$(readlink "$self") || break
  case $target in
    /*) self=$target ;;
    *) case $self in */*) self=${self%/*}/$target ;; *) self=$target ;; esac ;;
  esac
done
case $self in */*) dir=${self%/*} ;; *) dir=. ;; esac
SCRIPT_DIR=$(cd -- "$dir" && pwd -P) || die "Cannot open the launcher folder."
SCRIPT_PATH="$SCRIPT_DIR/${self##*/}"
REPO=$(cd -- "$SCRIPT_DIR/../.." && pwd -P) || die "Cannot open the MyInnoX1 folder."

# --- Environment ---------------------------------------------------------------

# Compose derives the project name from the folder name and fails if nothing
# usable is left. Spelled out, because ranges can match accented letters.
case ${REPO##*/} in
  *[ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789]*) ;;
  *) export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-myinnox1}" ;;
esac

if [ -z "${MYINNOX1_EXTRA_PATH+set}" ]; then
  extra="/usr/local/bin:/opt/homebrew/bin:${HOME:-}/.docker/bin:${HOME:-}/.rd/bin:${HOME:-}/.orbstack/bin"
else
  extra=$MYINNOX1_EXTRA_PATH
fi
PATH="${PATH:-/usr/bin:/bin}${extra:+:$extra}:/usr/bin:/bin"
export PATH

STATE_DIR=${MYINNOX1_STATE_DIR:-"${HOME:-}/Library/Application Support/MyInnoX1"}
# The watcher is started from another directory context, so keep this absolute.
case $STATE_DIR in /*) ;; *) STATE_DIR="$PWD/$STATE_DIR" ;; esac
export MYINNOX1_STATE_DIR="$STATE_DIR"
STATE_FILE="$STATE_DIR/state"
LOG_FILE="$STATE_DIR/watcher.log"
LOCK_FILE="$STATE_DIR/lock"

number_or() { # value default
  case $1 in ''|*[!0-9]*) printf '%s' "$2" ;; *) printf '%s' "$1" ;; esac
}
ENGINE_TIMEOUT=$(number_or "${MYINNOX1_ENGINE_TIMEOUT:-}" 180)
APP_TIMEOUT=$(number_or "${MYINNOX1_APP_TIMEOUT:-}" 60)

# --- State (parsed as data, never executed) -------------------------------------

valid_name() { # container ids and context names
  case $1 in ''|-*|*[!A-Za-z0-9_.+-]*) return 1 ;; esac
  return 0
}

valid_timestamp() { # as printed by docker inspect
  case $1 in ''|-*|*[!0123456789TZ:.+-]*) return 1 ;; esac
  return 0
}

load_state() {
  ST_ENGINE=none ST_CONTEXT= ST_STARTED=0 ST_CID= ST_CSTARTED= ST_WPID=
  [ -f "$STATE_FILE" ] || return 0
  local line value
  while IFS= read -r line || [ -n "$line" ]; do
    value=${line#*=}
    case $line in
      engine=*)
        case $value in docker-desktop|rancher-desktop) ST_ENGINE=$value ;; *) ST_ENGINE=none ;; esac ;;
      context=*) if valid_name "$value"; then ST_CONTEXT=$value; else ST_CONTEXT=; fi ;;
      engine_started=*) if [ "$value" = 1 ]; then ST_STARTED=1; else ST_STARTED=0; fi ;;
      container_id=*) if valid_name "$value"; then ST_CID=$value; else ST_CID=; fi ;;
      container_started_at=*)
        if valid_timestamp "$value"; then ST_CSTARTED=$value; else ST_CSTARTED=; fi ;;
      watcher_pid=*)
        case $value in ''|0*|*[!0-9]*) ST_WPID= ;; *) ST_WPID=$value ;; esac ;;
    esac
  done <"$STATE_FILE"
}

save_state() {
  local tmp="$STATE_FILE.tmp.$$"
  printf 'engine=%s\ncontext=%s\nengine_started=%s\ncontainer_id=%s\ncontainer_started_at=%s\nwatcher_pid=%s\n' \
    "$ST_ENGINE" "$ST_CONTEXT" "$ST_STARTED" "$ST_CID" "$ST_CSTARTED" "$ST_WPID" >"$tmp" &&
    mv -f "$tmp" "$STATE_FILE" ||
    die "Cannot write the launcher state in: $STATE_DIR"
}

clear_state() { rm -f "$STATE_FILE"; }

# An earlier "started by the launcher" no longer holds. The rest stays recorded.
drop_started_flag() {
  [ -f "$STATE_FILE" ] || return 0
  ST_STARTED=0
  save_state
}

# Ask the same engine that start used. DOCKER_HOST would override the context.
pin_context() {
  [ -n "$ST_CONTEXT" ] || return 0
  export DOCKER_CONTEXT="$ST_CONTEXT"
  if [ "$ST_ENGINE" != none ]; then unset DOCKER_HOST; fi
}

# --- One start / stop at a time ---------------------------------------------------

HAVE_LOCK=0

process_command() { LC_ALL=C ps -ww -p "$1" -o command= 2>/dev/null; }

acquire_lock() {
  local holder command announced=0 failures=0
  mkdir -p "$STATE_DIR" || die "Cannot create the folder: $STATE_DIR"
  # shlock also removes a lock whose owner no longer exists.
  until shlock -f "$LOCK_FILE" -p $$ >/dev/null 2>&1; do
    holder=$(tr -cd '0-9' 2>/dev/null <"$LOCK_FILE")
    command=
    if [ -n "$holder" ]; then command=$(process_command "$holder"); fi
    case $command in
      '')
        failures=$((failures + 1))
        [ "$failures" -lt 15 ] || die "Cannot lock the launcher. Delete this file and try again: $LOCK_FILE" ;;
      *launcher.sh*)
        failures=0
        if [ "$announced" = 0 ]; then
          say "Waiting for another MyInnoX1 start or stop to finish..."
          announced=1
        fi ;;
      *) rm -f "$LOCK_FILE" ;; # the process number was reused by another program
    esac
    sleep 1
  done
  HAVE_LOCK=1
}

release_lock() {
  if [ "$HAVE_LOCK" = 1 ]; then rm -f "$LOCK_FILE"; HAVE_LOCK=0; fi
}

# --- Docker -------------------------------------------------------------------------

require_docker() {
  command -v docker >/dev/null 2>&1 && return 0
  die "The 'docker' command was not found.
Install Docker Desktop (4.37 or newer), or Rancher Desktop with the dockerd (moby)
container engine. Open it once to finish its setup, then try again."
}

engine_running() {
  local version
  # Some older clients exit 0 without a server, so require a server version too.
  version=$(docker info --format '{{.ServerVersion}}' 2>/dev/null </dev/null) && [ -n "$version" ]
}

current_context() {
  local name
  name=$(docker context show 2>/dev/null </dev/null) || return 0
  if valid_name "$name"; then printf '%s' "$name"; fi
}

compose() {
  docker compose -f "$REPO/docker-compose.yml" -f "$REPO/launcher/compose.launcher.yml" "$@" </dev/null
}

container_id() {
  local ids
  ids=$(compose ps -a -q "$SERVICE" 2>/dev/null) || return 1
  ids=${ids%%$'\n'*}
  valid_name "$ids" || return 1
  printf '%s' "$ids"
}

# Prints "<status> <exit code> <time of the last start>".
container_status() {
  docker inspect -f '{{.State.Status}} {{.State.ExitCode}} {{.State.StartedAt}}' "$1" 2>/dev/null </dev/null
}

# Is this the recorded container, not recreated or restarted by someone else?
is_recorded_run() { # containerId status-line
  [ -n "$ST_CSTARTED" ] && [ "$1" = "$ST_CID" ] && [ "${2##* }" = "$ST_CSTARTED" ]
}

app_container_running() {
  local id status
  id=$(container_id) || return 1
  status=$(container_status "$id") || return 1
  [ "${status%% *}" = running ]
}

recorded_run_is_running() {
  local id status
  id=$(container_id) || return 1
  status=$(container_status "$id") || return 1
  [ "${status%% *}" = running ] && is_recorded_run "$id" "$status"
}

show_logs() {
  warn ""
  warn "--- Last lines of 'docker compose logs' ---"
  compose logs --tail 30 >&2 2>&1 || warn "(no logs available)"
  warn "-------------------------------------------"
}

# --- Engine selection and start -------------------------------------------------------

engine_for_context() {
  case $1 in
    desktop-linux) printf 'docker-desktop' ;;
    rancher-desktop) printf 'rancher-desktop' ;;
    *) printf 'none' ;;
  esac
}

# Only used to notice a second engine. Whether Docker Desktop can be started is
# learned from 'docker desktop start' itself.
DOCKER_APP=${MYINNOX1_DOCKER_APP:-/Applications/Docker.app}

# Sets CHOSEN to docker-desktop or rancher-desktop, or explains and exits.
choose_engine() { # context
  local manual="Start your container engine yourself, then run Start again."
  case $1 in
    desktop-linux) CHOSEN=docker-desktop ;;
    rancher-desktop)
      command -v rdctl >/dev/null 2>&1 || die "Rancher Desktop's 'rdctl' command was not found. $manual"
      CHOSEN=rancher-desktop ;;
    default)
      local found= count=0
      if [ -d "$DOCKER_APP" ]; then found=docker-desktop; count=$((count + 1)); fi
      if command -v rdctl >/dev/null 2>&1; then found=rancher-desktop; count=$((count + 1)); fi
      if command -v orb >/dev/null 2>&1; then found=orbstack; count=$((count + 1)); fi
      if command -v colima >/dev/null 2>&1; then found=colima; count=$((count + 1)); fi
      [ "$count" -le 1 ] || die "Several container engines are installed. $manual"
      case $found in
        # With nothing else installed, Docker Desktop may be in another folder.
        ''|docker-desktop) CHOSEN=docker-desktop ;;
        rancher-desktop) CHOSEN=$found ;;
        *) die "No container engine that the launcher can start was found.
Docker Desktop (4.37 or newer) and Rancher Desktop are supported. $manual" ;;
      esac ;;
    *) die "The launcher cannot start the engine for the Docker context '${1:-unknown}'. $manual" ;;
  esac
}

# 0: the application process exists. 1: it does not. 2: could not tell.
engine_process() { # engine
  local name result
  case $1 in
    docker-desktop) name="Docker Desktop" ;;
    rancher-desktop) name="Rancher Desktop" ;;
    *) return 2 ;;
  esac
  pgrep -x "$name" >/dev/null 2>&1 </dev/null
  result=$?
  case $result in 0|1) return "$result" ;; *) return 2 ;; esac
}

# Does the engine's own tool say that it is open, perhaps still booting?
# Failing or unrecognised status output counts as "not open".
engine_reports_open() { # engine
  local out
  case $1 in
    docker-desktop)
      out=$(docker desktop status 2>/dev/null </dev/null) || return 1
      printf '%s\n' "$out" |
        grep -qiE 'status[^A-Za-z0-9]+(running|starting|paused)([^A-Za-z0-9_]|$)' ;;
    rancher-desktop) rdctl list-settings >/dev/null 2>&1 </dev/null ;;
    *) return 1 ;;
  esac
}

# Sets CHOSEN and STARTED_IT. Records nothing about the new engine: cmd_start
# does that once Start has got far enough.
start_engine() {
  local context process
  if [ -n "${DOCKER_HOST:-}" ]; then
    die "The engine set in DOCKER_HOST does not answer. Start it yourself, then run Start again."
  fi
  # The engine is off. This stays true if starting it fails below.
  drop_started_flag
  context=$(current_context)
  choose_engine "$context"

  # A running application belongs to the user: wait for it, do not claim it.
  STARTED_IT=0
  engine_process "$CHOSEN"
  process=$?
  if [ "$process" = 0 ] || engine_reports_open "$CHOSEN"; then
    say "The container engine is already open. It will be left running when MyInnoX1 stops."
  else
    case $CHOSEN in
      docker-desktop)
        say "Starting Docker Desktop..."
        # --detach returns at once, so the timeout below applies.
        docker desktop start --detach </dev/null || die "Docker Desktop did not start. The likely cause is an older version:
starting it from here needs Docker Desktop 4.37 or newer.
Update it, or open it yourself, then run Start again." ;;
      rancher-desktop)
        say "Starting Rancher Desktop..."
        rdctl start </dev/null || die "Rancher Desktop did not start. Open it yourself, then run Start again." ;;
    esac
    # Claimed only if the application was certainly not there before.
    if [ "$process" = 1 ]; then STARTED_IT=1; fi
  fi

  say "Waiting for the engine (up to $ENGINE_TIMEOUT seconds)..."
  local deadline=$((SECONDS + ENGINE_TIMEOUT))
  until engine_running; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      printf '\n'
      die "The engine was not ready after $ENGINE_TIMEOUT seconds.
Check its window for messages. Rancher Desktop must use the dockerd (moby) engine."
    fi
    printf '.'
    sleep 1
  done
  printf '\n'
}

check_compose_version() {
  local raw version major minor patch rest
  local advice="MyInnoX1 needs Docker Compose 2.24.4 or newer. Update your container engine and try again."
  raw=$(docker compose version --short 2>/dev/null </dev/null) || die "Docker Compose was not found. $advice"
  version=${raw#v}
  version=${version%%[!0-9.]*}
  IFS=. read -r major minor patch rest <<EOF
$version
EOF
  major=$(number_or "${major:-}" x)
  minor=$(number_or "${minor:-}" x)
  patch=$(number_or "${patch:-}" x)
  case "$major$minor$patch" in *x*) die "Unrecognised Docker Compose version '$raw'. $advice" ;; esac
  # 10# keeps numbers with a leading zero decimal.
  if [ $((10#$major * 1000000 + 10#$minor * 1000 + 10#$patch)) -lt 2024004 ]; then
    die "Docker Compose $raw is too old. $advice"
  fi
}

# --- Watcher ------------------------------------------------------------------------------

watcher_alive() { # pid containerId
  local command
  [ -n "$1" ] || return 1
  command=$(process_command "$1") || return 1
  case $command in *"launcher.sh watch $2") return 0 ;; esac
  return 1
}

start_watcher() {
  nohup /bin/bash "$SCRIPT_PATH" watch "$ST_CID" </dev/null >>"$LOG_FILE" 2>&1 &
  ST_WPID=$!
  save_state
}

# --- Stop cleanup (Stop shortcut and watcher) -----------------------------------------------

# Docker Desktop can hide Kubernetes containers from 'docker ps', so its settings
# must positively say that Kubernetes is off.
kubernetes_disabled() {
  local folder file key value
  if [ -n "${MYINNOX1_DOCKER_SETTINGS:-}" ]; then
    file=$MYINNOX1_DOCKER_SETTINGS
  else
    folder="${HOME:-}/Library/Group Containers/group.com.docker"
    file="$folder/settings-store.json"
    [ -e "$file" ] || file="$folder/settings.json" # before Docker Desktop 4.35
  fi
  case ${file##*/} in
    settings.json) key=kubernetesEnabled ;;
    *) key=KubernetesEnabled ;;
  esac
  # '-o -' is essential: without it plutil rewrites the file.
  value=$(plutil -extract "$key" raw -o - "$file" 2>/dev/null </dev/null) || return 1
  [ "$value" = false ]
}

# Empty output when the engine may be stopped, otherwise the reason to keep it.
reason_to_keep_engine() { # was_ours
  local others
  [ "$1" = 1 ] || { printf 'the MyInnoX1 that the launcher started was not running'; return; }
  [ "$ST_STARTED" = 1 ] || { printf 'the launcher did not start it'; return; }
  case "$ST_ENGINE:$ST_CONTEXT" in
    docker-desktop:desktop-linux|rancher-desktop:rancher-desktop|rancher-desktop:default) ;;
    *) printf 'it is not an engine the launcher can safely stop'; return ;;
  esac
  others=$(docker ps -q 2>/dev/null </dev/null) || { printf 'could not check for other containers'; return; }
  [ -z "$others" ] || { printf 'other containers are running'; return; }
  if [ "$ST_ENGINE" = docker-desktop ] && ! kubernetes_disabled; then
    printf "Docker Desktop's settings do not confirm that Kubernetes is disabled"
  fi
}

cleanup() {
  local ids id status was_ours=0 reason stop_status=0
  load_state
  pin_context

  if ! engine_running; then
    clear_state
    say "Nothing to stop: the container engine is not running."
    return 0
  fi

  if ids=$(compose ps -a -q "$SERVICE" 2>/dev/null); then
    for id in $ids; do
      valid_name "$id" || continue
      status=$(container_status "$id") || continue
      is_recorded_run "$id" "$status" || continue
      case $status in
        "running "*|"exited $STOP_CODE "*) was_ours=1 ;;
      esac
    done
  fi

  say "Stopping MyInnoX1..."
  compose down || { warn "ERROR: 'docker compose down' failed. The engine was left running."; return 1; }
  say "MyInnoX1 has stopped."

  reason=$(reason_to_keep_engine "$was_ours")
  if [ -n "$reason" ]; then
    say "The container engine was left running: $reason."
  else
    say "Stopping the container engine, which the launcher started..."
    case $ST_ENGINE in
      docker-desktop) docker desktop stop </dev/null || stop_status=1 ;;
      rancher-desktop) rdctl shutdown </dev/null || stop_status=1 ;;
    esac
    if [ "$stop_status" = 0 ]; then
      say "The container engine has stopped."
    else
      warn "ERROR: the container engine did not stop. Quit it yourself."
    fi
  fi
  clear_state
  return "$stop_status"
}

# --- Commands -----------------------------------------------------------------------------------

cmd_start() {
  local context id deadline body status engine started
  [ -f "$REPO/docker-compose.yml" ] && [ -f "$REPO/launcher/compose.launcher.yml" ] ||
    die "MyInnoX1 files are missing. Keep the launcher inside the MyInnoX1 folder."
  require_docker
  cd -- "$REPO" || die "Cannot open the folder: $REPO"
  acquire_lock
  load_state

  # The new engine, context and flag stay in variables until the app is up, so
  # that a failed Start never points the watcher or Stop at another engine.
  if engine_running; then
    context=$(current_context)
    if [ -z "${DOCKER_HOST:-}" ] && [ -n "$context" ] && [ "$context" = "$ST_CONTEXT" ] &&
      recorded_run_is_running; then
      engine=$ST_ENGINE started=$ST_STARTED
    else
      drop_started_flag
      engine=$(engine_for_context "$context") started=0
      if [ -n "${DOCKER_HOST:-}" ]; then engine=none; fi
    fi
  else
    start_engine
    # Starting an engine can switch the current context.
    context=$(current_context)
    engine=$CHOSEN started=$STARTED_IT
  fi
  if [ -z "${DOCKER_HOST:-}" ] && [ -n "$context" ]; then export DOCKER_CONTEXT="$context"; fi

  # Never start without the launcher's compose file: it limits the port to this computer.
  check_compose_version

  if ! app_container_running; then
    # Any answer counts; curl exits 6 or 7 when nothing is listening.
    curl -q -s -o /dev/null --noproxy '*' --max-time 3 "$APP_URL/" </dev/null
    case $? in
      6|7) ;;
      *) die "Port 8787 is in use by another program. Close that program, then run Start again." ;;
    esac
  fi

  say "Starting MyInnoX1. The first run builds the app and can take several minutes."
  if ! compose up -d --build; then
    show_logs
    die "MyInnoX1 could not be started (see the messages above). If they mention port 8787,
another program is using it."
  fi

  if ! id=$(container_id); then
    show_logs
    die "The MyInnoX1 container was not found after starting it."
  fi
  if [ "$id" != "$ST_CID" ]; then ST_CSTARTED=; fi
  ST_ENGINE=$engine ST_CONTEXT=$context ST_STARTED=$started ST_CID=$id
  save_state

  say "Waiting for the app..."
  deadline=$((SECONDS + APP_TIMEOUT))
  while :; do
    if body=$(curl -q -s -f --noproxy '*' --max-time 3 "$APP_URL/_local/status" </dev/null); then
      case $body in *'"myinnox1"'*) break ;; esac
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      show_logs
      die "MyInnoX1 did not answer after $APP_TIMEOUT seconds."
    fi
    sleep 1
  done

  # Identifies this run of the container. Unreadable means Stop keeps the engine.
  ST_CSTARTED=
  if status=$(container_status "$ST_CID") && valid_timestamp "${status##* }"; then
    ST_CSTARTED=${status##* }
  fi
  save_state
  watcher_alive "$ST_WPID" "$ST_CID" || start_watcher
  release_lock

  if [ "${MYINNOX1_NO_BROWSER:-}" = 1 ]; then
    say "MyInnoX1 is running at $APP_URL"
  else
    say "MyInnoX1 is running. Opening $APP_URL"
    open "$APP_URL" || warn "Could not open the browser. Open $APP_URL yourself."
  fi
  say "You can close this window."
}

cmd_stop() {
  require_docker
  cd -- "$REPO" || die "Cannot open the folder: $REPO"
  acquire_lock
  cleanup
}

cmd_watch() { # containerId
  local id=$1 code status
  valid_name "$id" || die "watch needs a container ID."
  trap '' HUP
  require_docker
  cd -- "$REPO" || die "Cannot open the folder: $REPO"
  load_state
  if [ "$ST_CID" = "$id" ]; then pin_context; fi

  while :; do
    log "Watching container $id."
    if ! code=$(docker wait "$id" </dev/null); then
      log "'docker wait' failed. Leaving everything as it is."
      return 1
    fi
    if [ "$code" != "$STOP_CODE" ]; then
      log "The container exited with '$code', not a stop request. Leaving the engine as it is."
      return 0
    fi

    log "Stop requested from the app."
    acquire_lock
    load_state
    if [ "$ST_CID" != "$id" ]; then
      log "The launcher state no longer refers to this container. Nothing to do."
      return 0
    fi
    pin_context
    status=$(container_status "$id") || status=
    # A Start that ran meanwhile may have brought the same container back.
    if [ "${status%% *}" = running ]; then
      release_lock
      sleep 1
      continue
    fi
    cleanup
    return
  done
}

trap release_lock EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

case "${1:-}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  watch) cmd_watch "${2:-}" ;;
  *) warn "Usage: launcher.sh start | stop | watch <containerId>"; exit 2 ;;
esac
