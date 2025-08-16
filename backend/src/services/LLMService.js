const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { HumanMessage } = require("@langchain/core/messages");
const fs = require('fs');

class LLMService {
    constructor() {
        this.model = new ChatGoogleGenerativeAI({
            model: "gemini-2.0-flash",
            maxOutputTokens: 2048,
        });
    }

    async analyzeScreenshotAndQuery(screenshotPath, query, cleanHTML = null) {
        try {
            const imageBuffer = fs.readFileSync(screenshotPath);
            const base64Image = imageBuffer.toString('base64');

            const systemPrompt = `You are a browser automation assistant. Analyze the provided screenshot and HTML to generate browser actions that fulfill the user's request.

${cleanHTML ? `
**PRIORITIZE THIS HTML STRUCTURE FIRST:**
${cleanHTML}

Use the HTML to identify exact IDs, classes, and elements. The HTML shows the real structure of the page.
` : ''}

**TASK:** ${query}

**RULES:**
1. Return ONLY a JSON array of actions (no markdown, no explanation)
2. Each action MUST have: "action", "params", "reasoning", "phaseCompleted", "completed"
3. Available actions: navigateToWebsite, clickElement, fillInput, scrollToElement, waitForElement
4. ALWAYS include "selectorType" in params for clickElement, fillInput, scrollToElement, waitForElement
5. Use short text selectors (max 15 characters) to avoid XPath errors
6. Set "phaseCompleted": true if the page will change after this action
7. Set "completed": true ONLY when this current action will supposedly finish the execution of the query : ${query}
8. Generate maximum 3 actions per response
9. Only generate actions for elements visible in the screenshot or HTML

**ACTION PARAMETER FORMATS:**
- navigateToWebsite: { "website": "https://example.com" }
- clickElement: { "selector": "element-id", "selectorType": "id" }
- fillInput: { "selector": "input-id", "selectorType": "id", "text": "search term" }
- scrollToElement: { "selector": "element-id", "selectorType": "id" }
- waitForElement: { "selector": "element-id", "selectorType": "id", "timeout": 5000 }

**SELECTOR TYPES & FORMATS:**
- id: Raw ID value WITHOUT # symbol (e.g., "submit-btn", "search-box")
- css: Full CSS selector WITH symbols (e.g., "#submit-btn", ".button", "input[type='submit']")
- xpath: Full XPath starting with // or / (e.g., "//button[@type='submit']", "//div[@class='cart']")
- text: Short unique visible text, max 15 chars (e.g., "Submit", "Add to Cart", "Search")

**IMPORTANT:** Only use selectors for elements that are actually visible in the screenshot or present in the HTML structure provided.

Return the JSON array:`;

            const message = new HumanMessage({
                content: [
                    {
                        type: "text",
                        text: systemPrompt
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/png;base64,${base64Image}`
                        }
                    }
                ]
            });

            const response = await this.model.invoke([message]);
            const responseText = response.content.trim();
            
            // Clean response and parse JSON
            let cleanedResponse = responseText.replace(/```json|```/g, '').trim();
            if (cleanedResponse.startsWith('[') && !cleanedResponse.endsWith(']')) {
                cleanedResponse += ']';
            }
            
            return JSON.parse(cleanedResponse);

        } catch (error) {
            console.error('Error in LLM analysis:', error);
            throw error;
        }
    }

    async analyzeWithContext(screenshotPath, query, previousActions = [], cleanHTML = null) {
        try {
            const imageBuffer = fs.readFileSync(screenshotPath);
            const base64Image = imageBuffer.toString('base64');

            const systemPrompt = `You are a browser automation assistant. Continue the task based on the current screenshot and previous actions.

${cleanHTML ? `
**PRIORITIZE THIS HTML STRUCTURE FIRST:**
${cleanHTML}

Use the HTML to identify exact IDs, classes, and elements. The HTML shows the real structure of the page.
` : ''}

**ORIGINAL TASK:** ${query}

**PREVIOUS ACTIONS:**
${JSON.stringify(previousActions, null, 2)}

**RULES:**
1. Return ONLY a JSON array of actions (no markdown, no explanation)
2. Each action MUST have: "action", "params", "reasoning", "phaseCompleted", "completed"
3. Available actions: navigateToWebsite, clickElement, fillInput, scrollToElement, waitForElement
4. ALWAYS include "selectorType" in params for clickElement, fillInput, scrollToElement, waitForElement
5. Use short text selectors (max 15 characters) to avoid XPath errors
6. Set "phaseCompleted": true if the page will change after this action
7. Set "completed": true ONLY when this current action will supposedly finish the execution of the query : ${query}
8. Don't repeat previous actions unless necessary
9. Generate maximum 3 actions per response
10. Only generate actions for elements visible in the screenshot or HTML

**ACTION PARAMETER FORMATS:**
- navigateToWebsite: { "website": "https://example.com" }
- clickElement: { "selector": "element-id", "selectorType": "id" }
- fillInput: { "selector": "input-id", "selectorType": "id", "text": "search term" }
- scrollToElement: { "selector": "element-id", "selectorType": "id" }
- waitForElement: { "selector": "element-id", "selectorType": "id", "timeout": 5000 }

**SELECTOR TYPES & FORMATS:**
- id: Raw ID value WITHOUT # symbol (e.g., "submit-btn", "search-box")
- css: Full CSS selector WITH symbols (e.g., "#submit-btn", ".button", "input[type='submit']")
- xpath: Full XPath starting with // or / (e.g., "//button[@type='submit']", "//div[@class='cart']")
- text: Short unique visible text, max 15 chars (e.g., "Submit", "Add to Cart", "Search")

**IMPORTANT:** Only use selectors for elements that are actually visible in the screenshot or present in the HTML structure provided.

Continue the task from where it left off:`;

            const message = new HumanMessage({
                content: [
                    {
                        type: "text",
                        text: systemPrompt
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/png;base64,${base64Image}`
                        }
                    }
                ]
            });

            const response = await this.model.invoke([message]);
            const responseText = response.content.trim();
            
            // Clean response and parse JSON
            let cleanedResponse = responseText.replace(/```json|```/g, '').trim();
            if (cleanedResponse.startsWith('[') && !cleanedResponse.endsWith(']')) {
                cleanedResponse += ']';
            }
            
            return JSON.parse(cleanedResponse);

        } catch (error) {
            console.error('Error in LLM analysis:', error);
            throw error;
        }
    }

    async handleActionError({ screenshotPath, query, previousActions = [], lastAction, error, interceptingElement = null }) {
        try {
            const imageBuffer = fs.readFileSync(screenshotPath);
            const base64Image = imageBuffer.toString('base64');

            const systemPrompt = `The previous action failed. Generate recovery actions to continue the task.

**ORIGINAL TASK:** ${query}
**FAILED ACTION:** ${JSON.stringify(lastAction, null, 2)}
**ERROR:** ${error}
${interceptingElement ? `**INTERCEPTING ELEMENT:** ${interceptingElement}` : ''}

**RECOVERY RULES:**
1. Return ONLY a JSON array of actions (no markdown, no explanation)
2. Each action MUST have: "action", "params", "reasoning", "phaseCompleted", "completed"
3. Available actions: navigateToWebsite, clickElement, fillInput, scrollToElement, waitForElement
4. ALWAYS include "selectorType" in params for clickElement, fillInput, scrollToElement, waitForElement
5. Try different selectors or approaches to fix the error
6. If click was intercepted, try clicking the intercepting element instead
7. For "element not interactable" errors, try scrolling or waiting first
8. Use shorter text selectors (max 10 characters) to avoid XPath syntax errors
9. Generate maximum 3 recovery actions
10. DO NOT restart the task - continue from current state
11. Only generate actions for elements visible in the screenshot
12. Set "phaseCompleted": true if the page will change after this action
13. Set "completed": true ONLY when this current action will supposedly finish the execution of the query : ${query}
14. Don't repeat previous actions unless necessary

**ACTION PARAMETER FORMATS:**
- navigateToWebsite: { "website": "https://example.com" }
- clickElement: { "selector": "element-id", "selectorType": "id" }
- fillInput: { "selector": "input-id", "selectorType": "id", "text": "search term" }
- scrollToElement: { "selector": "element-id", "selectorType": "id" }
- waitForElement: { "selector": "element-id", "selectorType": "id", "timeout": 5000 }

**SELECTOR TYPES & FORMATS:**
- id: Raw ID value WITHOUT # symbol (e.g., "submit-btn", "search-box")
- css: Full CSS selector WITH symbols (e.g., "#submit-btn", ".button", "input[type='submit']")
- xpath: Full XPath starting with // or / (e.g., "//button[@type='submit']", "//div[@class='cart']")
- text: Very short unique visible text, max 10 chars (e.g., "Submit", "Add", "Search")

**IMPORTANT:** Only use selectors for elements that are actually visible in the screenshot.

Generate recovery actions:`;

            const message = new HumanMessage({
                content: [
                    {
                        type: "text",
                        text: systemPrompt
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/png;base64,${base64Image}`
                        }
                    }
                ]
            });

            const response = await this.model.invoke([message]);
            const responseText = response.content.trim();
            
            // Clean response and parse JSON
            let cleanedResponse = responseText.replace(/```json|```/g, '').trim();
            if (cleanedResponse.startsWith('[') && !cleanedResponse.endsWith(']')) {
                cleanedResponse += ']';
            }
            
            return JSON.parse(cleanedResponse);

        } catch (error) {
            console.error('Error in LLM error recovery:', error);
            throw error;
        }
    }
}

module.exports = LLMService;
