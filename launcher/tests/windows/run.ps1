# Tests for launcher/windows. No modules needed.
#
#   pwsh -File launcher/tests/windows/run.ps1            (or: powershell -File ...)
#   pwsh -File launcher/tests/windows/run.ps1 -Filter watcher
#
# docker, rdctl and curl are fakes (fake.ps1). The launcher runs in a child process of the same
# PowerShell, with a PATH that holds only the fakes, so no real container engine can be reached.
# Runs on Windows and, for development, on Linux. Keep this file ASCII only.

param([string] $Filter = '')

$ErrorActionPreference = 'Stop'
$OnWindows = ($env:OS -eq 'Windows_NT')
$Source = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($PSScriptRoot, '..', '..', '..'))
$Shell = (Get-Process -Id $PID).Path
$Root = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), 'myinnox1-tests-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
# Spaces, parentheses, ampersand, apostrophe and non-ASCII characters, built without non-ASCII source.
$SpecialName = "My Repo (v2) & O'Brien " + [char] 0x00E9 + [char] 0x00F1 + ' ' + [char] 0x5065
$IdA = 'a' * 64
$IdB = 'b' * 64
$StartedAt = '2026-01-01T00:00:00.000000001Z'

$script:Tests = New-Object System.Collections.ArrayList
$script:SandboxNumber = 0
$script:Sandbox = $null

function Test([string] $Name, [scriptblock] $Body) {
    [void] $script:Tests.Add(@{ Name = $Name; Body = $Body })
}

# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------

function Assert([bool] $Condition, [string] $Message) {
    if (-not $Condition) { throw "assertion failed: $Message" }
}
function Assert-Equal($Expected, $Actual, [string] $Message) {
    if ([string] $Expected -cne [string] $Actual) {
        throw "assertion failed: $Message (expected '$Expected', got '$Actual')"
    }
}
function Assert-Exit($Result, [int] $Code) {
    if ($Result.Code -ne $Code) {
        throw "assertion failed: exit code $($Result.Code), expected $Code. Output:`n$($Result.Output)"
    }
}
function Assert-Failed($Result) {
    Assert ($Result.Code -ne 0) "expected a failure. Output:`n$($Result.Output)"
}
function Assert-Output($Result, [string] $Pattern) {
    Assert ($Result.Output -match $Pattern) "output does not match '$Pattern':`n$($Result.Output)"
}

# ---------------------------------------------------------------------------
# Sandbox
# ---------------------------------------------------------------------------

function Set-World([string] $Name, [string] $Value) {
    $path = [System.IO.Path]::Combine($script:Sandbox.World, $Name)
    [System.IO.File]::WriteAllText("$path.new", $Value)
    for ($try = 0; $try -lt 50; $try++) {
        try {
            Move-Item -LiteralPath "$path.new" -Destination $path -Force
            return
        } catch { Start-Sleep -Milliseconds 20 }
    }
    throw "could not set $Name"
}

function Get-Calls([string] $Pattern = '.') {
    $path = [System.IO.Path]::Combine($script:Sandbox.World, 'calls.log')
    if (-not [System.IO.File]::Exists($path)) { return }
    for ($try = 0; $try -lt 50; $try++) {
        try {
            return @([System.IO.File]::ReadAllLines($path) | Where-Object { $_ -cmatch $Pattern })
        } catch { Start-Sleep -Milliseconds 20 }
    }
    throw 'could not read the call log'
}
function Count-Calls([string] $Pattern) { return @(Get-Calls $Pattern).Count }
function Assert-Called([string] $Pattern) {
    Assert ((Count-Calls $Pattern) -gt 0) "no call matching '$Pattern'. Calls:`n$((Get-Calls) -join "`n")"
}
function Assert-NotCalled([string] $Pattern) {
    Assert ((Count-Calls $Pattern) -eq 0) "unexpected call matching '$Pattern':`n$((Get-Calls $Pattern) -join "`n")"
}

$EngineStart = '^(docker .* desktop start|rdctl .* start)'
$EngineStop = '^(docker .* desktop stop|rdctl .* shutdown)'
$Up = '^docker .* compose -f .* up -d --build$'
$Down = '^docker .* compose -f .* down$'

function Add-Shim([string] $Bin, [string] $Name, [string] $Tool) {
    if ($OnWindows) {
        # A real native command, so that exit codes and stderr behave as with docker.exe.
        $text = "@echo off`r`n`"$Shell`" -NoProfile -ExecutionPolicy Bypass -File `"%~dp0fake.ps1`" $Tool %*`r`n" +
            "exit /b %ERRORLEVEL%`r`n"
        [System.IO.File]::WriteAllText([System.IO.Path]::Combine($Bin, "$Name.cmd"), $text, [System.Text.Encoding]::Default)
    } else {
        $path = [System.IO.Path]::Combine($Bin, $Name)
        $text = "#!/bin/sh`nexec `"$Shell`" -NoProfile -File `"`$(/usr/bin/dirname `"`$0`")/fake.ps1`" $Tool `"`$@`"`n"
        [System.IO.File]::WriteAllText($path, $text)
        & /bin/chmod 755 $path
    }
}

function New-Sandbox([string] $RepoName = $SpecialName) {
    $script:SandboxNumber++
    $base = [System.IO.Path]::Combine($Root, "s$($script:SandboxNumber)")
    $sandbox = @{
        Base  = $base
        Repo  = [System.IO.Path]::Combine($base, $RepoName)
        Bin   = [System.IO.Path]::Combine($base, 'bin')
        Empty = [System.IO.Path]::Combine($base, 'empty')
        World = [System.IO.Path]::Combine($base, 'world')
        State = [System.IO.Path]::Combine($base, "state dir (x) & y's")
        DockerApp = [System.IO.Path]::Combine($base, 'Docker Desktop.exe')
        Settings = [System.IO.Path]::Combine($base, 'settings-store.json')
    }
    foreach ($directory in @($sandbox.Bin, $sandbox.Empty, $sandbox.World, $sandbox.State,
            [System.IO.Path]::Combine($sandbox.Repo, 'launcher', 'windows'))) {
        [void] [System.IO.Directory]::CreateDirectory($directory)
    }
    [System.IO.File]::Copy([System.IO.Path]::Combine($Source, 'docker-compose.yml'),
        [System.IO.Path]::Combine($sandbox.Repo, 'docker-compose.yml'))
    [System.IO.File]::Copy([System.IO.Path]::Combine($Source, 'launcher', 'compose.launcher.yml'),
        [System.IO.Path]::Combine($sandbox.Repo, 'launcher', 'compose.launcher.yml'))
    foreach ($file in [System.IO.Directory]::GetFiles([System.IO.Path]::Combine($Source, 'launcher', 'windows'))) {
        [System.IO.File]::Copy($file, [System.IO.Path]::Combine($sandbox.Repo, 'launcher', 'windows',
                [System.IO.Path]::GetFileName($file)))
    }
    [System.IO.File]::Copy([System.IO.Path]::Combine($PSScriptRoot, 'fake.ps1'),
        [System.IO.Path]::Combine($sandbox.Bin, 'fake.ps1'))
    Add-Shim $sandbox.Bin 'docker' 'docker'
    Add-Shim $sandbox.Bin 'fakecurl' 'curl'
    Add-Shim $sandbox.Bin 'fakeproc' 'proc'
    $script:Sandbox = $sandbox
    Set-Settings '{"KubernetesEnabled": false}'
}
function Set-Settings([string] $Json) { [System.IO.File]::WriteAllText($script:Sandbox.Settings, $Json) }
function Get-ShimPath([string] $Name) {
    if ($OnWindows) { $Name += '.cmd' }
    return [System.IO.Path]::Combine($script:Sandbox.Bin, $Name)
}

function Add-Rdctl { Add-Shim $script:Sandbox.Bin 'rdctl' 'rdctl' }
function Add-DockerApp { [System.IO.File]::WriteAllText($script:Sandbox.DockerApp, '') }

# Engine off, Docker Desktop installed and selected.
function Use-DesktopOff {
    Add-DockerApp
    Set-World 'context' 'desktop-linux'
    Set-World 'desktop_plugin' '1'
    Set-World 'engine_up' '0'
    Set-World 'boot_polls' '2'
}
# Engine already running.
function Use-EngineOn {
    Set-World 'context' 'desktop-linux'
    Set-World 'desktop_plugin' '1'
    Set-World 'engine_up' '1'
}
function Set-Container([string] $Id, [string] $Status, [string] $ExitCode = '0') {
    Set-World 'container_id' $Id
    Set-World 'container_status' $Status
    Set-World 'container_exit' $ExitCode
    Set-World 'container_started_at' $StartedAt
}

