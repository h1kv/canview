# Adam Bell Portfolio

Single-page personal portfolio for Adam Bell, built with `index.html`, Tailwind CSS, and the generated `styles.css` output file.

## Files

- `index.html` — portfolio markup and content
- `styles.css` — compiled Tailwind CSS output
- `tailwind.config.js` — Tailwind theme configuration for the portfolio design system

## Requirements

- Node.js 18 or newer
- npm or npx

## Install Tailwind CSS

From the project root, install Tailwind CSS locally:

```bash
npm install --save-dev tailwindcss
```

Alternatively, run the build command with `npx` and allow npm to download Tailwind CSS when prompted.

## Build CSS

Generate `styles.css` from the classes used in `index.html` and the theme settings in `tailwind.config.js`:

```bash
npx tailwindcss --config ./tailwind.config.js --content ./index.html --output ./styles.css --minify
```

## Development Watch Mode

Rebuild `styles.css` automatically while editing `index.html`:

```bash
npx tailwindcss --config ./tailwind.config.js --content ./index.html --output ./styles.css --watch
```

## Preview

Open `index.html` directly in a browser, or serve the folder with a local static server:

```bash
npx serve .
```

The page expects `styles.css` to exist in the same directory as `index.html`.


---

## Branch: Create Agent 3
