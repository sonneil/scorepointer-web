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
    recordingLayout: null,
    isRecording: false,
    localObjectUrl: null,
    youtubeUrl: null,
    youtubeVideoId: null,
    youtubeAudioCaptureStream: null,
    mediaAudioCaptureStream: null,
    microphoneStream: null,
    microphonePermissionRequested: false,
    microphonePermissionGranted: false,
    microphonePermissionPending: false,
    recordingAudioContext: null,
    recordingAudioDestination: null,
    recordingAudioSources: [],
    mediaElementAudioSources: new Map(),
    mediaDrag: {
        userPosition: null,
        isDragging: false,
        pointerId: null,
        offsetX: 0,
        offsetY: 0,
    },
    lastRecordingObjectUrl: null,
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
    toolbar: document.querySelector('.toolbar'),
    pdfInput: document.getElementById('pdfInput'),
    mediaFileInput: document.getElementById('mediaFileInput'),
    youtubeUrlInput: document.getElementById('youtubeUrlInput'),
    loadYoutubeButton: document.getElementById('loadYoutubeButton'),
    recordButton: document.getElementById('recordButton'),
    microphoneSelect: document.getElementById('microphoneSelect'),
    enableMicrophoneCheckbox: document.getElementById('enableMicrophoneCheckbox'),
    status: document.getElementById('status'),
    stage: document.getElementById('stage'),
    emptyState: document.getElementById('emptyState'),
    pdfViewer: document.getElementById('pdfViewer'),
    canvasWrap: document.getElementById('canvasWrap'),
    pdfCanvas: document.getElementById('pdfCanvas'),
    measureHighlight: document.getElementById('measureHighlight'),
    pageControls: document.getElementById('pageControls'),
    previousPageButton: document.getElementById('previousPageButton'),
    nextPageButton: document.getElementById('nextPageButton'),
    floatingPreviousPageButton: document.getElementById('floatingPreviousPageButton'),
    floatingNextPageButton: document.getElementById('floatingNextPageButton'),
    pageSlider: document.getElementById('pageSlider'),
    pageIndicator: document.getElementById('pageIndicator'),
    mediaPanel: document.getElementById('mediaPanel'),
    mediaDragHandle: document.getElementById('mediaDragHandle'),
    videoPlayer: document.getElementById('videoPlayer'),
    youtubePlayer: document.getElementById('youtubePlayer'),
    youtubeAudio: document.getElementById('youtubeAudio'),
    playButton: document.getElementById('playButton'),
    pauseButton: document.getElementById('pauseButton'),
    stopButton: document.getElementById('stopButton'),
    countdown: document.getElementById('countdown'),
    microphoneDialog: document.getElementById('microphoneDialog'),
    microphoneDialogMessage: document.getElementById('microphoneDialogMessage'),
    dialogMicrophoneSelect: document.getElementById('dialogMicrophoneSelect'),
    microphoneDialogCancel: document.getElementById('microphoneDialogCancel'),
    microphoneDialogConfirm: document.getElementById('microphoneDialogConfirm'),
    recordingDownloadDialog: document.getElementById('recordingDownloadDialog'),
    recordingDownloadMessage: document.getElementById('recordingDownloadMessage'),
    recordingDownloadLink: document.getElementById('recordingDownloadLink'),
    recordingOpenLink: document.getElementById('recordingOpenLink'),
    recordingDownloadClose: document.getElementById('recordingDownloadClose'),
    recordingPrepareOverlay: document.getElementById('recordingPrepareOverlay'),
    recordingPrepareMessage: document.getElementById('recordingPrepareMessage'),
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
els.microphoneSelect.addEventListener('focus', onMicrophoneSelectorInteraction);
els.microphoneSelect.addEventListener('pointerdown', onMicrophoneSelectorInteraction);
els.microphoneSelect.addEventListener('click', onMicrophoneSelectorInteraction);
els.enableMicrophoneCheckbox.addEventListener('change', onEnableMicrophoneChanged);
els.recordingDownloadClose.addEventListener('click', () => els.recordingDownloadDialog?.close?.());
els.playButton.addEventListener('click', () => playMedia());
els.pauseButton.addEventListener('click', pauseMedia);
els.stopButton.addEventListener('click', stopMedia);
els.mediaDragHandle.addEventListener('pointerdown', startMediaPanelDrag);
els.mediaDragHandle.addEventListener('dblclick', resetMediaPanelPosition);
els.canvasWrap.addEventListener('click', placeHighlightFromClick);
els.previousPageButton.addEventListener('click', previousPage);
els.nextPageButton.addEventListener('click', nextPage);
els.floatingPreviousPageButton.addEventListener('click', previousPage);
els.floatingNextPageButton.addEventListener('click', nextPage);
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
    updateMediaLayout();
    applyMediaPanelPosition();
    if (state.hasPdf) renderCurrentPage();
});

window.visualViewport?.addEventListener('resize', () => {
    updateMediaLayout();
    applyMediaPanelPosition();
    if (state.hasPdf) renderCurrentPage();
});

if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', refreshMicrophoneDevices);
}