function Set-State([string[]] $Lines) {
    [System.IO.File]::WriteAllLines([System.IO.Path]::Combine($script:Sandbox.State, 'state'), $Lines)
}
# A state as left by a start that launched the engine.
function Set-Owned([string] $Engine = 'docker-desktop', [string] $Context = 'desktop-linux', [string] $Started = '1') {
    Set-State @("engine=$Engine", "context=$Context", "engine_started=$Started", "container_id=$IdA",
        "container_started_at=$StartedAt", 'watcher_pid=')
}
function Test-State { return [System.IO.File]::Exists([System.IO.Path]::Combine($script:Sandbox.State, 'state')) }
function Get-State {
    $result = @{}
    if (Test-State) {
        foreach ($line in [System.IO.File]::ReadAllLines([System.IO.Path]::Combine($script:Sandbox.State, 'state'))) {
            $parts = $line.Split([char[]] '=', 2)
            if ($parts.Count -eq 2) { $result[$parts[0]] = $parts[1] }
        }
    }
    return $result
}

function Set-ChildEnvironment($Info, [hashtable] $Environment) {
    $values = @{
        PATH                    = $script:Sandbox.Bin
        FAKE_WORLD              = $script:Sandbox.World
        MYINNOX1_STATE_DIR      = $script:Sandbox.State
        MYINNOX1_ENGINE_TIMEOUT = '60'
        MYINNOX1_APP_TIMEOUT    = '60'
        MYINNOX1_NO_BROWSER     = '1'
        MYINNOX1_DOCKER_APP     = $script:Sandbox.DockerApp
        MYINNOX1_EXTRA_PATH     = [System.IO.Path]::Combine($script:Sandbox.Base, 'nowhere')
        MYINNOX1_CURL           = Get-ShimPath 'fakecurl'
        MYINNOX1_PROCESS_CHECK  = Get-ShimPath 'fakeproc'
        MYINNOX1_DOCKER_SETTINGS = $script:Sandbox.Settings
    }
    foreach ($key in $Environment.Keys) { $values[$key] = $Environment[$key] }
    # PSModulePath: a Windows PowerShell child of pwsh must build its own.
    foreach ($name in @('DOCKER_HOST', 'DOCKER_CONTEXT', 'COMPOSE_PROJECT_NAME', 'PSModulePath')) {
        $Info.EnvironmentVariables.Remove($name)
    }
    foreach ($key in $values.Keys) {
        # $null means: not set at all.
        if ($null -eq $values[$key]) { $Info.EnvironmentVariables.Remove($key) }
        else { $Info.EnvironmentVariables[$key] = [string] $values[$key] }
    }
}

function Start-Child([string] $FileName, [string] $Arguments, [hashtable] $Environment = @{}) {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $FileName
    $info.Arguments = $Arguments
    $info.UseShellExecute = $false
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.WorkingDirectory = $script:Sandbox.Base
    Set-ChildEnvironment $info $Environment
    $process = [System.Diagnostics.Process]::Start($info)
    $process.StandardInput.Close()
    return @{
        Process = $process
        Out     = $process.StandardOutput.ReadToEndAsync()
        Err     = $process.StandardError.ReadToEndAsync()
    }
}
function Complete-Child($Child) {
    if (-not $Child.Process.WaitForExit(120000)) {
        $Child.Process.Kill()
        throw 'the launcher did not finish within 120 seconds'
    }
    Assert ($Child.Out.Wait(20000) -and $Child.Err.Wait(20000)) 'a process kept the output open'
    return @{ Code = $Child.Process.ExitCode; Output = $Child.Out.Result + $Child.Err.Result }
}
function Get-LauncherArguments([string] $Command) {
    $script = [System.IO.Path]::Combine($script:Sandbox.Repo, 'launcher', 'windows', 'launcher.ps1')
    return "-NoProfile -ExecutionPolicy Bypass -File `"$script`" $Command"
}
function Invoke-Launcher([string] $Command, [hashtable] $Environment = @{}) {
    return Complete-Child (Start-Child $Shell (Get-LauncherArguments $Command) $Environment)
}

function Wait-Until([scriptblock] $Condition, [string] $What, [int] $Seconds = 45) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while (-not (& $Condition)) {
        if ((Get-Date) -gt $deadline) { throw "timed out waiting until $What" }
        Start-Sleep -Milliseconds 200
    }
}
function Test-Alive([string] $ProcessId) {
    if (-not $ProcessId) { return $false }
    $process = Get-Process -Id ([int] $ProcessId) -ErrorAction SilentlyContinue
    return ($null -ne $process -and -not $process.HasExited)
}

# Lets every fake "docker wait" return, so that no watcher outlives its test.
function Remove-Sandbox {
    if (-not $script:Sandbox) { return }
    $watcher = (Get-State)['watcher_pid']
    foreach ($id in @($IdA, $IdB)) {
        if (-not (Test-Path -LiteralPath ([System.IO.Path]::Combine($script:Sandbox.World, "release_$id")))) {
            Set-World "release_$id" '0'
        }
    }
    if ($watcher -match '^\d+$' -and [int] $watcher -ne $PID) {
        $deadline = (Get-Date).AddSeconds(20)
        while ((Test-Alive $watcher) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
        if (Test-Alive $watcher) { Stop-Process -Id ([int] $watcher) -Force -ErrorAction SilentlyContinue }
    }
    $script:Sandbox = $null
}

# Starts the app and waits until the detached watcher is inside "docker wait".
function Start-App {
    $result = Invoke-Launcher 'start'
    Assert-Exit $result 0
    $id = (Get-State)['container_id']
    Wait-Until { (Count-Calls " wait $id$") -ge 1 } 'the watcher calls docker wait'
    return $result
}
# What pressing the dashboard button looks like from outside.
function Press-StopButton {
    $id = (Get-State)['container_id']
    Set-World 'container_status' 'exited'
    Set-World 'container_exit' '42'
    Set-World "release_$id" '42'
}

# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------

Test 'files: scripts are ASCII, parse cleanly and contain no external URL' {
    $files = @('windows/launcher.ps1', 'windows/Start MyInnoX1.cmd', 'windows/Stop MyInnoX1.cmd',
        'tests/windows/run.ps1', 'tests/windows/fake.ps1')
    foreach ($file in $files) {
        $path = [System.IO.Path]::Combine($Source, 'launcher', $file)
        $bytes = [System.IO.File]::ReadAllBytes($path)
        Assert (@($bytes | Where-Object { $_ -gt 127 }).Count -eq 0) "$file has non-ASCII bytes"
        if ($file -like '*.ps1') {
            $tokens = $null; $errors = $null
            [void] [System.Management.Automation.Language.Parser]::ParseFile($path, [ref] $tokens, [ref] $errors)
            Assert (@($errors).Count -eq 0) "$file does not parse: $errors"
        }
        if ($file -like 'windows/*') {
            $text = [System.IO.File]::ReadAllText($path)
            foreach ($url in [regex]::Matches($text, 'https?://[^\s''"]+')) {
                Assert ($url.Value -match '^http://(localhost|127\.0\.0\.1):8787') "external URL in ${file}: $($url.Value)"
            }
        }
    }
}

Test 'files: cmd wrappers use CRLF, a full PowerShell path and no delayed expansion' {
    foreach ($pair in @(@('Start MyInnoX1.cmd', 'start'), @('Stop MyInnoX1.cmd', 'stop'))) {
        $text = [System.IO.File]::ReadAllText([System.IO.Path]::Combine($Source, 'launcher', 'windows', $pair[0]))
        Assert ($text -notmatch '(?<!\r)\n') "$($pair[0]) has a bare LF"
        Assert ($text -match 'DisableDelayedExpansion') 'delayed expansion must be off'
        Assert ($text -match '"%SystemRoot%\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe" ') 'full path'
        Assert ($text -match "-ExecutionPolicy Bypass -File `"%~dp0launcher\.ps1`" $($pair[1])\r") 'invocation'
        Assert ($text -match 'pause') 'must pause on failure'
    }
    $stop = [System.IO.File]::ReadAllText([System.IO.Path]::Combine($Source, 'launcher', 'windows', 'Stop MyInnoX1.cmd'))
    Assert ($stop -match 'System32\\ping\.exe" -n \d+ 127\.0\.0\.1 >nul\r\nexit /b 0') 'Stop waits after success'
    Assert ($stop -notmatch '(?m)^\s*timeout ') 'timeout fails with redirected input'
}

