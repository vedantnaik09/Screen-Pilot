const express = require('express');
const fs = require('fs');
const path = require('path');
const router = require('./src/routes/api')
const extensionRoutes = require('./src/routes/extension-api')
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// CORS middleware for extension requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

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

// Create uploads directory for extension screenshots
const uploadsDir = path.resolve('uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

app.use('/screenshots', express.static(absScreenshotDir));
app.use('/uploads', express.static(uploadsDir));

// Original automation routes
app.use('/api', router);

// Extension-specific routes
app.use('/extension', extensionRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    message: "Server is running",
    timestamp: new Date().toISOString(),
    services: {
      automation: "active",
      extension: "active"
    }
  });
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
    console.log("Services available:");
    console.log("- Browser automation: http://localhost:3000/api");
    console.log("- Extension API: http://localhost:3000/extension");
    console.log("- Health check: http://localhost:3000/health");
});

