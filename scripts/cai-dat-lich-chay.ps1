<#
.SYNOPSIS
    Tự động đăng ký tác vụ chạy định kỳ vào Windows Task Scheduler cho HP Prio.
.DESCRIPTION
    Tạo tác vụ chạy lúc 8:00 sáng mỗi ngày và mỗi khi đăng nhập vào Windows.
    Kịch bản chạy ẩn dưới nền (WindowStyle Hidden) không làm gián đoạn công việc.
#>

param(
    [switch]$GoBo
)

$taskName = "HPPrio_SyncCalendar"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetScript = Join-Path $scriptDir "sync-outlook.ps1"

if ($GoBo) {
    Write-Host "Đang gỡ bỏ tác vụ '$taskName'..." -ForegroundColor Yellow
    try {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
        Write-Host "Đã gỡ bỏ tác vụ thành công!" -ForegroundColor Green
    } catch {
        Write-Host "Lỗi hoặc tác vụ không tồn tại: $($_.Exception.Message)" -ForegroundColor Red
    }
    exit 0
}

Write-Host "=== Cài đặt lịch tự động đồng bộ Outlook sang HP Prio ===" -ForegroundColor Cyan

if (-not (Test-Path $targetScript)) {
    Write-Host "LỖI: Không tìm thấy file script tại: $targetScript" -ForegroundColor Red
    exit 1
}

# 1. Hành động: Chạy powershell với cờ ẩn cửa sổ
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$targetScript`""

# 2. Bộ kích hoạt: 8:00 sáng mỗi ngày + Khi người dùng đăng nhập
$triggerDaily = New-ScheduledTaskTrigger -Daily -At "08:00"
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# 3. Cài đặt tác vụ: Cho phép chạy bằng pin, thức dậy để chạy
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

try {
    # Hủy tác vụ cũ nếu đã có
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

    # Đăng ký tác vụ mới
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger @($triggerDaily, $triggerLogon) `
        -Settings $settings `
        -Description "Tự động đồng bộ lịch họp Outlook Classic sang HP Prio" `
        -ErrorAction Stop | Out-Null

    Write-Host "ĐÃ ĐĂNG KÝ TÁC VỤ THÀNH CÔNG!" -ForegroundColor Green
    Write-Host "- Tên tác vụ: $taskName"
    Write-Host "- Thời gian chạy: 8:00 sáng mỗi ngày VÀ mỗi khi mở máy đăng nhập"
    Write-Host "- Lệnh thực thi: powershell.exe -File `"$targetScript`""
    Write-Host ""
    Write-Host "Để kiểm tra hoặc chạy thử ngay, anh có thể mở Task Scheduler hoặc chạy lệnh:" -ForegroundColor Yellow
    Write-Host "Start-ScheduledTask -TaskName `"$taskName`"" -ForegroundColor White
} catch {
    Write-Host "LỖI KHI ĐĂNG KÝ TÁC VỤ: $($_.Exception.Message)" -ForegroundColor Red
}