# ---------------------------------------------------------------------------
# The matrix in the specification
# ---------------------------------------------------------------------------

Test 'matrix: engine off, start, stop from the button: engine starts, then stops' {
    New-Sandbox; Use-DesktopOff
    $result = Start-App
    Assert-Output $result 'http://localhost:8787'
    Assert-Called '^docker .* desktop start --detach$'
    Assert-Called $Up
    $state = Get-State
    Assert-Equal 'docker-desktop' $state['engine'] 'engine'
    Assert-Equal 'desktop-linux' $state['context'] 'context'
    Assert-Equal '1' $state['engine_started'] 'engine_started'
    Assert-Equal $IdA $state['container_id'] 'container_id'
    Assert-Equal '2026-02-01T10:00:01.5Z' $state['container_started_at'] 'container_started_at'
    Assert (Test-Alive $state['watcher_pid']) 'watcher is running'
    Assert-NotCalled $EngineStop

    Press-StopButton
    Wait-Until { (Count-Calls '^docker .* desktop stop$') -eq 1 } 'the engine is stopped'
    Wait-Until { -not (Test-Alive $state['watcher_pid']) } 'the watcher exits'
    Assert (-not (Test-State)) 'state is cleared'
    Assert-Called '^docker \[ctx=desktop-linux\] .* down$'
    Assert-Called '^docker \[ctx=desktop-linux\] .* ps -q$'
    $log = [System.IO.File]::ReadAllText([System.IO.Path]::Combine($script:Sandbox.State, 'watcher.log'))
    Assert ($log -match 'Stop was requested') 'watcher.log records the request'
}

Test 'matrix: Rancher Desktop on the default context: starts, Stop shortcut shuts it down' {
    New-Sandbox; Add-Rdctl
    Set-World 'context' 'default'; Set-World 'engine_up' '0'; Set-World 'boot_polls' '3'
    [void] (Start-App)
    Assert-Called '^rdctl .* start$'
    $state = Get-State
    Assert-Equal 'rancher-desktop' $state['engine'] 'engine'
    Assert-Equal 'default' $state['context'] 'context'
    Assert-Equal '1' $state['engine_started'] 'engine_started'
    $result = Invoke-Launcher 'stop'
    Assert-Exit $result 0
    Assert-Called $Down
    Assert-Called '^rdctl \[ctx=default\] .* shutdown$'
    Assert (-not (Test-State)) 'state is cleared'
    Wait-Until { -not (Test-Alive $state['watcher_pid']) } 'the watcher exits'
    Assert-Equal 1 (Count-Calls $Down) 'the watcher does not clean up again'
}

Test 'matrix: the context recorded is the one in use after the engine started' {
    New-Sandbox; Use-DesktopOff
    Set-World 'context' 'default'; Set-World 'context_after_start' 'desktop-linux'
    [void] (Start-App)
    Assert-Equal 'desktop-linux' (Get-State)['context'] 'context'
    Assert-Exit (Invoke-Launcher 'stop') 0
    Assert-Called '^docker .* desktop stop$'
}

Test 'matrix: engine already on: it stays on' {
    New-Sandbox; Use-EngineOn
    [void] (Start-App)
    Assert-NotCalled $EngineStart
    Assert-Equal 'none' (Get-State)['engine'] 'engine'
    Assert-Equal '0' (Get-State)['engine_started'] 'engine_started'
    $result = Invoke-Launcher 'stop'
    Assert-Exit $result 0
    Assert-Output $result 'left running: the launcher did not start it'
    Assert-Called $Down
    Assert-NotCalled $EngineStop
}

Test 'matrix: another container running at stop: engine stays on' {
    New-Sandbox; Use-DesktopOff
    [void] (Start-App)
    Set-World 'other_containers' 'cccccccccccc'
    $result = Invoke-Launcher 'stop'
    Assert-Exit $result 0
    Assert-Output $result 'left running: other containers are running'
    Assert-NotCalled $EngineStop
    Assert (-not (Test-State)) 'state is cleared'
}

Test 'matrix: start clicked twice: one watcher, flag kept, browser URL both times' {
    New-Sandbox; Use-DesktopOff
    [void] (Start-App)
    $first = Get-State
    $result = Invoke-Launcher 'start'
    Assert-Exit $result 0
    Assert-Output $result 'http://localhost:8787'
    $second = Get-State
    Assert-Equal $first['watcher_pid'] $second['watcher_pid'] 'same watcher'
    Assert-Equal '1' $second['engine_started'] 'flag kept'
    Assert-Equal 'docker-desktop' $second['engine'] 'engine kept'
    Start-Sleep -Seconds 2
    Assert-Equal 1 (Count-Calls ' wait ') 'watchers'
    Assert-Equal 1 (Count-Calls $EngineStart) 'engine starts'
}

Test 'matrix: two starts at the same moment: one engine start, one watcher' {
    New-Sandbox; Use-DesktopOff
    $one = Start-Child $Shell (Get-LauncherArguments 'start')
    $two = Start-Child $Shell (Get-LauncherArguments 'start')
    Assert-Exit (Complete-Child $one) 0
    Assert-Exit (Complete-Child $two) 0
    Start-Sleep -Seconds 3
    Assert-Equal 1 (Count-Calls ' wait ') 'watchers'
    Assert-Equal 1 (Count-Calls $EngineStart) 'engine starts'
    Assert-Equal '1' (Get-State)['engine_started'] 'flag kept'
}

Test 'matrix: start again after a rebuild: flag kept, a watcher for the new container' {
    New-Sandbox; Use-DesktopOff
    [void] (Start-App)
    $first = Get-State
    Set-World 'new_id' $IdB
    Assert-Exit (Invoke-Launcher 'start') 0
    $second = Get-State
    Assert-Equal $IdB $second['container_id'] 'new container'
    Assert-Equal '1' $second['engine_started'] 'flag kept'
    Assert ($second['watcher_pid'] -ne $first['watcher_pid']) 'new watcher'
    Wait-Until { (Count-Calls " wait $IdB$") -eq 1 } 'the new watcher waits'
    # The old watcher sees its container replaced and must do nothing.
    Set-World "release_$IdA" '137'
    Wait-Until { -not (Test-Alive $first['watcher_pid']) } 'the old watcher exits'
    Assert-NotCalled $Down
    Assert-NotCalled $EngineStop
}

Test 'matrix: watcher closed, then button: app stops, engine stays; Stop shortcut covers it' {
    New-Sandbox; Use-DesktopOff
    [void] (Start-App)
    $watcher = (Get-State)['watcher_pid']
    Stop-Process -Id ([int] $watcher) -Force
    Wait-Until { -not (Test-Alive $watcher) } 'the watcher is gone'
    Press-StopButton
    Start-Sleep -Seconds 3
    Assert-NotCalled $Down
    Assert-NotCalled $EngineStop
    Assert-Exit (Invoke-Launcher 'stop') 0
    Assert-Called $Down
    Assert-Called '^docker .* desktop stop$'
}

Test 'matrix: start after the watcher was closed starts a new one' {
    New-Sandbox; Use-DesktopOff
    [void] (Start-App)
    $first = (Get-State)['watcher_pid']
    Stop-Process -Id ([int] $first) -Force
    Wait-Until { -not (Test-Alive $first) } 'the watcher is gone'
    Assert-Exit (Invoke-Launcher 'start') 0
    Assert ((Get-State)['watcher_pid'] -ne $first) 'new watcher'
    Wait-Until { (Count-Calls " wait $IdA$") -ge 2 } 'the new watcher waits'
}

Test 'matrix: Stop shortcut with the engine off starts nothing' {
    New-Sandbox; Use-DesktopOff; Add-Rdctl
    Set-Owned
    $result = Invoke-Launcher 'stop'
    Assert-Exit $result 0
    Assert-Output $result 'nothing to stop'
    Assert-NotCalled $EngineStart
    Assert-NotCalled $EngineStop
    Assert-NotCalled ' compose '
    Assert (-not (Test-State)) 'state is cleared'
}

