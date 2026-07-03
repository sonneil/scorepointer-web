import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs';

const state = {
    pdf: null,
    pageCount: 0,
    currentPage: 1,
    renderScale: 1.7,
    currentViewport: null,
    canvasScaleX: 1,
    canvasScaleY: 1,
    hasPdf: false,
    hasMedia: false,
    mediaType: null,
    mediaRecorder: null,
    recordedChunks: [],
    recordingStream: null,
    recordingCanvas: null,
    recordingContext: null,
    recordingFrameRequest: null,
    isRecording: false,
    localObjectUrl: null,
    youtubeUrl: null,
    youtubeVideoId: null,
    youtubeAudioCaptureStream: null,
    lastHighlightByPage: new Map(),
};

const HIGHLIGHT_STYLE = {
    gradientStops: [
        { offset: 0, color: 'rgba(255, 230, 0, 0.74)' },
        { offset: 0.38, color: 'rgba(255, 215, 0, 0.46)' },
        { offset: 0.72, color: 'rgba(255, 180, 0, 0.18)' },
        { offset: 1, color: 'rgba(255, 180, 0, 0)' },
    ],
    stroke: 'rgba(255, 190, 0, 0.32)',
};

const els = {
    pdfInput: document.getElementById('pdfInput'),
    mediaFileInput: document.getElementById('mediaFileInput'),
    youtubeUrlInput: document.getElementById('youtubeUrlInput'),
    loadYoutubeButton: document.getElementById('loadYoutubeButton'),
    recordButton: document.getElementById('recordButton'),
    status: document.getElementById('status'),
    emptyState: document.getElementById('emptyState'),
    pdfViewer: document.getElementById('pdfViewer'),
    canvasWrap: document.getElementById('canvasWrap'),
    pdfCanvas: document.getElementById('pdfCanvas'),
    measureHighlight: document.getElementById('measureHighlight'),
    pageControls: document.getElementById('pageControls'),
    previousPageButton: document.getElementById('previousPageButton'),
    nextPageButton: document.getElementById('nextPageButton'),
    pageSlider: document.getElementById('pageSlider'),
    pageIndicator: document.getElementById('pageIndicator'),
    mediaPanel: document.getElementById('mediaPanel'),
    videoPlayer: document.getElementById('videoPlayer'),
    youtubePlayer: document.getElementById('youtubePlayer'),
    youtubeAudio: document.getElementById('youtubeAudio'),
    playButton: document.getElementById('playButton'),
    pauseButton: document.getElementById('pauseButton'),
    stopButton: document.getElementById('stopButton'),
    countdown: document.getElementById('countdown'),
};

els.pdfInput.addEventListener('change', loadPdf);
els.mediaFileInput.addEventListener('change', loadVideoFile);
els.loadYoutubeButton.addEventListener('click', loadYoutubeFromInput);
els.youtubeUrlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        loadYoutubeFromInput();
    }
});
els.recordButton.addEventListener('click', onRecordButton);
els.playButton.addEventListener('click', () => playMedia());
els.pauseButton.addEventListener('click', pauseMedia);
els.stopButton.addEventListener('click', stopMedia);
els.canvasWrap.addEventListener('click', placeHighlightFromClick);
els.previousPageButton.addEventListener('click', previousPage);
els.nextPageButton.addEventListener('click', nextPage);
els.pageSlider.addEventListener('input', () => setPage(Number(els.pageSlider.value)));
els.youtubeAudio.addEventListener('error', () => {
    if (state.mediaType === 'youtube') {
        setStatus('YouTube video loaded. Audio-only recording fallback is unavailable. Rebuild with Maven so the bundled yt-dlp binary is available, or configure scorepointer.ytdlp.command.');
    }
});

window.addEventListener('keydown', (event) => {
    if (!state.hasPdf || isTypingTarget(event.target)) return;
    if (event.key === 'ArrowRight') {
        event.preventDefault();
        nextPage();
    } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        previousPage();
    }
});

window.addEventListener('resize', () => {
    if (state.hasPdf) renderCurrentPage();
});

