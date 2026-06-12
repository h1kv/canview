# Adam Bell Portfolio

A static, single-page portfolio website built with HTML5, Tailwind CSS via CDN, and a small amount of vanilla JavaScript for navigation and context loading.

## Files

- `index.html` — the complete portfolio page.
- `styles.css` — custom design-system variables and component styling.
- `tailwind.config.js` — Tailwind CDN configuration.
- `context.yaml` — the editable Context node for identity values.
- `investigation.yaml` — the Investigation node linked to the Context node and containing structured source facts.

## Context node linked to Investigation node

The workflow is represented directly in the data files:

```text
[context.yaml]
  person_name
  location
  monogram
  linkedin_url
      |
      v
[investigation.yaml]
  depends_on: "context.yaml"
  context_inputs:
    - person_name
    - location
    - monogram
    - linkedin_url
      |
      v
[index.html]
```

To change the displayed name, edit `context.yaml`:

```yaml
person_name: "Adam Bell"
location: "Portlaoise, County Laois, Ireland"
monogram: "AB"
linkedin_url: "https://ie.linkedin.com/in/adam-bell-ireland"
```

When the site is served from a local or hosted web server, `index.html` reads `context.yaml` and updates all elements marked with `data-context`. If the file is opened directly from the filesystem and the browser blocks local file fetching, the same verified default values are already embedded in the HTML so the page still renders correctly.

## Local preview

From the `portfolio` directory, run any static file server. For example:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Content sources and constraints

The site uses only the verified facts captured in the upstream investigation:

- Name: Adam Bell
- Location: Portlaoise, County Laois, Ireland
- Association: Pyca Ireland
- Volunteer work: Python Ireland / PyCon 2025 staff volunteer
- Volunteer work: TEAM HOPE logistics volunteer, Dec 2024–Jan 2025, sorting shoeboxes in Portlaoise
- Project: Non-Invasive Medical Vitals Monitor using heartbeat, oxygen saturation, temperature, and PPG methods
- Project: Screen-Time & Behaviour Study with 250+ student responses and 60+ teacher responses
- Skills: Python, Embedded Systems, Research, Data Analysis, Problem Solving, Community Engagement
- Certifications: Microsoft Learning Credential and Manual Handling Training
- Verified public profile: https://ie.linkedin.com/in/adam-bell-ireland

No public email address, GitHub URL, CV URL, or personal website was verified, so those routes are not linked as live destinations. LinkedIn is used as the verified contact route.

## Deployment

Upload the files in this directory to any static host, such as GitHub Pages, Netlify, Vercel static hosting, Cloudflare Pages, or a standard web server. No build step is required.
