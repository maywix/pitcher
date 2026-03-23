import express from "express";
import JSZip from "jszip";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const app = express();
const batchJobs = new Map();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 },
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function parseBitrate(value) {
  const parsed = Number.parseInt(String(value ?? "192"), 10);
  if (!Number.isFinite(parsed)) return 192;
  return Math.min(320, Math.max(64, parsed));
}

function parseFormat(value) {
  const format = String(value ?? "mp3").toLowerCase();
  if (["mp3", "wav", "ogg", "aac", "webm", "flac"].includes(format)) {
    return format;
  }
  return "mp3";
}

function parseNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function parseArray(value) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeAudioSettings(body) {
  const playbackRate = clamp(parseNumber(body?.playbackRate, 1), 0.25, 3);
  const preRollSeconds = clamp(parseNumber(body?.preRollSeconds, 0), 0, 300);
  const reverbMix = clamp(parseNumber(body?.reverbMix, 0), 0, 1);
  const reverbSize = clamp(parseNumber(body?.reverbSize, 0.5), 0.1, 0.9);

  const eqFreqsRaw = parseArray(body?.eqFreqs)
    .map((item) => Number.parseFloat(item))
    .filter((num) => Number.isFinite(num));
  const eqGainsRaw = parseArray(body?.eqGains)
    .map((item) => Number.parseFloat(item))
    .filter((num) => Number.isFinite(num));

  const bandCount = Math.min(eqFreqsRaw.length, eqGainsRaw.length);
  const eqBands = [];
  for (let i = 0; i < bandCount; i++) {
    const freq = clamp(eqFreqsRaw[i], 20, 20000);
    const gain = clamp(eqGainsRaw[i], -24, 24);
    eqBands.push({ freq, gain });
  }

  return {
    playbackRate,
    preRollSeconds,
    reverbMix,
    reverbSize,
    eqBands,
  };
}

function buildFilterChain(settings) {
  const filters = [];

  if (settings.preRollSeconds > 0.001) {
    const delayMs = Math.round(settings.preRollSeconds * 1000);
    filters.push(`adelay=${delayMs}:all=1`);
  }

  if (Math.abs(settings.playbackRate - 1) > 0.0001) {
    let remainingRate = settings.playbackRate;
    const tempoParts = [];

    while (remainingRate > 2.0) {
      tempoParts.push(2.0);
      remainingRate /= 2.0;
    }

    while (remainingRate < 0.5) {
      tempoParts.push(0.5);
      remainingRate /= 0.5;
    }

    tempoParts.push(remainingRate);

    for (const part of tempoParts) {
      filters.push(`atempo=${part.toFixed(6)}`);
    }
  }

  for (const band of settings.eqBands) {
    if (Math.abs(band.gain) <= 0.01) continue;
    filters.push(
      `equalizer=f=${band.freq.toFixed(3)}:t=q:w=4.31:g=${band.gain.toFixed(3)}`,
    );
  }

  if (settings.reverbMix > 0.001) {
    const d1 = Math.round(45 + settings.reverbSize * 140);
    const d2 = Math.round(d1 * 1.7);
    const decay1 = clamp(0.2 + settings.reverbSize * 0.5, 0.2, 0.85);
    const decay2 = clamp(decay1 * 0.6, 0.1, 0.8);
    const inGain = clamp(1 - settings.reverbMix * 0.7, 0.15, 1);
    const outGain = clamp(settings.reverbMix * 0.9, 0.05, 0.95);
    filters.push(
      `aecho=${inGain.toFixed(3)}:${outGain.toFixed(3)}:${d1}|${d2}:${decay1.toFixed(3)}|${decay2.toFixed(3)}`,
    );
  }

  return filters.join(",");
}

