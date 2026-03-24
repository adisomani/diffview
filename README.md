# Diffview

Static browser app for compact side-by-side markdown comparison.

## Features

- Paste markdown side by side.
- Edit both sides inline in the diff view.
- See deletions in red and additions in green.
- Use paragraph-level arrows to bulk-copy left to right or right to left.
- Copy either pane from the header icon.

## Run

Open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 8000
```

Then visit [http://localhost:8000](http://localhost:8000).

## Deploy To GitHub Pages

1. Push this repo to GitHub.
2. Ensure your default branch is `main`.
3. In GitHub, go to `Settings` -> `Pages`.
4. Set `Source` to `GitHub Actions`.
5. Push to `main` and the workflow in `.github/workflows/pages.yml` will publish the site.

Project sites are served at:

```text
https://<your-github-username>.github.io/<your-repository-name>/
```
