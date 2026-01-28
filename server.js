import express from "express";
import { exec } from "child_process";

const app = express();

app.get("/", (req, res) => {
  res.send("Backend running");
});

app.get("/test-ytdlp", (req, res) => {
  exec("yt-dlp --version", (err, stdout) => {
    if (err) return res.status(500).send(err.message);
    res.send(stdout);
  });
});

app.listen(3000, () => {
  console.log("Backend running on port 3000");
});