function isTypingTarget(target) {
    return target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function getToolbarHeight() {
    return els.toolbar?.offsetHeight || 64;
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
    const mediaLayoutActive = isMediaSideLayoutActive();
    const availableWidth = (mediaLayoutActive ? window.innerWidth * 0.5 : window.innerWidth) - 24;
    const availableHeight = window.innerHeight - getToolbarHeight() - 54 - 16;
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
    const previousDisabled = !state.hasPdf || state.currentPage <= 1;
    const nextDisabled = !state.hasPdf || state.currentPage >= state.pageCount;

    els.previousPageButton.disabled = previousDisabled;
    els.nextPageButton.disabled = nextDisabled;
    els.floatingPreviousPageButton.disabled = previousDisabled;
    els.floatingNextPageButton.disabled = nextDisabled;

    // Keep Start Recording clickable once a PDF is loaded so we can show a clear dialog
    // when neither video nor microphone is enabled.
    els.recordButton.disabled = !state.isRecording && !state.hasPdf;

    updateMicrophoneControls();
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
    els.videoPlayer.preload = 'auto';
    els.videoPlayer.src = state.localObjectUrl;
    els.videoPlayer.load();
    els.videoPlayer.classList.remove('hidden');
    els.mediaPanel.classList.remove('hidden');
    state.hasMedia = true;
    updateMediaLayout();
    applyMediaPanelPosition();
    if (state.hasPdf) renderCurrentPage();

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
    updateMediaLayout();
    applyMediaPanelPosition();
    if (state.hasPdf) renderCurrentPage();
    showYoutubeAudioOnlyDialog();

    setStatus('Loaded YouTube link. Recording will include only YouTube audio through the Maven-bundled yt-dlp fallback when available.');
    updateControls();
}

function showYoutubeAudioOnlyDialog() {
    window.alert('For YouTube videos, the recording will include audio only. The YouTube video preview will be visible while you play, but browser security does not allow the app to include the YouTube iframe video image in the recording.');
}

function isMediaSideLayoutActive() {
    return state.hasMedia && window.innerWidth > 900;
}

function updateMediaLayout() {
    els.stage.classList.toggle('media-layout', isMediaSideLayoutActive());
    applyMediaPanelPosition();
}

function startMediaPanelDrag(event) {
    if (!state.hasMedia) return;

    event.preventDefault();
    event.stopPropagation();

    const panelRect = els.mediaPanel.getBoundingClientRect();
    state.mediaDrag.isDragging = true;
    state.mediaDrag.pointerId = event.pointerId;
    state.mediaDrag.offsetX = event.clientX - panelRect.left;
    state.mediaDrag.offsetY = event.clientY - panelRect.top;

    els.mediaPanel.classList.add('media-dragging');
    els.mediaDragHandle.setPointerCapture?.(event.pointerId);

    document.addEventListener('pointermove', moveMediaPanelDrag);
    document.addEventListener('pointerup', stopMediaPanelDrag, { once: true });
    document.addEventListener('pointercancel', stopMediaPanelDrag, { once: true });
}

function moveMediaPanelDrag(event) {
    if (!state.mediaDrag.isDragging) return;
    if (state.mediaDrag.pointerId !== null && event.pointerId !== state.mediaDrag.pointerId) return;

    event.preventDefault();

    const stageRect = els.stage.getBoundingClientRect();
    const nextPosition = {
        x: event.clientX - stageRect.left - state.mediaDrag.offsetX,
        y: event.clientY - stageRect.top - state.mediaDrag.offsetY,
    };

    state.mediaDrag.userPosition = constrainMediaPanelPosition(nextPosition);
    applyMediaPanelPosition();
}

function stopMediaPanelDrag() {
    if (state.mediaDrag.pointerId !== null) {
        try { els.mediaDragHandle.releasePointerCapture?.(state.mediaDrag.pointerId); } catch (_) { }
    }

    state.mediaDrag.isDragging = false;
    state.mediaDrag.pointerId = null;
    els.mediaPanel.classList.remove('media-dragging');

    document.removeEventListener('pointermove', moveMediaPanelDrag);
    document.removeEventListener('pointerup', stopMediaPanelDrag);
    document.removeEventListener('pointercancel', stopMediaPanelDrag);
}

function resetMediaPanelPosition(options = {}) {
    state.mediaDrag.userPosition = null;
    state.mediaDrag.isDragging = false;
    state.mediaDrag.pointerId = null;

    els.mediaPanel.classList.remove('media-dragged', 'media-dragging');
    els.mediaPanel.style.left = '';
    els.mediaPanel.style.top = '';
    els.mediaPanel.style.right = '';
    els.mediaPanel.style.bottom = '';
    els.mediaPanel.style.transform = '';

    if (!options.silent) {
        updateMediaLayout();
    }
}

function applyMediaPanelPosition() {
    if (!state.hasMedia || !state.mediaDrag.userPosition) return;

    const constrained = constrainMediaPanelPosition(state.mediaDrag.userPosition);
    state.mediaDrag.userPosition = constrained;

    els.mediaPanel.classList.add('media-dragged');
    els.mediaPanel.style.left = `${constrained.x}px`;
    els.mediaPanel.style.top = `${constrained.y}px`;
    els.mediaPanel.style.right = 'auto';
    els.mediaPanel.style.bottom = 'auto';
    els.mediaPanel.style.transform = 'none';
}

function constrainMediaPanelPosition(position) {
    const stageRect = els.stage.getBoundingClientRect();
    const panelRect = els.mediaPanel.getBoundingClientRect();
    const margin = 6;
    const width = panelRect.width || 180;
    const height = panelRect.height || 120;

    const maxX = Math.max(margin, stageRect.width - width - margin);
    const maxY = Math.max(margin, stageRect.height - height - margin);

    return {
        x: Math.min(Math.max(position.x, margin), maxX),
        y: Math.min(Math.max(position.y, margin), maxY),
    };
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
    resetMediaPanelPosition({ silent: true });
    updateMediaLayout();
    if (state.hasPdf) renderCurrentPage();
}

async function playMedia(options = {}) {
    if (!state.hasMedia) return;

    if (state.mediaType === 'video-file') {
        if (options.restart) safeSetCurrentTime(els.videoPlayer, 0);
        try {
            await els.videoPlayer.play();
            await waitForMediaReady(els.videoPlayer, 0, {
                minReadyState: HTMLMediaElement.HAVE_CURRENT_DATA,
                callLoad: false,
            });
        } catch (_) {
            setStatus('Browser blocked video playback or video is not ready. Press Play inside the media element.');
        }
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

async function unlockMediaPlaybackForRecording() {
    if (!state.hasMedia) return;

    if (state.mediaType === 'video-file') {
        const previousVolume = els.videoPlayer.volume;
        try {
            safeSetCurrentTime(els.videoPlayer, 0);
            els.videoPlayer.volume = 0;
            await els.videoPlayer.play();
            await waitForMediaReady(els.videoPlayer, 800, {
                minReadyState: HTMLMediaElement.HAVE_CURRENT_DATA,
                callLoad: false,
            }).catch(() => false);
            await waitForVideoPlaybackFrame(els.videoPlayer, 800).catch(() => false);
        } catch (_) {
            // The final play attempt after the countdown will show the user-facing status if blocked.
        } finally {
            els.videoPlayer.pause();
            els.videoPlayer.volume = previousVolume;
            safeSetCurrentTime(els.videoPlayer, 0);
        }
        return;
    }

    if (state.mediaType === 'youtube') {
        try {
            safeSetCurrentTime(els.youtubeAudio, 0);
            await els.youtubeAudio.play();
            els.youtubeAudio.pause();
            safeSetCurrentTime(els.youtubeAudio, 0);
        } catch (_) {
            // The YouTube audio fallback may still become available before the real recording starts.
        }
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

async function waitForYouTubeAudioFallbackForRecording() {
    if (state.mediaType !== 'youtube') return false;

    const message = 'Preparing YouTube audio fallback. Recording will start when the audio stream is ready...';
    setStatus(message);
    setRecordingPrepareOverlayMessage(message);
    safeSetCurrentTime(els.youtubeAudio, 0);

    try {
        await waitForMediaReady(els.youtubeAudio, 0, {
            minReadyState: HTMLMediaElement.HAVE_CURRENT_DATA,
            callLoad: true,
        });
        setRecordingPrepareOverlayMessage('YouTube audio fallback is ready. Preparing recording...');
        return true;
    } catch (error) {
        setStatus(`YouTube audio fallback is unavailable: ${error.message}. The visible YouTube player may play, but its audio cannot be captured by the recording.`);
        setRecordingPrepareOverlayMessage('YouTube fallback is unavailable. Starting PDF-only recording...');
        return false;
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

    if (!state.hasMedia && !isMicrophoneRecordingEnabled()) {
        showStartPointerRequirementDialog();
        return;
    }

    if (isMicrophoneRecordingEnabled() && !state.microphonePermissionGranted) {
        const configured = await openMicrophoneSetupDialog();
        if (!configured) {
            els.enableMicrophoneCheckbox.checked = false;
            updateControls();
            if (!state.hasMedia) {
                showStartPointerRequirementDialog();
                return;
            }
        }
    }

    const mediaUnlockPromise = unlockMediaPlaybackForRecording();

    showRecordingPrepareOverlay('Preparing recording...');

    try {
        setStatus('Preparing recording...');

        const includeUploadedVideo = state.mediaType === 'video-file'
            ? await ensureUploadedVideoMetadataReady()
            : false;
        const youtubeAudioFallbackReadyBeforePlayback = state.mediaType === 'youtube'
            ? await waitForYouTubeAudioFallbackForRecording()
            : false;
        setRecordingPrepareOverlayMessage('Preparing recording canvas...');

        state.recordingLayout = createRecordingLayout(includeUploadedVideo);
        state.recordingCanvas = document.createElement('canvas');
        state.recordingCanvas.width = state.recordingLayout.canvasWidth;
        state.recordingCanvas.height = state.recordingLayout.canvasHeight;
        state.recordingContext = state.recordingCanvas.getContext('2d', { alpha: false });

        drawRecordingFrame();
        const stream = state.recordingCanvas.captureStream(30);
        state.recordingStream = stream;

        state.isRecording = true;
        els.recordButton.textContent = 'Stop Recording';
        els.recordButton.classList.add('recording');
        updateControls();

        setRecordingPrepareOverlayMessage('Unlocking media playback...');
        await mediaUnlockPromise;
        hideRecordingPrepareOverlay();
        await countdown();
        await playMedia({
            forRecording: true,
            restart: true,
            useYoutubeAudioFallback: youtubeAudioFallbackReadyBeforePlayback,
        });

        if (state.mediaType === 'video-file') {
            await waitForVideoPlaybackFrame(els.videoPlayer, 1500).catch(() => false);
            drawRecordingFrame();
        }
        const audioState = await addRecordingAudioTracks(stream);
        const youtubeAudioFallbackReady = audioState.youtubeAudioFallbackReady;

        if (!state.hasMedia && audioState.microphoneRequested && !audioState.microphoneReady) {
            stopRecordingFrameLoop();
            stopRecordingStreamTracks();
            state.recordingCanvas = null;
            state.recordingContext = null;
            state.recordingLayout = null;
            state.isRecording = false;
            els.recordButton.textContent = 'Start Recording';
            els.recordButton.classList.remove('recording');
            hideRecordingPrepareOverlay();
            updateControls();
            showStartPointerRequirementDialog();
            return;
        }

        const mimeType = chooseRecordingMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        state.recordedChunks = [];
        recorder.addEventListener('dataavailable', event => {
            if (event.data && event.data.size > 0) state.recordedChunks.push(event.data);
        });
        recorder.addEventListener('stop', saveRecording);

        state.mediaRecorder = recorder;
        startRecordingFrameLoop();
        recorder.start(1000);

        const microphoneStatus = audioState.microphoneReady
            ? ' and microphone'
            : audioState.microphoneRequested
                ? ' without microphone'
                : '';

        if (state.mediaType === 'video-file') {
            setStatus(audioState.mediaAudioReady
                ? `Recording PDF viewer, uploaded video, video audio${microphoneStatus}...`
                : `Recording PDF viewer and uploaded video${microphoneStatus}. No video audio track was captured.`);
        } else if (state.mediaType === 'youtube') {
            setStatus(youtubeAudioFallbackReady
                ? `Recording PDF viewer with YouTube audio fallback${microphoneStatus}. YouTube recording is audio-only.`
                : `Recording PDF viewer only${microphoneStatus}. YouTube audio fallback is unavailable.`);
        } else {
            setStatus(`Recording PDF viewer${microphoneStatus}...`);
        }
    } catch (error) {
        stopRecordingFrameLoop();
        stopRecordingStreamTracks();
        state.recordingCanvas = null;
        state.recordingContext = null;
        state.recordingLayout = null;
        state.isRecording = false;
        els.recordButton.textContent = 'Start Recording';
        els.recordButton.classList.remove('recording');
        hideRecordingPrepareOverlay();
        setStatus(`Recording failed: ${error.message}`);
        updateControls();
    }
}

async function addRecordingAudioTracks(recordingStream) {
    const audioState = {
        mediaAudioReady: false,
        youtubeAudioFallbackReady: false,
        microphoneRequested: isMicrophoneRecordingEnabled(),
        microphoneReady: false,
    };

    audioState.mediaAudioReady = await addMediaAudioToRecordingMixer();
    audioState.youtubeAudioFallbackReady = state.mediaType === 'youtube' && audioState.mediaAudioReady;

    if (audioState.microphoneRequested) {
        const microphoneStream = await getSelectedMicrophoneStream();
        if (microphoneStream) {
            state.microphoneStream = microphoneStream;
            audioState.microphoneReady = connectStreamToRecordingMixer(microphoneStream);
            refreshMicrophoneDevices();
        }
    }

    if (state.recordingAudioDestination) {
        for (const track of state.recordingAudioDestination.stream.getAudioTracks()) {
            recordingStream.addTrack(track);
        }
        await state.recordingAudioContext?.resume?.();
    }

    return audioState;
}

async function addMediaAudioToRecordingMixer() {
    const mediaAudioStream = await getMediaAudioStream();
    if (mediaAudioStream && connectStreamToRecordingMixer(mediaAudioStream)) {
        return true;
    }

    if (state.mediaType === 'video-file') {
        return connectMediaElementAudioToRecordingMixer(els.videoPlayer, 'uploaded video');
    }

    if (state.mediaType === 'youtube') {
        return connectMediaElementAudioToRecordingMixer(els.youtubeAudio, 'YouTube audio fallback');
    }

    return false;
}

async function getMediaAudioStream() {
    if (state.mediaType === 'video-file') {
        await waitForVideoPlaybackFrame(els.videoPlayer, 1500).catch(() => false);
        state.mediaAudioCaptureStream = await captureAudioStreamFromMediaElement(els.videoPlayer, 'uploaded video');
        return state.mediaAudioCaptureStream;
    }

    if (state.mediaType === 'youtube') {
        const ready = await waitForMediaReady(els.youtubeAudio, 0, {
            minReadyState: HTMLMediaElement.HAVE_CURRENT_DATA,
            callLoad: false,
        }).catch(() => false);
        if (!ready) return null;
        state.youtubeAudioCaptureStream = await captureAudioStreamFromMediaElement(els.youtubeAudio, 'YouTube audio fallback');
        return state.youtubeAudioCaptureStream;
    }

    return null;
}

async function captureAudioStreamFromMediaElement(mediaElement, label) {
    const captureStream = mediaElement.captureStream || mediaElement.mozCaptureStream;
    if (!captureStream) {
        // Safari/iPad often lacks HTMLMediaElement.captureStream().
        // We fall back to Web Audio in addMediaAudioToRecordingMixer().
        return null;
    }

    const mediaStream = captureStream.call(mediaElement);
    if (!mediaStream.getAudioTracks().length) {
        await waitForStreamAudioTrack(mediaStream, 1200).catch(() => false);
    }

    return mediaStream.getAudioTracks().length ? mediaStream : null;
}

function waitForStreamAudioTrack(mediaStream, timeoutMs) {
    if (mediaStream.getAudioTracks().length) return Promise.resolve(true);

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => cleanup(false), timeoutMs);
        const onAddTrack = () => cleanup(mediaStream.getAudioTracks().length > 0);

        function cleanup(success) {
            clearTimeout(timeout);
            mediaStream.removeEventListener('addtrack', onAddTrack);
            success ? resolve(true) : reject(new Error('No audio track available'));
        }

        mediaStream.addEventListener('addtrack', onAddTrack);
    });
}

function isMicrophoneRecordingEnabled() {
    return Boolean(els.enableMicrophoneCheckbox.checked && navigator.mediaDevices?.getUserMedia);
}

function showStartPointerRequirementDialog() {
    const message = 'Please enable your microphone or load a Video to start the pointer';
    window.alert(message);
    setStatus(message);
}

function getSelectedMicrophoneConstraints() {
    const deviceId = els.microphoneSelect.value;
    return deviceId ? { deviceId: { exact: deviceId } } : true;
}

async function onMicrophoneSelectorInteraction() {
    if (state.isRecording) return;

    if (!els.enableMicrophoneCheckbox.checked) {
        setStatus('Enable microphone first to choose an input device.');
        return;
    }

    if (!state.microphonePermissionGranted) {
        await openMicrophoneSetupDialog();
        return;
    }

    await refreshMicrophoneDevices();
}

async function onEnableMicrophoneChanged() {
    updateControls();

    if (!els.enableMicrophoneCheckbox.checked) {
        setStatus(state.hasMedia
            ? 'Microphone recording disabled. Recording will use only multimedia audio.'
            : 'Microphone disabled. Load a video or enable microphone to start the pointer.');
        return;
    }

    const configured = await openMicrophoneSetupDialog();
    if (!configured) {
        els.enableMicrophoneCheckbox.checked = false;
        updateControls();
        setStatus('Microphone recording was not enabled.');
    }
}

async function openMicrophoneSetupDialog() {
    if (!navigator.mediaDevices?.getUserMedia) {
        const message = window.isSecureContext === false
            ? 'Microphone access requires HTTPS on iPad/Safari when opening the app from another device. Open the app through HTTPS, or run it directly on localhost.'
            : 'This browser cannot access a microphone.';
        window.alert(message);
        setStatus(message);
        return false;
    }

    if (!els.microphoneDialog || typeof els.microphoneDialog.showModal !== 'function') {
        const granted = await requestMicrophonePermission();
        if (!granted) return false;
        await refreshMicrophoneDevices();
        openNativeMicrophonePicker();
        return true;
    }

    await refreshMicrophoneDevices();
    syncDialogMicrophoneOptions();
    updateMicrophoneDialogMode();

    if (!els.microphoneDialog.open) {
        els.microphoneDialog.showModal();
    }

    return new Promise((resolve) => {
        const cleanup = () => {
            els.microphoneDialogCancel.removeEventListener('click', onCancel);
            els.microphoneDialogConfirm.removeEventListener('click', onConfirm);
            els.microphoneDialog.removeEventListener('cancel', onCancel);
        };

        const closeWith = (result) => {
            cleanup();
            if (els.microphoneDialog.open) els.microphoneDialog.close();
            resolve(result);
        };

        const onCancel = (event) => {
            event?.preventDefault?.();
            closeWith(false);
        };

        const onConfirm = async (event) => {
            event.preventDefault();

            if (!state.microphonePermissionGranted) {
                els.microphoneDialogConfirm.disabled = true;
                const granted = await requestMicrophonePermission();
                els.microphoneDialogConfirm.disabled = false;

                if (!granted) {
                    updateMicrophoneDialogMode('Microphone permission was not granted. Allow access to enable microphone recording.');
                    return;
                }

                await refreshMicrophoneDevices();
                syncDialogMicrophoneOptions();
                updateMicrophoneDialogMode('Permission granted. Select the preferred input device and confirm.');
                return;
            }

            els.microphoneSelect.value = els.dialogMicrophoneSelect.value;
            setStatus('Microphone recording enabled.');
            closeWith(true);
        };

        els.microphoneDialogCancel.addEventListener('click', onCancel);
        els.microphoneDialogConfirm.addEventListener('click', onConfirm);
        els.microphoneDialog.addEventListener('cancel', onCancel);
    });
}

async function requestMicrophonePermission() {
    if (state.microphonePermissionPending) return false;

    try {
        state.microphonePermissionPending = true;
        setStatus('Requesting microphone permission...');

        const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        permissionStream.getTracks().forEach(track => track.stop());

        state.microphonePermissionRequested = true;
        state.microphonePermissionGranted = true;
        return true;
    } catch (error) {
        state.microphonePermissionRequested = true;
        state.microphonePermissionGranted = false;
        setStatus(`Microphone access was not granted: ${error.message}`);
        return false;
    } finally {
        state.microphonePermissionPending = false;
        updateControls();
    }
}

function syncDialogMicrophoneOptions() {
    const previousValue = els.dialogMicrophoneSelect.value || els.microphoneSelect.value;
    els.dialogMicrophoneSelect.innerHTML = '';

    for (const option of els.microphoneSelect.options) {
        els.dialogMicrophoneSelect.appendChild(new Option(option.textContent, option.value));
    }

    if ([...els.dialogMicrophoneSelect.options].some(option => option.value === previousValue)) {
        els.dialogMicrophoneSelect.value = previousValue;
    }
}

function updateMicrophoneDialogMode(messageOverride = '') {
    const hasPermission = state.microphonePermissionGranted;
    els.dialogMicrophoneSelect.disabled = !hasPermission;
    els.microphoneDialogConfirm.textContent = hasPermission ? 'Use selected microphone' : 'Allow microphone access';
    els.microphoneDialogMessage.textContent = messageOverride || (hasPermission
        ? 'Select the preferred microphone input for the recording.'
        : 'The browser will ask for microphone permission. After granting access, you can select the preferred input device.');
}

function openNativeMicrophonePicker() {
    if (typeof els.microphoneSelect.showPicker === 'function') {
        setTimeout(() => {
            try { els.microphoneSelect.showPicker(); } catch (_) { }
        }, 0);
    } else {
        els.microphoneSelect.focus();
    }
}

async function getSelectedMicrophoneStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('This browser cannot access a microphone. Recording will continue without microphone audio.');
        return null;
    }

    if (!state.microphonePermissionGranted) {
        setStatus('Enable microphone and grant access before recording with microphone audio.');
        return null;
    }

    try {
        return await navigator.mediaDevices.getUserMedia({ audio: getSelectedMicrophoneConstraints(), video: false });
    } catch (error) {
        setStatus(`Could not access the selected microphone. Recording will continue without microphone audio: ${error.message}`);
        return null;
    }
}

function connectStreamToRecordingMixer(mediaStream) {
    const audioTracks = mediaStream.getAudioTracks();
    if (!audioTracks.length) return false;

    const audioContext = ensureRecordingAudioContext();
    if (!audioContext) return false;

    const source = audioContext.createMediaStreamSource(mediaStream);
    return connectAudioNodeToRecordingDestination(source);
}

function connectMediaElementAudioToRecordingMixer(mediaElement, label) {
    if (!mediaElement || mediaElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;

    const audioContext = ensureRecordingAudioContext();
    if (!audioContext) return false;

    try {
        let entry = state.mediaElementAudioSources.get(mediaElement);
        if (!entry) {
            entry = {
                source: audioContext.createMediaElementSource(mediaElement),
                connectedToSpeakers: false,
            };
            state.mediaElementAudioSources.set(mediaElement, entry);
        }

        if (!entry.connectedToSpeakers) {
            entry.source.connect(audioContext.destination);
            entry.connectedToSpeakers = true;
        }

        return connectAudioNodeToRecordingDestination(entry.source);
    } catch (error) {
        setStatus(`Could not capture ${label} audio through Web Audio: ${error.message}`);
        return false;
    }
}

function connectAudioNodeToRecordingDestination(source) {
    const audioContext = ensureRecordingAudioContext();
    if (!audioContext || !state.recordingAudioDestination) return false;

    try {
        source.connect(state.recordingAudioDestination);
        state.recordingAudioSources.push({ source, destination: state.recordingAudioDestination });
        return true;
    } catch (_) {
        return false;
    }
}

function ensureRecordingAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        setStatus('This browser cannot mix multimedia and microphone audio. Recording will continue without audio.');
        return null;
    }

    if (!state.recordingAudioContext || state.recordingAudioContext.state === 'closed') {
        state.recordingAudioContext = new AudioContextClass();
    }

    if (!state.recordingAudioDestination) {
        state.recordingAudioDestination = state.recordingAudioContext.createMediaStreamDestination();
    }

    return state.recordingAudioContext;
}

