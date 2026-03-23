import express from "express";
import multer from "multer";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const app = express();
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

function ffmpegArgs(inputPath, outputPath, format, bitrate) {
  if (format === "wav") {
    return ["-y", "-i", inputPath, "-vn", "-acodec", "pcm_s16le", outputPath];
  }
  if (format === "ogg") {
    return [
      "-y",
      "-i",
      inputPath,
      "-vn",
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
      "-i",
      inputPath,
      "-vn",
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
      "-i",
      inputPath,
      "-vn",
      "-c:a",
      "libopus",
      "-b:a",
      `${bitrate}k`,
      outputPath,
    ];
  }
  if (format === "flac") {
    return ["-y", "-i", inputPath, "-vn", "-c:a", "flac", outputPath];
  }
  return [
    "-y",
    "-i",
    inputPath,
    "-vn",
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

app.post("/convert", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "file is required" });
    return;
  }

  const format = parseFormat(req.body?.format);
  const bitrate = parseBitrate(req.body?.kbps);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pitcher-"));
  const inputPath = path.join(tempDir, "input");
  const outputPath = path.join(tempDir, `output.${format}`);

  try {
    await fs.writeFile(inputPath, file.buffer);

    await new Promise((resolve, reject) => {
      const args = ffmpegArgs(inputPath, outputPath, format, bitrate);
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

    res.setHeader("Content-Type", mimeByFormat(format));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${downloadName}\"`,
    );
    res.send(outputBuffer);
  } catch (error) {
    res.status(500).json({ error: "conversion failed", detail: error.message });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`backend listening on ${port}`);
});
