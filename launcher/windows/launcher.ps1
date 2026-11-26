# MyInnoX1 desktop launcher for Windows (Windows PowerShell 5.1 and PowerShell 7).
#
#   launcher.ps1 start                 start the engine if needed, start the app, open the browser
#   launcher.ps1 stop                  stop the app; stop the engine only when that is safe
#   launcher.ps1 watch <containerId>   wait for the app; clean up if it was stopped from the dashboard
#
# Specification: docs/plan-desktop-launcher.md and docs/desktop-launcher-impl-plan.md.
# Rule of thumb: in every doubtful case the container engine is left running.
#
# Keep this file ASCII only: Windows PowerShell 5.1 misreads UTF-8 without a BOM.

param(
    [Parameter(Position = 0)] [string] $Command,
    [Parameter(Position = 1)] [string] $ContainerId
)

$ErrorActionPreference = 'Stop'

$script:OnWindows = ($env:OS -eq 'Windows_NT')
$script:ScriptPath = $PSCommandPath
$script:LauncherDir = [System.IO.Path]::GetDirectoryName($PSScriptRoot)
$script:RepoDir = [System.IO.Path]::GetDirectoryName($script:LauncherDir)
$script:ComposeBase = [System.IO.Path]::Combine($script:RepoDir, 'docker-compose.yml')
$script:ComposeOverride = [System.IO.Path]::Combine($script:LauncherDir, 'compose.launcher.yml')
$script:Service = 'innodigym-editor'
$script:AppUrl = 'http://localhost:8787'
# 127.0.0.1 for polling only: the port is published on IPv4, and "localhost" can be slow to fall back.
$script:StatusUrl = 'http://127.0.0.1:8787/_local/status'
$script:IdPattern = '^[0-9a-f]{12,64}$'
$script:ContextPattern = '^[A-Za-z0-9][A-Za-z0-9_.+-]*$'
# RFC 3339, as in .State.StartedAt.
$script:TimePattern = '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
$script:LogFile = $null
$script:Docker = $null

# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

function Say([string] $Message) {
    Write-Host $Message
    if ($script:LogFile) {
        try {
            $line = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' ' + $Message + [Environment]::NewLine
            [System.IO.File]::AppendAllText($script:LogFile, $line)
        } catch { }
    }
}

# An expected failure: the message is shown as it is, without a script trace.
function Fail([string] $Message) {
    $exception = New-Object System.InvalidOperationException($Message)
    $exception.Data['MyInnoX1'] = $true
    throw $exception
}

function Get-Seconds([string] $Name, [int] $Default) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    $parsed = 0
    if ($value -and [int]::TryParse($value, [ref] $parsed) -and $parsed -ge 0) { return $parsed }
    return $Default
}

function Find-Tool([string] $Name) {
    # Not aliases or functions: "curl" is an alias in Windows PowerShell.
    $found = @(Get-Command -Name $Name -CommandType Application, ExternalScript -ErrorAction SilentlyContinue)
    if ($found.Count -eq 0) { return $null }
    return $found[0].Path
}

# Runs a command and captures it. Windows PowerShell 5.1 turns redirected stderr of a native
# command into terminating errors under 'Stop', hence the local preference.
function Invoke-Tool([string] $Path, [string[]] $Arguments) {
    $ErrorActionPreference = 'Continue'
    $out = New-Object 'System.Collections.Generic.List[string]'
    $err = New-Object 'System.Collections.Generic.List[string]'
    $global:LASTEXITCODE = $null
    try {
        & $Path @Arguments 2>&1 | ForEach-Object {
            if ($_ -is [System.Management.Automation.ErrorRecord]) { $err.Add($_.Exception.Message) }
            else { $out.Add([string] $_) }
        }
        $code = $global:LASTEXITCODE
    } catch {
        $code = 127
        $err.Add($_.Exception.Message)
    }
    if ($null -eq $code) { $code = 127 }
    return New-Object psobject -Property @{
        Code  = [int] $code
        Out   = ($out -join "`n").Trim()
        Error = ($err -join "`n").Trim()
    }
}

