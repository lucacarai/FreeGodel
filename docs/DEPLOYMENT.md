# Publishing Free Gödel algebras dually

Repository: https://github.com/lucacarai/FreeGodel

Website: https://lucacarai.github.io/FreeGodel/

This app has its own repository in `FreeGodel/`. Publish this app folder rather than the parent workspace.

The `main` branch deploys through `.github/workflows/pages.yml`. The workflow runs the mathematical and interaction checks, builds the static website, and deploys only `dist/` to GitHub Pages.

For first publication, create the public `lucacarai/FreeGodel` repository and push this app's `main` branch. In the repository's **Settings → Pages**, choose **GitHub Actions** as the deployment source. If necessary, run **Deploy Free Gödel to GitHub Pages** again from the Actions tab after enabling Pages.

For updates, commit and push the app changes to `main`. The workflow republishes them automatically.

The build versions the stylesheet, app script, and imported construction module together using a source-content hash. This prevents a newly deployed app from reusing an older cached coloring module. A page already open during an update still needs a reload; Ctrl+F5 forces a fresh page on Windows.

All asset links are relative. To check the published path locally, run `node scripts/build.mjs`, then `node server.mjs --base=/FreeGodel/` and open http://127.0.0.1:4174/FreeGodel/. If the usual preview is already using that port, set `PORT` to another available port for this check.

Saved posets are browser-local. Use **Save file** in the local preview and **Open** on the published app to transfer a drawing.
