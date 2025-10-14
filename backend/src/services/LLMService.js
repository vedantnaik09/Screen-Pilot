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
            // Handle case where no screenshot is provided (HTML-only analysis)
            let base64Image = null;
            if (screenshotPath && fs.existsSync(screenshotPath)) {
                const imageBuffer = fs.readFileSync(screenshotPath);
                base64Image = imageBuffer.toString('base64');
            }

            let htmlSection = "";
            if (cleanHTML) {
                htmlSection = `
**PRIORITIZE THIS HTML STRUCTURE - THIS IS THE PRIMARY SOURCE:**
The HTML below contains the ACTUAL rendered DOM structure of the page. Use this as your PRIMARY source for element selection.

${cleanHTML}

**ELEMENT SELECTION STRATEGY:**
1. ALWAYS search the HTML first for the exact element you need
2. Look for elements with matching text content, IDs, classes, or attributes
3. Prefer elements with specific IDs or classes over generic selectors
4. For buttons/links, look for exact text matches in the HTML
5. Use the exact attribute values (id, class) from the HTML for selectors

**IMPORTANT NOTES:**
- The HTML shows the complete rendered structure, not just headers/navbar
- All interactive elements (buttons, inputs, links) should be present in the HTML
- Use the exact attribute values (id, class) from the HTML for selectors
- Text selectors should match the exact text content shown in HTML elements

`;
            }

            const systemPrompt = `You are a browser automation assistant used by selenium. You are generating array of actions for a particular phase(A phase indicates actions upto the navigation change or dom content change or button click). Dont generate actions after any action that would cause these consequences: navigation change or dom content change or button click

${htmlSection}

**TASK:** ${query}

**RULES:**
1. Return ONLY a JSON array of actions (no markdown, no explanation)
2. Each action MUST have: "action", "params", "reasoning", "phaseCompleted", "completed"
3. Available actions: navigateToWebsite, clickElement, fillInput, scrollToElement
4. ALWAYS include "selectorType" in params for clickElement, fillInput, scrollToElement
5. Use short text selectors (max 15 characters) to avoid XPath errors
6. Set "phaseCompleted": true if no more actions can be generated in the current scope of the html content. For the navigation or dom change set phaseCompleted as true. No subsequent actions should be generated after an action which would cause dom change or navigation.
7. Set "completed": true ONLY when this current action will finish the execution of the query: ${query}.
8. Generate minimum number of actions up until the phase upto 3 actions.
9. Only generate actions for elements visible in the HTML

**ACTION PARAMETER FORMATS:**
- navigateToWebsite: { "website": "https://example.com" }
- clickElement: { "selector": "element-id", "selectorType": "id" }
- fillInput: { "selector": "input-id", "selectorType": "id", "text": "search term" }
- scrollToElement: { "selector": "element-id", "selectorType": "id" }

**SELECTOR TYPES & FORMATS:**
- id: Raw ID value WITHOUT # symbol (e.g., "submit-btn", "search-box")
- css: Full CSS selector WITH symbols (e.g., "#submit-btn", ".button", "input[type='submit']")
- xpath: Full XPath starting with // or / (e.g., "//button[@type='submit']", "//div[@class='cart']")
- text: Short unique visible text, max 15 chars (e.g., "Submit", "Add to Cart", "Search")

**IMPORTANT:** 
- Only use selectors for elements that are actually present in the HTML structure provided.
- navigateToWebsite action would always have phaseCompleted as true
- If an action has phaseCompleted as true then dont generate anymore elements after that action element in the array.

Return the JSON array:`;

            const message = new HumanMessage({
                content: [
                    {
                        type: "text",
                        text: systemPrompt
                    },
                    ...(base64Image ? [{
                        type: "image_url",
                        image_url: {
                            url: `data:image/png;base64,${base64Image}`
                        }
                    }] : [])
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
            // Handle case where no screenshot is provided (HTML-only analysis)
            let base64Image = null;
            if (screenshotPath && fs.existsSync(screenshotPath)) {
                const imageBuffer = fs.readFileSync(screenshotPath);
                base64Image = imageBuffer.toString('base64');
            }

            let htmlSection = "";
            if (cleanHTML) {
                htmlSection = `
**PRIORITIZE THIS HTML STRUCTURE - THIS IS THE PRIMARY SOURCE:**
The HTML below contains the ACTUAL rendered DOM structure of the page. Use this as your PRIMARY source for element selection.

${cleanHTML}

**ELEMENT SELECTION STRATEGY:**
1. ALWAYS search the HTML first for the exact element you need
2. Look for elements with matching text content, IDs, classes, or attributes
3. Prefer elements with specific IDs or classes over generic selectors
4. For buttons/links, look for exact text matches in the HTML
5. Use the exact attribute values (id, class) from the HTML for selectors

**IMPORTANT NOTES:**
- The HTML shows the complete rendered structure, not just headers/navbar
- All interactive elements (buttons, inputs, links) should be present in the HTML
- Use the exact attribute values (id, class) from the HTML for selectors
- Text selectors should match the exact text content shown in HTML elements

`;
            }

            const systemPrompt = `You are a browser automation assistant used by selenium. You are generating array of actions for a particular phase(A phase indicates actions upto the navigation change or dom content change or button click). Dont generate actions after any action that would cause these consequences: navigation change or dom content change or button click

${htmlSection}

**ORIGINAL TASK:** ${query}

**PREVIOUS ACTIONS:**
${JSON.stringify(previousActions, null, 2)}

**RULES:**
1. Return ONLY a JSON array of actions (no markdown, no explanation)
2. Each action MUST have: "action", "params", "reasoning", "phaseCompleted", "completed"
3. Available actions: navigateToWebsite, clickElement, fillInput, scrollToElement
4. ALWAYS include "selectorType" in params for clickElement, fillInput, scrollToElement
5. Use short text selectors (max 15 characters) to avoid XPath errors
6. Set "phaseCompleted": true if no more actions can be generated in the current scope of the html content or the screenshot. For the navigation or dom change set phaseCompleted as true. No subsequent actions should be generated after an action which would cause dom change or navigation.
7. Set "completed": true ONLY when this current action will finish the execution of the query which is mentioned in the website from the screenshot or the html.
8. Don't repeat previous actions unless necessary
9. Generate minimum number of actions up until the phase upto 3 actions
10. Only generate actions for elements visible in the screenshot or HTML

**ACTION PARAMETER FORMATS:**
- navigateToWebsite: { "website": "https://example.com" }
- clickElement: { "selector": "element-id", "selectorType": "id" }
- fillInput: { "selector": "input-id", "selectorType": "id", "text": "search term" }
- scrollToElement: { "selector": "element-id", "selectorType": "id" }

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
                    ...(base64Image ? [{
                        type: "image_url",
                        image_url: {
                            url: `data:image/png;base64,${base64Image}`
                        }
                    }] : [])
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

    async handleActionError({ screenshotPath, query, previousActions = [], lastAction, error, interceptingElement = null, htmlSnippet = null }) {
        try {
            // Handle case where no screenshot is provided (HTML-only analysis)
            let base64Image = null;
            if (screenshotPath && fs.existsSync(screenshotPath)) {
                const imageBuffer = fs.readFileSync(screenshotPath);
                base64Image = imageBuffer.toString('base64');
            }

            let htmlSection = "";
            if (htmlSnippet) {
                htmlSection = `
**PRIORITIZE THIS HTML STRUCTURE - THIS IS THE PRIMARY SOURCE:**
The HTML below contains the ACTUAL rendered DOM structure of the page. Use this as your PRIMARY source for element selection.

${htmlSnippet}

**ELEMENT SELECTION STRATEGY:**
1. ALWAYS search the HTML first for the exact element you need
2. Look for elements with matching text content, IDs, classes, or attributes
3. Prefer elements with specific IDs or classes over generic selectors
4. For buttons/links, look for exact text matches in the HTML
5. Use the exact attribute values (id, class) from the HTML for selectors

**IMPORTANT NOTES:**
- The HTML shows the complete rendered structure, not just headers/navbar
- All interactive elements (buttons, inputs, links) should be present in the HTML
- Use the exact attribute values (id, class) from the HTML for selectors
- Text selectors should match the exact text content shown in HTML elements

`;
            }

            const systemPrompt = `You are a browser automation assistant used by selenium. You are generating array of actions for a particular phase(A phase indicates actions upto the navigation change or dom content change or button click). Dont generate actions after any action that would cause these consequences: navigation change or dom content change or button click. The previous action failed. Generate recovery actions to continue the task.

**ORIGINAL TASK:** ${query}
**FAILED ACTION:** ${JSON.stringify(lastAction, null, 2)}
**ERROR:** ${error}
${interceptingElement ? `**INTERCEPTING ELEMENT:** ${interceptingElement}` : ''}

${htmlSection}

**RECOVERY RULES:**
1. Return ONLY a JSON array of actions (no markdown, no explanation)
2. Each action MUST have: "action", "params", "reasoning", "phaseCompleted", "completed"
3. Available actions: navigateToWebsite, clickElement, fillInput, scrollToElement
4. ALWAYS include "selectorType" in params for clickElement, fillInput, scrollToElement
5. Try different selectors or approaches to fix the error
6. If click was intercepted, try clicking the intercepting element instead
7. For "element not interactable" errors, try scrolling or waiting first
8. Use shorter text selectors (max 10 characters) to avoid XPath syntax errors
9. Generate minimum number of actions up until the phase upto 3 actions
10. DO NOT restart the task - continue from current state
11. Only generate actions for elements present in the HTML structure
12. Set "phaseCompleted": true if no more actions can be generated in the current scope of the html content. For the navigation or dom change set phaseCompleted as true. No subsequent actions should be generated after an action which would cause dom change or navigation.
13. Set "completed": true ONLY when this current action will finish the execution of the query: ${query}
14. Don't repeat previous actions unless necessary
15. If you are searching for an input field, note that it may contain a placeholder and you wont be able to search it with text directly so in that case use appropriate xpath.

**ACTION PARAMETER FORMATS:**
- navigateToWebsite: { "website": "https://example.com" }
- clickElement: { "selector": "element-id", "selectorType": "id" }
- fillInput: { "selector": "input-id", "selectorType": "id", "text": "search term" }
- scrollToElement: { "selector": "element-id", "selectorType": "id" }

**SELECTOR TYPES & FORMATS:**
- id: Raw ID value WITHOUT # symbol (e.g., "submit-btn", "search-box")
- css: Full CSS selector WITH symbols (e.g., "#submit-btn", ".button", "input[type='submit']")
- xpath: Full XPath starting with // or / (e.g., "//button[@type='submit']", "//div[@class='cart']")
- text: Very short unique visible text, max 10 chars (e.g., "Submit", "Add", "Search")

**IMPORTANT:** 
- Only use selectors for elements that are actually present in the HTML structure provided.
- navigateToWebsite action would always have phaseCompleted as true
- If an action has phaseCompleted as true then dont generate anymore elements after that action element in the array.


Generate recovery actions:`;

            const message = new HumanMessage({
                content: [
                    {
                        type: "text",
                        text: systemPrompt
                    },
                    ...(base64Image ? [{
                        type: "image_url",
                        image_url: {
                            url: `data:image/png;base64,${base64Image}`
                        }
                    }] : [])
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
