#!/bin/bash
# Tests for the macOS launcher. Run: /bin/bash launcher/tests/macos/run.sh [name filter]
#
# No real container engine is ever reached: every launcher run gets a clean
# environment whose PATH is a directory of fake tools plus /usr/bin:/bin.

set -u
unset CDPATH
HERE=$(cd -- "$(dirname "$0")" && pwd -P) || exit 99
SRC=$(cd -- "$HERE/../.." && pwd -P) || exit 99   # the launcher/ folder
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/myinnox1-tests.XXXXXX") || exit 99
ROOT=$(cd -- "$ROOT" && pwd -P) || exit 99
FILTER=${1:-}

# A copy of the repository in an awkward path: spaces, non-ASCII, quotes, shell syntax.
REPO="$ROOT/Repo with  spaces ñandú 日本 it's \"q\" \$(x) [1]/webapp public"
mkdir -p "$REPO/launcher" || exit 99
cp -R "$SRC/macos" "$REPO/launcher/macos" || exit 99
cp "$SRC/compose.launcher.yml" "$REPO/launcher/" || exit 99
cp "$SRC/../docker-compose.yml" "$REPO/" || exit 99
LAUNCHER="$REPO/launcher/macos/launcher.sh"
# A second copy whose folder name has no Latin letter or digit.
REPO_NL="$ROOT/other/программа 日本語 Ελλάδα"
mkdir -p "$ROOT/other" && cp -R "$REPO" "$REPO_NL" || exit 99

# --- Safety ------------------------------------------------------------------------

# Engine tools must resolve inside the test folder, or not at all.
assert_safe() { # PATH-value
  local tool found
  for tool in docker rdctl orb colima curl open pgrep; do
    found=$(PATH="$1" command -v "$tool" 2>/dev/null)
    case $tool:$found in
      curl:|open:|pgrep:) echo "ABORT: no fake '$tool' on the test PATH" >&2; exit 99 ;;
      *:) ;;
      *:"$ROOT"/*) ;;
      *) echo "ABORT: '$tool' resolves to a real program: $found" >&2; exit 99 ;;
    esac
  done
}

mkdir -p "$ROOT/base-shims"
cp "$HERE/shims/"* "$ROOT/base-shims/" && chmod +x "$ROOT/base-shims/"* || exit 99
PATH="$ROOT/base-shims:/usr/bin:/bin"
export PATH
unset DOCKER_HOST DOCKER_CONTEXT
case $(command -v docker) in "$ROOT/base-shims/docker") ;; *) echo "ABORT: docker is not the fake" >&2; exit 99 ;; esac
case $(command -v rdctl) in "$ROOT/base-shims/rdctl") ;; *) echo "ABORT: rdctl is not the fake" >&2; exit 99 ;; esac
assert_safe "$PATH"

# --- Harness -----------------------------------------------------------------------

PASSED=0 FAILED=0 NTEST=0 T= F= SHIM= STATE= OUT= RC=0 FAILS_HERE=0 NAME=
BG_PIDS=

setup() {
  NTEST=$((NTEST + 1))
  T="$ROOT/t$NTEST"
  F="$T/fake dir" SHIM="$T/shim" STATE="$T/state dir é" OUT="$T/out"
  mkdir -p "$F/container" "$SHIM" "$T/home"
  cp "$ROOT/base-shims/"* "$SHIM/"
  echo desktop-linux >"$F/context"
  echo 2.30.0 >"$F/compose_version"
  echo 0 >"$F/serial"
  echo "t${NTEST}x$$" >"$F/id_prefix"
  : >"$F/desktop_plugin"
  mkdir "$T/Docker.app" # stands for an installed Docker Desktop
  SETTINGS="$T/settings-store.json"
  echo '{"KubernetesEnabled": false}' >"$SETTINGS"
  : >"$F/calls"
  EXTRA=
  NOBROWSER=1
  LAUNCHER="$REPO/launcher/macos/launcher.sh"
}

no_desktop() { rm -f "$F/desktop_plugin"; rmdir "$T/Docker.app"; }
use_rancher() { no_desktop; echo "${1:-rancher-desktop}" >"$F/context"; }
use_desktop() { rm -f "$SHIM/rdctl"; echo desktop-linux >"$F/context"; }
engine_on() { : >"$F/engine_up"; }
flag() { : >"$F/$1"; }

test_env() { # [VAR=value...] command...
  local tpath="$SHIM:/usr/bin:/bin"
  assert_safe "$tpath"
  env -i PATH="$tpath" HOME="$T/home" TMPDIR="${TMPDIR:-/tmp}" LANG=en_US.UTF-8 \
    FAKE_DIR="$F" MYINNOX1_STATE_DIR="$STATE" MYINNOX1_EXTRA_PATH= \
    MYINNOX1_DOCKER_APP="$T/Docker.app" MYINNOX1_DOCKER_SETTINGS="$SETTINGS" \
    MYINNOX1_NO_BROWSER="$NOBROWSER" MYINNOX1_ENGINE_TIMEOUT=3 MYINNOX1_APP_TIMEOUT=3 "$@"
}

# Runs a command with a hard time limit, output to $OUT, status to $RC.
limited() {
  local pid n=0
  "$@" >"$OUT" 2>&1 </dev/null &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    n=$((n + 1))
    if [ "$n" -gt 300 ]; then kill -9 "$pid"; fail "timed out: $*"; break; fi
    sleep 0.1
  done
  wait "$pid" 2>/dev/null
  RC=$?
  # assert_safe aborts the whole run, not only the background command.
  if [ "$RC" = 99 ]; then cat "$OUT"; exit 99; fi
}

# $EXTRA holds additional VAR=value words without spaces.
launch() { limited test_env ${EXTRA} /bin/bash "$LAUNCHER" "$@"; }

fail() {
  FAILS_HERE=$((FAILS_HERE + 1))
  echo "    FAIL: $*"
}
rc_is() { [ "$RC" = "$1" ] || fail "exit status $RC, expected $1"; }
rc_fails() { [ "$RC" != 0 ] || fail "expected a failure, got exit status 0"; }
out_has() { grep -qF -- "$1" "$OUT" || fail "output lacks: $1"; }
out_lacks() { ! grep -qF -- "$1" "$OUT" || fail "output has: $1"; }
log_has() { grep -qF -- "$1" "$STATE/watcher.log" 2>/dev/null || fail "watcher log lacks: $1"; }
called() { grep -qE -- "$1" "$F/calls" || fail "expected a call matching: $1"; }
not_called() { ! grep -qE -- "$1" "$F/calls" || fail "unexpected call: $(grep -E -- "$1" "$F/calls" | head -1)"; }
count_calls() { grep -cE -- "$1" "$F/calls"; }
ENGINE_START='(^rdctl :: start|:: desktop start)'
ENGINE_STOP='(^rdctl :: shutdown|:: desktop stop)'
COMPOSE_UP=' up -d --build$'
COMPOSE_DOWN=':: compose .* down$'
engine_stopped() { called "$ENGINE_STOP"; [ ! -f "$F/engine_up" ] || fail "engine still up"; }
engine_kept() { not_called "$ENGINE_STOP"; }
state_get() { sed -n "s/^$1=//p" "$STATE/state" 2>/dev/null; }
state_is() { local v; v=$(state_get "$1"); [ "$v" = "$2" ] || fail "state $1='$v', expected '$2'"; }
no_state() { [ ! -e "$STATE/state" ] || fail "state file still exists"; }
RUN1=2026-01-01T00:00:00.000000001Z # start time of a container made by put_container
put_state() { # engine context started cid [wpid]
  mkdir -p "$STATE"
  printf 'engine=%s\ncontext=%s\nengine_started=%s\ncontainer_id=%s\ncontainer_started_at=%s\nwatcher_pid=%s\n' \
    "$1" "$2" "$3" "$4" "$RUN1" "${5:-}" >"$STATE/state"
}
put_container() { # status exit [id]
  echo "$1" >"$F/container/status"; echo "$2" >"$F/container/exit"; echo "${3:-cidA}" >"$F/container/id"
  echo "$RUN1" >"$F/container/started"
}
wait_until() { # command...
  local n=0
  until "$@"; do
    n=$((n + 1)); [ "$n" -le 100 ] || return 1
    sleep 0.1
  done
}
dead() { ! kill -0 "$1" 2>/dev/null; }
waiting_on() { grep -q ":: wait $1\$" "$F/calls"; }
# Detached watchers only (their command substitutions share the command line).
watchers() { LC_ALL=C ps -ax -ww -o ppid=,command= | awk '$1 == 1' | grep -c "launcher\.sh watch $(cat "$F/id_prefix")"; }
cid() { cat "$F/container/id"; }
# Waits for the watcher to be inside 'docker wait', then sets WPID.
watcher_ready() {
  WPID=$(state_get watcher_pid)
  [ -n "$WPID" ] || { fail "no watcher pid recorded"; return 1; }
  wait_until waiting_on "$(cid)" || fail "watcher never called docker wait"
  kill -0 "$WPID" 2>/dev/null || fail "watcher is not running"
}
app_exits() { echo "$1" >"$F/container/exit"; echo exited >"$F/container/status"; }
watcher_finishes() { wait_until dead "$WPID" || fail "watcher did not exit"; }

teardown() {
  : >"$F/abort"
  local pid
  for pid in $(cat "$F/waiters" 2>/dev/null) $(state_get watcher_pid) $BG_PIDS; do
    case $pid in ''|0*|*[!0-9]*) continue ;; esac
    if ! wait_until dead "$pid"; then kill "$pid" 2>/dev/null; fail "process $pid was left running"; fi
  done
  BG_PIDS=
}

t() { # function description
  case "$1 $2" in *"$FILTER"*) ;; *) return ;; esac
  NAME=$2 FAILS_HERE=0
  setup
  "$1"
  teardown
  if [ "$FAILS_HERE" = 0 ]; then
    PASSED=$((PASSED + 1)); echo "ok   $2"
  else
    FAILED=$((FAILED + 1)); echo "FAIL $2"
    echo "    --- last output ---"; sed 's/^/    /' "$OUT" 2>/dev/null
    echo "    --- calls ---"; sed 's/^/    /' "$F/calls"
    [ -f "$STATE/watcher.log" ] && { echo "    --- watcher.log ---"; sed 's/^/    /' "$STATE/watcher.log"; }
  fi
}

cleanup_all() {
  local d
  for d in "$ROOT"/t*/"fake dir"; do [ -d "$d" ] && : >"$d/abort"; done
  sleep 0.5
  case $ROOT in */myinnox1-tests.*) rm -rf "$ROOT" ;; esac
}
trap cleanup_all EXIT
trap 'exit 130' INT TERM

