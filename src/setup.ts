/**
 * Core HUD setup logic — shared by all integration approaches.
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { generateListenerScript, getDomInjector, type HudOptions } from "./hud-overlay.js";
import { generateAudioCaptureScript } from "./audio-capture.js";
import { AudioWriter } from "./audio-writer.js";
import { registerHudPage, getAudioSegments, getRenderJob, setGlobalOutputDir, getCurrentSpec, type AudioSegment } from "./hud-registry.js";

/**
 * TTS provider for narrate().
 * - string: URL template — %s is replaced with encodeURIComponent(text).
 *   Must return audio (mp3/wav/ogg).
 *   Example: "https://api.example.com/tts?text=%s"
 * - function: receives text, returns audio Buffer/ArrayBuffer.
 * - false: disabled (falls back to speechSynthesis, which may not work headless).
 */
export type TtsProvider = false | string | ((text: string) => Promise<Buffer | ArrayBuffer>);

export type QaHudOptions = HudOptions & {
  actionDelay: number;
  /** Enable audio capture via Web Audio API. Set to a file path to save WAV, or `true` for auto-path. */
  audio: boolean | string;
  /** TTS provider for narrate(). See TtsProvider type. */
  tts: TtsProvider;
  /** Automatically annotate (caption + TTS) the test title at the start of each test. */
  autoAnnotate: boolean;
  /** Output directory for rendered videos. Default: `.demowright` */
  outputDir: string;
};

export const defaultOptions: QaHudOptions = {
  cursor: true,
  keyboard: true,
  cursorStyle: "default",
  keyFadeMs: 1500,
  actionDelay: 120,
  audio: false,
  tts: false,
  autoAnnotate: false,
  outputDir: ".demowright",
};

/**
 * Apply the demowright HUD to an existing BrowserContext.
 * Returns an AudioWriter if audio capture is enabled (call .save() after test).
 */