Test 'matrix: "docker info" exiting 0 without a server still means the engine is off' {
    New-Sandbox; Use-DesktopOff; Set-World 'info_exit_zero' '1'
    Assert-Exit (Invoke-Launcher 'stop') 0
    Assert-NotCalled ' compose '
    [void] (Start-App)
    Assert-Called $EngineStart
}

Test 'matrix: port 8787 taken: clear error, no up' {
    New-Sandbox; Use-EngineOn; Set-World 'port_busy' '1'
    Set-Owned
    $result = Invoke-Launcher 'start'
    Assert-Failed $result
    Assert-Output $result 'Port 8787 is in use'
    Assert-NotCalled $Up
    Assert-NotCalled ' wait '
    $state = Get-State
    Assert-Equal '0' $state['engine_started'] 'the claim is dropped'
    Assert-Equal 'desktop-linux' $state['context'] 'recorded context unchanged'
    Assert-Equal $IdA $state['container_id'] 'recorded container unchanged'
}

Test 'matrix: port 8787 answered by our own running container is not an error' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'running'; Set-Owned
    [void] (Start-App)
    Assert-Equal '1' (Get-State)['engine_started'] 'flag kept'
}

Test 'matrix: slow first start of the engine is waited for' {
    New-Sandbox; Use-DesktopOff; Set-World 'boot_polls' '6'
    $result = Start-App
    Assert-Output $result 'Waiting for the container engine'
}

Test 'matrix: build output is shown' {
    New-Sandbox; Use-EngineOn
    $result = Start-App
    Assert-Output $result 'load build definition'
}

# ---------------------------------------------------------------------------
# Start failures
# ---------------------------------------------------------------------------

Test 'start: engine never ready: times out, and Stop will not touch an engine it cannot see' {
    New-Sandbox; Use-DesktopOff; Set-World 'boot_polls' '100000'
    $result = Invoke-Launcher 'start' @{ MYINNOX1_ENGINE_TIMEOUT = '3' }
    Assert-Failed $result
    Assert-Output $result 'did not become ready within 3 seconds'
    Assert-NotCalled $Up
    Assert (-not (Test-State)) 'nothing is claimed'
}

Test 'start: engine start command fails' {
    New-Sandbox; Use-DesktopOff; Set-World 'start_fail' '1'
    $result = Invoke-Launcher 'start'
    Assert-Failed $result
    Assert-Output $result 'did not start'
    Assert-Output $result 'Docker Desktop 4\.37 or newer'
    Assert-Output $result 'Update it, or open it yourself, then run Start again'
    Assert-NotCalled $Up
    Assert ((Get-State)['engine_started'] -ne '1') 'a failed start claims nothing'
}

Test 'start: a Docker Desktop without the "desktop" command is reported, not claimed' {
    New-Sandbox; Use-DesktopOff; Set-World 'desktop_plugin' '0'
    $result = Invoke-Launcher 'start'
    Assert-Failed $result
    Assert-Output $result 'Docker Desktop 4\.37 or newer'
    Assert-Called $EngineStart
    Assert-NotCalled 'desktop version'
    Assert (-not (Test-State)) 'no state'
}

Test 'stale flag: dropped when the engine start fails; a later Stop leaves the user''s engine' {
    New-Sandbox; Use-DesktopOff; Set-Owned; Set-World 'start_fail' '1'
    Assert-Failed (Invoke-Launcher 'start')
    Assert-Equal '0' (Get-State)['engine_started'] 'engine_started'
    Set-World 'engine_up' '1'; Set-Container $IdA 'running'
    Assert-Exit (Invoke-Launcher 'stop') 0
    Assert-NotCalled $EngineStop
}

Test 'stale flag: dropped when the engine choice is refused' {
    New-Sandbox; Use-DesktopOff; Add-Rdctl; Set-World 'context' 'default'; Set-Owned
    Assert-Failed (Invoke-Launcher 'start')
    Assert-NotCalled $EngineStart
    Assert-Equal '0' (Get-State)['engine_started'] 'engine_started'
}

Test 'stale flag: dropped when the engine is already starting' {
    New-Sandbox; Use-DesktopOff; Set-Owned; Set-World 'desktop_app' 'starting'; Set-World 'booting' '1'
    [void] (Start-App)
    Assert-Equal '0' (Get-State)['engine_started'] 'engine_started'
}

Test 'stale flag: dropped when the start is interrupted' {
    New-Sandbox; Use-DesktopOff; Set-Owned; Set-World 'start_hang' '1'
    $child = Start-Child $Shell (Get-LauncherArguments 'start')
    Wait-Until { (Count-Calls $EngineStart) -eq 1 } 'the engine start command runs'
    $child.Process.Kill()
    [void] $child.Process.WaitForExit(20000)
    Assert-Equal '0' (Get-State)['engine_started'] 'engine_started'
}

Test 'start: compose up fails: error and logs, nothing claimed' {
    New-Sandbox; Use-DesktopOff; Set-World 'up_fail' '1'
    $result = Invoke-Launcher 'start'
    Assert-Failed $result
    Assert-Output $result 'could not start the app \(exit code 17\)'
    Assert-Output $result 'FAKE-APP-LOG-LINE'
    Assert-Called 'logs --tail \d+ innodigym-editor$'
    Assert-NotCalled ' wait '
    Assert (-not (Test-State)) 'no state'
    Assert-Exit (Invoke-Launcher 'stop') 0
    Assert-NotCalled $EngineStop
}

Test 'start: app never answers: times out with logs, no watcher' {
    New-Sandbox; Use-EngineOn; Set-World 'app_never' '1'
    $result = Invoke-Launcher 'start' @{ MYINNOX1_APP_TIMEOUT = '3' }
    Assert-Failed $result
    Assert-Output $result 'did not answer within 3 seconds'
    Assert-Output $result 'FAKE-APP-LOG-LINE'
    Assert-NotCalled ' wait '
    Assert-Equal $IdA (Get-State)['container_id'] 'container recorded'
}

Test 'start: app container exits at once: fails without waiting for the timeout' {
    New-Sandbox; Use-EngineOn; Set-World 'status_after_up' 'exited'
    $result = Invoke-Launcher 'start'
    Assert-Failed $result
    Assert-Output $result 'stopped while starting'
}

Test 'start: engine application already starting: not claimed' {
    New-Sandbox; Use-DesktopOff; Set-World 'desktop_app' 'starting'; Set-World 'booting' '1'
    [void] (Start-App)
    Assert-NotCalled $EngineStart
    Assert-Equal '0' (Get-State)['engine_started'] 'engine_started'
}

Test 'start: Rancher Desktop already starting: not claimed' {
    New-Sandbox; Add-Rdctl
    Set-World 'context' 'default'; Set-World 'engine_up' '0'; Set-World 'rd_app' 'running'; Set-World 'booting' '1'
    [void] (Start-App)
    Assert-NotCalled $EngineStart
    Assert-Equal '0' (Get-State)['engine_started'] 'engine_started'
}

Test 'start: Docker Desktop reporting "stopped" is started' {
    New-Sandbox; Use-DesktopOff; Set-World 'desktop_app' 'stopped'
    [void] (Start-App)
    Assert-Called $EngineStart
}

Test 'start: a running container the launcher did not record does not keep the flag' {
    New-Sandbox; Use-EngineOn; Set-Container $IdB 'running'; Set-World 'new_id' $IdB
    Set-Owned
    [void] (Start-App)
    Assert-Equal '0' (Get-State)['engine_started'] 'engine_started'
}

Test 'start: a recorded flag from another context is not kept' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'running'
    Set-Owned 'rancher-desktop' 'rancher-desktop'
    [void] (Start-App)
    Assert-Equal '0' (Get-State)['engine_started'] 'engine_started'
}

Test 'start: a stale flag is dropped when the container is not running' {
    New-Sandbox; Use-EngineOn
    Set-Owned
    [void] (Start-App)
    Assert-Equal '0' (Get-State)['engine_started'] 'engine_started'
}