# Runs an engine start or stop command without any pipe. A pipe would be inherited by the
# desktop app that the command launches, and the launcher would wait until that app quits.
function Invoke-Detached([string] $Path, [string] $Arguments) {
    if ($Path.EndsWith('.ps1', [StringComparison]::OrdinalIgnoreCase)) {
        $result = Invoke-Tool $Path ($Arguments -split ' ')
        return $result.Code
    }
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $Path
    $info.Arguments = $Arguments
    $info.UseShellExecute = $false
    try {
        $process = [System.Diagnostics.Process]::Start($info)
        $process.WaitForExit()
        return $process.ExitCode
    } catch {
        Say $_.Exception.Message
        return 127
    }
}

function Add-SearchPath {
    if (Test-Path -LiteralPath 'Env:\MYINNOX1_EXTRA_PATH') {
        $extra = @("$env:MYINNOX1_EXTRA_PATH" -split [System.IO.Path]::PathSeparator)
    } else {
        $extra = @()
        foreach ($root in @($env:ProgramW6432, $env:ProgramFiles)) {
            if ($root) {
                $extra += "$root\Docker\Docker\resources\bin"
                $extra += "$root\Rancher Desktop\resources\resources\win32\bin"
            }
        }
        if ($env:LOCALAPPDATA) {
            $extra += "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin"
            $extra += "$env:LOCALAPPDATA\Programs\Rancher Desktop\resources\resources\win32\bin"
        }
    }
    foreach ($directory in $extra) {
        if ($directory -and (Test-Path -LiteralPath $directory)) {
            $env:PATH = $env:PATH + [System.IO.Path]::PathSeparator + $directory
        }
    }
}

# ---------------------------------------------------------------------------
# State: key=value data outside the repository. Never executed, every value is validated.
# ---------------------------------------------------------------------------

function Initialize-State {
    $directory = $env:MYINNOX1_STATE_DIR
    if (-not $directory) {
        if ($env:LOCALAPPDATA) { $directory = [System.IO.Path]::Combine($env:LOCALAPPDATA, 'MyInnoX1') }
        else { $directory = [System.IO.Path]::Combine($HOME, '.local', 'state', 'MyInnoX1') }
    }
    $directory = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($directory)
    [void] [System.IO.Directory]::CreateDirectory($directory)
    $script:StateDir = $directory
    $script:StateFile = [System.IO.Path]::Combine($directory, 'state')
}

function New-State {
    return @{ engine = 'none'; context = ''; engine_started = '0'; container_id = ''
        container_started_at = ''; watcher_pid = '' }
}

function Test-StateExists {
    return [System.IO.File]::Exists($script:StateFile)
}

function Read-State {
    $state = New-State
    if (-not (Test-StateExists)) { return $state }
    $patterns = @{
        engine         = '^(docker-desktop|rancher-desktop|none)$'
        context        = $script:ContextPattern
        engine_started = '^[01]$'
        container_id   = $script:IdPattern
        container_started_at = $script:TimePattern
        watcher_pid    = '^[0-9]{1,9}$'
    }
    foreach ($line in [System.IO.File]::ReadAllLines($script:StateFile)) {
        $split = $line.IndexOf('=')
        if ($split -lt 1) { continue }
        $key = $line.Substring(0, $split)
        $value = $line.Substring($split + 1)
        if ($patterns.ContainsKey($key) -and $value -cmatch $patterns[$key]) { $state[$key] = $value }
    }
    return $state
}

function Write-State($State) {
    $keys = @('engine', 'context', 'engine_started', 'container_id', 'container_started_at', 'watcher_pid')
    $lines = foreach ($key in $keys) { $key + '=' + $State[$key] }
    $temporary = $script:StateFile + '.tmp'
    [System.IO.File]::WriteAllLines($temporary, [string[]] $lines)
    Move-Item -LiteralPath $temporary -Destination $script:StateFile -Force
}

function Clear-State {
    if (Test-StateExists) { [System.IO.File]::Delete($script:StateFile) }
}