function ffmpegArgs(inputPath, outputPath, format, bitrate, audioFilter) {
  const filterArgs = audioFilter ? ["-af", audioFilter] : [];

  if (format === "wav") {
    return [
      "-y",
      "-threads",
      "0",
      "-i",
      inputPath,
      "-vn",
      ...filterArgs,
      "-acodec",
      "pcm_s16le",
      outputPath,
    ];
  }
  if (format === "ogg") {
    return [
      "-y",
      "-threads",
      "0",
      "-i",
      inputPath,
      "-vn",
      ...filterArgs,
      "-c:a",
      "libvorbis",
      "-b:a",
      `${bitrate}k`,
      outputPath,
    ];
  }
  if (format === "aac") {
    return [
      "-y",
      "-threads",
      "0",
      "-i",
      inputPath,
      "-vn",
      ...filterArgs,
      "-c:a",
      "aac",
      "-b:a",
      `${bitrate}k`,
      outputPath,
    ];
  }
  if (format === "webm") {
    return [
      "-y",
      "-threads",
      "0",
      "-i",
      inputPath,
      "-vn",
      ...filterArgs,
      "-c:a",
      "libopus",
      "-b:a",
      `${bitrate}k`,
      outputPath,
    ];
  }
  if (format === "flac") {
    return [
      "-y",
      "-threads",
      "0",
      "-i",
      inputPath,
      "-vn",
      ...filterArgs,
      "-c:a",
      "flac",
      outputPath,
    ];
  }
  return [
    "-y",
    "-threads",
    "0",
    "-i",
    inputPath,
    "-vn",
    ...filterArgs,
    "-acodec",
    "libmp3lame",
    "-b:a",
    `${bitrate}k`,
    outputPath,
  ];
}

function mimeByFormat(format) {
  if (format === "wav") return "audio/wav";
  if (format === "ogg") return "audio/ogg";
  if (format === "aac") return "audio/aac";
  if (format === "webm") return "audio/webm";
  if (format === "flac") return "audio/flac";
  return "audio/mpeg";
}

function uniqueFileName(name, usedNames) {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }

  const extMatch = /(\.[^/.]+)$/.exec(name);
  const ext = extMatch ? extMatch[1] : "";
  const base = ext ? name.slice(0, -ext.length) : name;

  let index = 2;
  while (true) {
    const candidate = `${base} (${index})${ext}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    index += 1;
  }
}

async function convertUploadedFile(file, format, bitrate, audioFilter) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pitcher-"));
  const inputPath = path.join(tempDir, "input");
  const outputPath = path.join(tempDir, `output.${format}`);

  try {
    await fs.writeFile(inputPath, file.buffer);

    await new Promise((resolve, reject) => {
      const args = ffmpegArgs(
        inputPath,
        outputPath,
        format,
        bitrate,
        audioFilter,
      );
      const child = spawn("ffmpeg", args);

      let stderr = "";
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr || `ffmpeg exit code ${code}`));
      });
    });

    const outputBuffer = await fs.readFile(outputPath);
    const baseName = (file.originalname || "output").replace(/\.[^/.]+$/, "");
    const downloadName = `${baseName}.${format}`;

    return { outputBuffer, downloadName };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

app.post("/convert", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "file is required" });
    return;
  }

  const format = parseFormat(req.body?.format);
  const bitrate = parseBitrate(req.body?.kbps);
  const audioSettings = sanitizeAudioSettings(req.body);
  const audioFilter = buildFilterChain(audioSettings);

  try {
    const { outputBuffer, downloadName } = await convertUploadedFile(
      file,
      format,
      bitrate,
      audioFilter,
    );

    res.setHeader("Content-Type", mimeByFormat(format));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${downloadName}\"`,
    );
    res.send(outputBuffer);
  } catch (error) {
    res.status(500).json({ error: "conversion failed", detail: error.message });
  }
});

