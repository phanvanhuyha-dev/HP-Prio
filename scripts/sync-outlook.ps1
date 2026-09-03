<#
.SYNOPSIS
    Tự động đọc lịch họp hôm nay và ngày mai từ Outlook Classic (MAPI COM) và đẩy lên HP Prio.
.DESCRIPTION
    Script kết nối trực tiếp vào ứng dụng Outlook trên máy tính qua giao diện COM,
    không cần xin quyền Microsoft Entra ID hay mở tính năng Calendar Publishing.
    Có thể chạy thủ công hoặc kích hoạt tự động qua Windows Task Scheduler.
#>

param(
    [string]$AppUrl,
    [string]$SyncToken
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile = Join-Path $scriptDir "sync-outlook.log"
$configFile = Join-Path $scriptDir "sync-config.json"

function Write-Log {
    param([string]$Message)
    $timeStr = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $logLine = "[$timeStr] $Message"
    Write-Output $logLine
    try {
        Add-Content -Path $logFile -Value $logLine -Encoding UTF8
    } catch {}
}

# 1. Đọc cấu hình từ file json nếu không truyền tham số
if (-not $AppUrl -or -not $SyncToken) {
    if (Test-Path $configFile) {
        try {
            $cfg = Get-Content -Path $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
            if (-not $AppUrl -and $cfg.appUrl) { $AppUrl = $cfg.appUrl }
            if (-not $SyncToken -and $cfg.syncToken) { $SyncToken = $cfg.syncToken }
        } catch {
            Write-Log "CẢNH BÁO: Không đọc được file cấu hình sync-config.json: $($_.Exception.Message)"
        }
    }
}

# Chuẩn hóa URL
if (-not $AppUrl) {
    Write-Log "LỖI: Chưa cung cấp AppUrl. Vui lòng cấu hình trong scripts/sync-config.json hoặc truyền qua tham số -AppUrl"
    exit 1
}
$AppUrl = $AppUrl.TrimEnd('/')
$endpoint = "$AppUrl/api/calendar/sync"

if (-not $SyncToken) {
    Write-Log "LỖI: Chưa cung cấp SyncToken. Vui lòng cấu hình trong scripts/sync-config.json hoặc truyền qua tham số -SyncToken"
    exit 1
}

Write-Log "Bắt đầu quét lịch họp từ Outlook Classic..."

# 2. Kết nối Outlook qua COM
$outlook = $null
try {
    $outlook = New-Object -ComObject Outlook.Application
} catch {
    Write-Log "LỖI: Không thể khởi tạo đối tượng Outlook.Application COM: $($_.Exception.Message)"
    exit 1
}

$namespace = $outlook.GetNamespace("MAPI")

# Tìm thư mục Lịch (ưu tiên tài khoản email công ty)
$calFolder = $null
foreach ($f in $namespace.Folders) {
    try {
        $candidate = $f.Folders.Item("Calendar")
        if ($null -ne $candidate -and $candidate.Items.Count -gt 0) {
            $calFolder = $candidate
            Write-Log "Đã chọn thư mục Lịch của tài khoản: $($f.Name)"
            break
        }
    } catch {}
}

if ($null -eq $calFolder) {
    try {
        $calFolder = $namespace.GetDefaultFolder(9) # 9 = olFolderCalendar
        Write-Log "Đã chọn thư mục Lịch mặc định của hệ thống"
    } catch {
        Write-Log "LỖI: Không tìm thấy thư mục Lịch nào trong Outlook"
        exit 1
    }
}

$items = $calFolder.Items
$items.IncludeRecurrences = $true
$items.Sort("[Start]")

# Xác định khung thời gian: Từ 00:00 hôm nay đến 23:59 ngày mai (giờ địa phương)
$today = (Get-Date).Date
$tomorrowEnd = $today.AddDays(2).AddSeconds(-1)

# Thử lọc bằng Restrict của MAPI
$matchedItems = @()
$filtered = $null

$jetDate1 = $today.ToString("dd-MMM-yy 00:00")
$jetDate2 = $tomorrowEnd.ToString("dd-MMM-yy 23:59")
try {
    $filtered = $items.Restrict("[Start] >= '$jetDate1' AND [Start] <= '$jetDate2'")
    foreach ($item in $filtered) {
        $matchedItems += $item
    }
} catch {
    Write-Log "Không dùng được bộ lọc Restrict, chuyển sang duyệt tuần tự: $($_.Exception.Message)"
}

# Nếu Restrict trả về 0 sự kiện, duyệt tuần tự để đảm bảo không sót do lệch định dạng ngày
if ($matchedItems.Count -eq 0) {
    $matchedItems = @()
    foreach ($item in $items) {
        try {
            if ($item.Start -ge $today -and $item.Start -le $tomorrowEnd) {
                $matchedItems += $item
            } elseif ($item.Start -gt $tomorrowEnd) {
                # Danh sách đã sort theo Start, nếu vượt quá ngày mai thì dừng
                break
            }
        } catch {}
    }
}

Write-Log "Tìm thấy $($matchedItems.Count) cuộc họp trong hôm nay và ngày mai"

# Chuẩn bị dữ liệu gửi đi
$payloadEvents = @()
foreach ($item in $matchedItems) {
    try {
        $subj = [string]$item.Subject
        if ([string]::IsNullOrWhiteSpace($subj)) { $subj = "(Cuộc họp không có tiêu đề)" }

        # Convert sang UTC ISO 8601
        $startUtc = $item.Start.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        $endUtc = $item.End.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        $allDay = [bool]$item.AllDayEvent

        $payloadEvents += @{
            tieuDe  = $subj
            batDau  = $startUtc
            ketThuc = $endUtc
            caNgay  = $allDay
        }
        Write-Log "  - [$($item.Start.ToString('dd/MM HH:mm'))] $subj"
    } catch {
        Write-Log "  Bỏ qua 1 mục lỗi: $($_.Exception.Message)"
    }
}

$bodyJson = @{
    suKien = $payloadEvents
} | ConvertTo-Json -Depth 3

# Gửi HTTP POST lên HP Prio
Write-Log "Đang gửi dữ liệu lên endpoint: $endpoint..."
try {
    $headers = @{
        "Authorization" = "Bearer $SyncToken"
        "Content-Type"  = "application/json; charset=utf-8"
    }
    
    $response = Invoke-RestMethod -Uri $endpoint -Method POST -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($bodyJson))
    Write-Log "ĐỒNG BỘ THÀNH CÔNG! Kết quả máy chủ: Số lượng = $($response.soLuong), Ngày = $($response.cacNgay -join ', ')"
} catch {
    Write-Log "LỖI KHI GỌI API HP PRIO: $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) {
        Write-Log "Chi tiết lỗi: $($_.ErrorDetails.Message)"
    }
    exit 1
}