# --- Manual matrix of the spec (what shims can show) -----------------------------------

full_cycle() { # engine context
  launch start; rc_is 0
  called "$ENGINE_START"; called "$COMPOSE_UP"
  state_is engine "$1"; state_is context "$2"; state_is engine_started 1; state_is container_id "$(cid)"
  out_has "http://localhost:8787"
  watcher_ready || return
  app_exits 42; watcher_finishes
  called "$COMPOSE_DOWN"; engine_stopped; no_state
  log_has "Stop requested"; log_has "The container engine has stopped."
}
m_off_desktop() { use_desktop; full_cycle docker-desktop desktop-linux; called ':: desktop stop'; not_called '^rdctl'; }
m_off_rancher() { use_rancher; full_cycle rancher-desktop rancher-desktop; called '^rdctl :: shutdown'; not_called ':: desktop (start|stop)'; }

already_on() {
  engine_on
  launch start; rc_is 0
  not_called "$ENGINE_START"; state_is engine_started 0
  watcher_ready || return
  app_exits 42; watcher_finishes
  called "$COMPOSE_DOWN"; engine_kept; no_state; log_has "the launcher did not start it"
}
m_on_desktop() { use_desktop; already_on; }
m_on_rancher() { use_rancher; already_on; }

other_container() {
  echo otherid >"$F/others"
  launch start; rc_is 0
  watcher_ready || return
  app_exits 42; watcher_finishes
  called "$COMPOSE_DOWN"; engine_kept; log_has "other containers are running"
}
m_other_desktop() { use_desktop; other_container; }
m_other_rancher() { use_rancher; other_container; }

m_twice() {
  use_desktop; NOBROWSER=
  launch start; rc_is 0; watcher_ready || return
  local first=$WPID
  launch start; rc_is 0
  state_is watcher_pid "$first"; state_is engine_started 1
  [ "$(watchers)" = 1 ] || fail "$(watchers) watchers running"
  [ "$(count_calls '^open :: http://localhost:8787$')" = 2 ] || fail "browser not opened both times"
  [ "$(count_calls "$ENGINE_START")" = 1 ] || fail "engine started twice"
}

m_twice_concurrent() {
  use_desktop; NOBROWSER=; echo 2 >"$F/up_delay"
  OUT="$T/out1"
  test_env /bin/bash "$LAUNCHER" start >"$T/out1" 2>&1 </dev/null & local a=$!
  wait_until grep -q BUILD "$T/out1" || fail "first start did not reach the build"
  test_env /bin/bash "$LAUNCHER" start >"$T/out2" 2>&1 </dev/null & local b=$!
  wait "$a" || fail "first start failed"
  wait "$b" || fail "second start failed"
  OUT="$T/out2"; out_has "Waiting for another MyInnoX1"
  state_is engine_started 1
  [ "$(watchers)" = 1 ] || fail "$(watchers) watchers running"
  [ "$(count_calls '^open ::')" = 2 ] || fail "browser not opened"
  [ "$(count_calls "$ENGINE_START")" = 1 ] || fail "engine started twice"
  [ ! -e "$STATE/lock" ] || fail "lock left behind"
}

m_watcher_closed() {
  use_desktop
  launch start; rc_is 0; watcher_ready || return
  kill -9 "$WPID"; wait_until dead "$WPID"
  app_exits 42; sleep 0.5
  not_called "$COMPOSE_DOWN"; engine_kept
  # The Stop shortcut covers this case.
  launch stop; rc_is 0; called "$COMPOSE_DOWN"; engine_stopped; no_state
}

m_dead_watcher_replaced() {
  use_desktop
  launch start; watcher_ready || return
  local old=$WPID; kill -9 "$old"; wait_until dead "$old"
  launch start; rc_is 0; watcher_ready || return
  [ "$WPID" != "$old" ] || fail "no new watcher"
  state_is engine_started 1
}

m_stop_engine_off() {
  put_state docker-desktop desktop-linux 1 cidA
  launch stop; rc_is 0; out_has "Nothing to stop"
  not_called "$ENGINE_START"; engine_kept; not_called ':: compose'; no_state
}
m_stop_engine_off_nostate() { use_rancher; launch stop; rc_is 0; not_called "$ENGINE_START"; engine_kept; }
m_stop_engine_off_oldcli() { flag old_info; launch stop; rc_is 0; out_has "Nothing to stop"; not_called ':: compose'; not_called "$ENGINE_START"; }

m_reboot() {
  # restart "no" is what keeps the app down; the launcher must always apply that file.
  grep -q 'restart: "no"' "$REPO/launcher/compose.launcher.yml" || fail "override lacks restart no"
  engine_on; put_state docker-desktop desktop-linux 1 cidA 999999; put_container exited 137
  launch stop; rc_is 0; engine_kept; called "$COMPOSE_DOWN"
  put_state docker-desktop desktop-linux 1 cidA 999999; put_container exited 255
  launch start; rc_is 0; state_is engine_started 0
}

m_port_taken() {
  engine_on; echo 0 >"$F/port_taken"
  launch start; rc_fails; out_has "Port 8787 is in use"; not_called "$COMPOSE_UP"; engine_kept; not_called '^open'
}
m_port_taken_nonhttp() {
  engine_on; echo 52 >"$F/port_taken"
  launch start; rc_fails; out_has "Port 8787 is in use"; not_called "$COMPOSE_UP"
}
m_port_curl_flags() {
  engine_on; launch start; rc_is 0
  called '^curl :: -q .*--noproxy'
}