# Serialises start, stop and the watcher's cleanup. Released by the OS if the process dies.
# Waits as long as another process holds the lock; any other problem is given up on.
function Enter-Lock {
    $path = [System.IO.Path]::Combine($script:StateDir, 'lock')
    $announced = $false
    $failures = 0
    while ($true) {
        try {
            return [System.IO.File]::Open($path, [System.IO.FileMode]::OpenOrCreate,
                [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        } catch {
            $problem = $_.Exception.GetBaseException()
            if (Test-HeldByAnother $problem) {
                $failures = 0
                if (-not $announced) {
                    Say 'Waiting for another MyInnoX1 start or stop to finish...'
                    $announced = $true
                }
            } else {
                $failures++
                if ($failures -ge 10) {
                    Fail ("Cannot lock the launcher: $($problem.Message) " +
                        "Check the permissions of this file, or delete it, then try again: $path")
                }
            }
            Start-Sleep -Milliseconds 500
        }
    }
}

# A sharing or lock violation. Elsewhere than on Windows the code is the system's "try again".
function Test-HeldByAnother($Problem) {
    if (-not ($Problem -is [System.IO.IOException])) { return $false }
    if ($script:OnWindows) { return (@(32, 33) -contains ($Problem.HResult -band 0xFFFF)) }
    return (@(11, 35) -contains $Problem.HResult)
}

# ---------------------------------------------------------------------------
# Docker, Compose and the app
# ---------------------------------------------------------------------------

function Initialize-Docker {
    Add-SearchPath
    $script:Docker = Find-Tool 'docker'
    if (-not $script:Docker) {
        Fail ('Docker was not found. Install Docker Desktop, or Rancher Desktop with the dockerd (moby) engine. ' +
            'Then start MyInnoX1 again. If you have just installed it, sign out of Windows and back in first.')
    }
    # Compose derives the project name from the folder name and fails if nothing usable is left.
    if (-not $env:COMPOSE_PROJECT_NAME -and
        [System.IO.Path]::GetFileName($script:RepoDir) -notmatch '[A-Za-z0-9]') {
        $env:COMPOSE_PROJECT_NAME = 'myinnox1'
    }
}

function Test-Engine {
    # Some Docker versions exit 0 from "info" without a server, so ask for a server value.
    $result = Invoke-Tool $script:Docker @('info', '--format', '{{.ServerVersion}}')
    return ($result.Code -eq 0 -and $result.Out -ne '')
}

function Get-DockerContext {
    $result = Invoke-Tool $script:Docker @('context', 'show')
    if ($result.Code -eq 0 -and $result.Out -cmatch $script:ContextPattern) { return $result.Out }
    return ''
}

function Assert-ComposeVersion {
    $result = Invoke-Tool $script:Docker @('compose', 'version', '--short')
    if ($result.Code -ne 0 -or $result.Out -notmatch '^v?(\d+)\.(\d+)\.(\d+)') {
        Fail ('Docker Compose 2.24.4 or newer is needed, and its version could not be read. ' +
            'Update Docker Desktop or Rancher Desktop. ' + $result.Error)
    }
    $found = New-Object System.Version([int] $Matches[1], [int] $Matches[2], [int] $Matches[3])
    if ($found -lt (New-Object System.Version(2, 24, 4))) {
        Fail ("Docker Compose $found is too old: 2.24.4 or newer is needed. " +
            'Update Docker Desktop or Rancher Desktop, then try again.')
    }
}

function Get-ComposeArguments([string[]] $Rest) {
    return @('compose', '-f', $script:ComposeBase, '-f', $script:ComposeOverride) + $Rest
}

# Runs Compose with its output on screen, so that a slow first build shows progress.
function Invoke-ComposeVisible([string[]] $Rest) {
    $ErrorActionPreference = 'Continue'
    $arguments = Get-ComposeArguments $Rest
    $global:LASTEXITCODE = $null
    & $script:Docker @arguments | Out-Host
    if ($null -eq $global:LASTEXITCODE) { return 127 }
    return $global:LASTEXITCODE
}

function Show-Logs {
    Say ''
    Say 'Last lines of the app log:'
    [void] (Invoke-ComposeVisible @('logs', '--tail', '40', $script:Service))
}

# Returns the ID of this project's container, or '' when there is none.
function Get-AppContainer {
    $result = Invoke-Tool $script:Docker (Get-ComposeArguments @('ps', '-a', '-q', $script:Service))
    if ($result.Code -ne 0) { Fail ('Docker Compose could not list the app container. ' + $result.Error) }
    foreach ($line in ($result.Out -split "`n")) {
        if ($line.Trim() -cmatch $script:IdPattern) { return $line.Trim() }
    }
    return ''
}

function Get-ContainerInfo([string] $Id) {
    $info = New-Object psobject -Property @{ Status = ''; ExitCode = ''; StartedAt = '' }
    if (-not $Id) { return $info }
    $format = '{{.State.Status}} {{.State.ExitCode}} {{.State.StartedAt}}'
    $result = Invoke-Tool $script:Docker @('inspect', '--format', $format, $Id)
    if ($result.Code -eq 0 -and $result.Out -match '^(\S+) (-?\d+) (\S+)$') {
        $info.Status = $Matches[1]
        $info.ExitCode = $Matches[2]
        $startedAt = $Matches[3]
        if ($startedAt -cmatch $script:TimePattern) { $info.StartedAt = $startedAt }
    }
    return $info
}

# Is this the very run of the container that the launcher recorded?
function Test-RecordedRun($State, [string] $Id, $Info) {
    return ($Id -and $State.container_id -ceq $Id -and
        $State.container_started_at -and $State.container_started_at -ceq $Info.StartedAt)
}

# Talk to the engine that start used. DOCKER_HOST would override the context.
function Use-RecordedEngine($State) {
    if ($State.engine -ne 'none') { Remove-Item -LiteralPath 'Env:\DOCKER_HOST' -ErrorAction SilentlyContinue }
    if ($State.context) { $env:DOCKER_CONTEXT = $State.context }
}

# Is anything listening on port 8787?
function Test-PortBusy {
    if ($env:MYINNOX1_CURL) {
        return ((Invoke-Tool $env:MYINNOX1_CURL @($script:AppUrl)).Code -eq 0)
    }
    # A TCP connection, so that a slow or non-HTTP program counts too. "localhost" is both addresses.
    foreach ($address in @('127.0.0.1', '::1')) {
        $ip = [System.Net.IPAddress]::Parse($address)
        $client = $null
        try {
            $client = New-Object System.Net.Sockets.TcpClient($ip.AddressFamily)
            $pending = $client.BeginConnect($ip, 8787, $null, $null)
            if ($pending.AsyncWaitHandle.WaitOne(3000)) {
                $client.EndConnect($pending)
                return $true
            }
        } catch {
        } finally {
            if ($client) { $client.Close() }
        }
    }
    return $false
}

function Test-AppAnswers {
    $body = $null
    if ($env:MYINNOX1_CURL) {
        $result = Invoke-Tool $env:MYINNOX1_CURL @($script:StatusUrl)
        if ($result.Code -eq 0) { $body = $result.Out }
    } else {
        $response = $null
        try {
            $request = [System.Net.WebRequest]::Create($script:StatusUrl)
            $request.Proxy = $null
            $request.Timeout = 3000
            $response = $request.GetResponse()
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
            $body = $reader.ReadToEnd()
        } catch {
        } finally {
            if ($response) { $response.Close() }
        }
    }
    if (-not $body) { return $false }
    try { return (($body | ConvertFrom-Json).app -eq 'myinnox1') } catch { return $false }
}

# ---------------------------------------------------------------------------
# Engines
# ---------------------------------------------------------------------------

# Judged by the program file, without running anything. Only used to notice a second engine:
# whether Docker Desktop can be started is learned from "docker desktop start" itself.
function Test-DockerDesktopInstalled {
    if (Test-Path -LiteralPath 'Env:\MYINNOX1_DOCKER_APP') {
        $candidates = @($env:MYINNOX1_DOCKER_APP)
    } else {
        $candidates = @()
        foreach ($root in @($env:ProgramW6432, $env:ProgramFiles)) {
            if ($root) { $candidates += "$root\Docker\Docker\Docker Desktop.exe" }
        }
        if ($env:LOCALAPPDATA) { $candidates += "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe" }
    }
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $true }
    }
    return $false
}

