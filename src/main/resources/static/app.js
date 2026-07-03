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
    mediaRecorder: null,
    recordedChunks: [],
    recordingStream: null,
    recordingCanvas: null,
    recordingContext: null,
    recordingFrameRequest: null,
    isRecording: false,
    lastHighlightByPage: new Map(),
};

const els = {
    pdfInput: document.getElementById('pdfInput'),
    mediaFileInput: document.getElementById('mediaFileInput'),
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
    playButton: document.getElementById('playButton'),
    pauseButton: document.getElementById('pauseButton'),
    stopButton: document.getElementById('stopButton'),
    countdown: document.getElementById('countdown'),
};

els.pdfInput.addEventListener('change', loadPdf);
els.mediaFileInput.addEventListener('change', loadVideoFile);
els.recordButton.addEventListener('click', onRecordButton);
els.playButton.addEventListener('click', playMedia);
els.pauseButton.addEventListener('click', pauseMedia);
els.stopButton.addEventListener('click', stopMedia);
els.canvasWrap.addEventListener('click', placeHighlightFromClick);
els.previousPageButton.addEventListener('click', previousPage);
els.nextPageButton.addEventListener('click', nextPage);
els.pageSlider.addEventListener('input', () => setPage(Number(els.pageSlider.value)));

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
        setStatus('Please load a video file. Audio files and URLs are no longer supported.');
        event.target.value = '';
        return;
    }

    cleanupMedia();
    const objectUrl = URL.createObjectURL(file);
    els.videoPlayer.src = objectUrl;
    els.videoPlayer.classList.remove('hidden');
    els.mediaPanel.classList.remove('hidden');
    state.hasMedia = true;

    setStatus(`Loaded video file: ${file.name}`);
    updateControls();
}

function cleanupMedia() {
    stopMedia();
    if (els.videoPlayer.src?.startsWith('blob:')) {
        URL.revokeObjectURL(els.videoPlayer.src);
    }
    els.videoPlayer.removeAttribute('src');
    els.videoPlayer.load();
    els.videoPlayer.classList.add('hidden');
    state.hasMedia = false;
}

function playMedia() {
    if (!state.hasMedia) return;
    els.videoPlayer.play().catch(() => setStatus('Browser blocked video playback. Press Play inside the media element.'));
}

function pauseMedia() {
    if (!state.hasMedia) return;
    els.videoPlayer.pause();
}

function stopMedia() {
    els.videoPlayer.pause();
    try { els.videoPlayer.currentTime = 0; } catch (_) { }
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
        addVideoAudioTracks(stream);

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
        playMedia();
        startRecordingFrameLoop();
        recorder.start(1000);
        setStatus('Recording PDF viewer only...');
    } catch (error) {
        stopRecordingFrameLoop();
        stopRecordingStreamTracks();
        state.isRecording = false;
        setStatus(`Recording failed: ${error.message}`);
        updateControls();
    }
}

function addVideoAudioTracks(stream) {
    const captureStream = els.videoPlayer.captureStream || els.videoPlayer.mozCaptureStream;
    if (!captureStream) return;

    const videoStream = captureStream.call(els.videoPlayer);
    for (const track of videoStream.getAudioTracks()) {
        stream.addTrack(track);
    }
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

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(radiusX, radiusY);
    ctx.globalCompositeOperation = 'multiply';

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, 'rgba(255, 230, 0, 0.62)');
    gradient.addColorStop(0.38, 'rgba(255, 215, 0, 0.34)');
    gradient.addColorStop(0.72, 'rgba(255, 180, 0, 0.12)');
    gradient.addColorStop(1, 'rgba(255, 180, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255, 190, 0, 0.24)';
    ctx.lineWidth = 1 / Math.max(radiusX, radiusY);
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
