const { ChatOllama } = require("@langchain/ollama");
const { HumanMessage } = require("@langchain/core/messages");
const fs = require('fs');

class OllamaLLMService {
    constructor() {
        // Lightweight vision model for fast OCR and element listing (smaller / faster)
        this.visionModel = new ChatOllama({
            model: "qwen2.5vl", // lighter & faster for simple OCR/element listing
            baseUrl: "https://emerging-cockatoo-informally.ngrok-free.app/",
            temperature: 0,
        });

        // Text model for action generation
        this.textModel = new ChatOllama({
            model: "llama3.1:8b", // Text model for action planning
            baseUrl: "https://emerging-cockatoo-informally.ngrok-free.app/",
            temperature: 0.1,
        });
    }

    // Helper to robustly extract JSON from LLM responses
    parseJsonFromResponse(responseText) {
        let text = (responseText || '').trim();

        // Remove common triple-backtick fences and optional language tags
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

    // Step 1: Vision model analyzes screenshot for OCR and element listing
    // Now accepts the original query and a maxElements cap to keep the call lightweight.
    // Also requests a short "suggestion" string describing the recommended next action based on the screenshot + user query.
    async analyzeScreenshotForElements(screenshotPath, query = '', maxElements = 6) {
        try {
            const imageBuffer = fs.readFileSync(screenshotPath);
            const base64Image = imageBuffer.toString('base64');

            const visionPrompt = `I am trying to run a selenium code which performs actions automatically. For the current task I have received the following query: User query: "${query}"

The query is only for reference. Rely on the screenshot completely to return me the elements which we can consider clicking on to progress further and complete the task eventually. The entire task is divided into subtasks, so you may receive the screenshot at any stage of the progress, assess the stage and the query carefully and only return the relevant elements to the user query which are present in the screenshot only, don't return anything outside of the screenshot. You don't have to decipher the actual elements, just determine the different interactable elements distinguished by the texts and return it. If you think the required element is not visible ask it to scroll the page to the element you would send as text.

IMPORTANT NOTE: If the page screenshot is blank return an empty json and tell it to navigate according to the user query in the suggestion.

- Return JSON only in the following syntax: {"elements":[{"selectorFromAnalysis":"exact_visible_text","type":"text"}], "suggestion":<short suggested next action based on the screenshot and user query>}
- MAX elements: ${maxElements}. If more exist, return the most relevant ones only.
- The "suggestion" should be a very short sentence (max 100 characters) stating the most logical next action (e.g., "Click 'Sign in'", "Enter search term and submit", "Scroll to find 'Load more'"). If unsure, return an empty string. Along with the suggestion add a text indicating the current status(eg., "Searched for xyz successfully", "Currently on the product page").
 The suggestion is to be given phase wise(ie A phase indicates the actions up until the point the DOM Content changes or navigation happens. So dont give suggestions beyond a phase)
`;

            const message = new HumanMessage({
                content: [
                    { type: "text", text: visionPrompt },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/png;base64,${base64Image}`
                        }
                    }
                ]
            });

            const response = await this.visionModel.invoke([message]);
            const responseText = (response.content || '').trim();
            console.log('Raw Vision Model response:', responseText);

            try {
                const parsed = this.parseJsonFromResponse(responseText);

                // Ensure parsed structure and enforce limits/trimming
                const safe = { elements: [], suggestion: '' };

                if (parsed && Array.isArray(parsed.elements)) {
                    safe.elements = parsed.elements.slice(0, maxElements).map(e => {
                        return {
                            selectorFromAnalysis: (e.selectorFromAnalysis || '').toString().slice(0, 25),
                            type: (e.type || '').toString()
                        };
                    });
                }

                if (parsed && typeof parsed.suggestion === 'string') {
                    safe.suggestion = parsed.suggestion.trim().slice(0, 200);
                } else if (parsed && parsed.suggestion) {
                    safe.suggestion = String(parsed.suggestion).trim().slice(0, 200);
                }

                // Backwards compatibility: also expose `text` field for callers expecting the old shape
                safe.elements = safe.elements.map(el => ({ ...el }));
                
                console.log('Successfully parsed Vision Model JSON with suggestion:', safe);
                return safe;
            } catch (parseError) {
                console.error('JSON parse error (Vision Model):', parseError);
                console.error('Original Vision Model response:', responseText);
                throw new Error('Invalid JSON response from Vision Model');
            }

        } catch (error) {
            console.error('Error in Vision Model analysis:', error);
            throw error;
        }
    }

    // Step 2: Text model generates actions based on vision analysis and HTML
    async generateActionsFromAnalysis(query, visionAnalysis, cleanHTML, previousActions = []) {
        try {
            const actionPrompt = `You are a browser automation assistant used by selenium. You are generating array of actions for a particular phase(A phase indicates actions upto the navigation change or dom content change or button click). Dont generate actions after any action that would cause these consequences: navigation change or dom content change or button click

**ORIGINAL TASK:** ${query}

**SCREENSHOT ANALYSIS:**
Elements suggested by the screenshot analysis: ${visionAnalysis.elements}
Please take this suggestion very seriously and only generate actions according to this suggestion, dont generate anything not relevant to this suggestion: ${visionAnalysis.suggestion}
If the above suggestions asks you to click on a certain element then try if you can find that selector with its id or class in the below truncated html content, if you find it use that.
If you dont find that element then select the element with selectorType:"text" and selector as selectorFromAnalysis(dont include # at the start of this).

NOTE: The html content would only have elements and ids of the top part of the content, which likely covers the header and the navbar. So only choose the selectors from the html content if you think you are choosing the element from the truncated html. Selectors with "nav-" etc are majorly used for navigation and not for performing any actions. In that case rely on the above screenshot analysis suggestion.


${cleanHTML ? `

The below html only provides a snippet of the truncated html which would likely indicate the top part of the page only, so it is likely that the elements in the html only include the header and the navbar, so verify if clicking on those buttons is relevant. If you think the element to be clicked is outside the html content rely solely on the screenshot analysis provided and use the selectorType as text for clicking buttons/links and the selector would be indicated by selectorFromAnalysis from the screenshot analysis. Elements with nav would indicate that they are navbar elements and are primarily used for navigation and not for performing any action, so if you are looking to perform an action refer to the screenshot analysis.

**HTML STRUCTURE OF THE TOP PART ONLY:**
${cleanHTML}

 The html is only a snippet of the top part of the page so it may not cover the entire page. If you feel that is the case please rely on the screenshot analysis. If you find that the screenshot analysis differs from the html content then prefer to select the elements using the screenshot analysis.
` : ''}

${previousActions.length > 0 ? `
**PREVIOUS ACTIONS:**
${JSON.stringify(previousActions, null, 2)}
` : ''}

**RULES:**
1. Return ONLY a JSON array of actions (no markdown, no explanation)
2. Each action MUST have: "action", "params", "reasoning", "phaseCompleted", "completed"
3. Available actions: navigateToWebsite, clickElement, fillInput, scrollToElement, waitForElement
4. ALWAYS include "selectorType" in params for clickElement, fillInput, scrollToElement, waitForElement
5. Use the screenshot analysis to understand what elements are visible
6. Prefer HTML selectors (id, css) when available, fallback to text selectors from screenshot analysis
7. Use short text selectors (max 15 characters) to avoid XPath errors
8. Set "phaseCompleted": true if no more actions can be generated in the current scope of the html content or the screenshot. For the navigation or dom change set phaseCompleted as true. No subsequent actions should be generated after an action which would cause dom change or navigation.
9. Set "completed": true ONLY when this current action will finish the execution of the query: ${query}
10. Generate minimum number of actions upto 3 required to satisfy this suggestion: ${visionAnalysis.suggestion}
11. Only generate actions for elements that are visible according to the screenshot analysis
12. If a required element is not visible, you may scroll to it first
13. Don't repeat previous actions unless necessary

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
- text: Short unique visible text from screenshot analysis, max 15 chars (e.g., "Submit", "Add to Cart", "Search")

**IMPORTANT:** 
- Cross-reference the screenshot analysis with HTML structure to choose the best selectors
- Prioritize elements that are confirmed visible in the screenshot analysis
- Use exact text from the screenshot analysis for text selectors
- navigateToWebsite action would always have phaseCompleted as true
- If an action has phaseCompleted as true then dont generate anymore elements after that action element in the array.

Generate the actions array:`;

            const message = new HumanMessage({
                content: [
                    {
                        type: "text",
                        text: actionPrompt
                    }
                ]
            });

            const response = await this.textModel.invoke([message]);
            const responseText = response.content.trim();
            console.log('Raw Text Model response:', responseText);
            
            try {
                const parsed = this.parseJsonFromResponse(responseText);
                console.log('Successfully parsed Text Model JSON:', parsed);
                return parsed;
            } catch (parseError) {
                console.error('JSON parse error (Text Model):', parseError);
                console.error('Original Text Model response:', responseText);
                throw new Error('Invalid JSON response from Text Model');
            }

        } catch (error) {
            console.error('Error in Text Model action generation:', error);
            throw error;
        }
    }

    // Main function: Combines vision analysis with action generation
    async analyzeScreenshotAndQuery(screenshotPath, query, cleanHTML) {
        try {
            console.log('Step 1: Analyzing screenshot with vision model...', screenshotPath);
            // pass query and cap element count to keep it lightweight
            const visionAnalysis = await this.analyzeScreenshotForElements(screenshotPath, query, 6);
            
            console.log('Step 2: Generating actions with text model...');
            const actions = await this.generateActionsFromAnalysis(query, visionAnalysis, cleanHTML);
            
            return actions;
        } catch (error) {
            console.error('Error in analyzeScreenshotAndQuery:', error);
            throw error;
        }
    }

    // Main function with context: Combines vision analysis with action generation including previous actions
    async analyzeWithContext(screenshotPath, query, previousActions = [], cleanHTML) {
        try {
            console.log('Step 1: Analyzing screenshot with vision model...', screenshotPath);
            const visionAnalysis = await this.analyzeScreenshotForElements(screenshotPath, query, 6);
            
            console.log('Step 2: Generating actions with context using text model...');
            const actions = await this.generateActionsFromAnalysis(query, visionAnalysis, cleanHTML, previousActions);
            
            return actions;
        } catch (error) {
            console.error('Error in analyzeWithContext:', error);
            throw error;
        }
    }

    // Error handling with two-model approach
    async handleActionError({ screenshotPath, query, previousActions = [], lastAction, error, interceptingElement, cleanHTML}) {
        try {
            console.log('Step 1: Analyzing current state with vision model...');
            const visionAnalysis = await this.analyzeScreenshotForElements(screenshotPath, query, 6);
            
            console.log('Step 2: Generating recovery actions with text model...');
            const recoveryPrompt = `You are a browser automation assistant used by selenium. You are generating array of actions for a particular phase(A phase indicates actions upto the navigation change or dom content change or button click). Dont generate actions after any action that would cause these consequences: navigation change or dom content change or button click. The previous action failed. Generate recovery actions to continue the task.

**ORIGINAL TASK:** ${query}
**FAILED ACTION:** ${JSON.stringify(lastAction, null, 2)}
**ERROR:** ${error}
${interceptingElement ? `**INTERCEPTING ELEMENT:** ${interceptingElement}` : ''}

**SCREENSHOT ANALYSIS:**
Elements suggested by the screenshot analysis: ${visionAnalysis.elements}
Please take this suggestion very seriously and only generate actions according to this suggestion, dont generate anything not relevant to this suggestion: ${visionAnalysis.suggestion}
If the above suggestions asks you to click on a certain element then try if you can find that selector with its id or class in the below truncated html content, if you find it use that.
If you dont find that element then select the element with selectorType:"text" and selector as selectorFromAnalysis(dont include # at the start of this).

NOTE: The html content would only have elements and ids of the top part of the content, which likely covers the header and the navbar. So only choose the selectors from the html content if you think you are choosing the element from the truncated html. Selectors with "nav-" etc are majorly used for navigation and not for performing any actions. In that case rely on the above screenshot analysis suggestion.

${cleanHTML ? `

The below html only provides a snippet of the truncated html which would likely indicate the top part of the page only, so it is likely that the elements in the html only include the header and the navbar, so verify if clicking on those buttons is relevant. If you think the element to be clicked is outside the html content rely solely on the screenshot analysis provided and use the selectorType as text for clicking buttons/links and the selector would be indicated by selectorFromAnalysis from the screenshot analysis. Elements with nav would indicate that they are navbar elements and are primarily used for navigation and not for performing any action, so if you are looking to perform an action refer to the screenshot analysis.

**HTML STRUCTURE OF THE TOP PART ONLY:**
${cleanHTML}

 The html is only a snippet of the top part of the page so it may not cover the entire page. If you feel that is the case please rely on the screenshot analysis. If you find that the screenshot analysis differs from the html content then prefer to select the elements using the screenshot analysis.
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
9. Generate minimum number of actions upto 3 required to satisfy this suggestion: ${visionAnalysis.suggestion}
10. DO NOT restart the task - continue from current state
11. Only generate actions for elements visible in the screenshot analysis
12. Set "phaseCompleted": true if no more actions can be generated in the current scope of the html content or the screenshot. For the navigation or dom change set phaseCompleted as true. No subsequent actions should be generated after an action which would cause dom change or navigation.
13. Set "completed": true ONLY when this current action will finish the execution of the query: ${query}
14. Don't repeat previous actions unless necessary
15. If a required element is not visible, you may scroll to it first
16. If an action failed with "Wait timed out", the element doesn't exist - use different selector/selectorType

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
- text: Very short unique visible text from screenshot analysis, max 10 chars (e.g., "Submit", "Add", "Search")

**IMPORTANT:** 
- Cross-reference the screenshot analysis with HTML structure to choose the best selectors
- Prioritize elements that are confirmed visible in the screenshot analysis
- Use exact text from the screenshot analysis for text selectors
- navigateToWebsite action would always have phaseCompleted as true
- If an action has phaseCompleted as true then dont generate anymore elements after that action element in the array.

Generate recovery actions:`;

            const message = new HumanMessage({
                content: [
                    {
                        type: "text",
                        text: recoveryPrompt
                    }
                ]
            });

            const response = await this.textModel.invoke([message]);
            const responseText = response.content.trim();
            console.log('Raw Text Model recovery response:', responseText);
            
            try {
                const parsed = this.parseJsonFromResponse(responseText);
                console.log('Successfully parsed Text Model recovery JSON:', parsed);
                return parsed;
            } catch (parseError) {
                console.error('JSON parse error (Text Model recovery):', parseError);
                console.error('Original Text Model recovery response:', responseText);
                throw new Error('Invalid JSON response from Text Model (error recovery)');
            }

        } catch (error) {
            console.error('Error in handleActionError:', error);
            throw error;
        }
    }
}

module.exports = OllamaLLMService;