function isTypingTarget(target) {
    return target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

async function loadPdf(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus(`Loading PDF: ${file.name}`);
    const data = new Uint8Array(await file.arrayBuffer());
    state.pdf = await pdfjsLib.getDocument({ data }).promise;
    state.pageCount = state.pdf.numPages;
    state.currentPage = 1;
    state.hasPdf = true;
    state.lastHighlightByPage.clear();

    els.emptyState.classList.add('hidden');
    els.pdfViewer.classList.remove('hidden');
    els.pageControls.classList.remove('hidden');
    els.pageSlider.min = '1';
    els.pageSlider.max = String(state.pageCount);
    els.pageSlider.value = '1';

    await renderCurrentPage();
    updateControls();
    setStatus(`Loaded PDF: ${file.name}`);
}

async function renderCurrentPage() {
    if (!state.pdf) return;

    const page = await state.pdf.getPage(state.currentPage);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const availableWidth = window.innerWidth - 24;
    const availableHeight = window.innerHeight - 64 - 54 - 16;
    const fitScale = Math.min(availableWidth / unscaledViewport.width, availableHeight / unscaledViewport.height);
    state.renderScale = Math.max(0.5, Math.min(2.5, fitScale * window.devicePixelRatio));

    const viewport = page.getViewport({ scale: state.renderScale });
    state.currentViewport = viewport;

    const canvas = els.pdfCanvas;
    const context = canvas.getContext('2d', { alpha: false });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / window.devicePixelRatio)}px`;
    canvas.style.height = `${Math.floor(viewport.height / window.devicePixelRatio)}px`;

    await page.render({ canvasContext: context, viewport }).promise;
    updateScaleFactors();
    restoreHighlightForCurrentPage();
    updatePageIndicator();
}

function updateScaleFactors() {
    const rect = els.pdfCanvas.getBoundingClientRect();
    state.canvasScaleX = els.pdfCanvas.width / rect.width;
    state.canvasScaleY = els.pdfCanvas.height / rect.height;
}

function placeHighlightFromClick(event) {
    if (!state.hasPdf) return;
    const canvasRect = els.pdfCanvas.getBoundingClientRect();
    if (event.clientX < canvasRect.left || event.clientX > canvasRect.right || event.clientY < canvasRect.top || event.clientY > canvasRect.bottom) return;

    const displayX = event.clientX - canvasRect.left;
    const displayY = event.clientY - canvasRect.top;
    const marker = {
        displayX,
        displayY,
        radiusX: Math.max(92, canvasRect.width * 0.115),
        radiusY: Math.max(34, canvasRect.height * 0.035),
    };
    state.lastHighlightByPage.set(state.currentPage, marker);
    showHighlight(marker);
}

function showHighlight(marker) {
    els.measureHighlight.style.left = `${marker.displayX}px`;
    els.measureHighlight.style.top = `${marker.displayY}px`;
    els.measureHighlight.style.width = `${marker.radiusX * 2}px`;
    els.measureHighlight.style.height = `${marker.radiusY * 2}px`;
    els.measureHighlight.classList.remove('hidden');
}

function restoreHighlightForCurrentPage() {
    const marker = state.lastHighlightByPage.get(state.currentPage);
    if (marker) {
        showHighlight(marker);
    } else {
        els.measureHighlight.classList.add('hidden');
    }
}

function previousPage() {
    if (state.currentPage > 1) setPage(state.currentPage - 1);
}

function nextPage() {
    if (state.currentPage < state.pageCount) setPage(state.currentPage + 1);
}

async function setPage(pageNumber) {
    const clamped = Math.max(1, Math.min(state.pageCount, pageNumber));
    if (clamped === state.currentPage) return;
    state.currentPage = clamped;
    els.pageSlider.value = String(clamped);
    await renderCurrentPage();
    updateControls();
}

function updatePageIndicator() {
    els.pageIndicator.textContent = `Page ${state.currentPage} / ${state.pageCount}`;
    els.pageSlider.value = String(state.currentPage);
}

function updateControls() {
    els.previousPageButton.disabled = !state.hasPdf || state.currentPage <= 1;
    els.nextPageButton.disabled = !state.hasPdf || state.currentPage >= state.pageCount;
    els.recordButton.disabled = !(state.hasPdf && state.hasMedia) && !state.isRecording;
}

function loadVideoFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
        setStatus('Please load a video file or paste a YouTube URL. Audio files are not supported as local uploads.');
        event.target.value = '';
        return;
    }

    cleanupMedia();
    state.localObjectUrl = URL.createObjectURL(file);
    state.mediaType = 'video-file';
    els.videoPlayer.src = state.localObjectUrl;
    els.videoPlayer.classList.remove('hidden');
    els.mediaPanel.classList.remove('hidden');
    state.hasMedia = true;

    setStatus(`Loaded video file: ${file.name}`);
    updateControls();
}

function loadYoutubeFromInput() {
    const rawUrl = els.youtubeUrlInput.value.trim();
    if (!rawUrl) {
        setStatus('Paste a YouTube URL first.');
        return;
    }

    let parsed;
    try {
        parsed = parseYoutubeUrl(rawUrl);
    } catch (error) {
        setStatus(error.message);
        return;
    }

    cleanupMedia();
    state.mediaType = 'youtube';
    state.youtubeUrl = parsed.normalizedUrl;
    state.youtubeVideoId = parsed.videoId;

    const origin = encodeURIComponent(window.location.origin);
    els.youtubePlayer.src = `https://www.youtube.com/embed/${parsed.videoId}?enablejsapi=1&origin=${origin}&rel=0&playsinline=1`;
    els.youtubePlayer.classList.remove('hidden');
    els.youtubeAudio.src = `/api/youtube/audio?url=${encodeURIComponent(parsed.normalizedUrl)}`;
    els.youtubeAudio.load();
    els.mediaPanel.classList.remove('hidden');
    state.hasMedia = true;

    setStatus('Loaded YouTube link. Recording will use the Maven-bundled yt-dlp audio-only fallback when available.');
    updateControls();
}

