# Publishing MartonToolBox to IIS

One IIS site serves both parts: the backend files sit at the top level of the site folder and the Angular app sits in `wwwroot`.

## 1. Build the package (on the Mac)

Run from the repo root. The output folder should be empty first.

```sh
O="$HOME/Desktop/publish_toolbox"

dotnet publish backend/MartonToolBox.Api/MartonToolBox.Api.csproj \
  -c Release -r win-x64 --self-contained false -o "$O"

# The server keeps its own settings, so they must not be in the package.
find "$O" -maxdepth 1 -name 'appsettings*' -delete

(cd frontend/marton-toolbox && npx ng build)
mkdir -p "$O/wwwroot"
cp -R frontend/marton-toolbox/dist/marton-toolbox/browser/. "$O/wwwroot/"
```

The package should contain `MartonToolBox.Api.dll`, `MartonToolBox.Api.exe`, `web.config` and `wwwroot/index.html`, and no `appsettings*.json` files.

## 2. Deploy (on the server)

1. In IIS Manager, stop the site's app pool. Otherwise Windows keeps the DLL files locked.
2. Back up the database if it holds real orders. The backend applies new migrations when it starts.
3. Copy everything from `publish_toolbox` into the site's IIS folder and choose **replace**.
4. Start the app pool and open the site.

Be careful with these:

- **`web.config`:** the package replaces the one on the server. Skip it if the server's copy has custom settings or environment variables.
- **`wwwroot`:** don't empty it before copying, because it may hold files that aren't in the package, such as product images in `images/shop`.

The server needs the .NET 8 Hosting Bundle.

## 3. Server setup (once)

### Keep the app awake

The Sameday AWB job runs inside the backend, so IIS must not put the app to sleep. Run in an Administrator PowerShell, using your own pool and site names:

```powershell
Import-Module WebAdministration
Set-ItemProperty "IIS:\AppPools\YOUR_POOL" -Name startMode -Value AlwaysRunning
Set-ItemProperty "IIS:\AppPools\YOUR_POOL" -Name processModel.idleTimeout -Value ([TimeSpan]::Zero)
Set-ItemProperty "IIS:\Sites\YOUR_SITE" -Name applicationDefaults.preloadEnabled -Value $true
iisreset
```

### Document Converter

LibreOffice must be installed on the server. The app pool needs the environment variable `LibreOffice__Path` set to `C:\Program Files\LibreOffice\program\soffice.exe`, unless `soffice` is on its `PATH`.

## 4. Check after deploying

- The site opens and you can log in.
- Save an AWB on a paid order. The admin page shows Sameday's status and the order reaches **AWB înregistrat**.
- Convert a Word file to PDF and a PDF to DOCX.

Sameday tracking uses an undocumented public endpoint and re-checks unfinished orders every 12 hours (`Sameday:CheckIntervalHours`). Statuses it can't match to a step are written to the backend log.
