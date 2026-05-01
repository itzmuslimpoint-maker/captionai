import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import fetch from "node-fetch";

const app = express();

// ✅ CORS + body limit
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ✅ root route (blank fix)
app.get("/", (req, res) => {
  res.send("🚀 CaptionAI Backend is running");
});

// ✅ upload config
const upload = multer({ dest: "uploads/" });

// ✅ ensure folders exist
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("outputs")) fs.mkdirSync("outputs");

// ✅ API route
app.post("/api/transcribe", upload.single("video"), async (req, res) => {
  try {
    const videoPath = req.file.path;
    const audioPath = `outputs/${req.file.filename}.wav`;

    // 🎬 Step 1: Extract audio using ffmpeg
    await new Promise((resolve, reject) => {
      exec(
        `ffmpeg -i ${videoPath} -ar 16000 -ac 1 -c:a pcm_s16le ${audioPath}`,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // 🔑 Step 2: NVIDIA Whisper API
    const apiKey = process.env.NVIDIA_API_KEY;

    const response = await fetch(
      "https://api.nvcf.nvidia.com/v2/nvcf/pexec/functions/whisper",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "audio/wav",
        },
        body: fs.createReadStream(audioPath),
      }
    );

    const result = await response.json();

    // 🧠 Step 3: format captions
    const captions = (result.segments || []).map((seg, i) => ({
      id: i,
      start: seg.start,
      end: seg.end,
      text: seg.text,
      words: seg.words || [],
    }));

    res.json({
      success: true,
      captions,
      wordCount: captions.length,
    });

    // 🧹 cleanup
    fs.unlinkSync(videoPath);
    fs.unlinkSync(audioPath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Transcription failed" });
  }
});

// ✅ IMPORTANT: dynamic port for Render
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