function parseYoutubeUrl(rawUrl) {
    let normalized = rawUrl.trim();
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;

    let url;
    try {
        url = new URL(normalized);
    } catch (_) {
        throw new Error('Invalid YouTube URL.');
    }

    const hostname = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '').replace(/^music\./, '');
    let videoId = '';

    if (hostname === 'youtu.be') {
        videoId = url.pathname.split('/').filter(Boolean)[0] || '';
    } else if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
        if (url.pathname === '/watch') {
            videoId = url.searchParams.get('v') || '';
        } else {
            const parts = url.pathname.split('/').filter(Boolean);
            if (['embed', 'shorts', 'live'].includes(parts[0])) videoId = parts[1] || '';
        }
    }

    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        throw new Error('Could not find a valid YouTube video ID in that URL.');
    }

    return {
        videoId,
        normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
}

function cleanupMedia() {
    stopMedia();

    if (state.localObjectUrl) {
        URL.revokeObjectURL(state.localObjectUrl);
        state.localObjectUrl = null;
    }

    els.videoPlayer.removeAttribute('src');
    els.videoPlayer.load();
    els.videoPlayer.classList.add('hidden');

    els.youtubePlayer.removeAttribute('src');
    els.youtubePlayer.classList.add('hidden');
    els.youtubeAudio.removeAttribute('src');
    els.youtubeAudio.load();

    state.hasMedia = false;
    state.mediaType = null;
    state.youtubeUrl = null;
    state.youtubeVideoId = null;
    state.youtubeAudioCaptureStream = null;
}

async function playMedia(options = {}) {
    if (!state.hasMedia) return;

    if (state.mediaType === 'video-file') {
        if (options.restart) safeSetCurrentTime(els.videoPlayer, 0);
        await els.videoPlayer.play().catch(() => setStatus('Browser blocked video playback. Press Play inside the media element.'));
        return;
    }

    if (state.mediaType === 'youtube') {
        if (options.restart) {
            sendYoutubeCommand('seekTo', [0, true]);
            safeSetCurrentTime(els.youtubeAudio, 0);
        }

        if (options.forRecording && options.useYoutubeAudioFallback) {
            sendYoutubeCommand('mute');
            try {
                await els.youtubeAudio.play();
            } catch (_) {
                sendYoutubeCommand('unMute');
                setStatus('Could not start YouTube audio fallback. The visible YouTube player may play, but its audio cannot be captured by the recording.');
            }
        } else {
            els.youtubeAudio.pause();
            sendYoutubeCommand('unMute');
        }

        sendYoutubeCommand('playVideo');
    }
}

function pauseMedia() {
    if (!state.hasMedia) return;

    if (state.mediaType === 'video-file') {
        els.videoPlayer.pause();
    } else if (state.mediaType === 'youtube') {
        els.youtubeAudio.pause();
        sendYoutubeCommand('pauseVideo');
    }
}

function stopMedia() {
    if (state.mediaType === 'video-file') {
        els.videoPlayer.pause();
        safeSetCurrentTime(els.videoPlayer, 0);
    } else if (state.mediaType === 'youtube') {
        els.youtubeAudio.pause();
        safeSetCurrentTime(els.youtubeAudio, 0);
        sendYoutubeCommand('pauseVideo');
        sendYoutubeCommand('seekTo', [0, true]);
    } else {
        els.videoPlayer.pause();
        safeSetCurrentTime(els.videoPlayer, 0);
        els.youtubeAudio.pause();
        safeSetCurrentTime(els.youtubeAudio, 0);
    }
}

