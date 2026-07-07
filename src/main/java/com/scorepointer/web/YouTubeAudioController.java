package com.scorepointer.web;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/youtube")
public class YouTubeAudioController {

    private final YtDlpBinaryResolver ytDlpBinaryResolver;

    public YouTubeAudioController(YtDlpBinaryResolver ytDlpBinaryResolver) {
        this.ytDlpBinaryResolver = ytDlpBinaryResolver;
    }

    @GetMapping(value = "/audio", produces = "audio/mp4")
    public ResponseEntity<StreamingResponseBody> streamAudio(@RequestParam("url") String url) {
        validateYouTubeUrl(url);

        Process process;
        try {
            process = startYtDlpAudioProcess(url);
        } catch (IOException error) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "YouTube audio fallback could not start yt-dlp. " + error.getMessage(),
                    error
            );
        }

        drainErrorStreamInBackground(process.getErrorStream());

        StreamingResponseBody body = outputStream -> {
            try (InputStream inputStream = process.getInputStream()) {
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = inputStream.read(buffer)) != -1) {
                    try {
                        outputStream.write(buffer, 0, bytesRead);
                    } catch (IOException writeError) {
                        if (isClientAbort(writeError)) {
                            return;
                        }
                        throw writeError;
                    }
                }
            } catch (IOException streamError) {
                if (!isClientAbort(streamError)) {
                    throw streamError;
                }
            } finally {
                stopProcess(process);
            }
        };

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("audio/mp4"))
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.ACCEPT_RANGES, "none")
                .body(body);
    }

    private Process startYtDlpAudioProcess(String url) throws IOException {
        String ytDlpCommand = ytDlpBinaryResolver.resolveCommand();
        List<String> command = List.of(
                ytDlpCommand,
                "--quiet",
                "--no-warnings",
                "--no-playlist",
                "-f", "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]",
                "-o", "-",
                url
        );
        return new ProcessBuilder(command).start();
    }

    private void validateYouTubeUrl(String rawUrl) {
        URI uri;
        try {
            uri = new URI(rawUrl);
        } catch (URISyntaxException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid YouTube URL.", error);
        }

        String scheme = uri.getScheme();
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only HTTP and HTTPS YouTube URLs are supported.");
        }

        String host = uri.getHost();
        if (host == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid YouTube URL host.");
        }

        String normalizedHost = host.toLowerCase(Locale.ROOT);
        boolean allowedHost = normalizedHost.equals("youtu.be")
                || normalizedHost.equals("youtube.com")
                || normalizedHost.endsWith(".youtube.com");

        if (!allowedHost) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only YouTube URLs are supported.");
        }
    }

    private void drainErrorStreamInBackground(InputStream errorStream) {
        Thread thread = new Thread(() -> {
            try (errorStream) {
                errorStream.transferTo(OutputStreamDiscard.INSTANCE);
            } catch (IOException ignored) {
                // Nothing useful to report to the browser while a streaming response is active.
            }
        }, "yt-dlp-stderr-drain");
        thread.setDaemon(true);
        thread.start();
    }

    private void stopProcess(Process process) {
        try {
            if (!process.waitFor(Duration.ofSeconds(2).toMillis(), TimeUnit.MILLISECONDS)) {
                process.destroyForcibly();
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
        }
    }

    private boolean isClientAbort(Throwable error) {
        Throwable current = error;
        while (current != null) {
            String className = current.getClass().getName().toLowerCase(Locale.ROOT);
            String message = current.getMessage() == null ? "" : current.getMessage().toLowerCase(Locale.ROOT);

            if (className.contains("clientabort")
                    || message.contains("broken pipe")
                    || message.contains("connection reset")
                    || message.contains("connection aborted")
                    || message.contains("an established connection was aborted")
                    || message.contains("se ha anulado una conexión")
                    || message.contains("software en su equipo host")) {
                return true;
            }

            current = current.getCause();
        }
        return false;
    }

    private static final class OutputStreamDiscard extends java.io.OutputStream {
        private static final OutputStreamDiscard INSTANCE = new OutputStreamDiscard();

        @Override
        public void write(int b) {
            // Discard one byte.
        }

        @Override
        public void write(byte[] b, int off, int len) {
            // Discard bytes.
        }
    }
}