function waitForMediaReady(mediaElement, timeoutMs = 0, options = {}) {
    const minReadyState = options.minReadyState ?? HTMLMediaElement.HAVE_CURRENT_DATA;
    const shouldCallLoad = options.callLoad !== false;

    if (mediaElement.readyState >= minReadyState) return Promise.resolve(true);

    return new Promise((resolve, reject) => {
        let done = false;
        const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
            ? setTimeout(() => cleanup(false, new Error('Media not ready before timeout')), timeoutMs)
            : null;

        const onMaybeReady = () => {
            if (mediaElement.readyState >= minReadyState) {
                cleanup(true);
            }
        };
        const onError = () => cleanup(false, getMediaElementError(mediaElement));

        function cleanup(success, error = null) {
            if (done) return;
            done = true;
            if (timeout) clearTimeout(timeout);

            mediaElement.removeEventListener('loadedmetadata', onMaybeReady);
            mediaElement.removeEventListener('durationchange', onMaybeReady);
            mediaElement.removeEventListener('loadeddata', onMaybeReady);
            mediaElement.removeEventListener('canplay', onMaybeReady);
            mediaElement.removeEventListener('canplaythrough', onMaybeReady);
            mediaElement.removeEventListener('playing', onMaybeReady);
            mediaElement.removeEventListener('progress', onMaybeReady);
            mediaElement.removeEventListener('error', onError);

            success ? resolve(true) : reject(error || new Error('Media not ready'));
        }

        mediaElement.addEventListener('loadedmetadata', onMaybeReady);
        mediaElement.addEventListener('durationchange', onMaybeReady);
        mediaElement.addEventListener('loadeddata', onMaybeReady);
        mediaElement.addEventListener('canplay', onMaybeReady);
        mediaElement.addEventListener('canplaythrough', onMaybeReady);
        mediaElement.addEventListener('playing', onMaybeReady);
        mediaElement.addEventListener('progress', onMaybeReady);
        mediaElement.addEventListener('error', onError, { once: true });

        if (shouldCallLoad && mediaElement.networkState === HTMLMediaElement.NETWORK_EMPTY) {
            mediaElement.load();
        }

        onMaybeReady();
    });
}

