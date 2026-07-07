# ScorePointer Web

ScorePointer Web is a monolithic Spring Boot web version of the ScorePointer desktop prototype.

It runs locally in your browser and provides:

- PDF score loading from the browser
- Single-page PDF preview
- Previous / next page navigation with left/right arrow keys
- Bottom page slider
- Ellipse highlight with radial gradient on click
- Local video loading
- YouTube URL loading with embedded playback and an audio-only recording notice
- YouTube audio-only recording fallback through the local Spring Boot backend using a Maven-bundled `yt-dlp` binary
- Large media preview positioned in the right half of the screen on desktop
- Browser-based recording with countdown, automatic media playback, optional microphone capture, and uploaded-video picture included in the exported recording
- Recording output excludes the toolbar, page controls, and media player controls. When a local video is loaded, the exported recording includes the PDF page plus the uploaded video frame side-by-side.
- Microphone device selection and a toolbar checkbox to enable microphone recording
- Save As support when the browser supports the File System Access API

## Requirements

- Java 21+
- Maven 3.9+
- Modern Chromium-based browser recommended: Chrome, Edge, Brave
- Browser microphone permission if microphone capture is enabled. Permission is requested from the microphone setup dialog when **Enable microphone** is checked.
- Internet access during the first Maven build so Maven can download the bundled `yt-dlp` binaries

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

## Local video behavior

Use **Load video** to upload a local video file.

When you press **Start Recording**, the app records an internal canvas composition. With a local video loaded, the exported file includes the PDF page plus the uploaded video frame side-by-side. It does not use browser screen sharing, so the exported video excludes the top toolbar, page controls, media player controls, and microphone setup controls.

If the uploaded video has audio and the browser supports `HTMLMediaElement.captureStream()`, the recording includes the uploaded video's audio. Check **Enable microphone** to open the microphone setup dialog, grant browser permission, and choose the input device. Leave it unchecked to record only the multimedia audio.

## YouTube behavior

Paste a YouTube link in the toolbar and click **Load YouTube**.

When a YouTube link is loaded, the app shows a dialog explaining that YouTube recordings include audio only. The app still embeds the YouTube video in the right-side media panel for playback. Browsers do not allow an app to directly capture video or audio from a cross-origin YouTube iframe, so YouTube recording can include the PDF viewer plus the backend audio fallback, but not the YouTube video image.

To record YouTube audio, the app provides this same-origin backend endpoint:

```text
/api/youtube/audio?url=<youtube-url>
```

That endpoint shells out to `yt-dlp` and streams the best available M4A audio back to the browser. Because the audio is served by the local Spring Boot app, the frontend can add that audio track to the `MediaRecorder` output.

`yt-dlp` is bundled by Maven during `process-resources`. The build downloads these release artifacts into `target/classes/bin`, so they are packaged inside the Spring Boot jar:

- `yt-dlp.exe` for Windows
- `yt-dlp_linux` for Linux x64
- `yt-dlp_linux_aarch64` for Linux ARM64
- `yt-dlp_macos` for macOS

At runtime, the Spring Boot backend first looks for the matching bundled binary in the application classpath/JAR. If the app is being run from an IDE, it also checks the Maven output folder directly, for example `target/classes/bin/yt-dlp.exe` on Windows. When found in the JAR, it extracts the binary to the OS temp folder and executes that copy. You do not need to install `yt-dlp` manually for normal app usage.

If you see an error like `Cannot run program "yt-dlp.exe": CreateProcess error=2`, the app was started without the Maven-bundled binary being present. Rebuild from the `ScorePointer_web` folder:

```bash
mvn clean process-resources
```

or build the runnable jar:

```bash
mvn clean package -DskipTests
```

Then confirm this file exists on Windows:

```text
target/classes/bin/yt-dlp.exe
```

If you run from IntelliJ, run through the Maven tool window or enable Maven resource processing so `target/classes/bin` is created before the app starts. You can also override the command path manually with:

```properties
scorepointer.ytdlp.command=C:/absolute/path/to/yt-dlp.exe
```

## Recording behavior

The web version uses the browser `MediaRecorder` and `HTMLCanvasElement.captureStream()` APIs.

When you press **Start Recording**, the app records an internal canvas composition. If a local video file is loaded, the composition includes the PDF page plus the uploaded video frame side-by-side. It does not use browser screen sharing, so the exported video excludes the top toolbar, page controls, media player controls, and microphone setup controls.

The recording format depends on the browser. Most browsers generate `.webm`. Some browsers may support `.mp4`.

By default, microphone recording is disabled. Check **Enable microphone** next to **Start Recording** to open the setup dialog. The dialog requests browser microphone permission when needed and then lets you select the preferred input device. If browser labels appear as generic names like `Microphone 1`, grant microphone permission and the list is refreshed.

The app mixes multimedia audio and microphone audio through the Web Audio API into one recording track, so both sources are included in the exported video when available. If neither microphone nor multimedia is enabled and only a PDF is loaded, pressing **Start Recording** shows: `Please enable your microphone or load a Video to start the pointer`.

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
- Microphone capture requires browser permission and may show generic device names until permission has been granted.
- The recording is generated from rendered browser canvases, so it records the PDF page, highlight, and uploaded local video frame rather than a literal screen crop.
- YouTube iframe video/audio cannot be directly captured by the browser. YouTube recording uses the backend audio-only fallback through the Maven-bundled `yt-dlp` binary.
- The YouTube fallback records audio only; it does not add the YouTube video image to the exported recording.
- The highlight is intentionally approximate for the MVP: it uses a radial ellipse instead of measure detection.