Test 'start: compose calls use both files, the pinned context and special path characters' {
    New-Sandbox; Use-EngineOn
    [void] (Start-App)
    $line = @(Get-Calls $Up)[0]
    Assert ($line.StartsWith('docker [ctx=desktop-linux] [project=] compose -f ')) "pinned context: $line"
    Assert ($line.Contains([System.IO.Path]::Combine($script:Sandbox.Repo, 'docker-compose.yml'))) "base file: $line"
    Assert ($line.Contains([System.IO.Path]::Combine($script:Sandbox.Repo, 'launcher', 'compose.launcher.yml'))) "override: $line"
}

Test 'start: a folder name Compose cannot use gets a fixed project name' {
    New-Sandbox ([string] [char] 0x5065 + [char] 0x8EAB); Use-EngineOn
    [void] (Start-App)
    Assert-Called '\[project=myinnox1\] compose -f .* up '
}

# ---------------------------------------------------------------------------
# Stop safety
# ---------------------------------------------------------------------------

Test 'stop safety: control case, all conditions met, engine stops' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'running'; Set-Owned
    Assert-Exit (Invoke-Launcher 'stop') 0
    Assert-Called '^docker .* desktop stop$'
}

$leftRunning = @(
    @{ Name = '"docker ps -q" fails'; Reason = 'the list of running containers could not be read'
        Arrange = { Set-World 'ps_fail' '1' } }
    @{ Name = 'the engine was already running'; Reason = 'the launcher did not start it'
        Arrange = { Set-Owned 'docker-desktop' 'desktop-linux' '0' } }
    @{ Name = 'there is no state'; Reason = 'the launcher did not start it'
        Arrange = { [System.IO.File]::Delete([System.IO.Path]::Combine($script:Sandbox.State, 'state')) } }
    @{ Name = 'the container had exited with 0'; Reason = 'MyInnoX1 was not running'
        Arrange = { Set-Container $IdA 'exited' '0' } }
    @{ Name = 'the container had crashed'; Reason = 'MyInnoX1 was not running'
        Arrange = { Set-Container $IdA 'exited' '1' } }
    @{ Name = 'there is no container'; Reason = 'MyInnoX1 was not running'
        Arrange = { Set-Container '' '' } }
    @{ Name = '"compose ps" fails'; Reason = 'MyInnoX1 was not running'
        Arrange = { Set-World 'compose_ps_fail' '1' } }
    @{ Name = 'engine type none'; Reason = 'it cannot be confirmed'
        Arrange = { Set-Owned 'none' 'desktop-linux' } }
    @{ Name = 'Docker Desktop recorded with the default context'; Reason = 'it cannot be confirmed'
        Arrange = { Set-Owned 'docker-desktop' 'default' } }
    @{ Name = 'Rancher Desktop recorded with the desktop-linux context'; Reason = 'it cannot be confirmed'
        Arrange = { Set-Owned 'rancher-desktop' 'desktop-linux' } }
    @{ Name = 'a remote context'; Reason = 'it cannot be confirmed'
        Arrange = { Set-Owned 'docker-desktop' 'my-server' } }
    @{ Name = 'no recorded context'; Reason = 'it cannot be confirmed'
        Arrange = { Set-Owned 'docker-desktop' '' } }
    @{ Name = 'the container was restarted outside the launcher'; Reason = 'this is not the run'
        Arrange = { Set-World 'container_started_at' '2026-03-03T03:03:03Z' } }
    @{ Name = 'another container replaced the recorded one'; Reason = 'this is not the run'
        Arrange = { Set-World 'container_id' $IdB } }
    @{ Name = 'no start time was recorded'; Reason = 'this is not the run'
        Arrange = { Set-State @('engine=docker-desktop', 'context=desktop-linux', 'engine_started=1', "container_id=$IdA") } }
    @{ Name = 'the recorded start time is invalid and Docker reports none'; Reason = 'this is not the run'
        Arrange = { Set-State @('engine=docker-desktop', 'context=desktop-linux', 'engine_started=1', "container_id=$IdA",
                'container_started_at=yesterday'); Set-World 'container_started_at' 'yesterday' } }
    @{ Name = 'Kubernetes is enabled'; Reason = 'Kubernetes is enabled'
        Arrange = { Set-Settings '{"KubernetesEnabled": true}' } }
    @{ Name = 'Kubernetes is enabled in an old settings file'; Reason = 'Kubernetes is enabled'
        Arrange = { Set-Settings '{"kubernetesEnabled": true}' } }
    @{ Name = 'the Kubernetes setting is absent'; Reason = 'the Docker Desktop settings do not show'
        Arrange = { Set-Settings '{"AutoStart": false}' } }
    @{ Name = 'the Kubernetes setting is not a boolean'; Reason = 'Kubernetes is enabled'
        Arrange = { Set-Settings '{"KubernetesEnabled": "false"}' } }
    @{ Name = 'the settings file is missing'; Reason = 'the Docker Desktop settings could not be read'
        Arrange = { [System.IO.File]::Delete($script:Sandbox.Settings) } }
    @{ Name = 'the settings file is broken'; Reason = 'the Docker Desktop settings could not be read'
        Arrange = { Set-Settings '{"KubernetesEnabled": fal' } }
    @{ Name = 'the settings file is empty'; Reason = 'the Docker Desktop settings'
        Arrange = { Set-Settings '' } }
)
foreach ($case in $leftRunning) {
    $script:Tests.Add(@{ Name = "stop safety: left running when $($case.Name)"; Case = $case; Body = {
                New-Sandbox; Use-EngineOn; Add-Rdctl; Set-Container $IdA 'running'; Set-Owned
                . $Case.Arrange
                $environment = @{}
                if ($Case.Environment) { $environment = $Case.Environment }
                $result = Invoke-Launcher 'stop' $environment
                Assert-Exit $result 0
                Assert-Output $result "left running: $($Case.Reason)"
                Assert-Called $Down
                Assert-NotCalled $EngineStop
                Assert (-not (Test-State)) 'state is cleared'
            } }) | Out-Null
}

Test 'stop safety: compose down fails: error, engine left, state kept' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'running'; Set-Owned; Set-World 'down_fail' '1'
    $result = Invoke-Launcher 'stop'
    Assert-Failed $result
    Assert-Output $result 'left running'
    Assert-NotCalled $EngineStop
    Assert (Test-State) 'state is kept'
}

Test 'stop: a container that exited with 42 counts as ours' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'exited' '42'; Set-Owned
    Assert-Exit (Invoke-Launcher 'stop') 0
    Assert-Called '^docker .* desktop stop$'
}

Test 'stop: the recorded context is used even if the current one differs' {
    New-Sandbox; Use-EngineOn; Set-World 'context' 'other'; Set-Container $IdA 'running'; Set-Owned
    Assert-Exit (Invoke-Launcher 'stop') 0
    Assert-NotCalled '^docker \[ctx=\] .* (info|ps|down|inspect)'
    Assert-Called '^docker \[ctx=desktop-linux\] .* ps -q$'
}

Test 'stop: engine stop command fails: reported as a failure' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'running'; Set-Owned; Set-World 'stop_fail' '1'
    $result = Invoke-Launcher 'stop'
    Assert-Failed $result
    Assert-Output $result 'could not be stopped'
    Assert (-not (Test-State)) 'state is cleared'
}

Test 'stop: Rancher Desktop recorded but rdctl gone: left running' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'running'; Set-Owned 'rancher-desktop' 'rancher-desktop'
    $result = Invoke-Launcher 'stop'
    Assert-Exit $result 0
    Assert-Output $result 'rdctl was not found'
    Assert-NotCalled $EngineStop
}

Test 'kubernetes: an old key spelled kubernetesEnabled=false allows the stop' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'running'; Set-Owned
    Set-Settings '{"kubernetesEnabled": false}'
    Assert-Exit (Invoke-Launcher 'stop') 0
    Assert-Called '^docker .* desktop stop$'
}

Test 'kubernetes: Rancher Desktop does not depend on Docker Desktop settings' {
    New-Sandbox; Use-EngineOn; Add-Rdctl; Set-Container $IdA 'running'; Set-Owned 'rancher-desktop' 'default'
    Set-World 'context' 'default'; Set-Settings '{"KubernetesEnabled": true}'
    Assert-Exit (Invoke-Launcher 'stop') 0
    Assert-Called '^rdctl .* shutdown$'
}

