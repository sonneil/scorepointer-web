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

The app now asks `MediaRecorder` for MP4 first for better device compatibility. If the browser does not support MP4 recording, it falls back to WebM because renaming WebM as MP4 would create an invalid file.

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


## Mobile behavior

On phones, the multimedia preview is kept as a very small center-bottom player so audio playback remains available while the score stays as large and tappable as possible. Local uploaded video is still included in the recording on the right side of the PDF, just like the desktop layout. YouTube remains audio-only in the recording because the iframe video cannot be captured by the browser.

On small phones, the YouTube URL field and **Load YouTube** button move to a second toolbar row so they remain accessible.

Mobile also shows small floating previous/next page buttons on the left and right edges of the score viewer.


### Small-screen microphone controls

On smaller devices, the microphone controls stay visible in a third toolbar row instead of being hidden. This keeps **Enable microphone** available on phones while preserving the YouTube URL row.


## iPad / tablet fixes

- The **Enable microphone** checkbox stays tappable. If iPad/Safari blocks microphone APIs because the app is opened through plain HTTP from another device, the app now shows a clear HTTPS/localhost message instead of silently disabling the control.
- Local video audio has a Safari/iPad fallback: if `HTMLMediaElement.captureStream()` is unavailable, the app uses Web Audio to mix the video element audio into the recording.
- The small mobile/tablet video preview uses `dvh` and safe-area spacing so it does not fall below the visible screen.
- The YouTube audio backend now treats browser-cancelled streams as normal client aborts and stops `yt-dlp` cleanly, avoiding noisy stack traces such as “Se ha anulado una conexión establecida...”.


## Draggable video preview

The visible media preview can be moved with the **Drag preview** handle above the video. Dragging works with mouse and touch, and the preview is constrained inside the viewer area. Double-click the handle to reset it to the default position.

This drag position is **UI-only**. The exported recording keeps the normal recording layout for the video and is not affected by where the user moves the preview on screen.


### Dragging while recording

The visible preview can now be dragged even while recording is active. This still affects only the on-screen preview; the exported recording keeps the fixed recording video placement.


## Recording download reliability

When a recording finishes, the app now creates a persistent browser Blob URL and shows a **Recording ready** dialog with:

- **Download recording**: explicit download link using the generated filename.
- **Open recording**: opens the Blob URL directly, useful on iPad/Safari where automatic Blob downloads may be blocked or opened instead of saved.

The backend will not show errors for this because recording and download are client-side browser operations.


## YouTube audio on AWS with yt-dlp cookies

The backend can now pass optional configuration to `yt-dlp` through Spring Boot properties or environment variables.

Recommended EC2 systemd override:

```ini
[Service]
Environment=HOME=/home/ubuntu
Environment=PATH=/home/ubuntu/.deno/bin:/home/ubuntu/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=SCOREPOINTER_YTDLP_COMMAND=/home/ubuntu/.local/bin/yt-dlp
Environment=SCOREPOINTER_YTDLP_COOKIES_FILE=/opt/sheetmusicpointer/secrets/youtube-cookies.txt
Environment=SCOREPOINTER_YTDLP_REMOTE_COMPONENTS=ejs:github
```

Apply with:

```bash
sudo systemctl daemon-reload
sudo systemctl restart sheetmusicpointer
```

The Java controller now adds these `yt-dlp` args when configured:

```bash
--cookies /opt/sheetmusicpointer/secrets/youtube-cookies.txt
--remote-components ejs:github
```

It also logs `yt-dlp` stderr to the application logs, so YouTube errors such as bot checks, missing formats, or JS challenge failures are visible with:

```bash
sudo journalctl -u sheetmusicpointer -f
```

Keep `youtube-cookies.txt` out of git and treat it like a password.


## Media readiness before recording

Recording startup now waits for the selected media element to reach a playable ready state before beginning the countdown/capture path.

For YouTube audio fallback, the previous fixed 7-second wait was removed. The app now waits until the fallback audio element has real current media data, or until the browser reports a media error. This avoids starting a recording before a slower `yt-dlp` stream is actually ready.


## Recording preparation overlay

Pressing **Start Recording** now blocks the UI with a full-screen preparation overlay while the app loads media resources, prepares the YouTube audio fallback, unlocks playback, runs the 3-2-1 countdown, and starts `MediaRecorder`.

The overlay is removed only after `MediaRecorder.start()` succeeds. If preparation fails or the recording cannot start, the overlay is hidden and the normal error/status message is shown.