function getMediaElementError(mediaElement) {
    const error = mediaElement.error;
    if (!error) return new Error('Media failed to load');

    const errorNames = {
        [MediaError.MEDIA_ERR_ABORTED]: 'Media loading was aborted',
        [MediaError.MEDIA_ERR_NETWORK]: 'Network error while loading media',
        [MediaError.MEDIA_ERR_DECODE]: 'Media decode error',
        [MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED]: 'Media source is not supported',
    };

    return new Error(errorNames[error.code] || `Media error ${error.code}`);
}

function waitForMediaMetadata(mediaElement, timeoutMs) {
    if (mediaElement.readyState >= HTMLMediaElement.HAVE_METADATA
        && Number.isFinite(mediaElement.videoWidth)
        && Number.isFinite(mediaElement.videoHeight)) {
        return Promise.resolve(true);
    }

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => cleanup(false), timeoutMs);
        const onReady = () => cleanup(true);
        const onError = () => cleanup(false);

        function cleanup(success) {
            clearTimeout(timeout);
            mediaElement.removeEventListener('loadedmetadata', onReady);
            mediaElement.removeEventListener('durationchange', onReady);
            mediaElement.removeEventListener('error', onError);
            success ? resolve(true) : reject(new Error('Media metadata not ready'));
        }

        mediaElement.addEventListener('loadedmetadata', onReady, { once: true });
        mediaElement.addEventListener('durationchange', onReady, { once: true });
        mediaElement.addEventListener('error', onError, { once: true });
        mediaElement.load();
    });
}

