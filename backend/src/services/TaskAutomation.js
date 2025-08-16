const browserSessionManager = require("./BrowserSessionManager");
const LLMService = require("./LLMService");
const OllamaLLMService = require("./OllamaLLMService");

class TaskAutomation {
    async startTask(options) {
        const browserAutomation = await browserSessionManager.getBrowser();
        const llmService = new LLMService();
        let completed = false;
        let previousActions = [];
        let phase = 0;
        let screenshotPath;

        console.log(`\n🎯 STARTING TASK: ${options.query}`);
        console.log(`📊 TASK STATE: completed=${completed}, phase=${phase}`);

        while (!completed) {
            try {
                console.log(`\n[Phase ${phase}] Taking screenshot...`);
                screenshotPath = await browserAutomation.takeScreenshot();
                
                console.log(`[Phase ${phase}] Getting clean HTML for context...`);
                const cleanHTML = await browserAutomation.getCleanHTML();
                console.log(`[Phase ${phase}] Clean HTML length: ${cleanHTML.length} characters`);

                let actions;
                if (phase === 0) {
                    console.log(`[Phase ${phase}] Calling analyzeScreenshotAndQuery...`);
                    actions = await llmService.analyzeScreenshotAndQuery(screenshotPath, options.query, cleanHTML);
                } else {
                    console.log(`[Phase ${phase}] Calling analyzeWithContext with previous actions:`, previousActions.slice(-3));
                    actions = await llmService.analyzeWithContext(screenshotPath, options.query, previousActions.slice(-3), cleanHTML);
                }

                if (!Array.isArray(actions) || actions.length === 0) {
                    console.log(`[Phase ${phase}] No actions returned by the LLM`);
                    phase++;
                    continue;
                }

                // Try to execute all actions in the array
                const executionResult = await this.executeActionsArray(browserAutomation, actions, phase, previousActions);
                
                if (executionResult.error) {
                    // If there was an error, handle it
                    console.log(`[Phase ${phase}] 🚨 ERROR DETECTED - calling handleActionError...`);
                    console.log(`[Phase ${phase}] 📝 Error details:`, executionResult.error.message);
                    console.log(`[Phase ${phase}] 🔧 Failed action:`, executionResult.lastAction);
                    
                    const errorActions = await llmService.handleActionError({
                        screenshotPath,
                        query: options.query,
                        previousActions: previousActions.slice(-3),
                        lastAction: executionResult.lastAction,
                        error: executionResult.error.message,
                        interceptingElement: executionResult.interceptingElement
                    });

                    if (Array.isArray(errorActions) && errorActions.length > 0) {
                        console.log(`[Phase ${phase}] 🔄 Received ${errorActions.length} error recovery actions from LLM`);
                        console.log(`[Phase ${phase}] 🔄 Recovery actions:`, JSON.stringify(errorActions, null, 2));
                        
                        const errorExecutionResult = await this.executeActionsArray(browserAutomation, errorActions, phase, previousActions, true);
                        
                        if (errorExecutionResult.error) {
                            console.log(`[Phase ${phase}] ❌ Error in recovery actions, moving to next phase`);
                        }
                        
                        if (errorExecutionResult.completed) {
                            console.log(`[Phase ${phase}] ✅ Task completed via error recovery!`);
                            completed = true;
                        }
                    } else {
                        console.log(`[Phase ${phase}] ⚠️ No recovery actions received from LLM`);
                    }
                } else {
                    // All actions executed successfully
                    console.log(`[Phase ${phase}] ✅ All actions executed successfully`);
                    if (executionResult.completed) {
                        console.log(`[Phase ${phase}] 🎉 Task marked as completed!`);
                        completed = true;
                    }
                }

                if (!completed) {
                    phase++;
                }

            } catch (error) {
                console.log("Error in task automation", error);
                phase++;
            }
        }
        
        console.log("Task completed.");
    }

    async executeActionsArray(browserAutomation, actions, phase, previousActions, isErrorRecovery = false) {
        const prefix = isErrorRecovery ? "fallback " : "";
        
        for (const [i, actionObj] of actions.entries()) {
            console.log(`[Phase ${phase}] Executing ${prefix}action ${i + 1}/${actions.length}:`, actionObj);
            
            try {
                await this.executeAction(browserAutomation, actionObj);
                previousActions.push(actionObj);
                await browserAutomation.takeScreenshot();

                // Check if task is completed
                if (actionObj.completed === true) {
                    console.log(`[Phase ${phase}] Task marked as completed by LLM.`);
                    return { completed: true };
                }

                // Check if phase is completed (page changed)
                if (actionObj.phaseCompleted === true) {
                    console.log(`[Phase ${phase}] Phase marked as completed by LLM (page likely changed).`);
                    return { phaseCompleted: true };
                }

            } catch (error) {
                console.log(`[Phase ${phase}] Error executing ${prefix}action:`, error.message);
                
                // Extract intercepting element information from click interception errors
                let interceptingElementInfo = null;
                if (error.message.includes('element click intercepted') && error.message.includes('Other element would receive the click:')) {
                    const match = error.message.match(/Other element would receive the click: (<[^>]*>)/);
                    if (match) {
                        interceptingElementInfo = match[1];
                        console.log(`[Phase ${phase}] Detected intercepting element:`, interceptingElementInfo);
                        
                        // Extract useful attributes for the LLM
                        const classMatch = interceptingElementInfo.match(/class="([^"]+)"/);
                        const altMatch = interceptingElementInfo.match(/alt="([^"]+)"/);
                        const srcMatch = interceptingElementInfo.match(/src="([^"]+)"/);
                        
                        if (classMatch || altMatch || srcMatch) {
                            const suggestions = [];
                            if (altMatch) {
                                // Extract first few words from alt text for better selector
                                const altWords = altMatch[1].split(' ').slice(0, 2).join(' ');
                                suggestions.push(`CSS: img[alt*="${altWords}"]`);
                                suggestions.push(`XPath: //img[contains(@alt,"${altWords}")]`);
                            }
                            if (classMatch) {
                                const firstClass = classMatch[1].split(' ')[0];
                                suggestions.push(`CSS class: .${firstClass}`);
                            }
                            if (srcMatch) suggestions.push(`Image src contains: ${srcMatch[1].split('/').pop()}`);
                            
                            interceptingElementInfo += `\n\nSUGGESTED SELECTORS: ${suggestions.join(', ')}`;
                        }
                    }
                }

                // Add the failed action to previous actions for context
                previousActions.push(actionObj);
                
                // Return error information, don't execute subsequent actions
                return {
                    error: error,
                    lastAction: actionObj,
                    interceptingElement: interceptingElementInfo
                };
            }
        }

        // All actions executed successfully
        return { success: true };
    }

    async executeAction(browserAutomation, actionObj) {
        const { action, params } = actionObj;
        switch (action) {
            case "navigateToWebsite":
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