function safeSetCurrentTime(element, seconds) {
    try { element.currentTime = seconds; } catch (_) { }
}

function sendYoutubeCommand(func, args = []) {
    const target = els.youtubePlayer.contentWindow;
    if (!target) return;
    target.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube.com');
}

async function onRecordButton() {
    if (state.isRecording) {
        await stopRecording();
    } else {
        await startRecording();
    }
}

async function startRecording() {
    if (!HTMLCanvasElement.prototype.captureStream) {
        setStatus('This browser does not support canvas recording. Try Chrome, Edge, or Brave.');
        return;
    }
    if (!window.MediaRecorder) {
        setStatus('This browser does not support MediaRecorder. Try Chrome, Edge, or Brave.');
        return;
    }

    try {
        setStatus('Preparing PDF-only recording...');
        state.recordingCanvas = document.createElement('canvas');
        state.recordingCanvas.width = els.pdfCanvas.width;
        state.recordingCanvas.height = els.pdfCanvas.height;
        state.recordingContext = state.recordingCanvas.getContext('2d', { alpha: false });

        drawRecordingFrame();
        const stream = state.recordingCanvas.captureStream(30);
        const youtubeAudioFallbackReady = await addMediaAudioTracks(stream);

        const mimeType = chooseRecordingMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        state.recordedChunks = [];
        recorder.addEventListener('dataavailable', event => {
            if (event.data && event.data.size > 0) state.recordedChunks.push(event.data);
        });
        recorder.addEventListener('stop', saveRecording);

        state.mediaRecorder = recorder;
        state.recordingStream = stream;
        state.isRecording = true;
        els.recordButton.textContent = 'Stop Recording';
        els.recordButton.classList.add('recording');
        updateControls();

        await countdown();
        await playMedia({ forRecording: true, restart: true, useYoutubeAudioFallback: youtubeAudioFallbackReady });
        startRecordingFrameLoop();
        recorder.start(1000);

        if (state.mediaType === 'youtube') {
            setStatus(youtubeAudioFallbackReady
                ? 'Recording PDF viewer only with YouTube audio fallback...'
                : 'Recording PDF viewer only. YouTube iframe audio cannot be captured without the bundled yt-dlp audio fallback.');
        } else {
            setStatus('Recording PDF viewer only...');
        }
    } catch (error) {
        stopRecordingFrameLoop();
        stopRecordingStreamTracks();
        state.isRecording = false;
        els.recordButton.textContent = 'Record';
        els.recordButton.classList.remove('recording');
        setStatus(`Recording failed: ${error.message}`);
        updateControls();
    }
}

async function addMediaAudioTracks(stream) {
    if (state.mediaType === 'video-file') {
        await waitForMediaReady(els.videoPlayer, 3000).catch(() => false);
        return addTracksFromMediaElement(stream, els.videoPlayer, 'uploaded video');
    }

    if (state.mediaType === 'youtube') {
        const ready = await waitForMediaReady(els.youtubeAudio, 7000).catch(() => false);
        if (!ready) return false;
        return addTracksFromMediaElement(stream, els.youtubeAudio, 'YouTube audio fallback');
    }

    return false;
}

function addTracksFromMediaElement(stream, mediaElement, label) {
    const captureStream = mediaElement.captureStream || mediaElement.mozCaptureStream;
    if (!captureStream) {
        setStatus(`This browser cannot capture ${label} audio. The recording will be silent.`);
        return false;
    }

    const mediaStream = captureStream.call(mediaElement);
    const audioTracks = mediaStream.getAudioTracks();
    if (!audioTracks.length) return false;

    for (const track of audioTracks) stream.addTrack(track);
    if (label === 'YouTube audio fallback') state.youtubeAudioCaptureStream = mediaStream;
    return true;
}

function waitForMediaReady(mediaElement, timeoutMs) {
    if (mediaElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve(true);

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => cleanup(false), timeoutMs);
        const onReady = () => cleanup(true);
        const onError = () => cleanup(false);

        function cleanup(success) {
            clearTimeout(timeout);
            mediaElement.removeEventListener('loadedmetadata', onReady);
            mediaElement.removeEventListener('canplay', onReady);
            mediaElement.removeEventListener('error', onError);
            success ? resolve(true) : reject(new Error('Media not ready'));
        }

        mediaElement.addEventListener('loadedmetadata', onReady, { once: true });
        mediaElement.addEventListener('canplay', onReady, { once: true });
        mediaElement.addEventListener('error', onError, { once: true });
        mediaElement.load();
    });
}