export async function applyHud(
  context: BrowserContext,
  options?: Partial<QaHudOptions>,
): Promise<AudioWriter | undefined> {
  const opts = { ...defaultOptions, ...options };
  setGlobalOutputDir(opts.outputDir);
  const contextStartMs = Date.now();

  // 1. Event listeners via addInitScript (no DOM mutation — survives navigations)
  await context.addInitScript(generateListenerScript());

  // 2. Audio capture via Web Audio API + PulseAudio sink recording
  let audioWriter: AudioWriter | undefined;
  let pulseCapture: PulseCaptureHandle | undefined;
  if (opts.audio) {
    audioWriter = new AudioWriter();
    await context.addInitScript(generateAudioCaptureScript());
    // Start PulseAudio sink capture (records all browser audio output)
    pulseCapture = startPulseCapture(opts.outputDir);
  }

  // 3. Prepare DOM injection (called after each navigation via page.evaluate)
  const hudOpts: HudOptions = {
    cursor: opts.cursor,
    keyboard: opts.keyboard,
    cursorStyle: opts.cursorStyle,
    keyFadeMs: opts.keyFadeMs,
  };
  const domInjector = getDomInjector();

  const videoPaths: string[] = [];
  const pageNames: string[] = [];

  async function setupPage(page: Page) {
    registerHudPage(page, { tts: opts.tts });
    wrapNavigation(page, domInjector, hudOpts, pageNames);
    if (opts.actionDelay > 0) {
      patchPageDelay(page, opts.actionDelay);
    }

    if (audioWriter) {
      await setupAudioCapture(page, audioWriter);
      try {
        const vp = await page.video()?.path();
        if (vp) videoPaths.push(vp);
      } catch { /* no video recording */ }
    }
  }

  for (const page of context.pages()) {
    await setupPage(page);
  }
  context.on("page", (page) => setupPage(page));

  // Save audio + mux with video
  if (audioWriter && opts.audio) {
    const outDir = join(process.cwd(), opts.outputDir);
    const tmpDir = join(outDir, "tmp");
    mkdirSync(tmpDir, { recursive: true });
    // Ensure .gitignore exists so generated files aren't committed
    const gitignorePath = join(outDir, ".gitignore");
    if (!existsSync(gitignorePath)) writeFileSync(gitignorePath, "*\n");
    const audioPath = typeof opts.audio === "string"
      ? opts.audio
      : join(tmpDir, `demowright-audio-${Date.now()}.wav`);

    // Track all pages for segment collection
    const allPages: Page[] = [...context.pages()];
    context.on("page", (pg) => allPages.push(pg));

    context.on("close", () => {
      // Stop PulseAudio recording
      const pulseWavPath = pulseCapture?.stop();

      // Check for video render jobs from createVideoScript().render()
      for (const pg of allPages) {
        const job = getRenderJob(pg);
        if (job) {
          finalizeRenderJob(job, videoPaths);
          return; // render job handles everything — skip legacy audio path
        }
      }

      // Legacy path: build audio track from stored TTS segments + browser audio
      const segments: AudioSegment[] = [];
      for (const pg of allPages) {
        segments.push(...getAudioSegments(pg));
      }

      const hasTts = segments.length > 0;
      const hasBrowserAudio = audioWriter!.totalSamples > 0;
      const hasPulseAudio = pulseWavPath && existsSync(pulseWavPath);

      if (!hasTts && !hasBrowserAudio && !hasPulseAudio) return;

      let audioOffsetMs = 0;
      if (hasTts || hasPulseAudio) {
        const firstSegMs = hasTts ? segments[0].timestampMs : contextStartMs;
        audioOffsetMs = firstSegMs - contextStartMs;
        buildAndSaveAudioTrack(
          segments,
          audioPath,
          firstSegMs,
          hasBrowserAudio ? audioWriter! : undefined,
          contextStartMs,
          hasPulseAudio ? pulseWavPath : undefined,
        );
      } else {
        audioWriter!.save(audioPath);
      }
      // Clean up pulse WAV
      if (hasPulseAudio) {
        console.log(`[demowright] Pulse audio captured: ${pulseWavPath}`);
        // Keep for debugging: if (hasPulseAudio) try { unlinkSync(pulseWavPath!); } catch {}
      }

      // Name MP4 from: spec filename (via registry) > page title > timestamp
      const baseName = getCurrentSpec() ?? pageNames[0] ?? `demowright-${Date.now()}`;
      const mp4Path = join(outDir, `${baseName}.mp4`);
      const trimSec = (audioOffsetMs / 1000).toFixed(3);
      let muxed = false;
      for (const videoPath of videoPaths) {
        try {
          if (!existsSync(videoPath)) continue;
          execSync(
            `ffmpeg -y -ss ${trimSec} -i "${videoPath}" -i "${audioPath}" -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 64k -shortest "${mp4Path}"`,
            { stdio: "pipe" },
          );
          muxed = true;
          try { unlinkSync(audioPath); } catch {}
          console.log(`[demowright] ✓ Rendered: ${mp4Path}`);
        } catch {
          // ffmpeg not available or mux failed
        }
      }
      if (!muxed) {
        console.log(`[demowright] Audio saved: ${audioPath}`);
        console.log(`[demowright] Mux: ffmpeg -y -ss ${trimSec} -i <video.webm> -i "${audioPath}" -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 64k -shortest "${mp4Path}"`);
      }
    });
  }

  return audioWriter;
}

/**
 * Wraps page navigation methods to inject HUD DOM after each navigation.
 */
