<#
.SYNOPSIS
    Tu dong dang ky tac vu chay dinh ky vao Windows Task Scheduler cho HP Prio.
.DESCRIPTION
    Tao tac vu chay luc 8:00 sang moi ngay va moi khi dang nhap vao Windows.
    Kich ban chay an duoi nen (WindowStyle Hidden) khong lam gian doan cong viec.
#>

param(
    [switch]$GoBo
)

$taskName = "HPPrio_SyncCalendar"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetScript = Join-Path $scriptDir "sync-outlook.ps1"

if ($GoBo) {
    Write-Host "Dang go bo tac vu '$taskName'..." -ForegroundColor Yellow
    try {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
        Write-Host "Da go bo tac vu thanh cong!" -ForegroundColor Green
    } catch {
        $msg = $_.Exception.Message
        Write-Host "Loi hoac tac vu khong ton tai: $msg" -ForegroundColor Red
    }
    exit 0
}

Write-Host "=== Cai dat lich tu dong dong bo Outlook sang HP Prio ===" -ForegroundColor Cyan

if (-not (Test-Path $targetScript)) {
    Write-Host "LOI: Khong tim thay file script tai: $targetScript" -ForegroundColor Red
    exit 1
}

# 1. Hanh dong: Chay powershell voi co an cua so
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$targetScript`""

# 2. Bo kich hoat: 8:00 sang moi ngay + Khi nguoi dung dang nhap
$triggerDaily = New-ScheduledTaskTrigger -Daily -At "08:00"
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# 3. Cai dat tac vu: Cho phep chay bang pin, chay ngay khi kha dung
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

try {
    # Huy tac vu cu neu da co
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

    # Dang ky tac vu moi
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger @($triggerDaily, $triggerLogon) `
        -Settings $settings `
        -Description "Tu dong dong bo lich hop Outlook Classic sang HP Prio" `
        -ErrorAction Stop | Out-Null

    Write-Host "DA DANG KY TAC VU THANH CONG!" -ForegroundColor Green
    Write-Host "- Ten tac vu: $taskName"
    Write-Host "- Thoi gian chay: 8:00 sang moi ngay VA moi khi mo may dang nhap"
    Write-Host "- Lenh thuc thi: powershell.exe -File `"$targetScript`""
    Write-Host ""
    Write-Host "De chay thu ngay tac vu nen, anh co the chay lenh:" -ForegroundColor Yellow
    Write-Host "Start-ScheduledTask -TaskName `"$taskName`"" -ForegroundColor White
} catch {
    $errMsg = $_.Exception.Message
    Write-Host "LOI KHI DANG KY TAC VU: $errMsg" -ForegroundColor Red
}
