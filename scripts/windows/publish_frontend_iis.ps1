param(
    [string]$SiteRoot = "C:\inetpub\wwwroot\vip-tailors"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $projectRoot

npm ci
npm run build

New-Item -ItemType Directory -Force $SiteRoot | Out-Null
Copy-Item -Path (Join-Path $projectRoot "dist\*") -Destination $SiteRoot -Recurse -Force

$webConfig = @'
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ReactRoutes" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
            <add input="{REQUEST_URI}" pattern="^/api/" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
    <staticContent>
      <remove fileExtension=".json" />
      <mimeMap fileExtension=".json" mimeType="application/json" />
    </staticContent>
  </system.webServer>
</configuration>
'@

Set-Content -Path (Join-Path $SiteRoot "web.config") -Value $webConfig -Encoding UTF8

Write-Host "Published frontend to $SiteRoot"
Write-Host "web.config written for SPA routing."