function wrapNavigation(page: Page, domInjector: (opts: HudOptions) => void, hudOpts: HudOptions, pageNames?: string[]) {
  async function injectDom() {
    try {
      if (page.isClosed()) return;
      await page.evaluate(domInjector, hudOpts);
    } catch {
      // Page closed or crashed — ignore
    }
  }

  async function captureTitle() {
    if (!pageNames) return;
    try {
      if (page.isClosed()) return;
      let title = await page.title();
      if (!title) {
        // Fallback: first h1 or prominent heading text
        title = await page.evaluate(() => {
          const el = document.querySelector("h1, .brand, [class*='logo'], header h2");
          return el?.textContent?.trim() ?? "";
        });
      }
      if (title) {
        const clean = title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60);
        if (clean && !clean.startsWith("loading")) pageNames.push(clean);
      }
    } catch {}
  }

  // Wrap goto
  const originalGoto = page.goto.bind(page);
  (page as any).goto = async function (...args: any[]) {
    const result = await originalGoto(...(args as [any, ...any[]]));
    await injectDom();
    await captureTitle();
    return result;
  };

  // Wrap reload
  const originalReload = page.reload.bind(page);
  (page as any).reload = async function (...args: any[]) {
    const result = await originalReload(...(args as [any]));
    await injectDom();
    return result;
  };

  // Wrap setContent
  const originalSetContent = page.setContent.bind(page);
  (page as any).setContent = async function (...args: any[]) {
    const result = await originalSetContent(...(args as [any, ...any[]]));
    await injectDom();
    return result;
  };

  // Wrap goBack/goForward
  for (const method of ["goBack", "goForward"] as const) {
    const original = (page as any)[method].bind(page);
    (page as any)[method] = async function (...args: any[]) {
      const result = await original(...args);
      await injectDom();
      return result;
    };
  }
}

function patchPageDelay(page: Page, delay: number) {
  const pageMethods = [
    "click",
    "dblclick",
    "fill",
    "press",
    "type",
    "check",
    "uncheck",
    "selectOption",
    "hover",
    "tap",
    "dragAndDrop",
  ] as const;

  for (const method of pageMethods) {
    const original = (page as any)[method];
    if (typeof original === "function") {
      (page as any)[method] = async function (...args: any[]) {
        const result = await original.apply(this, args);
        await page.waitForTimeout(delay);
        return result;
      };
    }
  }

  const kb = page.keyboard;
  for (const method of ["press", "type", "insertText"] as const) {
    const original = (kb as any)[method];
    if (typeof original === "function") {
      (kb as any)[method] = async function (...args: any[]) {
        const result = await original.apply(this, args);
        await page.waitForTimeout(delay);
        return result;
      };
    }
  }
}

/**
 * Expose the audio chunk receiver on the page so the browser-side
 * capture script can send PCM data to Node.
 */
async function setupAudioCapture(page: Page, writer: AudioWriter) {
  try {
    await page.exposeFunction("__qaHudAudioChunk", (samples: number[], sampleRate: number) => {
      writer.addChunk(samples, sampleRate);
    });
  } catch {
    // exposeFunction may fail if already exposed on this page (e.g. SPA navigation)
  }
}

/**
 * Build a WAV file from stored TTS segments placed at their actual
 * wall-clock timestamps. Silence fills gaps between segments.
 * This eliminates drift caused by page.evaluate overhead.
 */
