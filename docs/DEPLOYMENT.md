# Deployment

The default build is configured for the supplied repository's `/bostik-game/` subpath. It contains no server requirement or secret. Use HTTPS in production.

## GitHub Pages

1. Push the feature branch to `rojerm2/bostik-game` and review it through the repository's normal workflow. This work does not merge branches or change protection settings.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source if it is not already enabled.
3. Open **Actions → Publish GitHub Pages → Run workflow** and choose the reviewed branch. The workflow performs a clean install, lint, typecheck, unit tests, production build, and upload/deploy through GitHub's official Pages actions. CI separately runs browser smoke tests.
4. Verify the deployment URL returned by the job. Test the home screen, camera/model loading, calibration, gameplay and warm offline restart at that exact URL. The expected repository URL is `https://rojerm2.github.io/bostik-game/`, but do not treat that expected address as proof of deployment.

The workflow is manual so pushes do not unexpectedly publish an unvalidated change. Repository Pages settings/Actions permissions may require the owner's intervention. No billing or paid hosting is needed. Hosting has not been verified merely because `dist` builds.

## Other static HTTPS hosting

```sh
npm ci
npm run check
```

Upload the **contents** of `dist/` at `/bostik-game/`. This includes `vision/`, `licenses/`, the service worker, manifest and all hashed bundles. Do not omit the large WASM/model assets. Serve `.wasm` as `application/wasm`, JavaScript as JavaScript, and the manifest as JSON. HTTPS and same-origin model/WASM loading are required.

To host at the domain root instead, set `BASE_PATH=/` in the build environment. For example in PowerShell:

```powershell
$env:BASE_PATH = '/'
npm run build
Remove-Item Env:BASE_PATH
```

Always use a leading and trailing slash. Rebuild for the desired subpath; do not move an already-built artifact between paths. The service worker generator uses the same environment value.

Wait for **Ready for offline adventures** before disconnecting. A new version's worker waits until old tabs close; close/reopen the app when **Update ready** appears. If browser storage was evicted, reload online. For local repair, run `npm run assets`; checksum mismatches are errors rather than silent asset updates.