Test 'kubernetes: platform location, settings-store.json before settings.json' {
    New-Sandbox; Use-EngineOn
    $appData = [System.IO.Path]::Combine($script:Sandbox.Base, 'Roaming')
    $folder = [System.IO.Path]::Combine($appData, 'Docker')
    [void] [System.IO.Directory]::CreateDirectory($folder)
    $old = [System.IO.Path]::Combine($folder, 'settings.json')
    $new = [System.IO.Path]::Combine($folder, 'settings-store.json')
    [System.IO.File]::WriteAllText($old, '{"kubernetesEnabled": false}')
    # An empty override cannot be passed on every system, so it is removed from the child.
    $platform = @{ APPDATA = $appData; MYINNOX1_DOCKER_SETTINGS = $null }
    Set-Container $IdA 'running'; Set-Owned
    Assert-Exit (Invoke-Launcher 'stop' $platform) 0
    Assert-Equal 1 (Count-Calls $EngineStop) 'the old file alone is used'
    [System.IO.File]::WriteAllText($new, '{}')
    Set-World 'engine_up' '1'; Set-Container $IdA 'running'; Set-Owned
    Assert-Exit (Invoke-Launcher 'stop' $platform) 0
    Assert-Equal 1 (Count-Calls $EngineStop) 'the new file wins over the old one'
    [System.IO.File]::WriteAllText($new, '{"KubernetesEnabled": false}')
    [System.IO.File]::WriteAllText($old, '{"kubernetesEnabled": true}')
    Set-Container $IdA 'running'; Set-Owned
    Assert-Exit (Invoke-Launcher 'stop' $platform) 0
    Assert-Equal 2 (Count-Calls $EngineStop) 'the new file is read'
}

Test 'ownership: a restart outside the launcher is not ours, for Stop and for a new Start' {
    New-Sandbox; Use-DesktopOff
    [void] (Start-App)
    Set-World 'container_started_at' '2026-03-03T03:03:03Z'
    Assert-Exit (Invoke-Launcher 'start') 0
    Assert-Equal '0' (Get-State)['engine_started'] 'engine_started'
    Assert-Exit (Invoke-Launcher 'stop') 0
    Assert-NotCalled $EngineStop
}

foreach ($case in @(
        @{ Name = 'the engine never becomes ready'; World = 'boot_polls'; Value = '100000' }
        @{ Name = 'an old Compose'; World = 'compose_version'; Value = '2.20.0' }
        @{ Name = 'a busy port'; World = 'port_busy'; Value = '1' }
        @{ Name = 'a failing "up"'; World = 'up_fail'; Value = '1' })) {
    $script:Tests.Add(@{ Name = "ownership: after starting the engine, $($case.Name) records nothing new"; Case = $case; Body = {
                New-Sandbox; Use-DesktopOff
                Set-State @('engine=rancher-desktop', 'context=rancher-desktop', 'engine_started=1', "container_id=$IdB",
                    "container_started_at=$StartedAt", 'watcher_pid=')
                Set-World $Case.World $Case.Value
                Assert-Failed (Invoke-Launcher 'start' @{ MYINNOX1_ENGINE_TIMEOUT = '4' })
                Assert-Called $EngineStart
                $state = Get-State
                Assert-Equal '0' $state['engine_started'] 'the old claim is dropped'
                Assert-Equal 'rancher-desktop' $state['engine'] 'engine unchanged'
                Assert-Equal 'rancher-desktop' $state['context'] 'context unchanged'
                Assert-Equal $IdB $state['container_id'] 'container unchanged'
            } }) | Out-Null
}

foreach ($case in @(
        @{ Name = 'an old Compose'; World = 'compose_version'; Value = '2.20.0' }
        @{ Name = 'a failing "compose ps"'; World = 'compose_ps_fail'; Value = '1' })) {
    $script:Tests.Add(@{ Name = "ownership: a mismatch is recorded even before $($case.Name) fails the start"; Case = $case; Body = {
                New-Sandbox; Use-EngineOn; Set-Container $IdA 'exited' '0'; Set-Owned
                Set-World $Case.World $Case.Value
                Assert-Failed (Invoke-Launcher 'start')
                $state = Get-State
                Assert-Equal '0' $state['engine_started'] 'the claim is dropped'
                Assert-Equal $IdA $state['container_id'] 'recorded container unchanged'
                Assert-Equal 'desktop-linux' $state['context'] 'recorded context unchanged'
                Assert-Equal $StartedAt $state['container_started_at'] 'recorded start time unchanged'
            } }) | Out-Null
    $script:Tests.Add(@{ Name = "ownership: a matching run keeps the claim when $($case.Name) fails the start"; Case = $case; Body = {
                New-Sandbox; Use-EngineOn; Set-Container $IdA 'running'; Set-Owned
                Set-World $Case.World $Case.Value
                Assert-Failed (Invoke-Launcher 'start')
                Assert-Equal '1' (Get-State)['engine_started'] 'flag kept'
            } }) | Out-Null
}

Test 'DOCKER_HOST: removed for stop when an engine is recorded' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'running'; Set-Owned
    Assert-Exit (Invoke-Launcher 'stop' @{ DOCKER_HOST = 'tcp://192.0.2.1:2375' }) 0
    Assert-NotCalled '\[host='
    Assert-Called '^docker .* desktop stop$'
}

Test 'DOCKER_HOST: removed for the watcher when an engine is recorded' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'exited' '42'; Set-Owned; Set-World "release_$IdA" '42'
    Assert-Exit (Invoke-Launcher "watch $IdA" @{ DOCKER_HOST = 'tcp://192.0.2.1:2375' }) 0
    Assert-NotCalled '\[host='
    Assert-Called '^docker .* desktop stop$'
}

Test 'DOCKER_HOST: kept when no engine is recorded, and no engine is stopped' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'running'; Set-Owned 'none' 'default'
    Assert-Exit (Invoke-Launcher 'stop' @{ DOCKER_HOST = 'tcp://192.0.2.1:2375' }) 0
    Assert-Called '\[host=tcp://192\.0\.2\.1:2375\] .* down$'
    Assert-NotCalled $EngineStop
}

Test 'DOCKER_HOST: a start with it set claims no engine' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'running'; Set-Owned
    Assert-Exit (Invoke-Launcher 'start' @{ DOCKER_HOST = 'tcp://192.0.2.1:2375' }) 0
    Assert-Equal 'none' (Get-State)['engine'] 'engine'
    Assert-Equal '0' (Get-State)['engine_started'] 'engine_started'
}

foreach ($case in @(
        @{ Engine = 'docker-desktop'; Process = 'Docker Desktop' }
        @{ Engine = 'rancher-desktop'; Process = 'Rancher Desktop' })) {
    $script:Tests.Add(@{ Name = "already open: the $($case.Process) process means no start and no claim"; Case = $case; Body = {
                New-Sandbox; Use-DesktopOff; Set-World 'booting' '1'
                if ($Case.Engine -eq 'rancher-desktop') { Add-Rdctl; Set-World 'context' 'rancher-desktop' }
                Set-World 'process' $Case.Process
                [void] (Start-App)
                Assert-NotCalled $EngineStart
                Assert-Equal '0' (Get-State)['engine_started'] 'engine_started'
            } }) | Out-Null
    $script:Tests.Add(@{ Name = "already open: a failing $($case.Process) process check starts without a claim"; Case = $case; Body = {
                New-Sandbox; Use-DesktopOff
                if ($Case.Engine -eq 'rancher-desktop') { Add-Rdctl; Set-World 'context' 'rancher-desktop' }
                Set-World 'process_check_fails' '1'
                [void] (Start-App)
                Assert-Called $EngineStart
                Assert-Equal '0' (Get-State)['engine_started'] 'engine_started'
                Assert-Exit (Invoke-Launcher 'stop') 0
                Assert-NotCalled $EngineStop
            } }) | Out-Null
}

Test 'already open: the real process list, with the application absent, allows the claim' {
    if (Get-Process | Where-Object { $_.ProcessName -eq 'Docker Desktop' }) {
        Write-Host '      (skipped: Docker Desktop is open on this machine)'
        return
    }
    New-Sandbox; Use-DesktopOff
    Assert-Exit (Invoke-Launcher 'start' @{ MYINNOX1_PROCESS_CHECK = $null }) 0
    Assert-Equal '1' (Get-State)['engine_started'] 'engine_started'
}

