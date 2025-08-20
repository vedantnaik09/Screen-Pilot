const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const LLMService = require('../services/LLMService');

const router = express.Router();

// Configure multer for screenshot uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Extension health check
router.get("/health", (req, res) => {
    return res.json({
        message: "Extension API is running",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
    });
});

// Process screenshot and query from extension
router.post("/processQuery", async (req, res) => {
    const llmService = new LLMService();
    
    try {
        const { screenshotDataUrl, query, htmlSnippet, previousActions = [], phase = 0 } = req.body;
        
        console.log(`\n🔍 [EXTENSION API] Processing query for phase ${phase}`);
        console.log(`📝 Query: ${query}`);
        console.log(`📊 Previous actions count: ${previousActions.length}`);
        console.log(`📄 HTML snippet length: ${htmlSnippet ? htmlSnippet.length : 0} chars`);
        
        if (!screenshotDataUrl || !query) {
            console.log("❌ Missing required fields");
            return res.status(400).json({ 
                error: "Missing required fields: screenshotDataUrl and query" 
            });
        }

        // Convert data URL to file
        let screenshotPath;
        if (screenshotDataUrl.startsWith('data:image/')) {
            console.log("📸 Converting screenshot data URL to file...");
            // Extract base64 data
            const base64Data = screenshotDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Save to uploads directory
            const filename = `extension-screenshot-${Date.now()}.png`;
            screenshotPath = path.join('uploads', filename);
            fs.writeFileSync(screenshotPath, buffer);
            console.log(`💾 Screenshot saved: ${screenshotPath} (${buffer.length} bytes)`);
        } else {
            console.log("❌ Invalid screenshot data format");
            return res.status(400).json({ error: "Invalid screenshot data format" });
        }

        console.log(`🤖 Calling LLM service for phase ${phase}...`);
        let result;
        if (phase === 0) {
            console.log("🆕 Using analyzeScreenshotAndQuery (initial phase)");
            result = await llmService.analyzeScreenshotAndQuery(screenshotPath, query, htmlSnippet);
        } else {
            console.log("🔄 Using analyzeWithContext (continuation phase)");
            console.log(`📋 Previous actions: ${JSON.stringify(previousActions, null, 2)}`);
            result = await llmService.analyzeWithContext(screenshotPath, query, previousActions, htmlSnippet);
        }

        console.log(`✅ LLM returned ${Array.isArray(result) ? result.length : 'non-array'} actions`);
        if (Array.isArray(result)) {
            result.forEach((action, index) => {
                console.log(`   ${index + 1}. ${action.action} - ${action.reasoning}`);
                if (action.params) {
                    console.log(`      Params: ${JSON.stringify(action.params, null, 2)}`);
                }
            });
        }

        // Clean up temporary file
        if (fs.existsSync(screenshotPath)) {
            fs.unlinkSync(screenshotPath);
            console.log(`🗑️ Cleaned up screenshot file: ${screenshotPath}`);
        }

        return res.json(result);
    } catch (error) {
        console.error("❌ [EXTENSION API] Error in processQuery:", error);
        console.error("Stack trace:", error.stack);
        return res.status(500).json({ error: "Failed to process query" });
    }
});

// Handle error recovery for extension
router.post("/handleError", async (req, res) => {
    const llmService = new LLMService();
    
    try {
        const { 
            screenshotDataUrl, 
            query, 
            previousActions = [], 
            lastAction, 
            error: errorMessage, 
            htmlSnippet 
        } = req.body;
        
        console.log(`\n🚨 [EXTENSION API] Error recovery request`);
        console.log(`📝 Query: ${query}`);
        console.log(`❌ Error: ${errorMessage}`);
        console.log(`🔧 Last action: ${JSON.stringify(lastAction, null, 2)}`);
        console.log(`📊 Previous actions count: ${previousActions.length}`);
        
        if (!screenshotDataUrl || !query || !lastAction || !errorMessage) {
            console.log("❌ Missing required fields for error recovery");
            return res.status(400).json({ 
                error: "Missing required fields for error recovery" 
            });
        }

        // Convert data URL to file
        let screenshotPath;
        if (screenshotDataUrl.startsWith('data:image/')) {
            console.log("📸 Converting error recovery screenshot...");
            const base64Data = screenshotDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            
            const filename = `extension-error-${Date.now()}.png`;
            screenshotPath = path.join('uploads', filename);
            fs.writeFileSync(screenshotPath, buffer);
            console.log(`💾 Error screenshot saved: ${screenshotPath}`);
        } else {
            console.log("❌ Invalid screenshot data format for error recovery");
            return res.status(400).json({ error: "Invalid screenshot data format" });
        }

        console.log("🤖 Calling LLM error recovery...");
        const result = await llmService.handleActionError({
            screenshotPath,
            query,
            previousActions,
            lastAction,
            error: errorMessage,
            interceptingElement: null,
            htmlSnippet
        });

        console.log(`✅ Error recovery returned ${Array.isArray(result) ? result.length : 'non-array'} actions`);
        if (Array.isArray(result)) {
            result.forEach((action, index) => {
                console.log(`   Recovery ${index + 1}. ${action.action} - ${action.reasoning}`);
            });
        }

        // Clean up temporary file
        if (fs.existsSync(screenshotPath)) {
            fs.unlinkSync(screenshotPath);
            console.log(`🗑️ Cleaned up error screenshot: ${screenshotPath}`);
        }

        return res.json(result);
    } catch (error) {
        console.error("❌ [EXTENSION API] Error in error recovery:", error);
        console.error("Stack trace:", error.stack);
        return res.status(500).json({ error: "Failed to handle error recovery" });
    }
});

// Upload screenshot endpoint (alternative method)
router.post("/uploadScreenshot", upload.single('screenshot'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No screenshot file uploaded" });
        }

        const { query, htmlSnippet, previousActions = "[]", phase = "0" } = req.body;
        
        if (!query) {
            return res.status(400).json({ error: "Missing query parameter" });
        }

        const llmService = new LLMService();
        const screenshotPath = req.file.path;
        const parsedPreviousActions = JSON.parse(previousActions);
        const phaseNumber = parseInt(phase);

        let result;
        if (phaseNumber === 0) {
            result = await llmService.analyzeScreenshotAndQuery(screenshotPath, query, htmlSnippet);
        } else {
            result = await llmService.analyzeWithContext(screenshotPath, query, parsedPreviousActions, htmlSnippet);
        }

        // Clean up uploaded file
        fs.unlinkSync(screenshotPath);

        return res.json(result);
    } catch (error) {
        console.error("Error in uploadScreenshot:", error);
        
        // Clean up file on error
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (cleanupError) {
                console.error("Error cleaning up file:", cleanupError);
            }
        }
        
        return res.status(500).json({ error: "Failed to process uploaded screenshot" });
    }
});

// Get extension configuration
router.get("/config", (req, res) => {
    return res.json({
        serverUrl: process.env.SERVER_URL || "http://localhost:3000",
        maxFileSize: "10MB",
        supportedFormats: ["png", "jpeg", "jpg"],
        apiVersion: "1.0.0",
        features: {
            errorRecovery: true,
            contextAnalysis: true,
            htmlProcessing: true
        }
    });
});

// Test endpoint for extension connectivity
router.post("/test", (req, res) => {
    const { testData } = req.body;
    return res.json({
        message: "Extension API test successful",
        received: testData,
        timestamp: new Date().toISOString(),
        server: "browser-automator-backend"
    });
});

module.exports = router;
