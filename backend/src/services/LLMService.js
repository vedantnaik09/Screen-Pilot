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

            const systemPrompt = `You are a browser automation assistant used by selenium. You are generating array of actions for a particular phase(A phase indicates actions upto the navigation change or dom content change or button click). Dont generate actions after any action that would cause these consequences: navigation change or dom content change or button click

${cleanHTML ? `
**PRIORITIZE THIS HTML STRUCTURE FIRST:**
The below html only provides a snippet of the truncated html which would likely indicate the top part of the page only, so it is likely that the elements in the html only include the header and the navbar, so verify if clicking on those buttons is relevant. If you think the element to be clicked is outside the html content rely solely on the screenshot provided. Elements with nav would indicate that they are navbar elements and are primarily used for navigation and not for performing any action, so if you are looking to perform an action refer to the screenshot.

${cleanHTML}

NOTE: The html content would only have elements and ids of the top part of the content, which likely covers the header and the navbar. So only choose the selectors from the html content if you think you are choosing the element from the truncated html. Selectors with "nav-" etc are majorly used for navigation and not for performing any actions. In that case rely on the above screenshot analysis suggestion.

` : ''}

**TASK:** ${query}

**RULES:**
1. Return ONLY a JSON array of actions (no markdown, no explanation)
2. Each action MUST have: "action", "params", "reasoning", "phaseCompleted", "completed"
3. Available actions: navigateToWebsite, clickElement, fillInput, scrollToElement, waitForElement
4. ALWAYS include "selectorType" in params for clickElement, fillInput, scrollToElement, waitForElement
5. Use short text selectors (max 15 characters) to avoid XPath errors
6. Set "phaseCompleted": true if no more actions can be generated in the current scope of the html content or the screenshot. For the navigation or dom change set phaseCompleted as true. No subsequent actions should be generated after an action which would cause dom change or navigation.
7. Set "completed": true ONLY when this current action will finish the execution of the query: ${query}
8. Generate minimum number of actions up until the phase upto 3 actions.
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

**IMPORTANT:** 
- Only use selectors for elements that are actually visible in the screenshot or present in the HTML structure provided.
- navigateToWebsite action would always have phaseCompleted as true
- If an action has phaseCompleted as true then dont generate anymore elements after that action element in the array.

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

            const systemPrompt = `You are a browser automation assistant used by selenium. You are generating array of actions for a particular phase(A phase indicates actions upto the navigation change or dom content change or button click). Dont generate actions after any action that would cause these consequences: navigation change or dom content change or button click

${cleanHTML ? `
**PRIORITIZE THIS HTML STRUCTURE FIRST:**
The below html only provides a snippet of the truncated html which would likely indicate the top part of the page only, so it is likely that the elements in the html only include the header and the navbar, so verify if clicking on those buttons is relevant. If you think the element to be clicked is outside the html content rely solely on the screenshot provided. Elements with nav would indicate that they are navbar elements and are primarily used for navigation and not for performing any action, so if you are looking to perform an action refer to the screenshot.

${cleanHTML}

NOTE: The html content would only have elements and ids of the top part of the content, which likely covers the header and the navbar. So only choose the selectors from the html content if you think you are choosing the element from the truncated html. Selectors with "nav-" etc are majorly used for navigation and not for performing any actions. In that case rely on the above screenshot analysis suggestion.

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
6. Set "phaseCompleted": true if no more actions can be generated in the current scope of the html content or the screenshot. For the navigation or dom change set phaseCompleted as true. No subsequent actions should be generated after an action which would cause dom change or navigation.
7. Set "completed": true ONLY when this current action will finish the execution of the query: ${query}
8. Don't repeat previous actions unless necessary
9. Generate minimum number of actions up until the phase upto 3 actions
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

**IMPORTANT:** 
- Only use selectors for elements that are actually visible in the screenshot or present in the HTML structure provided.
- navigateToWebsite action would always have phaseCompleted as true
- If an action has phaseCompleted as true then dont generate anymore elements after that action element in the array.

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

            const systemPrompt = `You are a browser automation assistant used by selenium. You are generating array of actions for a particular phase(A phase indicates actions upto the navigation change or dom content change or button click). Dont generate actions after any action that would cause these consequences: navigation change or dom content change or button click. The previous action failed. Generate recovery actions to continue the task.

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
9. Generate minimum number of actions up until the phase upto 3 actions
10. DO NOT restart the task - continue from current state
11. Only generate actions for elements visible in the screenshot
12. Set "phaseCompleted": true if no more actions can be generated in the current scope of the html content or the screenshot. For the navigation or dom change set phaseCompleted as true. No subsequent actions should be generated after an action which would cause dom change or navigation.
13. Set "completed": true ONLY when this current action will finish the execution of the query: ${query}
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

**IMPORTANT:** 
- Only use selectors for elements that are actually visible in the screenshot or present in the HTML structure provided.
- navigateToWebsite action would always have phaseCompleted as true
- If an action has phaseCompleted as true then dont generate anymore elements after that action element in the array.


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
