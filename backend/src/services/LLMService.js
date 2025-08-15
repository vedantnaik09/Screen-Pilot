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

    // Always require pageSource as a parameter
    async analyzeScreenshotAndQuery(screenshotPath, pageSource, query) {
        try {
            // Read and encode screenshot
            const imageBuffer = fs.readFileSync(screenshotPath);
            const base64Image = imageBuffer.toString('base64');

            const systemPrompt = `You are a browser automation assistant. Based on the screenshot, page source, and user query, determine what actions should be performed.

Available functions:
1. navigateToWebsite(website) - Navigate to a website
2. clickElement(selector, selectorType) - Click a button, link, or any clickable element
3. fillInput(selector, text, selectorType) - Fill an input field with text
4. scrollToElement(selector, selectorType) - Scroll to bring an element into view
5. waitForElement(selector, selectorType, timeout) - Wait for an element to appear

Selector types: 'id', 'xpath', 'css', 'text' (for partial text match)

Rules:
- Only generate actions for the current page state. 
- If an action (like navigation or clicking a link/button) leads to a new page or significant DOM change, set "phaseCompleted": true for that action and stop generating further actions for this phase. Wait for the next screenshot and page source before continuing.
- Only set "completed": true in the last action if the user's query is fully completed.
- ALWAYS return an array of actions, even if only one action is needed.

Here is the current page source (HTML):
${pageSource}

User Query: ${query}

Respond ONLY with valid JSON in this format:
[
  {
    "action": "functionName",
    "params": {
      "selector": "element_selector",
      "selectorType": "id|css|xpath|text",
      "text": "text_to_fill" // only for fillInput
    },
    "reasoning": "Brief explanation",
    "phaseCompleted": false, // set to true if this action ends the current phase (e.g., navigation)
    "completed": false // set to true ONLY in the last action if the user's query is fully completed
  }
]
`;

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
            let cleanedResponse = responseText.replace(/```json|```/g, '').trim();
            // Try to auto-close a single open array
            if (cleanedResponse.startsWith('[') && !cleanedResponse.endsWith(']')) {
                cleanedResponse += ']';
            }
            try {
                return JSON.parse(cleanedResponse);
            } catch (parseError) {
                console.error('Failed to parse LLM response:', responseText);
                throw new Error('Invalid JSON response from LLM');
            }

        } catch (error) {
            console.error('Error in LLM analysis:', error);
            throw error;
        }
    }

    async analyzeWithContext(screenshotPath, pageSource, query, previousActions = []) {
        try {
            const imageBuffer = fs.readFileSync(screenshotPath);
            const base64Image = imageBuffer.toString('base64');

            const contextPrompt = previousActions.length > 0 
                ? `\n\nPrevious actions taken: ${JSON.stringify(previousActions, null, 2)}`
                : '';

            const systemPrompt = `You are a browser automation assistant. Based on the screenshot, page source, user query, and previous actions, determine what actions should be performed next.

Available functions:
1. navigateToWebsite(website) - Navigate to a website
2. clickElement(selector, selectorType) - Click a button, link, or any clickable element
3. fillInput(selector, text, selectorType) - Fill an input field with text
4. scrollToElement(selector, selectorType) - Scroll to bring an element into view
5. waitForElement(selector, selectorType, timeout) - Wait for an element to appear

Selector types: 'id', 'xpath', 'css', 'text' (for partial text match)

Rules:
- Only generate actions for the current page state. 
- If an action (like navigation or clicking a link/button) leads to a new page or significant DOM change, set "phaseCompleted": true for that action and stop generating further actions for this phase. Wait for the next screenshot and page source before continuing.
- Only set "completed": true in the last action if the user's query is fully completed.
- ALWAYS return an array of actions, even if only one action is needed.

Here is the current page source (HTML):
${pageSource}

${contextPrompt}

User Query: ${query}

Respond ONLY with valid JSON in this format:
[
  {
    "action": "functionName",
    "params": {
      "selector": "element_selector",
      "selectorType": "id|css|xpath|text",
      "text": "text_to_fill" // only for fillInput
    },
    "reasoning": "Brief explanation",
    "phaseCompleted": false, // set to true if this action ends the current phase (e.g., navigation)
    "completed": false // set to true ONLY in the last action if the user's query is fully completed
  }
]
`;

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
            let cleanedResponse = responseText.replace(/```json|```/g, '').trim();
            if (cleanedResponse.startsWith('[') && !cleanedResponse.endsWith(']')) {
                cleanedResponse += ']';
            }
            try {
                return JSON.parse(cleanedResponse);
            } catch (parseError) {
                console.error('Failed to parse LLM response:', responseText);
                throw new Error('Invalid JSON response from LLM');
            }

        } catch (error) {
            console.error('Error in contextual LLM analysis:', error);
            throw error;
        }
    }
}

module.exports = LLMService;