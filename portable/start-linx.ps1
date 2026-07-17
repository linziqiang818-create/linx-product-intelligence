$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8765
$url = "http://127.0.0.1:$port/"
$listener = New-Object System.Net.Sockets.TcpListener -ArgumentList @([Net.IPAddress]::Loopback, $port)
$servedRequests = 0
$maximumRequests = if ($env:LINX_MAX_REQUESTS) { [int]$env:LINX_MAX_REQUESTS } else { 0 }

try {
    $listener.Start()
}
catch {
    if ($env:LINX_NO_BROWSER -ne "1") { Start-Process $url }
    Write-Host "LINX may already be running. Close other LINX launcher windows and retry if needed."
    Read-Host "Press Enter to close"
    exit 0
}

if ($env:LINX_NO_BROWSER -ne "1") { Start-Process $url }
Write-Host "LINX is running at $url"
Write-Host "Keep this window open. Close it to stop LINX."

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "text/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            while ($reader.ReadLine()) { }
            $requestPath = if ($requestLine) { ($requestLine -split " ")[1] } else { "/" }
            $requestPath = ($requestPath -split "\?")[0]
            $relative = [Uri]::UnescapeDataString($requestPath.TrimStart("/"))
            if (-not $relative) { $relative = "index.html" }
            $resolvedRoot = [IO.Path]::GetFullPath($root)
            $resolvedFile = [IO.Path]::GetFullPath((Join-Path $root $relative))
            $safeRootPrefix = $resolvedRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
            $isSafe = $resolvedFile.Equals($resolvedRoot, [StringComparison]::OrdinalIgnoreCase) -or
                $resolvedFile.StartsWith($safeRootPrefix, [StringComparison]::OrdinalIgnoreCase)
            $exists = Test-Path -LiteralPath $resolvedFile -PathType Leaf
            if ($isSafe -and $exists) {
                $body = [IO.File]::ReadAllBytes($resolvedFile)
                $extension = [IO.Path]::GetExtension($resolvedFile).ToLowerInvariant()
                $contentType = $mimeTypes[$extension]
                if (-not $contentType) { $contentType = "application/octet-stream" }
                $status = "200 OK"
            }
            else {
                $body = [Text.Encoding]::UTF8.GetBytes("Not found")
                $contentType = "text/plain; charset=utf-8"
                $status = "404 Not Found"
            }
            $header = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
            $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($body, 0, $body.Length)
            $stream.Flush()
        }
        finally {
            $client.Close()
        }
        $servedRequests += 1
        if ($maximumRequests -gt 0 -and $servedRequests -ge $maximumRequests) { break }
    }
}
finally {
    $listener.Stop()
}
