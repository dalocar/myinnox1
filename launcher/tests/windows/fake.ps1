# Fake docker, rdctl and curl for run.ps1. Usage: fake.ps1 <tool> <arguments...>
# The pretend machine is a folder of small files named by $env:FAKE_WORLD.
# Nothing here talks to a real container engine. Keep this file ASCII only.

$ErrorActionPreference = 'Stop'
$world = $env:FAKE_WORLD
if (-not $world) { [Console]::Error.WriteLine('FAKE_WORLD is not set'); exit 99 }

$tool = [string] $args[0]
$rest = @()
if ($args.Count -gt 1) { $rest = @($args[1..($args.Count - 1)] | ForEach-Object { [string] $_ }) }

function Get-World([string] $Name, [string] $Default = '') {
    $path = [System.IO.Path]::Combine($world, $Name)
    for ($try = 0; $try -lt 50; $try++) {
        if (-not [System.IO.File]::Exists($path)) { return $Default }
        try { return [System.IO.File]::ReadAllText($path).Trim() } catch { Start-Sleep -Milliseconds 20 }
    }
    return $Default
}
function Set-World([string] $Name, [string] $Value) {
    [System.IO.File]::WriteAllText([System.IO.Path]::Combine($world, $Name), $Value)
}
function Out-Line([string] $Text) { [Console]::Out.WriteLine($Text) }
function Err-Line([string] $Text) { [Console]::Error.WriteLine($Text) }

$hostNote = ''
if ($env:DOCKER_HOST) { $hostNote = " [host=$env:DOCKER_HOST]" }
$entry = "$tool [ctx=$env:DOCKER_CONTEXT] [project=$env:COMPOSE_PROJECT_NAME]$hostNote $($rest -join ' ')"
for ($try = 0; $try -lt 100; $try++) {
    try {
        [System.IO.File]::AppendAllText([System.IO.Path]::Combine($world, 'calls.log'), $entry + "`n")
        break
    } catch { Start-Sleep -Milliseconds 20 }
}

# An engine that was asked to start becomes ready after "boot_polls" calls to "info".
function Start-Boot {
    if ((Get-World 'start_fail') -eq '1') { Err-Line 'fake: cannot start'; exit 1 }
    Set-World 'booting' '1'
    $after = Get-World 'context_after_start'
    if ($after) { Set-World 'context' $after }
}

# Stands in for the process list: exit 0 present, 1 absent, anything else a failed check.
if ($tool -eq 'proc') {
    if ((Get-World 'process_check_fails') -eq '1') { Err-Line 'fake: access denied'; exit 5 }
    if ((Get-World 'process') -eq $rest[0]) { exit 0 }
    exit 1
}

if ($tool -eq 'curl') {
    if ((Get-World 'port_busy') -eq '1') { Out-Line '<html>another program</html>'; exit 0 }
    if ((Get-World 'engine_up') -eq '1' -and (Get-World 'container_status') -eq 'running' -and
        (Get-World 'app_never') -ne '1') {
        Out-Line '{"app": "myinnox1", "launcher": true}'
        exit 0
    }
    Err-Line 'curl: (7) Failed to connect'
    exit 7
}

if ($tool -eq 'rdctl') {
    switch ($rest[0]) {
        'list-settings' { if ((Get-World 'rd_app') -eq 'running') { Out-Line '{}'; exit 0 }; Err-Line 'connection refused'; exit 1 }
        'start' { Err-Line 'About to launch Rancher Desktop...'; Start-Boot; exit 0 }
        'shutdown' {
            if ((Get-World 'stop_fail') -eq '1') { Err-Line 'fake: cannot stop'; exit 1 }
            Set-World 'engine_up' '0'; Out-Line 'Shutting down.'; exit 0
        }
    }
    Err-Line "fake rdctl: unexpected $($rest -join ' ')"
    exit 98
}

if ($tool -ne 'docker') { Err-Line "fake: unknown tool $tool"; exit 98 }

$up = ((Get-World 'engine_up') -eq '1')
$command = $rest[0]

