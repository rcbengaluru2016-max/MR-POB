# Dot-source this file from PowerShell. These helpers send requests only when called.
# Default target is the isolated test harness, not the application backend.
Add-Type -AssemblyName System.Net.Http
$script:ErpApiBaseUrl = 'http://127.0.0.1:3201'
$script:ErpManualClient = [System.Net.Http.HttpClient]::new()
$script:ErpManualClient.Timeout = [TimeSpan]::FromMinutes(3)

function Invoke-ErpManualRequest {
    param([System.Net.Http.HttpRequestMessage]$RequestMessage)
    $replyMessage = $null
    try {
        $replyMessage = $script:ErpManualClient.SendAsync($RequestMessage).GetAwaiter().GetResult()
        $replyText = $replyMessage.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $replyData = $replyText
        if ($replyText) {
            try { $replyData = $replyText | ConvertFrom-Json } catch { }
        }
        Write-Host ('HTTP {0}' -f [int]$replyMessage.StatusCode)
        [PSCustomObject]@{ StatusCode = [int]$replyMessage.StatusCode; Data = $replyData }
    } finally {
        if ($null -ne $replyMessage) { $replyMessage.Dispose() }
        $RequestMessage.Dispose()
    }
}

function Invoke-ErpApi {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('GET', 'POST', 'PATCH', 'DELETE')][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$Token,
        [object]$Body = $null,
        [hashtable]$Headers = @{},
        [string]$BaseUrl = $script:ErpApiBaseUrl
    )
    if (-not $Path.StartsWith('/api/')) { throw 'Use an /api/ path.' }
    $requestMessage = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method), $BaseUrl.TrimEnd('/') + $Path)
    if ($Token) { $requestMessage.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $Token) }
    foreach ($headerName in $Headers.Keys) { [void]$requestMessage.Headers.TryAddWithoutValidation($headerName, [string]$Headers[$headerName]) }
    if ($null -ne $Body) {
        $requestMessage.Content = [System.Net.Http.StringContent]::new(($Body | ConvertTo-Json -Depth 20 -Compress), [Text.Encoding]::UTF8, 'application/json')
    }
    Invoke-ErpManualRequest -RequestMessage $requestMessage
}

function Send-ErpRegistration {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('customer', 'company', 'patient')][string]$Kind,
        [Parameter(Mandatory = $true)][hashtable]$Fields,
        [hashtable]$Files = @{},
        [string]$IdempotencyKey
    )
    $resource = @{ customer = 'customers'; company = 'companies'; patient = 'patients' }[$Kind]
    $requestMessage = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, "$script:ErpApiBaseUrl/api/registrations/$resource")
    $form = [System.Net.Http.MultipartFormDataContent]::new()
    foreach ($fieldName in $Fields.Keys) { $form.Add([System.Net.Http.StringContent]::new([string]$Fields[$fieldName]), [string]$fieldName) }
    foreach ($slot in $Files.Keys) {
        $resolvedFile = (Resolve-Path -LiteralPath $Files[$slot] -ErrorAction Stop).Path
        $fileContent = [System.Net.Http.ByteArrayContent]::new([IO.File]::ReadAllBytes($resolvedFile))
        $mime = switch ([IO.Path]::GetExtension($resolvedFile).ToLowerInvariant()) {
            '.png' { 'image/png' }
            '.jpg' { 'image/jpeg' }
            '.jpeg' { 'image/jpeg' }
            '.webp' { 'image/webp' }
            '.pdf' { 'application/pdf' }
            default { 'application/octet-stream' }
        }
        $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new($mime)
        $form.Add($fileContent, [string]$slot, [IO.Path]::GetFileName($resolvedFile))
    }
    $requestMessage.Content = $form
    if ($IdempotencyKey) { [void]$requestMessage.Headers.TryAddWithoutValidation('Idempotency-Key', $IdempotencyKey) }
    Invoke-ErpManualRequest -RequestMessage $requestMessage
}
