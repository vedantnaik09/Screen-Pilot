const { ChatOllama } = require("@langchain/ollama");
const { HumanMessage } = require("@langchain/core/messages");
const fs = require('fs');

class OllamaLLMService {
    constructor() {
        this.model = new ChatOllama({
            model: "qwen2.5vl", // Much better for vision-language tasks and UI understanding
            baseUrl: "https://emerging-cockatoo-informally.ngrok-free.app/", // Default Ollama URL
            temperature: 0.1,
            // Qwen2-VL is specifically designed for vision tasks and should provide better JSON responses
        });
    }

    // Helper to robustly extract JSON from LLM responses that may include
    // markdown fences (```json ... ```), surrounding commentary, or extra
    // whitespace. Returns the parsed object or throws a descriptive error.
    parseJsonFromResponse(responseText) {
        let text = (responseText || '').trim();

        // Remove common triple-backtick fences and optional language tags
        // e.g. ```json\n...\n```
        text = text.replace(/^```(?:\w+)?\s*/i, '');
        text = text.replace(/\s*```$/i, '');

        // Quick try: direct parse
        try {
            return JSON.parse(text);
        } catch (e) {
            // Attempt to locate the first JSON object/array and the last matching bracket
            const firstCharIndex = text.search(/[\{\[]/);
            if (firstCharIndex !== -1) {
                const opening = text[firstCharIndex];
                const closing = opening === '[' ? ']' : '}';
                const lastCharIndex = text.lastIndexOf(closing);
                if (lastCharIndex > firstCharIndex) {
                    const candidate = text.slice(firstCharIndex, lastCharIndex + 1);
                    try {
                        return JSON.parse(candidate);
                    } catch (ee) {
                        // fall through to throw below with useful debug
                    }
                }
            }

            // As a last effort, strip single backticks and any leading/trailing non-json
            const stripped = text.replace(/```/g, '').replace(/`/g, '').trim();
            try {
                return JSON.parse(stripped);
            } catch (finalErr) {
                const preview = stripped.length > 1000 ? stripped.slice(0, 1000) + '...[truncated]' : stripped;
                const err = new Error('Unable to parse JSON from LLM response after cleaning. Preview: ' + preview);
                err.original = responseText;
                err.cleaned = stripped;
                throw err;
            }
        }
    }



    // No longer require pageSource as a parameter
    async analyzeScreenshotAndQuery(screenshotPath, query, cleanHTML) {
        try {
            // Read and encode screenshot
           const imageBuffer = fs.readFileSync(screenshotPath);
                       const base64Image = imageBuffer.toString('base64');
           
                       const systemPrompt = `You are a browser automation assistant used by selenium. You are generating array of actions for a particular phase. Analyze the provided screenshot and HTML to generate browser actions that fulfill the user's request.
           
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
           6. Set "phaseCompleted": true if no more actions can be generated in the current scope of the html content or the screenshot. It would be true for the last action of the array. For the first navigation or dom change set phaseCompleted as true and that would be the last action of the array.
           7. Set "completed": true ONLY when this current action will supposedly finish the execution of the query : ${query}
           8. Generate maximum 3 actions per response
           9. Only generate actions for elements visible in the screenshot or HTML
           10. If a required element is not visbile you may scroll to it in order to see it properly.
           
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
            console.log('Raw LLM response (analyzeScreenshotAndQuery):', responseText);
            
            try {
                const parsed = this.parseJsonFromResponse(responseText);
                console.log('Successfully parsed JSON (analyzeScreenshotAndQuery):', parsed);
                return parsed;
            } catch (parseError) {
                console.error('JSON parse error (analyzeScreenshotAndQuery):', parseError);
                console.error('Original LLM response (analyzeScreenshotAndQuery):', responseText);
                throw new Error('Invalid JSON response from LLM');
            }

        } catch (error) {
            console.error('Error in LLM analysis:', error);
            throw error;
        }
    }

    async analyzeWithContext(screenshotPath, query, previousActions = [], cleanHTML) {
        try {
             const imageBuffer = fs.readFileSync(screenshotPath);
                        const base64Image = imageBuffer.toString('base64');
            
                        const systemPrompt = `You are a browser automation assistant used by selenium. You are generating array of actions for a particular phase. Continue the task based on the current screenshot and previous actions.
            
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
            6. Set "phaseCompleted": true if no more actions can be generated in the current scope of the html content or the screenshot. It would be true for the last action of the array. For the first navigation or dom change set phaseCompleted as true and that would be the last action of the array.
            7. Set "completed": true ONLY when this current action will supposedly finish the execution of the query : ${query}
            8. Don't repeat previous actions unless necessary
            9. Generate maximum 3 actions per response
            10. Only generate actions for elements visible in the screenshot or HTML
            11. If a required element is not visbile you may scroll to it in order to see it properly.
            
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
            console.log('Raw LLM response (analyzeWithContext):', responseText);
            
            try {
                const parsed = this.parseJsonFromResponse(responseText);
                console.log('Successfully parsed JSON (analyzeWithContext):', parsed);
                return parsed;
            } catch (parseError) {
                console.error('JSON parse error (analyzeWithContext):', parseError);
                console.error('Original LLM response (analyzeWithContext):', responseText);
                throw new Error('Invalid JSON response from LLM');
            }

        } catch (error) {
            console.error('Error in contextual LLM analysis:', error);
            throw error;
        }
    }

        // Handle error feedback and ask LLM for a new suggestion
    async handleActionError({ screenshotPath, query, previousActions = [], lastAction, error, interceptingElement, cleanHTML}) {
        try {
            const imageBuffer = fs.readFileSync(screenshotPath);
                        const base64Image = imageBuffer.toString('base64');
            
                        const systemPrompt = `
                        You are a browser automation assistant used by selenium. You are generating array of actions for a particular phase. Analyze the provided screenshot and HTML to generate browser actions that fulfill the user's request.
                        The previous action failed. Generate recovery actions to continue the task.
            
            **ORIGINAL TASK:** ${query}
            **FAILED ACTION:** ${JSON.stringify(lastAction, null, 2)}
            **ERROR:** ${error}
            ${interceptingElement ? `**INTERCEPTING ELEMENT:** ${interceptingElement}` : ''}

            ${cleanHTML ? `
            **PRIORITIZE THIS HTML STRUCTURE FIRST:**
            ${cleanHTML}
            
            Use the HTML to identify exact IDs, classes, and elements. The HTML shows the real structure of the page.
            ` : ''}
            
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
            12. Set "phaseCompleted": true if no more actions can be generated in the current scope of the html content or the screenshot. It would be true for the last action of the array. For the first navigation or dom change set phaseCompleted as true and dont generate any more actions after that.
            13. Set "completed": true ONLY when this current action will supposedly finish the execution of the query : ${query}
            14. Don't repeat previous actions unless necessary
            15. If a required element is not visbile you may scroll to it in order to see it properly.
            16. If an action failed with the error "Wait timed out" it means that the element with that selector/selectorType combination does not exist and you will have to generate action with a different selector/selectorType.
            
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
            console.log('Raw LLM response (handleActionError):', responseText);
            
            try {
                const parsed = this.parseJsonFromResponse(responseText);
                console.log('Successfully parsed JSON (handleActionError):', parsed);
                return parsed;
            } catch (parseError) {
                console.error('JSON parse error (handleActionError):', parseError);
                console.error('Original LLM response (handleActionError):', responseText);
                throw new Error('Invalid JSON response from LLM (error recovery)');
            }
        } catch (error) {
            console.error('Error in LLM error recovery:', error);
            throw error;
        }
    }
}

module.exports = OllamaLLMService;