Test 'lock: waits for a live holder, then continues' {
    New-Sandbox; Use-EngineOn
    $held = [System.IO.File]::Open([System.IO.Path]::Combine($script:Sandbox.State, 'lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    try {
        $child = Start-Child $Shell (Get-LauncherArguments 'stop')
        Assert (-not $child.Process.WaitForExit(9000)) 'the launcher must still be waiting'
        Assert-NotCalled '.'
    } finally { $held.Dispose() }
    $result = Complete-Child $child
    Assert-Exit $result 0
    Assert-Output $result 'Waiting for another MyInnoX1'
}

Test 'lock: gives up with a message when the lock cannot be taken at all' {
    New-Sandbox; Use-EngineOn
    [void] [System.IO.Directory]::CreateDirectory([System.IO.Path]::Combine($script:Sandbox.State, 'lock'))
    foreach ($command in @('start', 'stop', "watch $IdA")) {
        $result = Invoke-Launcher $command
        Assert-Exit $result 1
        Assert-Output $result 'Cannot lock the launcher'
    }
    Assert-NotCalled $Up
}

# ---------------------------------------------------------------------------
# Watcher
# ---------------------------------------------------------------------------

foreach ($code in @('0', '1', '2', '130', '137', '143', '420')) {
    $script:Tests.Add(@{ Name = "watcher: exit code $code is logged and nothing else happens"; Case = $code; Body = {
                New-Sandbox; Use-EngineOn; Set-Container $IdA 'exited' $Case; Set-Owned
                Set-World "release_$IdA" $Case
                $result = Invoke-Launcher "watch $IdA"
                Assert-Exit $result 0
                Assert-Output $result "exit code $Case, which is not a stop request"
                Assert-NotCalled $Down
                Assert-NotCalled $EngineStop
                Assert (Test-State) 'state is kept'
            } }) | Out-Null
}

Test 'watcher: docker wait failing (engine quit) touches nothing' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'running'; Set-Owned; Set-World "release_$IdA" 'fail'
    $result = Invoke-Launcher "watch $IdA"
    Assert-Failed $result
    Assert-NotCalled $Down
    Assert-NotCalled $EngineStop
    Assert (Test-State) 'state is kept'
}

Test 'watcher: exit code 42 cleans up and stops the engine, in the recorded context' {
    New-Sandbox; Use-EngineOn; Set-World 'context' 'other'; Set-Container $IdA 'exited' '42'; Set-Owned
    Set-World "release_$IdA" '42'
    Assert-Exit (Invoke-Launcher "watch $IdA") 0
    Assert-Called '^docker \[ctx=desktop-linux\] .* wait '
    Assert-Called '^docker \[ctx=desktop-linux\] .* down$'
    Assert-Called '^docker .* desktop stop$'
    Assert (-not (Test-State)) 'state is cleared'
}

Test 'watcher: 42 for a container that is no longer recorded does nothing' {
    New-Sandbox; Use-EngineOn; Set-Container $IdB 'running'
    Set-State @('engine=docker-desktop', 'context=desktop-linux', 'engine_started=1', "container_id=$IdB")
    Set-World "release_$IdA" '42'
    Assert-Exit (Invoke-Launcher "watch $IdA") 0
    Assert-NotCalled $Down
    Assert-NotCalled $EngineStop
    Assert (Test-State) 'state is kept'
}

Test 'watcher: 42 after the state was already cleared does nothing' {
    New-Sandbox; Use-EngineOn; Set-World "release_$IdA" '42'
    Assert-Exit (Invoke-Launcher "watch $IdA") 0
    Assert-NotCalled $Down
    Assert-NotCalled $EngineStop
}

Test 'watcher: 42 but the container is running again: watches it again, then cleans up' {
    New-Sandbox; Use-DesktopOff; Set-World 'release_once' '1'
    [void] (Start-App)
    $watcher = (Get-State)['watcher_pid']
    Set-World "release_$IdA" '42'
    Wait-Until { (Count-Calls " wait $IdA$") -eq 2 } 'the watcher waits a second time'
    Assert (Test-Alive $watcher) 'the same watcher is alive'
    Assert-NotCalled $Down
    Assert-NotCalled $EngineStop
    Assert-Exit (Invoke-Launcher 'start') 0
    Assert-Equal $watcher (Get-State)['watcher_pid'] 'Start keeps this watcher'
    Press-StopButton
    Wait-Until { (Count-Calls '^docker .* desktop stop$') -eq 1 } 'the engine is stopped'
    Wait-Until { -not (Test-Alive $watcher) } 'the watcher exits'
}

Test 'watcher: invalid arguments are refused' {
    New-Sandbox; Use-EngineOn
    foreach ($arguments in @('watch', 'watch nonsense', 'watch "abc; calc"', 'restart', '')) {
        Assert-Exit (Invoke-Launcher $arguments) 2
    }
    Assert-NotCalled '.'
}

# ---------------------------------------------------------------------------
# Compose version
# ---------------------------------------------------------------------------

foreach ($version in @('2.24.3', 'v2.20.0', '2.9.9', '1.29.2', 'garbage', 'missing')) {
    $script:Tests.Add(@{ Name = "compose version: '$version' is refused without up"; Case = $version; Body = {
                New-Sandbox; Use-EngineOn; Set-World 'compose_version' $Case
                $result = Invoke-Launcher 'start'
                Assert-Failed $result
                Assert-Output $result '2\.24\.4 or newer'
                Assert-NotCalled ' compose -f '
            } }) | Out-Null
}
foreach ($version in @('2.24.4', 'v2.29.1-desktop.1', '2.100.0', '5.0.0')) {
    $script:Tests.Add(@{ Name = "compose version: '$version' is accepted"; Case = $version; Body = {
                New-Sandbox; Use-EngineOn; Set-World 'compose_version' $Case
                [void] (Start-App)
                Assert-Called $Up
            } }) | Out-Null
}

Test 'compose version: Stop with an old Compose fails and leaves the engine' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'running'; Set-Owned; Set-World 'compose_version' '2.20.0'
    $result = Invoke-Launcher 'stop'
    Assert-Failed $result
    Assert-NotCalled $Down
    Assert-NotCalled $EngineStop
}

# ---------------------------------------------------------------------------
# Engine selection (engine off)
# ---------------------------------------------------------------------------

# Desktop: the Docker Desktop program file exists.
$selection = @(
    @{ Context = 'desktop-linux'; Desktop = $true; Rdctl = $true; Expect = 'docker-desktop' }
    @{ Context = 'desktop-linux'; Desktop = $false; Rdctl = $true; Expect = 'docker-desktop' }
    @{ Context = 'rancher-desktop'; Desktop = $true; Rdctl = $true; Expect = 'rancher-desktop' }
    @{ Context = 'rancher-desktop'; Desktop = $true; Rdctl = $false; Expect = '' }
    @{ Context = 'default'; Desktop = $true; Rdctl = $false; Expect = 'docker-desktop' }
    @{ Context = 'default'; Desktop = $false; Rdctl = $true; Expect = 'rancher-desktop' }
    @{ Context = 'default'; Desktop = $true; Rdctl = $true; Expect = '' }
    @{ Context = 'default'; Desktop = $false; Rdctl = $false; Expect = 'docker-desktop' }
    @{ Context = 'orbstack'; Desktop = $true; Rdctl = $false; Expect = '' }
    @{ Context = 'desktop-windows'; Desktop = $true; Rdctl = $false; Expect = '' }
    @{ Context = 'my-server'; Desktop = $false; Rdctl = $true; Expect = '' }
    @{ Context = 'default'; Desktop = $true; Rdctl = $false; Expect = ''; DockerHost = 'tcp://192.0.2.1:2375' }
)
foreach ($case in $selection) {
    $name = "engine selection: context $($case.Context), desktop=$($case.Desktop), rdctl=$($case.Rdctl)"
    if ($case.DockerHost) { $name += ', DOCKER_HOST set' }
    $script:Tests.Add(@{ Name = $name; Case = $case; Body = {
                New-Sandbox
                Set-World 'context' $Case.Context; Set-World 'engine_up' '0'
                Set-World 'desktop_plugin' '1'
                if ($Case.Desktop) { Add-DockerApp }
                if ($Case.Rdctl) { Add-Rdctl }
                $environment = @{}
                if ($Case.DockerHost) { $environment['DOCKER_HOST'] = $Case.DockerHost }
                $result = Invoke-Launcher 'start' $environment
                if ($Case.Expect) {
                    Assert-Exit $result 0
                    Assert-Equal $Case.Expect (Get-State)['engine'] 'engine'
                    $pattern = '^docker .* desktop start'
                    if ($Case.Expect -eq 'rancher-desktop') { $pattern = '^rdctl .* start$' }
                    Assert-Called $pattern
                    Assert-Equal 1 (Count-Calls $EngineStart) 'exactly one engine start'
                } else {
                    Assert-Failed $result
                    Assert-Output $result 'yourself'
                    Assert-NotCalled $EngineStart
                    Assert-NotCalled $Up
                }
            } }) | Out-Null
}