if ($command -eq 'info') {
    if (-not $up -and (Get-World 'booting') -eq '1') {
        $left = [int] (Get-World 'boot_polls' '1')
        if ($left -le 1) { Set-World 'engine_up' '1'; Set-World 'booting' '0'; $up = $true }
        else { Set-World 'boot_polls' ([string] ($left - 1)) }
    }
    if ($up) { Err-Line 'WARNING: bridge-nf-call-iptables is disabled'; Out-Line '29.0.0'; exit 0 }
    Err-Line 'Cannot connect to the Docker daemon. Is the docker daemon running?'
    if ((Get-World 'info_exit_zero') -eq '1') { exit 0 }
    exit 1
}
if ($command -eq 'context') { Err-Line 'WARNING: fake context warning'; Out-Line (Get-World 'context' 'default'); exit 0 }
if ($command -eq 'desktop') {
    if ((Get-World 'desktop_plugin') -ne '1') { Err-Line "docker: 'desktop' is not a docker command."; exit 1 }
    switch ($rest[1]) {
        'status' {
            $status = Get-World 'desktop_app'
            if ($status) { Out-Line 'Name            Value'; Out-Line "Status          $status"; exit 0 }
            Err-Line 'Error: Docker Desktop is not running'
            exit 1
        }
        'start' {
            if ((Get-World 'start_hang') -eq '1') { Start-Sleep -Seconds 30; exit 1 }
            Start-Boot; exit 0
        }
        'stop' {
            if ((Get-World 'stop_fail') -eq '1') { Err-Line 'fake: cannot stop'; exit 1 }
            Set-World 'engine_up' '0'; exit 0
        }
    }
}
if ($command -eq 'compose' -and $rest[1] -eq 'version') {
    $version = Get-World 'compose_version' '2.29.1'
    if ($version -eq 'missing') { Err-Line "docker: 'compose' is not a docker command."; exit 1 }
    Out-Line $version
    exit 0
}

if (-not $up) { Err-Line 'Cannot connect to the Docker daemon.'; exit 1 }

if ($command -eq 'compose') {
    if ($rest[1] -ne '-f' -or $rest[3] -ne '-f') { Err-Line 'fake: compose without both files'; exit 97 }
    foreach ($file in @($rest[2], $rest[4])) {
        if (-not (Test-Path -LiteralPath $file)) { Err-Line "fake: no such file: $file"; exit 96 }
    }
    switch ($rest[5]) {
        'ps' {
            if ((Get-World 'compose_ps_fail') -eq '1') { Err-Line 'fake: ps failed'; exit 1 }
            $id = Get-World 'container_id'
            if ($id) { Out-Line $id }
            exit 0
        }
        'up' {
            Err-Line ' => [internal] load build definition from Dockerfile'
            if ((Get-World 'up_fail') -eq '1') { Err-Line 'fake: build failed'; exit 17 }
            $new = Get-World 'new_id' ('a' * 64)
            if ((Get-World 'container_id') -ne $new -or (Get-World 'container_status') -ne 'running') {
                $runs = 1 + [int] (Get-World 'runs' '0')
                Set-World 'runs' ([string] $runs)
                Set-World 'container_started_at' ('2026-02-01T10:00:{0:D2}.5Z' -f $runs)
            }
            Set-World 'container_id' $new
            Set-World 'container_status' (Get-World 'status_after_up' 'running')
            Set-World 'container_exit' '0'
            exit 0
        }
        'down' {
            if ((Get-World 'down_fail') -eq '1') { Err-Line 'fake: down failed'; exit 1 }
            $id = Get-World 'container_id'
            if ($id -and -not (Get-World "release_$id")) { Set-World "release_$id" '143' }
            Set-World 'container_id' ''
            Set-World 'container_status' ''
            Err-Line ' Container removed'
            exit 0
        }
        'logs' { Out-Line 'FAKE-APP-LOG-LINE'; exit 0 }
    }
}
if ($command -eq 'inspect') {
    $id = $rest[$rest.Count - 1]
    if ($id -ne (Get-World 'container_id')) { Err-Line 'Error: No such object'; exit 1 }
    $startedAt = Get-World 'container_started_at' '2026-01-01T00:00:00.000000001Z'
    Out-Line "$(Get-World 'container_status') $(Get-World 'container_exit' '0') $startedAt"
    exit 0
}
if ($command -eq 'ps') {
    if ((Get-World 'ps_fail') -eq '1') { Err-Line 'fake: ps failed'; exit 1 }
    $other = Get-World 'other_containers'
    if ($other) { Out-Line $other }
    if ((Get-World 'container_status') -eq 'running') { Out-Line (Get-World 'container_id') }
    Err-Line 'WARNING: harmless'
    exit 0
}
if ($command -eq 'wait') {
    $id = $rest[1]
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
        $code = Get-World "release_$id"
        if ($code -eq 'fail') { Err-Line 'error during connect: EOF'; exit 1 }
        if ($code) {
            # For a watcher that waits a second time: each release counts once.
            if ((Get-World 'release_once') -eq '1') { Set-World "release_$id" '' }
            Out-Line $code
            exit 0
        }
        Start-Sleep -Milliseconds 100
    }
    Err-Line 'fake: wait was never released'
    exit 95
}

Err-Line "fake docker: unexpected $($rest -join ' ')"
exit 98