# Which engine to start, or 'none' when the user has to do it.
function Select-Engine([string] $Context) {
    if ($env:DOCKER_HOST) { return 'none' }
    if ($Context -ceq 'desktop-linux') { return 'docker-desktop' }
    if ($Context -ceq 'rancher-desktop') {
        if (Find-Tool 'rdctl') { return 'rancher-desktop' }
        return 'none'
    }
    if ($Context -cne 'default') { return 'none' }
    if (-not (Find-Tool 'rdctl')) {
        # With no other engine, try Docker Desktop even if it is installed in another folder.
        return 'docker-desktop'
    }
    if (Test-DockerDesktopInstalled) { return 'none' }
    return 'rancher-desktop'
}

# 'present', 'absent', or 'unknown' when the check itself fails.
function Get-ProcessPresence([string] $Name) {
    if ($env:MYINNOX1_PROCESS_CHECK) {
        $code = (Invoke-Tool $env:MYINNOX1_PROCESS_CHECK @($Name)).Code
        if ($code -eq 0) { return 'present' }
        if ($code -eq 1) { return 'absent' }
        return 'unknown'
    }
    try {
        $found = @(Get-Process -ErrorAction Stop | Where-Object { $_.ProcessName -eq $Name })
        if ($found.Count -gt 0) { return 'present' }
        return 'absent'
    } catch {
        return 'unknown'
    }
}