# ---------------------------------------------------------------------------
# Finding docker
# ---------------------------------------------------------------------------

Test 'docker missing: start and stop explain it and fail' {
    New-Sandbox; Set-Owned
    foreach ($command in @('start', 'stop')) {
        $result = Invoke-Launcher $command @{ PATH = $script:Sandbox.Empty }
        Assert-Exit $result 1
        Assert-Output $result 'Docker was not found'
    }
    Assert (Test-State) 'state is kept'
}

Test 'docker is found through the extra search directories' {
    New-Sandbox; Use-EngineOn
    $result = Invoke-Launcher 'start' @{ PATH = $script:Sandbox.Empty; MYINNOX1_EXTRA_PATH = $script:Sandbox.Bin }
    Assert-Exit $result 0
    Assert-Called $Up
}

if ($OnWindows) {
    Test 'docker is found in the platform list (per-user Docker Desktop)' {
        New-Sandbox; Use-EngineOn
        $local = [System.IO.Path]::Combine($script:Sandbox.Base, 'Local')
        $bin = [System.IO.Path]::Combine($local, 'Programs', 'DockerDesktop', 'resources', 'bin')
        [void] [System.IO.Directory]::CreateDirectory($bin)
        [System.IO.File]::Copy([System.IO.Path]::Combine($script:Sandbox.Bin, 'fake.ps1'), [System.IO.Path]::Combine($bin, 'fake.ps1'))
        Add-Shim $bin 'docker' 'docker'
        # Without MYINNOX1_EXTRA_PATH the platform list applies, so point all its roots into the sandbox.
        $info = New-Object System.Diagnostics.ProcessStartInfo
        $info.FileName = $Shell
        $info.Arguments = Get-LauncherArguments 'start'
        $info.UseShellExecute = $false
        $info.RedirectStandardOutput = $true
        Set-ChildEnvironment $info @{ PATH = $script:Sandbox.Empty; LOCALAPPDATA = $local
            ProgramFiles = $script:Sandbox.Empty; ProgramW6432 = $script:Sandbox.Empty }
        $info.EnvironmentVariables.Remove('MYINNOX1_EXTRA_PATH')
        $info.EnvironmentVariables.Remove('MYINNOX1_DOCKER_APP')
        $process = [System.Diagnostics.Process]::Start($info)
        $output = $process.StandardOutput.ReadToEnd()
        $process.WaitForExit()
        Assert ($process.ExitCode -eq 0) "exit $($process.ExitCode): $output"
        Assert-Called $Up
    }
}

# ---------------------------------------------------------------------------
# Hostile state
# ---------------------------------------------------------------------------

Test 'hostile state: values are data, never executed, and invalid ones are ignored' {
    New-Sandbox; Use-EngineOn; Add-Rdctl; Set-Container $IdA 'running'
    $marker = [System.IO.Path]::Combine($script:Sandbox.Base, 'pwned')
    $payload = "`$(New-Item -ItemType File -Path '$marker')"
    Set-State @(
        "engine=docker-desktop; $payload", "engine=$payload", "context=$payload", 'context=--help',
        'context=desktop-linux & calc', "engine_started=1; $payload", "container_id=$IdA; $payload",
        "watcher_pid=$payload", "`$env:PATH=$payload", $payload, '=1', 'engine_started', ('x' * 100000),
        'ENGINE_STARTED=1', 'engine=Docker-Desktop')
    $result = Invoke-Launcher 'stop'
    Assert-Exit $result 0
    Assert-Output $result 'left running'
    Assert-NotCalled $EngineStop
    Assert-NotCalled '\[ctx=[^\]]*(\$|--help|calc)'
    Assert (-not (Test-Path -LiteralPath $marker)) 'something in the state file was executed'
}

Test 'hostile state: hostile values do not survive a start' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'running'
    Set-State @('engine=evil', 'context=desktop-linux', 'engine_started=yes', "container_id=$IdA", 'watcher_pid=-1')
    [void] (Start-App)
    Assert-Equal 'none' (Get-State)['engine'] 'engine'
    Assert-Equal '0' (Get-State)['engine_started'] 'engine_started'
}

Test 'hostile state: a watcher PID that belongs to another process is not a watcher' {
    New-Sandbox; Use-EngineOn; Set-Container $IdA 'running'
    Set-State @('engine=none', 'context=desktop-linux', 'engine_started=0', "container_id=$IdA", "watcher_pid=$PID")
    [void] (Start-App)
    Assert ((Get-State)['watcher_pid'] -ne [string] $PID) 'a new watcher was started'
}

Test 'hostile state: binary rubbish is survived' {
    New-Sandbox; Use-EngineOn
    [System.IO.File]::WriteAllBytes([System.IO.Path]::Combine($script:Sandbox.State, 'state'),
        [byte[]] (0, 255, 254, 61, 61, 10, 13, 0, 200))
    Assert-Exit (Invoke-Launcher 'stop') 0
    Assert-NotCalled $EngineStop
}

# ---------------------------------------------------------------------------
# The .cmd wrappers (Windows only)
# ---------------------------------------------------------------------------

if ($OnWindows) {
    function Invoke-Wrapper([string] $Name, [hashtable] $Environment = @{}) {
        $wrapper = [System.IO.Path]::Combine($script:Sandbox.Repo, 'launcher', 'windows', $Name)
        return Complete-Child (Start-Child $env:ComSpec "/d /s /c `"`"$wrapper`"`"" $Environment)
    }
    Test 'wrapper: Start and Stop work from a folder with special characters' {
        New-Sandbox ($SpecialName + ' !bang!'); Use-DesktopOff
        $result = Invoke-Wrapper 'Start MyInnoX1.cmd'
        Assert-Exit $result 0
        Assert-Called $Up
        Wait-Until { (Count-Calls ' wait ') -eq 1 } 'the watcher waits'
        Assert-Exit (Invoke-Wrapper 'Stop MyInnoX1.cmd') 0
        Assert-Called $Down
        Assert-Called '^docker .* desktop stop$'
    }
    Test 'wrapper: failures pause and keep the exit code' {
        New-Sandbox
        foreach ($pair in @(@('Start MyInnoX1.cmd', 'did not start'), @('Stop MyInnoX1.cmd', 'not stopped'))) {
            $result = Invoke-Wrapper $pair[0] @{ PATH = $script:Sandbox.Empty }
            Assert-Exit $result 1
            Assert-Output $result 'Docker was not found'
            Assert-Output $result $pair[1]
        }
    }
}

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

Write-Host "PowerShell $($PSVersionTable.PSVersion) at $Shell"
[void] [System.IO.Directory]::CreateDirectory($Root)
$passed = 0
$failed = @()
$timer = [System.Diagnostics.Stopwatch]::StartNew()
try {
    foreach ($test in $script:Tests) {
        if ($Filter -and $test.Name -notlike "*$Filter*") { continue }
        $Case = $test.Case
        try {
            & $test.Body
            $passed++
            Write-Host "PASS  $($test.Name)"
        } catch {
            $failed += $test.Name
            Write-Host "FAIL  $($test.Name)"
            Write-Host "      $($_.Exception.Message)"
            Write-Host "      $($_.ScriptStackTrace -replace "`n", "`n      ")"
        } finally {
            try { Remove-Sandbox } catch { Write-Host "      cleanup: $($_.Exception.Message)" }
        }
    }
} finally {
    Start-Sleep -Milliseconds 500
    Remove-Item -LiteralPath $Root -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host ("{0} passed, {1} failed, {2:N0} s" -f $passed, $failed.Count, $timer.Elapsed.TotalSeconds)
foreach ($name in $failed) { Write-Host "  failed: $name" }
if ($failed.Count -gt 0 -or $passed -eq 0) { exit 1 }
exit 0