app.post("/convert-batch", upload.array("files", 100), async (req, res) => {
  const files = req.files;
  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "files are required" });
    return;
  }

  const format = parseFormat(req.body?.format);
  const bitrate = parseBitrate(req.body?.kbps);
  const audioSettings = sanitizeAudioSettings(req.body);
  const audioFilter = buildFilterChain(audioSettings);

  try {
    const zip = new JSZip();
    const usedNames = new Set();
    const cpuCount = os.cpus()?.length || 2;
    const workerCount = Math.min(
      files.length,
      Math.max(1, Math.min(cpuCount - 1, 4)),
    );
    let nextIndex = 0;

    async function worker() {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= files.length) return;

        const converted = await convertUploadedFile(
          files[index],
          format,
          bitrate,
          audioFilter,
        );
        const uniqueName = uniqueFileName(converted.downloadName, usedNames);
        zip.file(uniqueName, converted.outputBuffer);
      }
    }

    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 1 },
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="processed_all.zip"',
    );
    res.send(zipBuffer);
  } catch (error) {
    res
      .status(500)
      .json({ error: "batch conversion failed", detail: error.message });
  }
});

app.post(
  "/convert-batch-jobs",
  upload.array("files", 100),
  async (req, res) => {
    const files = req.files;
    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: "files are required" });
      return;
    }

    const format = parseFormat(req.body?.format);
    const bitrate = parseBitrate(req.body?.kbps);
    const audioSettings = sanitizeAudioSettings(req.body);
    const audioFilter = buildFilterChain(audioSettings);

    const jobId = randomUUID();
    const job = {
      id: jobId,
      status: "processing",
      total: files.length,
      processed: 0,
      error: null,
      zipBuffer: null,
      canceled: false,
      createdAt: Date.now(),
    };

    batchJobs.set(jobId, job);

    (async () => {
      try {
        const zip = new JSZip();
        const usedNames = new Set();

        const cpuCount = os.cpus()?.length || 2;
        const workerCount = Math.min(
          files.length,
          Math.max(1, Math.min(cpuCount - 1, 4)),
        );
        let nextIndex = 0;

        async function worker() {
          while (true) {
            if (job.canceled) {
              throw new Error("job cancelled");
            }

            const index = nextIndex;
            nextIndex += 1;
            if (index >= files.length) return;

            const converted = await convertUploadedFile(
              files[index],
              format,
              bitrate,
              audioFilter,
            );

            const uniqueName = uniqueFileName(converted.downloadName, usedNames);
            zip.file(uniqueName, converted.outputBuffer);
            job.processed += 1;
          }
        }

        await Promise.all(Array.from({ length: workerCount }, () => worker()));

        if (job.canceled) {
          job.status = "cancelled";
          return;
        }

        job.zipBuffer = await zip.generateAsync({
          type: "nodebuffer",
          compression: "DEFLATE",
          compressionOptions: { level: 1 },
        });
        job.status = "done";
      } catch (error) {
        job.error = error.message;
        job.status = job.canceled ? "cancelled" : "failed";
      }
    })();

    res.status(202).json({
      jobId,
      total: job.total,
      status: job.status,
    });
  },
);

app.get("/convert-batch-jobs/:jobId/status", (req, res) => {
  const job = batchJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "job not found" });
    return;
  }

  res.json({
    jobId: job.id,
    status: job.status,
    total: job.total,
    processed: job.processed,
    error: job.error,
  });
});

app.get("/convert-batch-jobs/:jobId/download", (req, res) => {
  const job = batchJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "job not found" });
    return;
  }

  if (job.status !== "done" || !job.zipBuffer) {
    res.status(409).json({ error: "job not completed" });
    return;
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="processed_all.zip"',
  );
  res.send(job.zipBuffer);

  setTimeout(() => {
    batchJobs.delete(job.id);
  }, 60 * 1000);
});

app.delete("/convert-batch-jobs/:jobId", (req, res) => {
  const job = batchJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "job not found" });
    return;
  }

  job.canceled = true;
  if (job.status === "processing") {
    job.status = "cancelled";
  }
  res.json({ ok: true, status: job.status });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`backend listening on ${port}`);
});