# 'open' (the user's, perhaps still starting), 'closed' (safe to start and claim), or 'unknown'.
function Get-EngineAppState([string] $Engine) {
    if ($Engine -eq 'docker-desktop') {
        $presence = Get-ProcessPresence 'Docker Desktop'
        if ($presence -eq 'present') { return 'open' }
        $result = Invoke-Tool $script:Docker @('desktop', 'status')
        $open = ($result.Code -eq 0 -and
            $result.Out -match ('(?i)status[^A-Za-z0-9\r\n]+(running|starting|paused)\b'))
    } else {
        $presence = Get-ProcessPresence 'Rancher Desktop'
        if ($presence -eq 'present') { return 'open' }
        $open = ((Invoke-Tool (Find-Tool 'rdctl') @('list-settings')).Code -eq 0)
    }
    if ($open) { return 'open' }
    if ($presence -eq 'absent') { return 'closed' }
    return 'unknown'
}

# Docker Desktop can hide Kubernetes containers from "docker ps". Returns '' only when its settings
# say that Kubernetes is disabled, and otherwise why that is not certain.
function Get-KubernetesDoubt {
    if (Test-Path -LiteralPath 'Env:\MYINNOX1_DOCKER_SETTINGS') {
        $path = $env:MYINNOX1_DOCKER_SETTINGS
    } else {
        $path = ''
        if ($env:APPDATA) {
            $folder = [System.IO.Path]::Combine($env:APPDATA, 'Docker')
            # settings.json is the name before Docker Desktop 4.35. A newer file wins.
            $path = [System.IO.Path]::Combine($folder, 'settings-store.json')
            if (-not [System.IO.File]::Exists($path)) { $path = [System.IO.Path]::Combine($folder, 'settings.json') }
        }
    }
    try {
        $settings = [System.IO.File]::ReadAllText($path) | ConvertFrom-Json
        # Property names are matched without case: KubernetesEnabled, formerly kubernetesEnabled.
        $property = $settings.PSObject.Properties['KubernetesEnabled']
    } catch {
        return 'the Docker Desktop settings could not be read, so Kubernetes may be in use'
    }
    if (-not $property) { return 'the Docker Desktop settings do not show that Kubernetes is disabled' }
    if ($property.Value -is [bool] -and -not $property.Value) { return '' }
    return 'Kubernetes is enabled in Docker Desktop'
}

function Start-Engine([string] $Engine) {
    if ($Engine -eq 'docker-desktop') {
        Say 'Starting Docker Desktop...'
        $code = Invoke-Detached $script:Docker 'desktop start --detach'
        $name = 'Docker Desktop'
    } else {
        Say 'Starting Rancher Desktop...'
        $code = Invoke-Detached (Find-Tool 'rdctl') 'start'
        $name = 'Rancher Desktop'
    }
    if ($code -eq 0) { return }
    if ($Engine -eq 'docker-desktop') {
        Fail ("$name did not start (exit code $code). The likely cause is an older version: " +
            'starting it from here needs Docker Desktop 4.37 or newer. ' +
            'Update it, or open it yourself, then run Start again.')
    }
    Fail "$name did not start (exit code $code). Open it yourself, then run Start again."
}

function Wait-Engine {
    $timeout = Get-Seconds 'MYINNOX1_ENGINE_TIMEOUT' 180
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $nextNote = 0
    while ($true) {
        if (Test-Engine) { return }
        if ($watch.Elapsed.TotalSeconds -ge $timeout) {
            Fail ("The container engine did not become ready within $timeout seconds. Check its window, then try again. " +
                'Rancher Desktop must use the dockerd (moby) engine.')
        }
        if ($watch.Elapsed.TotalSeconds -ge $nextNote) {
            Say 'Waiting for the container engine...'
            $nextNote += 10
        }
        Start-Sleep -Seconds 1
    }
}

