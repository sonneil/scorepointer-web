# ScorePointer Web

ScorePointer Web is a monolithic Spring Boot web version of the ScorePointer desktop prototype.

It runs locally in your browser and provides:

- PDF score loading from the browser
- Single-page PDF preview
- Previous / next page navigation with left/right arrow keys
- Bottom page slider
- Ellipse highlight with radial gradient on click
- Local video loading
- Mini-player positioned at the bottom center
- Browser-based recording with countdown and automatic video playback
- PDF-viewer-only recording output: the exported video contains only the PDF page and the ellipse highlight, not the toolbar, page controls, or video player panel
- Save As support when the browser supports the File System Access API

## Requirements

- Java 21+
- Maven 3.9+
- Modern Chromium-based browser recommended: Chrome, Edge, Brave

## Run in development mode

```bash
mvn spring-boot:run
```

Then open:

```text
http://localhost:8080
```

## Build executable JAR

```bash
mvn clean package -DskipTests
```

Run:

```bash
java -jar target/scorepointer-web-1.0.0.jar
```

Then open:

```text
http://localhost:8080
```

## Recording behavior

The web version uses the browser `MediaRecorder` and `HTMLCanvasElement.captureStream()` APIs.

When you press **Record**, the app records an internal canvas copy of the PDF page plus the ellipse highlight. It does not use browser screen sharing, so the exported video excludes the top toolbar, page controls, and video player panel.

If the uploaded video has audio and the browser supports `HTMLMediaElement.captureStream()`, the recording includes the uploaded video's audio.

The recording format depends on the browser. Most browsers generate `.webm`. Some browsers may support `.mp4`.

## Save As behavior

On Chromium-based browsers, the app uses the File System Access API, so you can choose the filename and target location.

On browsers that do not support this API, the app falls back to a normal download.

## PDF rendering

The frontend loads PDF.js from a CDN:

```text
https://cdn.jsdelivr.net/npm/pdfjs-dist
```

This keeps the Spring Boot app small. If you need a fully offline build, bundle PDF.js into `src/main/resources/static/vendor/pdfjs` and update `app.js` imports accordingly.

## Known limitations

- Browser recording generally exports WebM, not MP4.
- The PDF-viewer-only recording is generated from the rendered PDF canvas, so it records the PDF page and highlight rather than a literal screen crop.
- Uploaded video URLs, external video links, YouTube links, and audio-only files are no longer supported.
- The highlight is intentionally approximate for the MVP: it uses a radial ellipse instead of measure detection.