async function ensureUploadedVideoMetadataReady() {
    if (state.mediaType !== 'video-file') return false;

    // Do not make the visual video area depend on metadata timing. Some browsers
    // delay videoWidth/videoHeight until playback starts; in that case we still
    // reserve a picture-in-picture video box and draw the real frames as soon as
    // they become available.
    await waitForMediaMetadata(els.videoPlayer, 2500).catch(() => false);
    return true;
}

function waitForVideoPlaybackFrame(videoElement, timeoutMs) {
    if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && videoElement.videoWidth > 0) {
        return Promise.resolve(true);
    }

    return new Promise((resolve, reject) => {
        let done = false;
        const timeout = setTimeout(() => cleanup(false), timeoutMs);

        const finish = () => cleanup(true);
        const fail = () => cleanup(false);

        function cleanup(success) {
            if (done) return;
            done = true;
            clearTimeout(timeout);
            videoElement.removeEventListener('loadeddata', finish);
            videoElement.removeEventListener('canplay', finish);
            videoElement.removeEventListener('playing', finish);
            videoElement.removeEventListener('timeupdate', finish);
            videoElement.removeEventListener('error', fail);
            success ? resolve(true) : reject(new Error('Video frame not ready'));
        }

        if (typeof videoElement.requestVideoFrameCallback === 'function') {
            videoElement.requestVideoFrameCallback(() => cleanup(true));
        }

        videoElement.addEventListener('loadeddata', finish, { once: true });
        videoElement.addEventListener('canplay', finish, { once: true });
        videoElement.addEventListener('playing', finish, { once: true });
        videoElement.addEventListener('timeupdate', finish, { once: true });
        videoElement.addEventListener('error', fail, { once: true });
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

function createRecordingLayout(includeUploadedVideo = false) {
    const pdfWidth = els.pdfCanvas.width;
    const pdfHeight = els.pdfCanvas.height;
    const hasUploadedVideo = includeUploadedVideo && state.mediaType === 'video-file';

    const layout = {
        canvasWidth: hasUploadedVideo ? pdfWidth * 2 : pdfWidth,
        canvasHeight: pdfHeight,
        pdfX: 0,
        pdfY: 0,
        pdfWidth,
        pdfHeight,
        videoRect: null,
    };

    if (!hasUploadedVideo) return layout;

    const margin = Math.max(20, Math.round(Math.min(pdfWidth, pdfHeight) * 0.035));
    layout.videoRect = {
        x: pdfWidth + margin,
        y: margin,
        width: pdfWidth - margin * 2,
        height: pdfHeight - margin * 2,
    };

    return layout;
}

function getRecordingLayout() {
    return state.recordingLayout || createRecordingLayout(false);
}

function drawRecordingFrame() {
    if (!state.recordingContext || !state.recordingCanvas) return;

    const layout = getRecordingLayout();
    if (state.recordingCanvas.width !== layout.canvasWidth || state.recordingCanvas.height !== layout.canvasHeight) {
        state.recordingCanvas.width = layout.canvasWidth;
        state.recordingCanvas.height = layout.canvasHeight;
    }

    const ctx = state.recordingContext;
    ctx.save();
    ctx.fillStyle = '#111317';
    ctx.fillRect(0, 0, state.recordingCanvas.width, state.recordingCanvas.height);
    ctx.restore();

    ctx.drawImage(els.pdfCanvas, layout.pdfX, layout.pdfY, layout.pdfWidth, layout.pdfHeight);
    drawRecordedHighlight(ctx, layout);
    drawRecordedVideo(ctx, layout);
}

function drawRecordedVideo(ctx, layout) {
    if (!layout.videoRect || state.mediaType !== 'video-file') return;

    const { x, y, width, height } = layout.videoRect;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, width, height);

    if (isUploadedVideoDrawable()) {
        try {
            drawVideoContain(ctx, els.videoPlayer, x, y, width, height);
        } catch (_) {
            drawCenteredText(ctx, 'Video frame unavailable', x, y, width, height);
        }
    } else {
        drawCenteredText(ctx, 'Loading video...', x, y, width, height);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = Math.max(2, Math.round(width * 0.006));
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
}

function isUploadedVideoDrawable() {
    return state.mediaType === 'video-file'
        && els.videoPlayer.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        && els.videoPlayer.videoWidth > 0
        && els.videoPlayer.videoHeight > 0;
}

function drawVideoContain(ctx, videoElement, x, y, width, height) {
    const sourceAspect = videoElement.videoWidth / videoElement.videoHeight;
    const targetAspect = width / height;
    let drawWidth = width;
    let drawHeight = height;
    let drawX = x;
    let drawY = y;

    if (sourceAspect > targetAspect) {
        drawHeight = Math.round(width / sourceAspect);
        drawY = y + Math.round((height - drawHeight) / 2);
    } else {
        drawWidth = Math.round(height * sourceAspect);
        drawX = x + Math.round((width - drawWidth) / 2);
    }

    ctx.drawImage(videoElement, drawX, drawY, drawWidth, drawHeight);
}

function drawCenteredText(ctx, text, x, y, width, height) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = `${Math.max(18, Math.round(width * 0.045))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + width / 2, y + height / 2);
    ctx.restore();
}

function drawRecordedHighlight(ctx, layout) {
    const marker = state.lastHighlightByPage.get(state.currentPage);
    if (!marker) return;

    const x = layout.pdfX + marker.displayX * state.canvasScaleX;
    const y = layout.pdfY + marker.displayY * state.canvasScaleY;
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
    els.recordButton.textContent = 'Start Recording';
    els.recordButton.classList.remove('recording');
    updateControls();
    setStatus('Preparing recorded file...');
}

function stopRecordingStreamTracks() {
    if (state.recordingStream) {
        state.recordingStream.getTracks().forEach(track => track.stop());
        state.recordingStream = null;
    }
    if (state.mediaAudioCaptureStream) {
        state.mediaAudioCaptureStream.getTracks().forEach(track => track.stop());
        state.mediaAudioCaptureStream = null;
    }
    if (state.youtubeAudioCaptureStream) {
        state.youtubeAudioCaptureStream.getTracks().forEach(track => track.stop());
        state.youtubeAudioCaptureStream = null;
    }
    if (state.microphoneStream) {
        state.microphoneStream.getTracks().forEach(track => track.stop());
        state.microphoneStream = null;
    }
    for (const connection of state.recordingAudioSources) {
        try {
            connection.source.disconnect(connection.destination);
        } catch (_) { }
    }
    state.recordingAudioSources = [];
    state.recordingAudioDestination = null;
    state.recordingLayout = null;
}

async function refreshMicrophoneDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
        updateMicrophoneControls();
        return;
    }

    const previousValue = els.microphoneSelect.value;

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const microphones = devices.filter(device => device.kind === 'audioinput');

        els.microphoneSelect.innerHTML = '';
        els.microphoneSelect.appendChild(new Option('Default microphone', ''));

        microphones.forEach((device, index) => {
            const label = device.label || `Microphone ${index + 1}`;
            els.microphoneSelect.appendChild(new Option(label, device.deviceId));
        });

        if ([...els.microphoneSelect.options].some(option => option.value === previousValue)) {
            els.microphoneSelect.value = previousValue;
        }
    } catch (_) {
        // Device enumeration can fail until the page is granted microphone permission.
    } finally {
        updateMicrophoneControls();
    }
}

function updateMicrophoneControls() {
    const microphoneSupported = Boolean(navigator.mediaDevices?.getUserMedia);

    if (!microphoneSupported && els.enableMicrophoneCheckbox.checked) {
        els.enableMicrophoneCheckbox.checked = false;
    }

    els.microphoneSelect.disabled = !els.enableMicrophoneCheckbox.checked || !microphoneSupported || state.isRecording;
    els.enableMicrophoneCheckbox.disabled = state.isRecording;
    els.enableMicrophoneCheckbox.title = microphoneSupported
        ? 'Enable microphone recording'
        : 'Microphone access requires HTTPS on iPad/Safari when opening from another device.';
}

function chooseRecordingMimeType() {
    const candidates = [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
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
    const isMp4 = type.toLowerCase().includes('mp4');
    const extension = isMp4 ? 'mp4' : 'webm';
    const blob = new Blob(state.recordedChunks, { type });
    const defaultName = `scorepointer-recording-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${extension}`;

    try {
        presentRecordingDownload(blob, defaultName, type);
    } finally {
        state.recordingCanvas = null;
        state.recordingContext = null;
        state.recordingLayout = null;
    }
}

function presentRecordingDownload(blob, filename, type) {
    if (state.lastRecordingObjectUrl) {
        URL.revokeObjectURL(state.lastRecordingObjectUrl);
    }

    const url = URL.createObjectURL(blob);
    state.lastRecordingObjectUrl = url;

    configureRecordingDownloadLinks(url, filename, blob, type);
    triggerRecordingDownload(url, filename);
    showRecordingDownloadDialog();

    const sizeMb = (blob.size / (1024 * 1024)).toFixed(1);
    setStatus(`Recording ready: ${filename} (${sizeMb} MB). Use the download dialog if your browser blocked the automatic download.`);
}

function configureRecordingDownloadLinks(url, filename, blob, type) {
    const extension = filename.split('.').pop()?.toUpperCase() || 'VIDEO';
    const sizeMb = (blob.size / (1024 * 1024)).toFixed(1);
    const actualType = type || blob.type || 'unknown video type';

    els.recordingDownloadMessage.textContent = `Your ${extension} recording is ready (${sizeMb} MB, ${actualType}). If the automatic download did not start, use Download recording. On iPad/Safari, use Open recording and then Share/Save to Files if needed.`;

    els.recordingDownloadLink.href = url;
    els.recordingDownloadLink.download = filename;
    els.recordingDownloadLink.type = type || blob.type || '';

    els.recordingOpenLink.href = url;
    els.recordingOpenLink.type = type || blob.type || '';
}

function triggerRecordingDownload(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);

    try {
        link.click();
    } finally {
        link.remove();
    }
}

function showRecordingDownloadDialog() {
    if (els.recordingDownloadDialog && typeof els.recordingDownloadDialog.showModal === 'function') {
        if (!els.recordingDownloadDialog.open) {
            els.recordingDownloadDialog.showModal();
        }
        return;
    }

    // Older iOS/Safari versions may not support <dialog>.
    // Opening the blob gives the user a visible file page and the share/save controls.
    window.open(state.lastRecordingObjectUrl, '_blank', 'noopener');
}

function showRecordingPrepareOverlay(message = 'Preparing recording...') {
    setRecordingPrepareOverlayMessage(message);
    els.recordingPrepareOverlay?.classList.remove('hidden');
    document.body.classList.add('recording-preparing');
}

function setRecordingPrepareOverlayMessage(message) {
    if (els.recordingPrepareMessage) {
        els.recordingPrepareMessage.textContent = message;
    }
}

function hideRecordingPrepareOverlay() {
    els.recordingPrepareOverlay?.classList.add('hidden');
    document.body.classList.remove('recording-preparing');
}

function setStatus(message) {
    els.status.textContent = message;
}

refreshMicrophoneDevices();
updateMediaLayout();
updateMicrophoneControls();
updateControls();
