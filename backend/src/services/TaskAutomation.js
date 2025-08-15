const browserSessionManager = require("./BrowserSessionManager");
const LLMService = require("./LLMService");

class TaskAutomation {
    async startTask(options) {
        const browserAutomation = await browserSessionManager.getBrowser();
        const llmService = new LLMService();
        let completed = false;
        let previousActions = [];
        let phase = 0;
        let screenshotPath;
        try {
            while (!completed) {
                console.log(`\n[Phase ${phase}] Taking screenshot...`);
                screenshotPath = await browserAutomation.takeScreenshot();
                console.log(`[Phase ${phase}] Getting page source...`);
                const pageSource = await browserAutomation.getPageSource();

                let actions;
                if (phase === 0) {
                    console.log(`[Phase ${phase}] Calling analyzeScreenshotAndQuery...`);
                    actions = await llmService.analyzeScreenshotAndQuery(screenshotPath, pageSource, options.query);
                } else {
                    console.log(`[Phase ${phase}] Calling analyzeWithContext with previous actions:`, previousActions.slice(-3));
                    actions = await llmService.analyzeWithContext(screenshotPath, pageSource, options.query, previousActions.slice(-3));
                }

                if (!Array.isArray(actions) || actions.length === 0) {
                    console.log(`[Phase ${phase}] No actions returned by the LLM`);
                    break;
                }

                let phaseCompleted = false;
                for (const [i, actionObj] of actions.entries()) {
                    console.log(`[Phase ${phase}] Executing action ${i + 1}/${actions.length}:`, actionObj);
                    await this.executeAction(browserAutomation, actionObj);
                    previousActions.push(actionObj);

                    if (actionObj.completed === true) {
                        console.log(`[Phase ${phase}] Task marked as completed by LLM.`);
                        completed = true;
                        break;
                    }
                    if (actionObj.phaseCompleted === true) {
                        console.log(`[Phase ${phase}] Phase marked as completed by LLM (page likely changed).`);
                        phaseCompleted = true;
                        break;
                    }
                }
                phase++;
                console.log(`[Phase ${phase}] Moving to next phase...`);
            }
            console.log("Task completed.");
        } catch (error) {
            console.log("Error in task automation", error);
        }
        // Do NOT close the browser here!
    }

    async executeAction(browserAutomation, actionObj) {
        const { action, params } = actionObj;
        switch (action) {
            case "navigateToWebsite":
                // Accept both {website} and {selector, selectorType}
                let url = params.website || params.selector;
                if (!url) throw new Error("No URL provided for navigateToWebsite");
                await browserAutomation.navigateToWebsite(url);
                break;
            case "clickElement":
                await browserAutomation.clickElement(params.selector, params.selectorType);
                break;
            case "fillInput":
                await browserAutomation.fillInput(params.selector, params.text, params.selectorType);
                break;
            case "scrollToElement":
                await browserAutomation.scrollToElement(params.selector, params.selectorType);
                break;
            case "waitForElement":
                await browserAutomation.waitForElement(params.selector, params.selectorType, params.timeout);
                break;
            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }

    async closeTask() {
        await browserSessionManager.closeBrowser();
    }
}

module.exports = TaskAutomation;