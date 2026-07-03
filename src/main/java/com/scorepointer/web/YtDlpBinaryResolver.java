package com.scorepointer.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

@Component
public class YtDlpBinaryResolver {

    private final String configuredCommand;
    private Path extractedBinary;

    public YtDlpBinaryResolver(@Value("${scorepointer.ytdlp.command:}") String configuredCommand) {
        this.configuredCommand = configuredCommand;
    }

    public synchronized String resolveCommand() throws IOException {
        if (StringUtils.hasText(configuredCommand)) {
            return configuredCommand.trim();
        }

        if (extractedBinary != null && Files.isRegularFile(extractedBinary)) {
            return extractedBinary.toAbsolutePath().toString();
        }

        String bundledResourcePath = getBundledResourcePath();

        Path extractedFromClasspath = extractFromClasspath(bundledResourcePath);
        if (extractedFromClasspath != null) {
            extractedBinary = extractedFromClasspath;
            return extractedBinary.toAbsolutePath().toString();
        }

        Path bundledFileOnDisk = findBundledFileOnDisk(bundledResourcePath);
        if (bundledFileOnDisk != null) {
            makeExecutable(bundledFileOnDisk);
            return bundledFileOnDisk.toAbsolutePath().toString();
        }

        throw new FileNotFoundException(buildMissingBinaryMessage(bundledResourcePath));
    }

    public String getPreferredLocationDescription() {
        if (StringUtils.hasText(configuredCommand)) {
            return configuredCommand.trim();
        }
        return "bundled " + getBundledResourcePath() + " from the Maven build output or application jar";
    }

    private Path extractFromClasspath(String bundledResourcePath) throws IOException {
        ClassPathResource bundledBinary = new ClassPathResource(bundledResourcePath);
        if (!bundledBinary.exists()) {
            return null;
        }

        Path outputDirectory = Path.of(System.getProperty("java.io.tmpdir"), "scorepointer", "yt-dlp");
        Files.createDirectories(outputDirectory);

        Path outputFile = outputDirectory.resolve(getExtractedFileName());
        try (InputStream inputStream = bundledBinary.getInputStream()) {
            Files.copy(inputStream, outputFile, StandardCopyOption.REPLACE_EXISTING);
        }

        makeExecutable(outputFile);
        return outputFile;
    }

    private Path findBundledFileOnDisk(String bundledResourcePath) {
        Set<Path> candidates = new LinkedHashSet<>();
        Path resourceRelativePath = Path.of(bundledResourcePath);
        Path userDirectory = Path.of(System.getProperty("user.dir", ".")).toAbsolutePath().normalize();

        candidates.add(userDirectory.resolve("target/classes").resolve(resourceRelativePath));
        candidates.add(userDirectory.resolve("classes").resolve(resourceRelativePath));
        candidates.add(userDirectory.resolve("src/main/resources").resolve(resourceRelativePath));
        candidates.add(userDirectory.resolve(resourceRelativePath));
        candidates.add(userDirectory.resolve("bin").resolve(getExtractedFileName()));

        getCodeSourceDirectory().ifPresent(codeSourceDirectory -> {
            candidates.add(codeSourceDirectory.resolve(resourceRelativePath));
            candidates.add(codeSourceDirectory.resolve("target/classes").resolve(resourceRelativePath));
        });

        for (Path candidate : candidates) {
            if (candidate != null && Files.isRegularFile(candidate)) {
                return candidate.toAbsolutePath().normalize();
            }
        }
        return null;
    }

    private java.util.Optional<Path> getCodeSourceDirectory() {
        try {
            Path codeSource = Path.of(YtDlpBinaryResolver.class
                    .getProtectionDomain()
                    .getCodeSource()
                    .getLocation()
                    .toURI()).toAbsolutePath().normalize();
            if (Files.isDirectory(codeSource)) {
                return java.util.Optional.of(codeSource);
            }
            Path parent = codeSource.getParent();
            if (parent != null && Files.isDirectory(parent)) {
                return java.util.Optional.of(parent);
            }
        } catch (IllegalArgumentException | NullPointerException | SecurityException | URISyntaxException ignored) {
            // Fall through and report the normal missing-binary message.
        }
        return java.util.Optional.empty();
    }

    private void makeExecutable(Path file) {
        file.toFile().setReadable(true, false);
        file.toFile().setExecutable(true, false);
    }

    private String buildMissingBinaryMessage(String bundledResourcePath) {
        return "Bundled yt-dlp binary was not found. Expected resource: " + bundledResourcePath
                + ". Run `mvn clean process-resources` or `mvn clean package` from the ScorePointer_web folder so Maven downloads yt-dlp into target/classes/bin. "
                + "If you run from IntelliJ, run through Maven or enable Maven resource processing first. "
                + "Optional override: set scorepointer.ytdlp.command to an absolute yt-dlp path.";
    }

    private String getBundledResourcePath() {
        if (isWindows()) {
            return "bin/yt-dlp.exe";
        }
        if (isMac()) {
            return "bin/yt-dlp_macos";
        }
        if (isLinuxAarch64()) {
            return "bin/yt-dlp_linux_aarch64";
        }
        if (isLinux()) {
            return "bin/yt-dlp_linux";
        }
        return "bin/yt-dlp";
    }

    private String getExtractedFileName() {
        if (isWindows()) {
            return "yt-dlp.exe";
        }
        if (isMac()) {
            return "yt-dlp_macos";
        }
        if (isLinuxAarch64()) {
            return "yt-dlp_linux_aarch64";
        }
        if (isLinux()) {
            return "yt-dlp_linux";
        }
        return "yt-dlp";
    }

    private boolean isWindows() {
        return getOsName().contains("win");
    }

    private boolean isMac() {
        String osName = getOsName();
        return osName.contains("mac") || osName.contains("darwin");
    }

    private boolean isLinux() {
        return getOsName().contains("linux");
    }

    private boolean isLinuxAarch64() {
        String architecture = System.getProperty("os.arch", "").toLowerCase(Locale.ROOT);
        return isLinux() && (architecture.contains("aarch64") || architecture.contains("arm64"));
    }

    private String getOsName() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
    }
}