m_awkward_path() {
  use_desktop
  launch start; rc_is 0; watcher_ready || return
  grep -qF -- ":: compose -f $REPO/docker-compose.yml -f $REPO/launcher/compose.launcher.yml up -d --build" "$F/calls" ||
    fail "compose was not called with the exact file paths"
  ! grep -E ':: compose ' "$F/calls" | grep -v ':: compose version' | grep -qvF -- "-f $REPO/launcher/compose.launcher.yml" ||
    fail "a compose call omitted the launcher file"
}

m_slow_build() {
  use_desktop; echo 5 >"$F/up_delay" # longer than the app timeout of 3 s
  launch start; rc_is 0; out_has "BUILD PROGRESS step 5"; out_has "can take several minutes"
}

# --- Start failures --------------------------------------------------------------------------

f_up_fails() {
  engine_on; flag fail_up
  launch start; rc_fails; out_has "could not be started"; out_has "FAKE CONTAINER LOG LINE"; out_has "port is already allocated"
  not_called '^open'; engine_kept; [ ! -e "$F/waiters" ] || fail "watcher started"; [ ! -e "$STATE/lock" ] || fail "lock left"
}
f_status_never() {
  engine_on; flag status_never; NOBROWSER=
  launch start; rc_fails; out_has "did not answer"; out_has "FAKE CONTAINER LOG LINE"; not_called '^open'
  state_is container_id "$(cid)"; engine_kept
}
f_no_docker() { rm -f "$SHIM/docker"; launch start; rc_fails; out_has "'docker' command was not found"; out_has "Rancher Desktop"; not_called "$ENGINE_START"; }
f_no_docker_stop() { rm -f "$SHIM/docker"; put_state rancher-desktop rancher-desktop 1 cidA; launch stop; rc_fails; engine_kept; }
f_engine_timeout() {
  use_rancher; flag engine_never_ready
  launch start; rc_fails; out_has "not ready after 3 seconds"; not_called "$COMPOSE_UP"
  no_state; engine_kept
}
f_engine_old_info() { use_rancher; flag engine_never_ready; flag old_info; launch start; rc_fails; out_has "not ready"; not_called "$COMPOSE_UP"; }
f_engine_start_fails() {
  use_rancher; flag fail_engine_start
  launch start; rc_fails; out_has "did not start"; not_called "$COMPOSE_UP"; no_state
}
# A leftover engine_started=1 must not survive a failed start: the user then opens
# the engine, and Stop must leave it running.
failed_start_over_old_state() { # engine context
  put_state "$1" "$2" 1 cidA; put_container exited 42; flag fail_engine_start
  launch start; rc_fails; state_is engine_started 0; not_called "$COMPOSE_UP"
  engine_on
  launch stop; rc_is 0; engine_kept; out_has "the launcher did not start it"
}
f_old_state_desktop() { failed_start_over_old_state docker-desktop desktop-linux; }
f_old_state_rancher() { use_rancher; failed_start_over_old_state rancher-desktop rancher-desktop; }
f_old_state_refused() {
  put_state docker-desktop desktop-linux 1 cidA; echo my-remote >"$F/context"
  launch start; rc_fails; state_is engine_started 0
}
f_desktop_start_fails() {
  flag fail_engine_start
  launch start; rc_fails; called ':: desktop start'
  out_has "Docker Desktop 4.37 or newer"; out_has "or open it yourself, then run Start again"
  not_called "$COMPOSE_UP"; no_state
}
f_failed_then_retry() {
  use_desktop; flag fail_up
  launch start; rc_fails; no_state
  rm "$F/fail_up"; launch start; rc_is 0; state_is engine_started 0
}

# --- Old Compose: never start without the restriction ----------------------------------------

compose_refused() { # version
  engine_on; echo "$1" >"$F/compose_version"
  launch start; rc_fails; out_has "2.24.4 or newer"; not_called ' up( |$)'; not_called '^open'
}
v_2_24_3() { compose_refused 2.24.3; }
v_2_23_9() { compose_refused 2.23.9; }
v_1() { compose_refused 1.29.2; }
v_v2_9() { compose_refused v2.9.0; }
v_short() { compose_refused 2.24; }
v_garbage() { compose_refused "dev"; }
v_empty() { compose_refused ""; }
v_missing() { engine_on; flag compose_missing; launch start; rc_fails; out_has "2.24.4 or newer"; not_called ' up( |$)'; }
v_after_engine_start() {
  use_desktop; echo 2.20.0 >"$F/compose_version"
  launch start; rc_fails; not_called ' up( |$)'; engine_kept
}
compose_accepted() { engine_on; echo "$1" >"$F/compose_version"; launch start; rc_is 0; called "$COMPOSE_UP"; }
va_min() { compose_accepted 2.24.4; }
va_v() { compose_accepted v2.24.4; }
va_suffix() { compose_accepted 2.30.3-desktop.1; }
va_minor() { compose_accepted 2.100.0; }
va_5() { compose_accepted 5.0.0; }
va_zero() { compose_accepted 2.25.08; }

# --- Engine selection ---------------------------------------------------------------------------

e_ctx_desktop_both() { launch start; rc_is 0; called ':: desktop start'; not_called '^rdctl'; state_is engine docker-desktop; }
e_ctx_rancher_both() { echo rancher-desktop >"$F/context"; launch start; rc_is 0; called '^rdctl :: start'; not_called ':: desktop start'; state_is engine rancher-desktop; }
e_default_rancher_only() {
  use_rancher default; full_cycle rancher-desktop default; called '^rdctl :: shutdown'
}
e_default_rancher_switches() {
  use_rancher default; echo rancher-desktop >"$F/context_after_start"
  full_cycle rancher-desktop rancher-desktop
}
e_default_desktop_switches() {
  rm "$SHIM/rdctl"; echo default >"$F/context"; echo desktop-linux >"$F/context_after_start"
  full_cycle docker-desktop desktop-linux
}
e_default_desktop_stays() {
  rm "$SHIM/rdctl"; echo default >"$F/context"
  launch start; rc_is 0; called ':: desktop start'; watcher_ready || return
  app_exits 42; watcher_finishes; called "$COMPOSE_DOWN"; engine_kept
}
refused_selection() { # message
  launch start; rc_fails; out_has "$1"; not_called "$ENGINE_START"; not_called '^(orb|colima) :: start'; not_called "$COMPOSE_UP"; no_state
}
e_default_several() { echo default >"$F/context"; refused_selection "Several container engines"; }
e_default_rancher_and_colima() { use_rancher default; other_cli colima; refused_selection "Several container engines"; }
# No other engine and no app in the usual folder: try Docker Desktop anyway.
e_default_desktop_elsewhere() {
  rm "$SHIM/rdctl"; rmdir "$T/Docker.app"; echo default >"$F/context"; echo desktop-linux >"$F/context_after_start"
  full_cycle docker-desktop desktop-linux
}
desktop_start_refused() {
  launch start; rc_fails; called ':: desktop start'; out_has "Docker Desktop 4.37 or newer"
  out_has "or open it yourself, then run Start again"; not_called "$COMPOSE_UP"; no_state
}
e_default_none() { rm "$SHIM/rdctl"; no_desktop; echo default >"$F/context"; desktop_start_refused; }
other_cli() { printf '#!/bin/bash\necho "%s :: $*" >>"$FAKE_DIR/calls"\n' "$1" >"$SHIM/$1"; chmod +x "$SHIM/$1"; }
e_default_orb_only() { rm "$SHIM/rdctl"; no_desktop; echo default >"$F/context"; other_cli orb; refused_selection "Start your container engine yourself"; not_called '^orb'; }
e_ctx_orbstack() { echo orbstack >"$F/context"; other_cli orb; refused_selection "'orbstack'"; not_called '^orb'; }
e_ctx_colima() { echo colima >"$F/context"; other_cli colima; refused_selection "'colima'"; not_called '^colima'; }
e_ctx_custom() { echo my-remote >"$F/context"; refused_selection "'my-remote'"; }
e_desktop_too_old() { rm "$F/desktop_plugin"; desktop_start_refused; }
e_no_precheck() { launch start; rc_is 0; not_called ':: desktop version'; }
e_rancher_no_rdctl() { echo rancher-desktop >"$F/context"; rm "$SHIM/rdctl"; refused_selection "'rdctl' command was not found"; }
e_docker_host_down() { EXTRA="DOCKER_HOST=tcp://example:1"; refused_selection "DOCKER_HOST"; }
e_docker_host_up() {
  engine_on; EXTRA="DOCKER_HOST=unix:///x"
  launch start; rc_is 0; state_is engine none; state_is engine_started 0
}
e_unknown_running() { engine_on; echo orbstack >"$F/context"; launch start; rc_is 0; state_is engine none; state_is engine_started 0; }

