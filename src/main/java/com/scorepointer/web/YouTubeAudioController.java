package com.scorepointer.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
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

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/youtube")
public class YouTubeAudioController {

    private static final Logger log = LoggerFactory.getLogger(YouTubeAudioController.class);

    private final YtDlpBinaryResolver ytDlpBinaryResolver;
    private final String cookiesFile;
    private final String remoteComponents;

    public YouTubeAudioController(
            YtDlpBinaryResolver ytDlpBinaryResolver,
            @Value("${scorepointer.ytdlp.cookies-file:}") String cookiesFile,
            @Value("${scorepointer.ytdlp.remote-components:ejs:github}") String remoteComponents) {
        this.ytDlpBinaryResolver = ytDlpBinaryResolver;
        this.cookiesFile = cookiesFile == null ? "" : cookiesFile.trim();
        this.remoteComponents = remoteComponents == null ? "" : remoteComponents.trim();
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
        List<String> command = new ArrayList<>();
        command.add(ytDlpCommand);
        command.add("--no-progress");
        command.add("--no-color");
        command.add("--no-playlist");

        if (hasText(remoteComponents)) {
            command.add("--remote-components");
            command.add(remoteComponents);
        }

        if (hasText(cookiesFile)) {
            Path cookiesPath = Path.of(cookiesFile).toAbsolutePath().normalize();
            if (!Files.isRegularFile(cookiesPath)) {
                throw new IOException("Configured YouTube cookies file does not exist: " + cookiesPath);
            }
            command.add("--cookies");
            command.add(cookiesPath.toString());
        }

        command.add("-f");
        command.add("bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]");
        command.add("-o");
        command.add("-");
        command.add(url);

        log.info(
                "Starting yt-dlp audio stream. command={}, cookiesConfigured={}, remoteComponents={}",
                ytDlpCommand,
                hasText(cookiesFile),
                hasText(remoteComponents) ? remoteComponents : "(disabled)"
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
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(errorStream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (hasText(line)) {
                        log.warn("yt-dlp: {}", line);
                    }
                }
            } catch (IOException error) {
                log.debug("Could not read yt-dlp stderr.", error);
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

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
