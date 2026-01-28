import express from "express";
import { exec } from "child_process";

const app = express();

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.get("/test-ytdlp", (req, res) => {
  exec("yt-dlp --version", (err, stdout, stderr) => {
    if (err) {
      return res.status(500).send(stderr || err.message);
    }
    res.send(stdout);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