# --- An engine application that is already open is not ours -------------------------------------

open_engine() { # expected-engine
  echo 2 >"$F/boots_in"
  launch start; rc_is 0; not_called "$ENGINE_START"; out_has "already open"
  state_is engine "$1"; state_is engine_started 0; called "$COMPOSE_UP"
  watcher_ready || return
  app_exits 42; watcher_finishes; called "$COMPOSE_DOWN"; engine_kept
}
desktop_open() { # status output
  printf '%b\n' "$1" >"$F/desktop_status"; open_engine docker-desktop
}
o_running() { desktop_open 'Name                Value\nStatus              running\nSessionID           abc'; }
o_starting() { desktop_open 'Status              starting'; }
o_paused() { desktop_open 'Status: paused'; }
o_json() { desktop_open '{"Status": "Running"}'; }
o_rancher() { use_rancher; flag rdctl_open; open_engine rancher-desktop; }
o_never_ready() {
  echo 'Status running' >"$F/desktop_status"
  launch start; rc_fails; out_has "not ready"; not_called "$ENGINE_START"; no_state
}
desktop_not_open() { # status output
  printf '%b\n' "$1" >"$F/desktop_status"
  launch start; rc_is 0; called ':: desktop start'; state_is engine_started 1
}
n_stopped() { desktop_not_open 'Status              stopped'; }
n_not_running() { desktop_not_open 'Status: not running'; }
n_unknown() { desktop_not_open 'Docker Desktop is doing something'; }
n_other_field() { desktop_not_open 'Status stopped\nEngine running'; }
n_longer_word() { desktop_not_open 'Status runningless'; }
n_failing() { flag fail_desktop_status; desktop_not_open 'Status running'; }
n_rancher() { use_rancher; launch start; rc_is 0; called '^rdctl :: list-settings'; called '^rdctl :: start'; state_is engine_started 1; }

# --- Compose project name ---------------------------------------------------------------------------

all_projects() { # expected value on every compose call
  [ -s "$F/projects" ] || fail "no compose calls"
  ! grep -qvxF -- "$1" "$F/projects" || fail "a compose call had project name: $(grep -vxF -- "$1" "$F/projects" | head -1)"
}
p_non_latin_cycle() {
  use_desktop; LAUNCHER="$REPO_NL/launcher/macos/launcher.sh"
  launch start; rc_is 0; watcher_ready || return
  app_exits 42; watcher_finishes; called "$COMPOSE_DOWN"; engine_stopped; all_projects myinnox1
}
p_non_latin_stop() {
  LAUNCHER="$REPO_NL/launcher/macos/launcher.sh"; ready_to_stop
  launch stop; rc_is 0; engine_stopped; all_projects myinnox1
}
p_non_latin_watch() {
  LAUNCHER="$REPO_NL/launcher/macos/launcher.sh"; ready_to_stop; put_container exited 42
  launch watch cidA; rc_is 0; called "$COMPOSE_DOWN"; all_projects myinnox1
}
p_non_latin_user_value() {
  LAUNCHER="$REPO_NL/launcher/macos/launcher.sh"; engine_on; EXTRA="COMPOSE_PROJECT_NAME=mine"
  launch start; rc_is 0; all_projects mine
}
p_latin_untouched() { engine_on; launch start; rc_is 0; all_projects unset; }

# --- Start: the engine_started flag ----------------------------------------------------------------

g_keep_when_running() {
  engine_on; put_state docker-desktop desktop-linux 1 cidA; put_container running 0
  launch start; rc_is 0; state_is engine_started 1; state_is engine docker-desktop
}
g_drop_when_stopped() {
  engine_on; put_state docker-desktop desktop-linux 1 cidA; put_container exited 42
  launch start; rc_is 0; state_is engine_started 0
}
g_drop_when_context_changed() {
  engine_on; echo rancher-desktop >"$F/context"; put_state docker-desktop desktop-linux 1 cidA; put_container running 0
  launch start; rc_is 0; state_is engine_started 0; state_is context rancher-desktop
}
g_drop_when_other_container() {
  engine_on; put_state docker-desktop desktop-linux 1 cidOLD; put_container running 0 cidA
  launch start; rc_is 0; state_is engine_started 0; state_is container_id cidA
}
g_drop_when_no_recorded_id() {
  engine_on; put_state docker-desktop desktop-linux 1 ""; put_container running 0
  launch start; rc_is 0; state_is engine_started 0
}
g_drop_when_check_fails() {
  engine_on; put_state docker-desktop desktop-linux 1 cidA; put_container running 0; flag fail_inspect
  launch start; state_is engine_started 0
}
g_running_skips_port_check() {
  engine_on; put_container running 0; echo 0 >"$F/port_taken"
  launch start; rc_is 0; called "$COMPOSE_UP"
}
g_recreated_container() {
  use_desktop
  launch start; watcher_ready || return
  local old=$WPID oldcid; oldcid=$(cid)
  flag recreate
  launch start; rc_is 0; [ "$(cid)" != "$oldcid" ] || fail "container not recreated"
  watcher_ready || return
  [ "$WPID" != "$old" ] || fail "no watcher for the new container"
  # The old watcher sees its container go away and does nothing.
  wait_until dead "$old" || fail "old watcher still running"
  not_called "$COMPOSE_DOWN"; engine_kept; state_is engine_started 1
}

# --- Stop safety (each condition) --------------------------------------------------------------------