function startRecordingFrameLoop() {
    const draw = () => {
        drawRecordingFrame();
        state.recordingFrameRequest = requestAnimationFrame(draw);
    };
    state.recordingFrameRequest = requestAnimationFrame(draw);
}

function stopRecordingFrameLoop() {
    if (state.recordingFrameRequest) {
        cancelAnimationFrame(state.recordingFrameRequest);
        state.recordingFrameRequest = null;
    }
}

function drawRecordingFrame() {
    if (!state.recordingContext || !state.recordingCanvas) return;

    const source = els.pdfCanvas;
    if (state.recordingCanvas.width !== source.width || state.recordingCanvas.height !== source.height) {
        state.recordingCanvas.width = source.width;
        state.recordingCanvas.height = source.height;
    }

    const ctx = state.recordingContext;
    ctx.drawImage(source, 0, 0, state.recordingCanvas.width, state.recordingCanvas.height);
    drawRecordedHighlight(ctx);
}

function drawRecordedHighlight(ctx) {
    const marker = state.lastHighlightByPage.get(state.currentPage);
    if (!marker) return;

    const x = marker.displayX * state.canvasScaleX;
    const y = marker.displayY * state.canvasScaleY;
    const radiusX = marker.radiusX * state.canvasScaleX;
    const radiusY = marker.radiusY * state.canvasScaleY;

    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = state.recordingCanvas.width;
    overlayCanvas.height = state.recordingCanvas.height;
    const overlayCtx = overlayCanvas.getContext('2d');

    overlayCtx.save();
    overlayCtx.translate(x, y);
    overlayCtx.scale(radiusX, radiusY);

    const gradient = overlayCtx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const stop of HIGHLIGHT_STYLE.gradientStops) {
        gradient.addColorStop(stop.offset, stop.color);
    }

    overlayCtx.fillStyle = gradient;
    overlayCtx.beginPath();
    overlayCtx.arc(0, 0, 1, 0, Math.PI * 2);
    overlayCtx.fill();

    overlayCtx.globalAlpha = 0.36;
    overlayCtx.fill();
    overlayCtx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(overlayCanvas, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(radiusX, radiusY);
    ctx.strokeStyle = HIGHLIGHT_STYLE.stroke;
    ctx.lineWidth = 1.2 / Math.max(radiusX, radiusY);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

async function stopRecording() {
    pauseMedia();
    stopRecordingFrameLoop();

    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
    }
    stopRecordingStreamTracks();
    state.isRecording = false;
    els.recordButton.textContent = 'Record';
    els.recordButton.classList.remove('recording');
    updateControls();
    setStatus('Preparing recorded file...');
}

function stopRecordingStreamTracks() {
    if (state.recordingStream) {
        state.recordingStream.getTracks().forEach(track => track.stop());
        state.recordingStream = null;
    }
    if (state.youtubeAudioCaptureStream) {
        state.youtubeAudioCaptureStream.getTracks().forEach(track => track.stop());
        state.youtubeAudioCaptureStream = null;
    }
}

function chooseRecordingMimeType() {
    const candidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
    ];
    return candidates.find(type => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || '';
}

async function countdown() {
    els.countdown.classList.remove('hidden');
    for (const value of ['3', '2', '1']) {
        els.countdown.textContent = value;
        await sleep(700);
    }
    els.countdown.classList.add('hidden');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function saveRecording() {
    const type = state.mediaRecorder?.mimeType || 'video/webm';
    const extension = type.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(state.recordedChunks, { type });
    const defaultName = `scorepointer-pdf-viewer-recording-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${extension}`;

    try {
        if ('showSaveFilePicker' in window) {
            const handle = await window.showSaveFilePicker({
                suggestedName: defaultName,
                types: [{
                    description: extension.toUpperCase() + ' video',
                    accept: { [type]: [`.${extension}`] },
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            setStatus(`Recording saved as ${handle.name}`);
        } else {
            downloadBlob(blob, defaultName);
            setStatus('Recording downloaded. Your browser may ask where to save it depending on settings.');
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            downloadBlob(blob, defaultName);
            setStatus(`Save picker failed. Downloaded instead: ${error.message}`);
        } else {
            setStatus('Save cancelled. Recording kept only until page refresh.');
        }
    } finally {
        state.recordingCanvas = null;
        state.recordingContext = null;
    }
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function setStatus(message) {
    els.status.textContent = message;
}

updateControls();