# ---------------------------------------------------------------------------
# Watcher process
# ---------------------------------------------------------------------------

function Get-ProcessCommandLine([int] $Id) {
    try {
        if ($script:OnWindows) {
            $found = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $Id" -ErrorAction Stop
            if ($found) { return [string] $found.CommandLine }
            return ''
        }
        if ([System.IO.File]::Exists("/proc/$Id/cmdline")) {
            return [System.IO.File]::ReadAllText("/proc/$Id/cmdline").Replace([string] [char] 0, ' ')
        }
        return [string] (Get-Process -Id $Id -ErrorAction Stop).CommandLine
    } catch {
        return ''
    }
}

# Is the recorded process alive, and is it this launcher's watcher for this container?
function Test-WatcherAlive($State, [string] $Id) {
    if (-not $State.watcher_pid -or $State.container_id -cne $Id) { return $false }
    $line = Get-ProcessCommandLine ([int] $State.watcher_pid)
    if (-not $line) { return $false }
    if ($line.IndexOf($script:ScriptPath, [StringComparison]::OrdinalIgnoreCase) -lt 0) { return $false }
    return ($line -cmatch ('\swatch\s+' + $Id + '(\s|$)'))
}

function Start-Watcher([string] $Id) {
    $shell = (Get-Process -Id $PID).Path
    if ([System.IO.Path]::GetFileNameWithoutExtension($shell) -notmatch '^(powershell|pwsh)$') {
        $leaf = 'powershell.exe'
        if ($PSVersionTable.PSVersion.Major -ge 6) { $leaf = 'pwsh' }
        $shell = [System.IO.Path]::Combine($PSHOME, $leaf)
    }
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.WorkingDirectory = $script:StateDir
    if ($script:OnWindows) {
        # Through the shell: a new, visible, minimised window that inherits no handles.
        # A Windows path cannot contain a double quote, so quoting it is enough.
        $info.FileName = $shell
        $info.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $script:ScriptPath + '" watch ' + $Id
        $info.UseShellExecute = $true
        $info.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Minimized
    } else {
        # Only used by the tests on other systems (PowerShell 7).
        $info.FileName = '/bin/sh'
        $info.UseShellExecute = $false
        foreach ($argument in @('-c', 'exec "$0" "$@" </dev/null >/dev/null 2>&1', $shell,
                '-NoProfile', '-File', $script:ScriptPath, 'watch', $Id)) {
            $info.ArgumentList.Add($argument)
        }
    }
    return [System.Diagnostics.Process]::Start($info).Id
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

function Invoke-Start {
    Initialize-Docker
    $state = Read-State
    $engine = 'none'
    $started = '0'
    $engineWasRunning = Test-Engine

    if (-not $engineWasRunning) {
        # Whatever was started before is gone. Forget it first, so that a start that fails, is
        # refused or is interrupted cannot leave a claim on an engine that the user opens later.
        if ($state.engine_started -eq '1') {
            $state.engine_started = '0'
            Write-State $state
        }
        $context = Get-DockerContext
        $engine = Select-Engine $context
        if ($engine -eq 'none') {
            Fail ('The container engine is not running, and MyInnoX1 cannot tell which one to start. ' +
                'Start your container engine yourself, then run Start again.')
        }
        $application = Get-EngineAppState $engine
        if ($application -eq 'open') {
            Say 'The container engine is already open. Waiting for it. It will be left running afterwards.'
            $engineWasRunning = $true
        } else {
            Start-Engine $engine
            # Claimed only now that the command succeeded. Recorded further down, once the app
            # container exists: a Start that fails before that claims nothing.
            if ($application -eq 'closed') {
                $started = '1'
            } else {
                Say 'It cannot be confirmed that the engine was closed, so it will be left running afterwards.'
            }
        }
        Wait-Engine
    }

    # Read again: Docker Desktop switches the context when it starts.
    $context = Get-DockerContext

    # Ownership of an engine that was already running survives only for the very container run
    # that the launcher recorded, in the same context. Otherwise it is dropped here, before any
    # check that can fail. The rest of the record changes only after those checks.
    $kept = $false
    if ($engineWasRunning) {
        $kept = [bool] (-not $env:DOCKER_HOST -and $context -and $state.context -ceq $context)
        if ($kept) {
            $recorded = Get-ContainerInfo $state.container_id
            $kept = [bool] ($recorded.Status -eq 'running' -and
                (Test-RecordedRun $state $state.container_id $recorded))
        }
        if (-not $kept -and $state.engine_started -eq '1') {
            $state.engine_started = '0'
            Write-State $state
        }
    }
    if ($context) { $env:DOCKER_CONTEXT = $context }

    Assert-ComposeVersion
    $existing = Get-AppContainer
    $info = Get-ContainerInfo $existing
    $running = ($info.Status -eq 'running')

    if (-not $running -and (Test-PortBusy)) {
        Fail ('Port 8787 is in use by another program, or by another copy of MyInnoX1. ' +
            'Close it, then start MyInnoX1 again.')
    }

    if ($engineWasRunning) {
        if ($kept -and (Test-RecordedRun $state $existing $info)) {
            $engine = $state.engine
            $started = $state.engine_started
        } else {
            $engine = 'none'
            $started = '0'
        }
    }

    Say 'Starting MyInnoX1. The first time can take several minutes...'
    $code = Invoke-ComposeVisible @('up', '-d', '--build')
    if ($code -ne 0) {
        Show-Logs
        Fail "Docker Compose could not start the app (exit code $code). See the messages above."
    }

    $id = Get-AppContainer
    if (-not $id) {
        Show-Logs
        Fail 'The app container was not found after starting it.'
    }

    # Only now is the new engine, context and container recorded.
    $previous = $state
    $state = New-State
    $state.engine = $engine
    $state.context = $context
    $state.engine_started = $started
    $state.container_id = $id
    if (Test-RecordedRun $previous $id (Get-ContainerInfo $id)) {
        $state.container_started_at = $previous.container_started_at
    }
    if (Test-WatcherAlive $previous $id) { $state.watcher_pid = $previous.watcher_pid }
    Write-State $state

    $timeout = Get-Seconds 'MYINNOX1_APP_TIMEOUT' 60
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    while (-not (Test-AppAnswers)) {
        $status = (Get-ContainerInfo $id).Status
        if ($status -eq 'exited' -or $status -eq 'dead') {
            Show-Logs
            Fail 'The app stopped while starting.'
        }
        if ($watch.Elapsed.TotalSeconds -ge $timeout) {
            Show-Logs
            Fail "The app did not answer within $timeout seconds."
        }
        Start-Sleep -Seconds 1
    }

    # The app is up: record which run of the container this is.
    $state.container_started_at = (Get-ContainerInfo $id).StartedAt
    Write-State $state

    if (-not $state.watcher_pid) {
        try {
            $state.watcher_pid = [string] (Start-Watcher $id)
            Write-State $state
        } catch {
            Say ('Warning: the watcher could not be started, so the Stop button will leave the engine running. ' +
                'Use Stop MyInnoX1 instead. ' + $_.Exception.Message)
        }
    }

    Say "MyInnoX1 is running at $($script:AppUrl)"
    if ($env:MYINNOX1_NO_BROWSER -ne '1') {
        try { Start-Process $script:AppUrl }
        catch { Say "Open $($script:AppUrl) in your browser." }
    }
}

# Shared by "stop" and the watcher. The caller holds the lock.
function Invoke-Cleanup {
    $state = Read-State
    Use-RecordedEngine $state

    if (-not (Test-Engine)) {
        Say 'The container engine is not running, so there is nothing to stop.'
        Clear-State
        return
    }
    Assert-ComposeVersion

    $wasUp = $false
    $ours = $false
    try {
        $id = Get-AppContainer
        $info = Get-ContainerInfo $id
        $wasUp = ($info.Status -eq 'running' -or ($info.Status -eq 'exited' -and $info.ExitCode -eq '42'))
        $ours = [bool] (Test-RecordedRun $state $id $info)
    } catch {
        Say $_.Exception.Message
    }

    Say 'Stopping MyInnoX1...'
    $code = Invoke-ComposeVisible @('down')
    if ($code -ne 0) {
        Fail "Docker Compose could not stop the app (exit code $code). The container engine was left running."
    }
    Say 'MyInnoX1 has stopped.'

    $reason = ''
    $others = $null
    $contextMatches = (($state.engine -eq 'docker-desktop' -and $state.context -ceq 'desktop-linux') -or
        ($state.engine -eq 'rancher-desktop' -and @('rancher-desktop', 'default') -ccontains $state.context))
    if ($state.engine_started -ne '1') {
        $reason = 'the launcher did not start it'
    } elseif (-not $wasUp) {
        $reason = 'MyInnoX1 was not running'
    } elseif (-not $ours) {
        $reason = 'this is not the run of MyInnoX1 that the launcher recorded'
    } elseif (-not $contextMatches) {
        $reason = 'it cannot be confirmed which engine the launcher started'
    } else {
        $others = Invoke-Tool $script:Docker @('ps', '-q')
        if ($others.Code -ne 0) { $reason = 'the list of running containers could not be read' }
        elseif ($others.Out -ne '') { $reason = 'other containers are running' }
        elseif ($state.engine -eq 'docker-desktop') { $reason = Get-KubernetesDoubt }
    }
    if ($reason) {
        Say "The container engine was left running: $reason."
        Clear-State
        return
    }

    if ($state.engine -eq 'docker-desktop') {
        Say 'Stopping Docker Desktop...'
        $code = Invoke-Detached $script:Docker 'desktop stop'
    } else {
        $rdctl = Find-Tool 'rdctl'
        if (-not $rdctl) {
            Clear-State
            Say 'The container engine was left running: rdctl was not found.'
            return
        }
        Say 'Stopping Rancher Desktop...'
        $code = Invoke-Detached $rdctl 'shutdown'
    }
    Clear-State
    if ($code -ne 0) { Fail "The container engine could not be stopped (exit code $code). Close it yourself." }
    Say 'The container engine has stopped.'
}

function Invoke-Watch([string] $Id) {
    $script:LogFile = [System.IO.Path]::Combine($script:StateDir, 'watcher.log')
    try { $Host.UI.RawUI.WindowTitle = 'MyInnoX1' } catch { }
    Say "Watching container $Id"
    Say 'Keep this window minimised. It closes by itself when MyInnoX1 stops.'
    Initialize-Docker
    while ($true) {
        # Read under the lock: a start may still be writing the state.
        $lock = Enter-Lock
        try { $state = Read-State } finally { $lock.Dispose() }
        if ($state.container_id -ceq $Id) { Use-RecordedEngine $state }

        $result = Invoke-Tool $script:Docker @('wait', $Id)
        if ($result.Code -ne 0 -or $result.Out -notmatch '^\d+$') {
            Fail ("Lost track of the app (docker wait exit code $($result.Code)). " +
                'The container engine was not touched. ' + $result.Error)
        }
        if ($result.Out -ne '42') {
            Say "The app ended with exit code $($result.Out), which is not a stop request. Nothing else to do."
            return
        }

        Say 'Stop was requested from the dashboard.'
        $lock = Enter-Lock
        try {
            # A newer start, or a finished stop, may have happened while waiting.
            if ((Read-State).container_id -cne $Id) {
                Say 'This container is no longer the recorded one. Nothing to do.'
                return
            }
            if ((Get-ContainerInfo $Id).Status -ne 'running') {
                Invoke-Cleanup
                return
            }
        } finally {
            $lock.Dispose()
        }
        Say 'The app is running again. Watching it again.'
    }
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

$exitCode = 0
try {
    if ($Command -eq 'start' -or $Command -eq 'stop') {
        Initialize-State
        $lock = Enter-Lock
        try {
            if ($Command -eq 'start') {
                Invoke-Start
            } else {
                Initialize-Docker
                Invoke-Cleanup
            }
        } finally {
            $lock.Dispose()
        }
    } elseif ($Command -eq 'watch' -and $ContainerId -cmatch $script:IdPattern) {
        Initialize-State
        Invoke-Watch $ContainerId
    } else {
        Say 'Usage: launcher.ps1 start | stop | watch <containerId>'
        $exitCode = 2
    }
} catch {
    Say ''
    if ($_.Exception.Data.Contains('MyInnoX1')) {
        Say ('Error: ' + $_.Exception.Message)
    } else {
        Say ('Unexpected error: ' + $_.Exception.Message)
        Say $_.InvocationInfo.PositionMessage
    }
    $exitCode = 1
}
exit $exitCode