NOT_OURS="the MyInnoX1 that the launcher started was not running"
# A state in which every condition for stopping the engine holds.
ready_to_stop() { engine_on; put_state docker-desktop desktop-linux 1 cidA; put_container running 0; }
stop_keeps() { # reason
  launch stop; rc_is 0; called "$COMPOSE_DOWN"; engine_kept; out_has "left running: $1"; no_state
}
s_all_true_running() { ready_to_stop; launch stop; rc_is 0; engine_stopped; no_state; }
s_all_true_42() { ready_to_stop; put_container exited 42; launch stop; rc_is 0; engine_stopped; }
s_exit0() { ready_to_stop; put_container exited 0; stop_keeps "$NOT_OURS"; }
s_exit143() { ready_to_stop; put_container exited 143; stop_keeps "$NOT_OURS"; }
s_paused() { ready_to_stop; put_container paused 0; stop_keeps "$NOT_OURS"; }
s_created() { ready_to_stop; put_container created 0; stop_keeps "$NOT_OURS"; }
s_no_container() { ready_to_stop; rm "$F/container/status"; stop_keeps "$NOT_OURS"; }
s_compose_ps_fails() { ready_to_stop; flag fail_compose_ps; stop_keeps "$NOT_OURS"; }
s_inspect_fails() { ready_to_stop; flag fail_inspect; stop_keeps "$NOT_OURS"; }
s_not_started() { ready_to_stop; put_state docker-desktop desktop-linux 0 cidA; stop_keeps "the launcher did not start it"; }
s_flag_garbage() { ready_to_stop; put_state docker-desktop desktop-linux yes cidA; stop_keeps "the launcher did not start it"; }
s_others() { ready_to_stop; echo zzz >"$F/others"; stop_keeps "other containers are running"; }
s_ps_fails() { ready_to_stop; flag fail_ps_q; stop_keeps "could not check for other containers"; }
unsafe_engine() { ready_to_stop; put_state "$1" "$2" 1 cidA; stop_keeps "it is not an engine"; }
s_engine_none() { unsafe_engine none desktop-linux; }
s_engine_unknown() { unsafe_engine orbstack orbstack; }
s_desktop_default() { unsafe_engine docker-desktop default; }
s_desktop_rancher_ctx() { unsafe_engine docker-desktop rancher-desktop; }
s_rancher_desktop_ctx() { unsafe_engine rancher-desktop desktop-linux; }
s_rancher_custom_ctx() { unsafe_engine rancher-desktop remote; }
s_empty_ctx() { unsafe_engine docker-desktop ""; }
s_rancher_default_ok() { ready_to_stop; put_state rancher-desktop default 1 cidA; launch stop; rc_is 0; called '^rdctl :: shutdown'; }
s_no_state() { engine_on; put_container running 0; stop_keeps "$NOT_OURS"; }
s_down_fails() {
  ready_to_stop; flag fail_down
  launch stop; rc_fails; engine_kept; out_has "engine was left running"; state_is engine_started 1
}
s_engine_stop_fails() { ready_to_stop; flag fail_engine_stop; launch stop; rc_fails; out_has "did not stop"; no_state; }
s_context_pinned() {
  ready_to_stop; echo rancher-desktop >"$F/context"
  EXTRA="DOCKER_CONTEXT=other DOCKER_HOST=tcp://elsewhere:1"
  launch stop; rc_is 0; engine_stopped
  ! grep '^docker ' "$F/calls" | grep -qv '^docker ctx=desktop-linux host=- ' ||
    fail "a docker call was not pinned to the recorded context"
}
s_order() {
  ready_to_stop; launch stop
  local down ps stop
  down=$(grep -nE "$COMPOSE_DOWN" "$F/calls" | cut -d: -f1)
  ps=$(grep -nE ':: ps -q$' "$F/calls" | cut -d: -f1)
  stop=$(grep -nE "$ENGINE_STOP" "$F/calls" | cut -d: -f1)
  [ "$down" -lt "$ps" ] && [ "$ps" -lt "$stop" ] || fail "expected down, ps -q, engine stop in that order"
}
s_shortcut_while_watched() {
  use_desktop; launch start; watcher_ready || return
  launch stop; rc_is 0; engine_stopped; watcher_finishes
  [ "$(count_calls "$ENGINE_STOP")" = 1 ] || fail "engine stopped more than once"
  [ "$(count_calls "$COMPOSE_DOWN")" = 1 ] || fail "watcher also ran cleanup"
}

# --- A: only the recorded run of the recorded container is ours -------------------------

restarted() { echo 2026-03-03T03:03:03.3Z >"$F/container/started"; }
a_id_differs() { ready_to_stop; put_container running 0 cidB; stop_keeps "$NOT_OURS"; }
a_id_differs_42() { ready_to_stop; put_container exited 42 cidB; stop_keeps "$NOT_OURS"; }
a_restarted() { ready_to_stop; restarted; stop_keeps "$NOT_OURS"; }
a_restarted_42() { ready_to_stop; put_container exited 42; restarted; stop_keeps "$NOT_OURS"; }
set_recorded_time() { grep -v '^container_started_at=' "$STATE/state" >"$T/s"; printf '%s\n' "$1" >>"$T/s"; cp "$T/s" "$STATE/state"; }
a_no_time() { ready_to_stop; set_recorded_time ""; stop_keeps "$NOT_OURS"; }
a_empty_time() { ready_to_stop; set_recorded_time "container_started_at="; : >"$F/container/started"; stop_keeps "$NOT_OURS"; }
a_bad_time() { ready_to_stop; set_recorded_time 'container_started_at=yesterday'; echo yesterday >"$F/container/started"; stop_keeps "$NOT_OURS"; }
a_recorded_by_start() {
  use_desktop; launch start; rc_is 0
  state_is container_started_at "$(cat "$F/container/started")"
  watcher_ready
}
a_not_recorded_without_app() { use_desktop; flag status_never; launch start; rc_fails; state_is container_started_at ""; launch stop; engine_kept; }
user_changes() { # recreate|restart
  use_desktop; launch start; rc_is 0; watcher_ready || return
  local old=$WPID
  kill "$old" 2>/dev/null; wait_until dead "$old"
  restarted
  [ "$1" = recreate ] && echo "$(cid)new" >"$F/container/id"
  launch stop; rc_is 0; called "$COMPOSE_DOWN"; engine_kept; out_has "$NOT_OURS"
}
a_user_restart() { user_changes restart; }
a_user_recreate() { user_changes recreate; }
a_start_after_restart() {
  ready_to_stop; restarted
  launch start; rc_is 0; state_is engine_started 0
  launch stop; engine_kept
}

# --- B: Docker Desktop and Kubernetes ---------------------------------------------------------

K8S="do not confirm that Kubernetes is disabled"
k8s_keeps() { printf '%s\n' "$1" >"$SETTINGS"; ready_to_stop; stop_keeps "Docker Desktop's settings $K8S"; }
b_false() { ready_to_stop; printf '{\n  "AutoStart": false,\n  "x": null,\n  "KubernetesEnabled": false\n}\n' >"$SETTINGS"
  cp "$SETTINGS" "$T/before"; launch stop; rc_is 0; engine_stopped; cmp -s "$SETTINGS" "$T/before" || fail "settings file was modified"; }
b_true() { k8s_keeps '{"KubernetesEnabled": true}'; }
b_absent() { k8s_keeps '{"AutoStart": false}'; }
b_nested() { k8s_keeps '{"x": {"KubernetesEnabled": false}}'; }
b_camel() { k8s_keeps '{"kubernetesEnabled": false}'; }
b_number() { k8s_keeps '{"KubernetesEnabled": 0}'; }
b_invalid() { k8s_keeps 'not json {"KubernetesEnabled": false'; }
b_empty() { k8s_keeps ''; }
b_missing() { rm "$SETTINGS"; ready_to_stop; stop_keeps "Docker Desktop's settings $K8S"; }
b_unreadable() { chmod 000 "$SETTINGS"; ready_to_stop; stop_keeps "Docker Desktop's settings $K8S"; chmod 600 "$SETTINGS"; }
b_rancher() { rm "$SETTINGS"; ready_to_stop; put_state rancher-desktop rancher-desktop 1 cidA; launch stop; rc_is 0; called '^rdctl :: shutdown'; }
b_watcher() { use_desktop; echo '{"KubernetesEnabled": true}' >"$SETTINGS"; launch start; watcher_ready || return
  app_exits 42; watcher_finishes; called "$COMPOSE_DOWN"; engine_kept; log_has "$K8S"; }
# The real locations, inside the temporary HOME.
default_settings() { # expect(stop|keep) store-content-or-- legacy-content-or--
  local d="$T/home/Library/Group Containers/group.com.docker"
  mkdir -p "$d"; SETTINGS=
  [ "$2" = - ] || echo "$2" >"$d/settings-store.json"
  [ "$3" = - ] || echo "$3" >"$d/settings.json"
  ready_to_stop; launch stop; rc_is 0
  if [ "$1" = stop ]; then engine_stopped; else engine_kept; fi
}
b_default_store() { default_settings stop '{"KubernetesEnabled": false}' -; }
b_default_legacy() { default_settings stop - '{"kubernetesEnabled": false}'; }
b_default_legacy_true() { default_settings keep - '{"kubernetesEnabled": true}'; }
b_default_precedence() { default_settings keep '{"KubernetesEnabled": true}' '{"kubernetesEnabled": false}'; }
b_default_absent_no_fallback() { default_settings keep '{}' '{"kubernetesEnabled": false}'; }
b_default_none() { default_settings keep - -; }

# --- C and D: claiming the engine ------------------------------------------------------------