function buildAndSaveAudioTrack(
  segments: AudioSegment[],
  outputPath: string,
  contextStartMs: number,
  browserAudio?: AudioWriter,
  contextCreationMs?: number,
  pulseWavPath?: string,
): void {
  if (segments.length === 0 && !browserAudio && !pulseWavPath) return;

  // Parse first segment to get sample rate
  const firstBuf = segments[0]?.wavBuf;
  const dataOffset0 = firstBuf ? firstBuf.indexOf("data") + 8 : -1;
  if (segments.length > 0 && dataOffset0 < 8) return;
  const sampleRate = firstBuf ? firstBuf.readUInt32LE(24) : (browserAudio?.rate ?? 44100);
  const channels = 2; // output stereo

  // Use context creation time as base — audio track includes silence for pre-narration period
  const baseMs = contextStartMs;
  let totalMs = 0;
  for (const seg of segments) {
    const dOff = seg.wavBuf.indexOf("data") + 8;
    if (dOff < 8) continue;
    const sr = seg.wavBuf.readUInt32LE(24);
    const ch = seg.wavBuf.readUInt16LE(22);
    const pcm = seg.wavBuf.subarray(dOff);
    const segDur = (pcm.length / 2 / ch / sr) * 1000;
    const endMs = (seg.timestampMs - baseMs) + segDur;
    if (endMs > totalMs) totalMs = endMs;
  }

  // Account for browser-captured audio duration
  if (browserAudio && browserAudio.totalSamples > 0) {
    const browserStartMs = browserAudio.captureStartMs;
    const browserDurMs = browserAudio.duration * 1000;
    const browserEndMs = (browserStartMs - baseMs) + browserDurMs;
    if (browserEndMs > totalMs) totalMs = browserEndMs;
  }

  // Account for PulseAudio-captured audio duration
  if (pulseWavPath && existsSync(pulseWavPath)) {
    try {
      const pBuf = readFileSync(pulseWavPath);
      const pDoff = pBuf.indexOf("data");
      if (pDoff >= 0) {
        const pSr = pBuf.readUInt32LE(24);
        const pCh = pBuf.readUInt16LE(22);
        const pDataLen = pBuf.readUInt32LE(pDoff + 4);
        const pDurMs = (pDataLen / 2 / pCh / pSr) * 1000;
        if (pDurMs > totalMs) totalMs = pDurMs;
      }
    } catch {}
  }

  // Create buffer for entire track
  const totalSamples = Math.ceil((totalMs / 1000) * sampleRate * channels);
  const trackBuffer = new Float32Array(totalSamples);

  // Place each segment at its correct offset
  for (const seg of segments) {
    const dOff = seg.wavBuf.indexOf("data") + 8;
    if (dOff < 8) continue;
    const ch = seg.wavBuf.readUInt16LE(22);
    const pcmData = seg.wavBuf.subarray(dOff);
    const sampleCount = pcmData.length / 2;

    // Decode PCM to float32
    const float32 = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      float32[i] = pcmData.readInt16LE(i * 2) / 32768;
    }

    // Convert to stereo interleaved
    const stereo = ch === 1
      ? (() => {
          const s = new Float32Array(sampleCount * 2);
          for (let i = 0; i < sampleCount; i++) {
            s[i * 2] = float32[i];
            s[i * 2 + 1] = float32[i];
          }
          return s;
        })()
      : float32;

    // Place at correct timeline offset
    const offsetMs = seg.timestampMs - baseMs;
    const offsetSamples = Math.floor((offsetMs / 1000) * sampleRate) * channels;
    for (let i = 0; i < stereo.length && offsetSamples + i < trackBuffer.length; i++) {
      trackBuffer[offsetSamples + i] += stereo[i];
    }
  }

  // Mix in browser-captured audio (oscillators, media elements, etc.)
  if (browserAudio && browserAudio.totalSamples > 0) {
    const browserPcm = browserAudio.toFloat32(); // interleaved stereo float32
    const browserOffsetMs = browserAudio.captureStartMs - baseMs;
    const browserOffsetSamples = Math.max(0, Math.floor((browserOffsetMs / 1000) * sampleRate) * channels);
    // Resample if browser audio has different sample rate
    if (browserAudio.rate === sampleRate) {
      for (let i = 0; i < browserPcm.length && browserOffsetSamples + i < trackBuffer.length; i++) {
        trackBuffer[browserOffsetSamples + i] += browserPcm[i];
      }
    } else {
      // Simple linear resample
      const ratio = browserAudio.rate / sampleRate;
      const outLen = Math.floor(browserPcm.length / ratio);
      for (let i = 0; i < outLen && browserOffsetSamples + i < trackBuffer.length; i++) {
        const srcIdx = i * ratio;
        const lo = Math.floor(srcIdx);
        const hi = Math.min(lo + 1, browserPcm.length - 1);
        const frac = srcIdx - lo;
        trackBuffer[browserOffsetSamples + i] += browserPcm[lo] * (1 - frac) + browserPcm[hi] * frac;
      }
    }
  }

  // Mix in PulseAudio-captured browser audio (system-level capture)
  if (pulseWavPath && existsSync(pulseWavPath)) {
    try {
      const pulseBuf = readFileSync(pulseWavPath);
      const pDoff = pulseBuf.indexOf("data");
      if (pDoff >= 0) {
        const pSr = pulseBuf.readUInt32LE(24);
        const pCh = pulseBuf.readUInt16LE(22);
        const pBps = pulseBuf.readUInt16LE(34);
        const pcmData = pulseBuf.subarray(pDoff + 8);
        const bytesPerSample = pBps / 8;
        const sampleCount = Math.floor(pcmData.length / bytesPerSample);

        // Decode to float32
        const float32 = new Float32Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
          if (pBps === 16) {
            float32[i] = pcmData.readInt16LE(i * 2) / 32768;
          } else if (pBps === 32) {
            float32[i] = pcmData.readFloatLE(i * 4);
          }
        }

        // Convert to stereo interleaved if mono
        const stereo = pCh === 1
          ? (() => {
              const s = new Float32Array(sampleCount * 2);
              for (let i = 0; i < sampleCount; i++) {
                s[i * 2] = float32[i];
                s[i * 2 + 1] = float32[i];
              }
              return s;
            })()
          : float32;

        // Mix into track at start (pulse capture starts with context)
        if (pSr === sampleRate) {
          for (let i = 0; i < stereo.length && i < trackBuffer.length; i++) {
            trackBuffer[i] += stereo[i];
          }
        } else {
          const ratio = pSr / sampleRate;
          const outLen = Math.min(Math.floor(stereo.length / ratio), trackBuffer.length);
          for (let i = 0; i < outLen; i++) {
            const srcIdx = i * ratio;
            const lo = Math.floor(srcIdx);
            const hi = Math.min(lo + 1, stereo.length - 1);
            const frac = srcIdx - lo;
            trackBuffer[i] += stereo[lo] * (1 - frac) + stereo[hi] * frac;
          }
        }
      }
    } catch {
      // PulseAudio WAV read/parse failed — continue without it
    }
  }

  // Write WAV
  const int16 = new Int16Array(trackBuffer.length);
  for (let i = 0; i < trackBuffer.length; i++) {
    const s = Math.max(-1, Math.min(1, trackBuffer[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const dataBytes = int16.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  Buffer.from(int16.buffer).copy(buffer, 44);

  writeFileSync(outputPath, buffer);
}

/**
 * Finalize a video render job: run ffmpeg with the actual video path,
 * applying fade transitions, subtitle burn-in, and chapter metadata.
 */
function probeVideoDuration(filePath: string): number {
  try {
    const out = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`, { stdio: ["ignore", "pipe", "ignore"] });
    return parseFloat(out.toString()) || 0;
  } catch {
    return 0;
  }
}

function finalizeRenderJob(
  job: import("./hud-registry.js").VideoRenderJob,
  videoPaths: string[],
): void {
  for (const videoPath of videoPaths) {
    try {
      if (!existsSync(videoPath)) continue;

      // Compute trim offset: video starts at page creation, audio starts at render() start.
      // Trim = videoDur - audioDur to skip the silent lead-in before render() began.
      let ssArgs = "";
      if (existsSync(job.wavPath)) {
        const videoDur = probeVideoDuration(videoPath);
        const audioDur = probeVideoDuration(job.wavPath);
        if (videoDur > 0 && audioDur > 0 && videoDur > audioDur + 0.5) {
          const trimSec = (videoDur - audioDur).toFixed(3);
          ssArgs = `-ss ${trimSec}`;
        }
      }

      // Build video filter chain
      const filters: string[] = [];

      // Fade transitions
      const transitions = job.timeline.filter((e) => e.kind === "transition");
      for (const t of transitions) {
        const startSec = (t.startMs / 1000).toFixed(3);
        const durSec = (t.durationMs / 1000).toFixed(3);
        const endSec = ((t.startMs + t.durationMs) / 1000).toFixed(3);
        filters.push(`fade=t=out:st=${startSec}:d=${durSec}`);
        filters.push(`fade=t=in:st=${endSec}:d=${durSec}`);
      }

      // Subtitle burn-in
      if (existsSync(job.srtPath)) {
        const escapedSrt = job.srtPath.replace(/\\/g, "/").replace(/:/g, "\\\\:").replace(/'/g, "'\\''");
        filters.push(`subtitles='${escapedSrt}'`);
      }

      const vf = filters.length > 0 ? `-vf "${filters.join(",")}"` : "";

      // Chapter metadata
      const chapterArgs = existsSync(job.chaptersPath)
        ? `-i "${job.chaptersPath}" -map_metadata 2`
        : "";

      const cmd = [
        `ffmpeg -y`,
        ssArgs,
        `-i "${videoPath}"`,
        `-i "${job.wavPath}"`,
        chapterArgs,
        vf,
        `-c:v libx264 -preset fast -crf 28`,
        `-c:a aac`,
        `-shortest`,
        `"${job.mp4Path}"`,
      ].filter(Boolean).join(" ");

      execSync(cmd, { stdio: "pipe" });
      // Clean up intermediates
      for (const f of [job.wavPath, job.srtPath, job.chaptersPath]) {
        try { unlinkSync(f); } catch {}
      }
      console.log(`[demowright] ✓ Rendered: ${job.mp4Path}`);
      return;
    } catch (e: any) {
      console.log(`[demowright] ffmpeg failed: ${e.message}`);
    }
  }

  // ffmpeg not available — print the command for manual use.
  // Use a dynamic import (ESM-safe) rather than CJS `require`, which throws
  // ReferenceError in ESM contexts after a transient ffmpeg failure.
  if (videoPaths.length > 0) {
    import("./video-script.js")
      .then((mod) => {
        if (typeof mod.buildFfmpegCommand === "function") {
          const cmd = mod.buildFfmpegCommand(
            videoPaths[0] ?? "<video.webm>",
            job.wavPath,
            job.srtPath,
            job.chaptersPath,
            job.mp4Path,
            job.timeline,
          );
          console.log(`[demowright] Run manually:\n${cmd}`);
        }
      })
      .catch(() => {});
  }
}

/**
 * PulseAudio-based browser audio capture.
 * Uses module-pipe-sink which writes raw PCM to a file as audio plays.
 * (module-null-sink's monitor is broken in some PulseAudio environments —
 *  it returns silence even when audio is actively playing to the sink.)
 */
interface PulseCaptureHandle {
  stop(): string | undefined;
}

function startPulseCapture(outputDir: string): PulseCaptureHandle | undefined {
  // Reuse existing capture across module instances (register.cjs + test may load separate copies)
  const g = globalThis as any;
  if (g.__qaHudPulseCapture) return g.__qaHudPulseCapture as PulseCaptureHandle;

  // Use pipe created by config.ts in the main process (env var set before workers spawn).
  // Workers cannot create their own pipe-sink because PulseAudio's FIFO reading
  // from a worker process captures silence for browser audio.
  const preCreatedPipe = process.env.__DEMOWRIGHT_PULSE_PIPE;
  if (!preCreatedPipe) {
    // No pipe from config.ts — try creating one directly (works for programmatic applyHud)
    return startPulseCaptureDirectly(outputDir);
  }

  const tmpDir = join(process.cwd(), outputDir, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const wavPath = join(tmpDir, `pulse-capture-${Date.now()}.wav`);
  const pipePath = preCreatedPipe;

  // Read from the pipe file in background — pipe-sink writes data continuously
  // (including silence when nothing plays), so we use a ring buffer with a max
  // duration to avoid unbounded memory growth.
  const MAX_SECONDS = 300; // 5 minutes max
  const MAX_BYTES = 44100 * 2 * 2 * MAX_SECONDS; // s16le stereo
  let ringBuffer = Buffer.alloc(0);
  let totalBytesReceived = 0;
  let readerProc: ChildProcess | undefined;
  try {
    readerProc = spawn("cat", [pipePath], { stdio: ["ignore", "pipe", "ignore"] });
    readerProc.stdout!.on("data", (chunk: Buffer) => {
      totalBytesReceived += chunk.length;
      ringBuffer = Buffer.concat([ringBuffer, chunk]);
      // Trim to max size, keeping the latest data
      if (ringBuffer.length > MAX_BYTES) {
        // Align to frame boundary (4 bytes per frame: s16le stereo)
        const excess = ringBuffer.length - MAX_BYTES;
        const alignedExcess = excess - (excess % 4);
        ringBuffer = ringBuffer.subarray(alignedExcess);
      }
    });
    console.log(`[demowright] Pulse pipe-sink capture started: pipe=${pipePath}, PID=${readerProc.pid}`);
  } catch (e: any) {
    console.log(`[demowright] Pulse pipe reader failed: ${e.message}`);
    return undefined;
  }

  const handle: PulseCaptureHandle = {
    stop() {
      g.__qaHudPulseCapture = undefined;
      try { readerProc?.kill("SIGTERM"); } catch {}
      // Unload the pipe-sink module (cleans up the FIFO)
      try {
        const modules = execSync("pactl list modules short", { encoding: "utf-8" });
        for (const line of modules.split("\n")) {
          if (line.includes("demowright_sink")) {
            const modId = line.split("\t")[0];
            try { execSync(`pactl unload-module ${modId}`, { stdio: "pipe" }); } catch {}
          }
        }
      } catch {}

      const raw = ringBuffer;
      const durSec = raw.length / 44100 / 4;
      console.log(`[demowright] Pulse audio: ${(totalBytesReceived / 1024 / 1024).toFixed(1)}MB received, ${raw.length} bytes kept, ${durSec.toFixed(1)}s`);
      try { unlinkSync(pipePath); } catch {}
      if (raw.length === 0) return undefined;

      // Clamp to WAV max (4GB - 44 header bytes)
      const maxWavData = 0xFFFFFFFF - 36;
      const pcmData = raw.length > maxWavData ? raw.subarray(raw.length - maxWavData) : raw;

      const hdr = Buffer.alloc(44);
      hdr.write("RIFF", 0);
      hdr.writeUInt32LE(36 + pcmData.length, 4);
      hdr.write("WAVE", 8);
      hdr.write("fmt ", 12);
      hdr.writeUInt32LE(16, 16);
      hdr.writeUInt16LE(1, 20);
      hdr.writeUInt16LE(2, 22);
      hdr.writeUInt32LE(44100, 24);
      hdr.writeUInt32LE(44100 * 2 * 2, 28);
      hdr.writeUInt16LE(4, 32);
      hdr.writeUInt16LE(16, 34);
      hdr.write("data", 36);
      hdr.writeUInt32LE(pcmData.length, 40);

      writeFileSync(wavPath, Buffer.concat([hdr, pcmData]));
      return wavPath;
    },
  };
  g.__qaHudPulseCapture = handle;
  return handle;
}

/**
 * Fallback: create pipe-sink directly (for programmatic applyHud without config.ts).
 */
function startPulseCaptureDirectly(outputDir: string): PulseCaptureHandle | undefined {
  try {
    execSync("pactl info", { stdio: "pipe" });
  } catch {
    return undefined;
  }

  const tmpDir = join(process.cwd(), outputDir, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const pipePath = join(tmpDir, `pulse-pipe-${Date.now()}.raw`);

  // Unload stale sinks
  try {
    const modules = execSync("pactl list modules short", { encoding: "utf-8" });
    for (const line of modules.split("\n")) {
      if (line.includes("demowright_sink")) {
        const modId = line.split("\t")[0];
        try { execSync(`pactl unload-module ${modId}`, { stdio: "pipe" }); } catch {}
      }
    }
  } catch {}

  try {
    execSync(
      `pactl load-module module-pipe-sink sink_name=demowright_sink file="${pipePath}" rate=44100 channels=2 format=s16le sink_properties=device.description="Demowright_Audio_Capture"`,
      { stdio: "pipe", encoding: "utf-8" },
    ).trim();
    execSync("pactl set-default-sink demowright_sink", { stdio: "pipe" });
  } catch {
    return undefined;
  }

  // Set env var so workers can find the pipe
  process.env.__DEMOWRIGHT_PULSE_PIPE = pipePath;

  return startPulseCapture(outputDir);
}

