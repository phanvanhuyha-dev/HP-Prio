<#
.SYNOPSIS
    Tu dong doc lich hop hom nay va ngay mai tu Outlook Classic (MAPI COM) va day len HP Prio.
.DESCRIPTION
    Script ket noi truc tiep vao ung dung Outlook tren may tinh qua giao dien COM,
    khong can xin quyen Microsoft Entra ID hay mo tinh nang Calendar Publishing.
    Co the chay thu cong hoac kich hoat tu dong qua Windows Task Scheduler.
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

# 1. Doc cau hinh tu file json neu khong truyen tham so
if (-not $AppUrl -or -not $SyncToken) {
    if (Test-Path $configFile) {
        try {
            $cfg = Get-Content -Path $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
            if (-not $AppUrl -and $cfg.appUrl) { $AppUrl = $cfg.appUrl }
            if (-not $SyncToken -and $cfg.syncToken) { $SyncToken = $cfg.syncToken }
        } catch {
            Write-Log "CANH BAO: Khong doc duoc file cau hinh sync-config.json: $($_.Exception.Message)"
        }
    }
}

# Chuan hoa URL
if (-not $AppUrl) {
    Write-Log "LOI: Chua cung cap AppUrl. Vui long cau hinh trong scripts/sync-config.json hoac truyen qua tham so -AppUrl"
    exit 1
}
$AppUrl = $AppUrl.TrimEnd('/')
$endpoint = "$AppUrl/api/calendar/sync"

if (-not $SyncToken) {
    Write-Log "LOI: Chua cung cap SyncToken. Vui long cau hinh trong scripts/sync-config.json hoac truyen qua tham so -SyncToken"
    exit 1
}

Write-Log "Bat dau quet lich hop tu Outlook Classic..."

# 2. Ket noi Outlook qua COM
$outlook = $null
try {
    $outlook = New-Object -ComObject Outlook.Application
} catch {
    Write-Log "LOI: Khong the khoi tao doi tuong Outlook.Application COM: $($_.Exception.Message)"
    exit 1
}

$namespace = $outlook.GetNamespace("MAPI")

# Tim thu muc Lich (uu tien tai khoan email cong ty)
$calFolder = $null
foreach ($f in $namespace.Folders) {
    try {
        $candidate = $f.Folders.Item("Calendar")
        if ($null -ne $candidate -and $candidate.Items.Count -gt 0) {
            $calFolder = $candidate
            Write-Log "Da chon thu muc Lich cua tai khoan: $($f.Name)"
            break
        }
    } catch {}
}

if ($null -eq $calFolder) {
    try {
        $calFolder = $namespace.GetDefaultFolder(9) # 9 = olFolderCalendar
        Write-Log "Da chon thu muc Lich mac dinh cua he thong"
    } catch {
        Write-Log "LOI: Khong tim thay thu muc Lich nao trong Outlook"
        exit 1
    }
}

$items = $calFolder.Items
$items.IncludeRecurrences = $true
$items.Sort("[Start]")

# Khung thoi gian: Tu 00:00 hom nay den 23:59 ngay mai
$today = (Get-Date).Date
$tomorrowEnd = $today.AddDays(2).AddSeconds(-1)

$matchedItems = @()

# Thu loc bang Restrict cua MAPI voi dinh dang Jet date
$jetDate1 = $today.ToString("dd-MMM-yy 00:00")
$jetDate2 = $tomorrowEnd.ToString("dd-MMM-yy 23:59")
try {
    $filtered = $items.Restrict("[Start] >= '$jetDate1' AND [Start] <= '$jetDate2'")
    foreach ($item in $filtered) {
        $matchedItems += $item
    }
} catch {
    Write-Log "Khong dung duoc bo loc Restrict, chuyen sang duyet tuan tu: $($_.Exception.Message)"
}

# Neu Restrict tra ve 0, duyet tuan tu de tranh lech gio he thong
if ($matchedItems.Count -eq 0) {
    $matchedItems = @()
    foreach ($item in $items) {
        try {
            if ($item.Start -ge $today -and $item.Start -le $tomorrowEnd) {
                $matchedItems += $item
            } elseif ($item.Start -gt $tomorrowEnd) {
                break
            }
        } catch {}
    }
}

Write-Log "Tim thay $($matchedItems.Count) cuoc hop trong hom nay va ngay mai"

# Chuan bi du lieu gui di
$payloadEvents = @()
foreach ($item in $matchedItems) {
    try {
        $subj = [string]$item.Subject
        if ([string]::IsNullOrWhiteSpace($subj)) { $subj = "(Cuoc hop khong co tieu de)" }

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
        $startStr = $item.Start.ToString("dd/MM HH:mm")
        Write-Log "  - [$startStr] $subj"
    } catch {
        Write-Log "  Bo qua 1 muc loi: $($_.Exception.Message)"
    }
}

$bodyJson = @{
    suKien = $payloadEvents
} | ConvertTo-Json -Depth 3

# Gui HTTP POST len HP Prio
Write-Log "Dang gui du lieu len endpoint: $endpoint..."
try {
    $headers = @{
        "Authorization" = "Bearer $SyncToken"
        "Content-Type"  = "application/json; charset=utf-8"
    }
    
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyJson)
    $response = Invoke-RestMethod -Uri $endpoint -Method POST -Headers $headers -Body $bodyBytes
    
    $soLuong = $response.soLuong
    $cacNgayStr = ""
    if ($response.cacNgay) {
        $cacNgayStr = [string]::Join(", ", $response.cacNgay)
    }
    Write-Log "DONG BO THANH CONG! So luong = $soLuong, Cac ngay = $cacNgayStr"
} catch {
    Write-Log "LOI KHI GOI API HP PRIO: $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) {
        Write-Log "Chi tiet loi: $($_.ErrorDetails.Message)"
    }
    exit 1
}
