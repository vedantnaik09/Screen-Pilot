const express = require('express');
const fs = require('fs');
const path = require('path');
const router = require('./src/routes/api')
require('dotenv').config();

const app = express();
app.use(express.json())
const screenshotDir = process.env.SCREENSHOT_DIR;

if (!screenshotDir) {
  console.error('Error: SCREENSHOT_DIR environment variable is not set.');
  process.exit(1);
}

const absScreenshotDir = path.resolve(screenshotDir);

if (!fs.existsSync(absScreenshotDir)) {
  console.error(`Error: Screenshot directory "${absScreenshotDir}" does not exist.`);
  process.exit(1);
}

app.use('/screenshots', express.static(absScreenshotDir));

app.use(router)

app.listen(3000, ()=>{
    console.log("Server running")
})

