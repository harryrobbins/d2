# MermaiD2

A static web app with a source editor on the left and a diagram preview on
the right. Choose Mermaid or D2. Conversion, layout, and rendering happen on the
device in Web Workers; no diagram server is required.

## Run

Prerequisites: Node.js 22.12+ and Go 1.26.2+ (for building the Mermaid converter).

```sh
cd playground
npm ci
npm run dev
```

Open the local URL printed by Vite. The first run builds the converter and may
download its Go dependencies. Subsequent runs reuse the Go build cache.

```sh
npm run build          # builds converter + static site into dist/
npm run preview        # serves the production build locally
npx playwright install chromium
npm test              # browser integration tests against the production build
```

Deploy the contents of `dist/` to any static host. Serve `.wasm` files with
`application/wasm` and enable HTTP compression for the large WASM assets. No API,
secrets, or backend process are needed. Hosts with a Content Security Policy must
allow this app's worker/blob and WebAssembly execution requirements; D2.js creates
its rendering worker from a Blob.

## Features

- Mermaid/D2 selection with separate drafts saved in localStorage.
- CodeMirror editor, live preview, and Ctrl/Command + Enter to render manually.
- TALA, Dagre, and ELK layout selection, five palettes, and sketch mode.
- Canvas pan/zoom and fit. SVG, PNG, JPEG, WebP, PDF, ASCII, source, converted D2, and graph JSON exports.
- 14 examples: complex commerce and data architectures, release gates, nested states, class and ER models, sequences, mindmaps, C4, multi-region service mesh, and network boundaries. 12 are available in both languages; two use native D2.
- Inspect and copy the D2 source produced by Mermaid conversion.
- Conversion/compiler errors preserve the previous preview, clearly marked stale.
- Thirty-second worker timeout with recovery on the next render.
- Sanitized SVG output and responsive editor/canvas layout.

## Rendering path

Mermaid → `mermaid2d2` (Go/WASM worker) → D2 source → `@d2lang/d2`
(WASM worker, selected layout) → SVG. D2 input skips the conversion step.

The D2 engine is pinned to the published `@d2lang/d2` 0.1.34 package. This app
does not rebuild or modify the checkout's D2 engine. The converter is pinned to
`github.com/noamsto/mermaid2d2` v0.6.0, with a separate Go module under `converter/`.
Its D2 0.7.1 dependency supports conversion in that library; actual layout and
rendering use the current npm D2 engine, which includes open-source TALA.
`scripts/build-converter.mjs` compiles the bridge and copies the matching Go
runtime into the ignored `src/generated/` directory before Vite bundles the app. It also generates D2 companions for the Mermaid gallery using the same converter.

This is a Mermaid-input playground using the D2 renderer. It is not a Mermaid
layout plugin: shapes, typography, and themes come from D2.

## Supported input and limits

Mermaid conversion supports flowcharts, sequence, state, class, ER, mindmap, and
C4 diagrams. The converter uses its own Mermaid parser, so coverage may differ
from Mermaid.js, especially for newer syntax. Conversion is lossy where the
languages disagree; for example, some C4 metadata, sequence note placement, and
styling are not preserved. Pie, Gantt, journey, XY, and git graphs are unsupported
and report an error. See [mermaid2d2](https://github.com/noamsto/mermaid2d2) for its
coverage matrix.

Pasted Markdown code fences are accepted for both languages. Mermaid YAML
frontmatter and initialization directives are removed; choose the output palette
in the playground instead. Explicit flowchart TD/TB directions are restored in
the converted D2 so TALA respects the constraint.

D2 input must be self-contained. Filesystem imports and navigating multiple
boards are not exposed in this app. D2's specialized sequence/grid layouts still
apply with any selected layout engine. Large graphs can take noticeably longer to lay out.

Drafts stay in localStorage. Source text is not sent to a diagram service.
External images/icons referenced in source may still make network requests.
Exported SVGs are sanitized before display and download.

## Dependencies and licenses

This directory follows the repository's MPL-2.0 license. D2 is MPL-2.0;
mermaid2d2 is MIT. The build includes D2's license and third-party notices, the Go
runtime license, and available Go dependency notices under `dist/licenses/`.
The npm and Go lockfiles pin the complete dependency graph.

## Exports

SVG preserves vector geometry. PNG and WebP use a transparent background; JPEG
and PDF use white. Raster exports support 1×, 2×, and 3× resolution, capped at
32 million pixels and 16,384 pixels per side. PDF embeds a raster image on a
single page matching the diagram proportions. ASCII uses D2's text renderer;
complex shapes and styling may be simplified. Source export preserves the input;
D2 export saves the normalized/converted source. Graph JSON contains the compiled
D2 graph, language, and layout engine.

Raster/PDF exports require referenced images to be embedded data URLs; external
images can still be previewed and exported in SVG. Drafts are stored on this
browser only. The download action always exports the last successful, current
render.

## Cloudflare Workers

The static app deploys as the `mermaid2` Worker using `wrangler.jsonc`.
The configured account is Harry's account; change `account_id` for another account.
No bindings or secrets are required.

```sh
npx wrangler login     # authenticate if needed
npm run build
npm run deploy:check   # validate deployment without publishing
npm run deploy        # rebuild and publish to Workers
npm run workers:dev   # serve the built assets through Wrangler locally
```

The asset host serves the SPA and WASM, with immutable caching for versioned
assets. Security headers are defined in `public/_headers`. Do not deploy without
running the production browser tests first.
