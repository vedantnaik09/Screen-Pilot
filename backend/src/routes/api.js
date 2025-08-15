const express = require('express');
const TaskAutomation = require('../services/TaskAutomation');
const LLMService = require('../services/LLMService');

const router = express.Router();

router.get("/health",(req,res)=>{
    return res.json({
        message:"Server is running"
    })
})

router.post("/startTask",async (req,res)=>{
        const taskAutomation = new TaskAutomation();
    try {
        await taskAutomation.startTask(req.body);
        return res.json({message:"Succesful"})
    } catch (error) {
        console.log("Error in starting task: ",error)
        return res.status(500).json({error:"Faield to do task automation"})
    }
})

router.post("/processQuery",async (req,res)=>{
        const llmService = new LLMService();
    try {
         const { screenshotPath, query } = req.body;
        if (!screenshotPath || !query) {
            return res.status(400).json({ error: "Missing screenshotPath or query" });
        }
        const result = await llmService.analyzeScreenshotAndQuery(screenshotPath, query)
        return res.json(result)
    } catch (error) {
        console.log("Error in starting task: ",error)
        return res.status(500).json({ error: "Failed to process query" });
    }
})

router.post("/closeTask", async (req, res) => {
    const taskAutomation = new TaskAutomation();
    try {
        await taskAutomation.closeTask();
        return res.json({ message: "Browser closed" });
    } catch (error) {
        console.log("Error closing browser: ", error);
        return res.status(500).json({ error: "Failed to close browser" });
    }
});

module.exports = router;