c_process_docker() {
  flag proc_docker; echo 'Status stopped' >"$F/desktop_status"; open_engine docker-desktop
  called '^pgrep :: -x Docker Desktop$'
}
c_process_rancher() { use_rancher; flag proc_rancher; open_engine rancher-desktop; called '^pgrep :: -x Rancher Desktop$'; }
unsure() { # engine
  flag pgrep_error
  launch start; rc_is 0; called "$ENGINE_START"; state_is engine "$1"; state_is engine_started 0
  watcher_ready || return
  app_exits 42; watcher_finishes; engine_kept
}
c_error_docker() { unsure docker-desktop; }
c_error_rancher() { use_rancher; unsure rancher-desktop; }
c_error_but_open() { flag pgrep_error; echo 'Status running' >"$F/desktop_status"; open_engine docker-desktop; }
c_absent_claimed() { launch start; rc_is 0; called '^pgrep :: -x Docker Desktop$'; state_is engine_started 1; }
d_detach() { launch start; rc_is 0; called ':: desktop start --detach$'; }
d_detach_timeout() {
  flag engine_never_ready
  launch start; rc_fails; called ':: desktop start --detach$'; out_has "not ready after 3 seconds"; no_state
}

# --- E: a failed Start keeps the old record ---------------------------------------------------

old_record_kept() { # expected-flag
  state_is engine docker-desktop; state_is context desktop-linux; state_is engine_started "$1"
  state_is container_id cidA; state_is container_started_at "$RUN1"
}
switched() { ready_to_stop; echo rancher-desktop >"$F/context"; }
e_compose() { switched; echo 2.20.0 >"$F/compose_version"; launch start; rc_fails; old_record_kept 0; }
e_port() { switched; put_container exited 42; echo 0 >"$F/port_taken"; launch start; rc_fails; out_has "in use"; old_record_kept 0; }
e_up() { switched; put_container exited 42; flag fail_up; launch start; rc_fails; old_record_kept 0; }
e_engine_off() {
  switched; rm "$F/engine_up"; echo 2.20.0 >"$F/compose_version"
  launch start; rc_fails; called '^rdctl :: start'; old_record_kept 0
}
e_then_watch() {
  switched; put_container exited 42; echo 2.20.0 >"$F/compose_version"; launch start; rc_fails
  echo 2.30.0 >"$F/compose_version"; : >"$F/calls"
  launch watch cidA; rc_is 0; called '^docker ctx=desktop-linux .* down$'; engine_kept; not_called 'ctx=rancher-desktop'
}
e_matching_keeps_flag() {
  ready_to_stop; flag fail_up; launch start; rc_fails; old_record_kept 1
}
e_restarted_dropped_before_failure() {
  ready_to_stop; restarted; echo 2.20.0 >"$F/compose_version"; launch start; rc_fails; old_record_kept 0
}

# --- Watcher ---------------------------------------------------------------------------------------------

watch_code() { # exit code of the container
  ready_to_stop; put_container exited "$1"
  launch watch cidA; rc_is 0; not_called "$COMPOSE_DOWN"; engine_kept; out_has "exited with '$1'"; state_is engine_started 1
}
w_0() { watch_code 0; }
w_1() { watch_code 1; }
w_2() { watch_code 2; }
w_137() { watch_code 137; }
w_143() { watch_code 143; }
w_420() { watch_code 420; }
w_42() { ready_to_stop; put_container exited 42; launch watch cidA; rc_is 0; called "$COMPOSE_DOWN"; engine_stopped; no_state; called '^docker ctx=desktop-linux .*:: wait cidA'; }
w_wait_fails() { ready_to_stop; flag fail_wait; launch watch cidA; rc_fails; not_called "$COMPOSE_DOWN"; engine_kept; state_is engine_started 1; }
w_engine_quits() {
  use_desktop; launch start; watcher_ready || return
  rm "$F/engine_up"; watcher_finishes
  not_called "$COMPOSE_DOWN"; engine_kept; log_has "'docker wait' failed"
}
w_manual_stop() {
  use_desktop; launch start; watcher_ready || return
  app_exits 143; watcher_finishes; not_called "$COMPOSE_DOWN"; engine_kept
}
w_stale_state() {
  ready_to_stop; put_state docker-desktop desktop-linux 1 cidNEW; put_container exited 42
  launch watch cidA; rc_is 0; not_called "$COMPOSE_DOWN"; engine_kept; state_is container_id cidNEW
}
w_no_state() { engine_on; put_container exited 42; launch watch cidA; rc_is 0; not_called "$COMPOSE_DOWN"; engine_kept; }
w_bad_id() { launch watch '--help'; rc_fails; not_called ':: wait'; }
w_no_id() { launch watch; rc_fails; not_called ':: wait'; }
w_restarted_before_cleanup() {
  use_desktop; launch start; watcher_ready || return
  # Hold the lock like a running start, press Stop, then bring the container back.
  printf '#!/bin/bash\ntrap "kill \\$!" EXIT; trap exit TERM\nsleep 30 & wait\n' >"$T/launcher.sh"
  /bin/bash "$T/launcher.sh" >/dev/null 2>&1 </dev/null & local holder=$!
  BG_PIDS=$holder
  echo "$holder" >"$STATE/lock"
  app_exits 42; sleep 1.5
  not_called "$COMPOSE_DOWN"
  echo running >"$F/container/status"
  kill "$holder"; wait "$holder" 2>/dev/null; BG_PIDS=
  wait_until grep_count_2 || fail "watcher did not go back to waiting"
  not_called "$COMPOSE_DOWN"; engine_kept; kill -0 "$WPID" || fail "watcher exited"
  app_exits 42; watcher_finishes; called "$COMPOSE_DOWN"; engine_stopped
}
grep_count_2() { [ "$(count_calls ':: wait ')" -ge 2 ]; }
w_survives_hangup() {
  use_desktop; launch start; watcher_ready || return
  [ "$(ps -o ppid= -p "$WPID" | tr -d ' ')" = 1 ] || fail "watcher still has a parent"
  kill -HUP "$WPID"; sleep 0.5; kill -0 "$WPID" 2>/dev/null || fail "watcher died on hangup"
  app_exits 42; watcher_finishes; engine_stopped
}

# --- State, lock, environment ------------------------------------------------------------------------------

evil_state() {
  mkdir -p "$STATE"
  cat >"$STATE/state" <<EVIL
engine=\$(touch "$T/pwned1")
context=desktop-linux; touch "$T/pwned2"
engine_started=\`touch "$T/pwned3"\`
container_id=\$(touch "$T/pwned4")
container_started_at=\$(touch "$T/pwned8")
watcher_pid=\$(touch "$T/pwned5")
touch "$T/pwned6"
PATH=$T/nowhere
STATE_DIR=$T/nowhere
x[\$(touch "$T/pwned7")]=1
EVIL
}
no_pwned() { [ -z "$(ls "$T"/pwned* 2>/dev/null)" ] || fail "state file content was executed"; }
x_evil_stop() { engine_on; put_container running 0; evil_state; launch stop; rc_is 0; no_pwned; engine_kept; }
x_evil_start() { engine_on; put_container running 0; evil_state; launch start; rc_is 0; no_pwned; state_is engine_started 0; }
x_evil_watch() { engine_on; put_container exited 42; evil_state; launch watch cidA; no_pwned; engine_kept; not_called "$COMPOSE_DOWN"; }
x_option_values() {
  ready_to_stop; printf 'engine=docker-desktop\ncontext=--host=evil\nengine_started=1\ncontainer_id=-x\nwatcher_pid=-1' >"$STATE/state"
  launch stop; rc_is 0; engine_kept; not_called '--host=evil|ctx=--'
}
x_other_pid() {
  engine_on; sleep 30 & BG_PIDS=$!; put_container running 0; put_state none desktop-linux 0 cidA "$BG_PIDS"
  launch start; rc_is 0; kill -0 "$BG_PIDS" 2>/dev/null || fail "unrelated process was killed"
  [ "$(state_get watcher_pid)" != "$BG_PIDS" ] || fail "unrelated process taken for the watcher"
  kill "$BG_PIDS"; wait "$BG_PIDS" 2>/dev/null; BG_PIDS=
}
x_lock_dead() { engine_on; mkdir -p "$STATE"; echo 999999 >"$STATE/lock"; launch start; rc_is 0; [ ! -e "$STATE/lock" ] || fail "lock left"; }
x_lock_reused_pid() {
  engine_on; mkdir -p "$STATE"; sleep 30 & BG_PIDS=$!; echo "$BG_PIDS" >"$STATE/lock"
  launch stop; rc_is 0; kill -0 "$BG_PIDS" 2>/dev/null || fail "unrelated process was killed"
  kill "$BG_PIDS"; wait "$BG_PIDS" 2>/dev/null; BG_PIDS=
}
x_lock_unwritable() { mkdir -p "$T/plain"; : >"$T/plain/file"; STATE="$T/plain/file/state"; launch stop; rc_fails; out_has "Cannot create"; }
x_default_state_dir() {
  engine_on; limited test_env /usr/bin/env -u MYINNOX1_STATE_DIR /bin/bash "$LAUNCHER" start
  rc_is 0; STATE="$T/home/Library/Application Support/MyInnoX1"; [ -f "$STATE/state" ] || fail "no state in the default folder"
}
x_extra_path() {
  engine_on; mkdir "$T/extra"; mv "$SHIM/docker" "$T/extra/"
  limited test_env MYINNOX1_EXTRA_PATH="$T/extra" /bin/bash "$LAUNCHER" start; rc_is 0; called "$COMPOSE_UP"
}
x_usage() { launch; rc_fails; out_has "Usage"; launch bogus; rc_fails; }
x_browser() { engine_on; NOBROWSER=; launch start; rc_is 0; called '^open :: http://localhost:8787$'; not_called '^open :: .*127\.0\.0\.1'; }
x_no_browser() { engine_on; launch start; rc_is 0; not_called '^open'; out_has "http://localhost:8787"; }
x_no_external_urls() {
  ! grep -rhoE 'https?://[A-Za-z0-9._-]+' "$SRC/macos" | grep -vE '//localhost$' | grep -q . || fail "external URL in the scripts"
}

# --- The double-clickable files -------------------------------------------------------------------------------

d_executable() {
  local f
  for f in "Start MyInnoX1.command" "Stop MyInnoX1.command" launcher.sh; do
    [ -x "$SRC/macos/$f" ] || fail "not executable: $f"
  done
}
in_dir() { cd "$1" && shift && "$@"; }
d_start_stop() {
  use_desktop
  limited in_dir / test_env "$REPO/launcher/macos/Start MyInnoX1.command"; rc_is 0; out_lacks "Press Return"
  watcher_ready || return
  limited in_dir / test_env "$REPO/launcher/macos/Stop MyInnoX1.command"; rc_is 0; out_lacks "Press Return"; engine_stopped
}
d_relative() {
  engine_on
  limited in_dir "$REPO/launcher/macos" test_env /bin/bash "Start MyInnoX1.command"; rc_is 0
  watcher_ready
}
d_symlink() {
  engine_on; mkdir -p "$T/Desktop é" "$T/second"
  ln -s "$REPO/launcher/macos/Start MyInnoX1.command" "$T/second/link"
  ln -s "../second/link" "$T/Desktop é/My Start.command"
  limited in_dir / test_env "$T/Desktop é/My Start.command"; rc_is 0; called "$COMPOSE_UP"
}
d_start_failure_waits() {
  rm "$SHIM/docker"
  limited test_env "$REPO/launcher/macos/Start MyInnoX1.command"; rc_fails; out_has "Press Return"
}
d_stop_failure_waits() {
  ready_to_stop; flag fail_down
  limited test_env "$REPO/launcher/macos/Stop MyInnoX1.command"; rc_fails; out_has "Press Return"
}
d_moved_file() {
  cp "$REPO/launcher/macos/Start MyInnoX1.command" "$T/"
  limited test_env "$T/Start MyInnoX1.command"; rc_fails; out_has "Press Return"
}

t m_off_desktop "matrix: engine off, start, stop from button (Docker Desktop)"
t m_off_rancher "matrix: engine off, start, stop from button (Rancher Desktop)"
t m_on_desktop "matrix: engine already on stays on (Docker Desktop)"
t m_on_rancher "matrix: engine already on stays on (Rancher Desktop)"
t m_other_desktop "matrix: another container running, engine stays on (Docker Desktop)"
t m_other_rancher "matrix: another container running, engine stays on (Rancher Desktop)"
t m_twice "matrix: start twice, one watcher, browser opens"
t m_twice_concurrent "matrix: start twice at the same time, one watcher"
t m_watcher_closed "matrix: watcher gone, button leaves engine on, Stop shortcut covers it"
t m_dead_watcher_replaced "start replaces a dead watcher"
t m_stop_engine_off "matrix: Stop shortcut with engine off starts nothing"
t m_stop_engine_off_nostate "stop with engine off and no state"
t m_stop_engine_off_oldcli "stop: 'docker info' exiting 0 without a server counts as off"
t m_reboot "matrix: after a reboot (restart disabled; leftovers never stop the engine)"
t m_port_taken "matrix: port 8787 taken, clear error, no up"
t m_port_taken_nonhttp "port taken by a non-HTTP program"
t m_port_curl_flags "HTTP checks ignore curlrc and proxies"
t m_awkward_path "matrix: path with spaces and non-ASCII; both compose files always"
t m_slow_build "matrix: slow first build shows progress, no false timeout"

t f_up_fails "failure: compose up fails, logs shown"
t f_status_never "failure: app never answers"
t f_no_docker "failure: docker missing"
t f_no_docker_stop "failure: docker missing at stop"
t f_engine_timeout "failure: engine never ready"
t f_engine_old_info "failure: old client 'docker info' is not treated as ready"
t f_engine_start_fails "failure: engine start command fails"
t f_desktop_start_fails "failure: 'docker desktop start' fails, version hint shown"
t f_old_state_desktop "failure: failed start clears an old started flag (Docker Desktop)"
t f_old_state_rancher "failure: failed start clears an old started flag (Rancher Desktop)"
t f_old_state_refused "failure: refused engine clears an old started flag"
t f_failed_then_retry "failed start then retry records the engine as not started by us"

t v_2_24_3 "compose 2.24.3 refused"
t v_2_23_9 "compose 2.23.9 refused"
t v_1 "compose 1.29.2 refused"
t v_v2_9 "compose v2.9.0 refused"
t v_short "compose 2.24 refused"
t v_garbage "compose unparseable version refused"
t v_empty "compose empty version refused"
t v_missing "compose missing refused"
t v_after_engine_start "old compose after starting the engine: no up"
t va_min "compose 2.24.4 accepted"
t va_v "compose v2.24.4 accepted"
t va_suffix "compose 2.30.3-desktop.1 accepted"
t va_minor "compose 2.100.0 accepted"
t va_5 "compose 5.0.0 accepted"
t va_zero "compose version with a leading zero accepted"

t e_ctx_desktop_both "engine: context desktop-linux"
t e_ctx_rancher_both "engine: context rancher-desktop"
t e_default_rancher_only "engine: default context, only Rancher, full cycle"
t e_default_rancher_switches "engine: Rancher switches the context when starting"
t e_default_desktop_switches "engine: Docker Desktop switches the context when starting"
t e_default_desktop_stays "engine: Docker Desktop on 'default' is never stopped"
t e_default_several "engine: default context, several engines"
t e_default_rancher_and_colima "engine: default context, Rancher and Colima"
t e_default_none "engine: default context, none installed"
t e_default_desktop_elsewhere "engine: default context, no other engine, Docker Desktop tried"
t e_default_orb_only "engine: default context, only OrbStack"
t e_ctx_orbstack "engine: context orbstack"
t e_ctx_colima "engine: context colima"
t e_ctx_custom "engine: custom context"
t e_desktop_too_old "engine: Docker Desktop without 'docker desktop'"
t e_no_precheck "engine: no 'docker desktop version' precheck"
t e_rancher_no_rdctl "engine: rancher context without rdctl"
t e_docker_host_down "engine: DOCKER_HOST unreachable starts nothing"
t e_docker_host_up "engine: DOCKER_HOST reachable is recorded as none"
t e_unknown_running "engine: unknown running engine is recorded as none"

t o_running "open engine: Docker Desktop running is not claimed"
t o_starting "open engine: Docker Desktop starting is not claimed"
t o_paused "open engine: Docker Desktop paused is not claimed"
t o_json "open engine: JSON status output"
t o_rancher "open engine: Rancher Desktop open is not claimed"
t o_never_ready "open engine: never ready, still not claimed"
t n_stopped "closed engine: status stopped"
t n_not_running "closed engine: status 'not running'"
t n_unknown "closed engine: unrecognised status"
t n_other_field "closed engine: 'running' in another field"
t n_longer_word "closed engine: longer word"
t n_failing "closed engine: status command fails"
t n_rancher "closed engine: rdctl list-settings fails"

t p_non_latin_cycle "project name: non-Latin folder, start and watcher cleanup"
t p_non_latin_stop "project name: non-Latin folder, stop"
t p_non_latin_watch "project name: non-Latin folder, watch"
t p_non_latin_user_value "project name: the user's value is kept"
t p_latin_untouched "project name: Latin folder is left to Compose"

t g_keep_when_running "flag kept while our container runs"
t g_drop_when_stopped "flag dropped when our container is not running"
t g_drop_when_context_changed "flag dropped when the context changed"
t g_drop_when_other_container "flag dropped when another container ID is running"
t g_drop_when_no_recorded_id "flag dropped when no container ID is recorded"
t g_drop_when_check_fails "flag dropped when the container cannot be checked"
t g_running_skips_port_check "port check skipped for our running container"
t g_recreated_container "recreated container gets a new watcher"

t s_all_true_running "stop: all conditions true (running)"
t s_all_true_42 "stop: all conditions true (exited 42)"
t s_exit0 "stop: exited 0 keeps engine"
t s_exit143 "stop: exited 143 keeps engine"
t s_paused "stop: paused keeps engine"
t s_created "stop: created keeps engine"
t s_no_container "stop: no container keeps engine"
t s_compose_ps_fails "stop: compose ps fails keeps engine"
t s_inspect_fails "stop: inspect fails keeps engine"
t s_not_started "stop: engine not started by launcher"
t s_flag_garbage "stop: unreadable flag counts as 0"
t s_others "stop: other containers"
t s_ps_fails "stop: docker ps fails"
t s_engine_none "stop: engine none"
t s_engine_unknown "stop: unknown engine"
t s_desktop_default "stop: Docker Desktop with default context"
t s_desktop_rancher_ctx "stop: Docker Desktop with rancher context"
t s_rancher_desktop_ctx "stop: Rancher with desktop-linux context"
t s_rancher_custom_ctx "stop: Rancher with custom context"
t s_empty_ctx "stop: no recorded context"
t s_rancher_default_ok "stop: Rancher with default context is allowed"
t s_no_state "stop: no state"
t s_down_fails "stop: compose down fails"
t s_engine_stop_fails "stop: engine stop fails"
t s_context_pinned "stop: recorded context pinned, DOCKER_HOST ignored"
t s_order "stop: down, then check containers, then stop engine"
t s_shortcut_while_watched "stop shortcut while the watcher is alive"

t a_id_differs "A: another container ID is not ours (running)"
t a_id_differs_42 "A: another container ID is not ours (exited 42)"
t a_restarted "A: restarted container is not ours (running)"
t a_restarted_42 "A: restarted container is not ours (exited 42)"
t a_no_time "A: no recorded start time"
t a_empty_time "A: empty start times do not match"
t a_bad_time "A: invalid recorded start time"
t a_recorded_by_start "A: start records the start time"
t a_not_recorded_without_app "A: no start time unless the app came up"
t a_user_restart "A: user restarts the container, then Stop"
t a_user_recreate "A: user recreates the container, then Stop"
t a_start_after_restart "A: Start after a user restart drops the flag"

t b_false "B: Kubernetes false allows the stop, file untouched"
t b_true "B: Kubernetes enabled"
t b_absent "B: key absent"
t b_nested "B: key only nested"
t b_camel "B: wrong key spelling in settings-store.json"
t b_number "B: value is not a boolean false"
t b_invalid "B: invalid JSON"
t b_empty "B: empty file"
t b_missing "B: file missing"
t b_unreadable "B: file unreadable"
t b_rancher "B: Rancher needs no Docker settings"
t b_watcher "B: watcher leaves Docker Desktop with Kubernetes running"
t b_default_store "B: default path, settings-store.json"
t b_default_legacy "B: default path, old settings.json"
t b_default_legacy_true "B: default path, old settings.json enabled"
t b_default_precedence "B: settings-store.json wins over settings.json"
t b_default_absent_no_fallback "B: no fallback when the new file lacks the key"
t b_default_none "B: default path, no files"

t c_process_docker "C: Docker Desktop process present, not claimed"
t c_process_rancher "C: Rancher Desktop process present, not claimed"
t c_error_docker "C: process check fails, Docker Desktop not claimed"
t c_error_rancher "C: process check fails, Rancher Desktop not claimed"
t c_error_but_open "C: process check fails and status says open"
t c_absent_claimed "C: process absent and status closed, claimed"
t d_detach "D: Docker Desktop is started detached"
t d_detach_timeout "D: engine timeout applies after a detached start"

t e_compose "E: old Compose after a context switch keeps the record"
t e_port "E: port in use after a context switch keeps the record"
t e_up "E: failed up after a context switch keeps the record"
t e_engine_off "E: failure after starting another engine keeps the record"
t e_then_watch "E: watcher still targets the recorded engine"
t e_matching_keeps_flag "E: failed Start over our running app keeps the flag"
t e_restarted_dropped_before_failure "E: dropped flag persisted before a failure"

t w_0 "watcher: exit 0"
t w_1 "watcher: exit 1"
t w_2 "watcher: exit 2"
t w_137 "watcher: exit 137"
t w_143 "watcher: exit 143"
t w_420 "watcher: exit 420"
t w_42 "watcher: exit 42 runs cleanup"
t w_wait_fails "watcher: docker wait fails"
t w_engine_quits "watcher: engine quits"
t w_manual_stop "watcher: manual docker stop"
t w_stale_state "watcher: 42 for a container no longer recorded"
t w_no_state "watcher: 42 with no state"
t w_bad_id "watcher: option-like id rejected"
t w_no_id "watcher: missing id rejected"
t w_restarted_before_cleanup "watcher: container restarted while waiting for the lock"
t w_survives_hangup "watcher: detached and survives hangup"

t x_evil_stop "state: malicious file not executed (stop)"
t x_evil_start "state: malicious file not executed (start)"
t x_evil_watch "state: malicious file not executed (watch)"
t x_option_values "state: option-like values rejected"
t x_other_pid "state: unrelated PID is not the watcher"
t x_lock_dead "lock: dead owner"
t x_lock_reused_pid "lock: PID reused by another program"
t x_lock_unwritable "lock: state folder cannot be created"
t x_default_state_dir "env: default state folder"
t x_extra_path "env: MYINNOX1_EXTRA_PATH is searched"
t x_usage "usage"
t x_browser "browser opens localhost"
t x_no_browser "MYINNOX1_NO_BROWSER prints the URL"
t x_no_external_urls "no external URLs in the scripts"

t d_executable "files: executable bits"
t d_start_stop "files: double-click start and stop from another folder"
t d_relative "files: run by relative name"
t d_symlink "files: through a chain of symlinks"
t d_start_failure_waits "files: start failure keeps the window open"
t d_stop_failure_waits "files: stop failure keeps the window open"
t d_moved_file "files: wrapper copied away fails visibly"

echo
echo "$PASSED passed, $FAILED failed"
[ "$FAILED" = 0 ] && [ "$PASSED" -gt 0 ]
