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

    // Handle error feedback and ask LLM for a new suggestion
    async handleActionError({ screenshotPath, query, previousActions = [], lastAction, error }) {
        try {
            const imageBuffer = fs.readFileSync(screenshotPath);
            const base64Image = imageBuffer.toString('base64');
            const contextPrompt = previousActions.length > 0
                ? `\n\nPrevious actions taken: ${JSON.stringify(previousActions, null, 2)}`
                : '';

            const systemPrompt = `You are a browser automation assistant. The previous action failed with the following error: "${error}".

Use your knowledge of common website structures and well-known sites (such as Amazon, Google, etc.) to select the most appropriate elements for automation. Use the screenshot only as a fallback reference if you cannot infer the structure from your knowledge.

Rules:
- Always prioritize your knowledge of the website's structure (e.g., for Amazon, use known input/search bar ids, button classes, etc.).
- For product listings on Amazon, prefer using known container classes (like 's-result-item'), data attributes (like 'data-asin'), or predictable CSS selectors for product links/buttons. Do NOT use visible product titles or dynamic text as selectors. Prefer clicking the first product by index or container, not by text.
- Do NOT use long product titles, dynamic text, or placeholder/label text as selectors. Prefer unique, stable selectors (id, name, css, xpath).
- Only use text selectors if the text is short, visible, and not a placeholder, label, or dynamic content.
- Always wait for elements to be visible and enabled before clicking or interacting.
- If an element is not interactable, suggest scrolling, waiting, or closing overlays/popups/modals before retrying.
- Check for overlays, modals, or other UI elements that may block interaction and close or dismiss them if present.
- Only select elements that are visible and interactable (not hidden, disabled, or off-screen).
- If you are not sure an element is interactable, suggest a 'waitForElement' or 'scrollToElement' action before interacting.
- If the error suggests a different approach, recommend it.
- If an action (like navigation or clicking a link/button) leads to a new page or significant DOM change, set "phaseCompleted": true for that action and stop generating further actions for this phase. Wait for the next screenshot before continuing.
- Only set "completed": true in the last action if the user's query is fully completed.
- ALWAYS return an array of actions, even if only one action is needed.

${contextPrompt}

Last attempted action: ${JSON.stringify(lastAction, null, 2)}

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
        "phaseCompleted": false,
        "completed": false
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
            
            // Handle multiple JSON arrays - take only the first valid one
            if (cleanedResponse.includes('][')) {
                const firstArrayEnd = cleanedResponse.indexOf(']') + 1;
                cleanedResponse = cleanedResponse.substring(0, firstArrayEnd);
            }
            
            // If response is truncated, try to fix it by finding the last complete action
            if (!cleanedResponse.endsWith(']') && cleanedResponse.includes('{')) {
                const lastCompleteAction = cleanedResponse.lastIndexOf('}, {');
                if (lastCompleteAction > 0) {
                    cleanedResponse = cleanedResponse.substring(0, lastCompleteAction + 1) + ']';
                } else {
                    // Find the last complete action ending with }
                    const lastBrace = cleanedResponse.lastIndexOf('}');
                    if (lastBrace > 0) {
                        cleanedResponse = cleanedResponse.substring(0, lastBrace + 1) + ']';
                    }
                }
            }
            
            // Try to auto-close a single open array
            if (cleanedResponse.startsWith('[') && !cleanedResponse.endsWith(']')) {
                cleanedResponse += ']';
            }
            
            try {
                return JSON.parse(cleanedResponse);
            } catch (parseError) {
                console.error('Failed to parse LLM error recovery response:', responseText);
                throw new Error('Invalid JSON response from LLM (error recovery)');
            }
        } catch (error) {
            console.error('Error in LLM error recovery:', error);
            throw error;
        }
    }

    // No longer require pageSource as a parameter
    async analyzeScreenshotAndQuery(screenshotPath, query) {
        try {
            // Read and encode screenshot
            const imageBuffer = fs.readFileSync(screenshotPath);
            const base64Image = imageBuffer.toString('base64');

            const systemPrompt = `You are a browser automation assistant. Use your knowledge of common website structures and well-known sites (such as Amazon, Google, etc.) to select the most appropriate elements for automation. Use the screenshot only as a fallback reference if you cannot infer the structure from your knowledge.

Available functions:
1. navigateToWebsite(website) - Navigate to a website
2. clickElement(selector, selectorType) - Click a button, link, or any clickable element
3. fillInput(selector, text, selectorType) - Fill an input field with text
4. scrollToElement(selector, selectorType) - Scroll to bring an element into view
5. waitForElement(selector, selectorType, timeout) - Wait for an element to appear

Selector types: 'id', 'xpath', 'css', 'text' (for partial text match)

Rules:
- Always prioritize your knowledge of the website's structure (e.g., for Amazon, use known input/search bar ids, button classes, etc.).
- For product listings on Amazon, prefer using known container classes (like 's-result-item'), data attributes (like 'data-asin'), or predictable CSS selectors for product links/buttons. Do NOT use visible product titles or dynamic text as selectors. Prefer clicking the first product by index or container, not by text.
- Do NOT use long product titles, dynamic text, or placeholder/label text as selectors. Prefer unique, stable selectors (id, name, css, xpath).
- Only use text selectors if the text is short, visible, and not a placeholder, label, or dynamic content.
- Always wait for elements to be visible and enabled before clicking or interacting.
- If an element is not interactable, suggest scrolling, waiting, or closing overlays/popups/modals before retrying.
- Check for overlays, modals, or other UI elements that may block interaction and close or dismiss them if present.
- Only select elements that are visible and interactable (not hidden, disabled, or off-screen).
- If you are not sure an element is interactable, suggest a 'waitForElement' or 'scrollToElement' action before interacting.
- If an action (like navigation or clicking a link/button) leads to a new page or significant DOM change, set "phaseCompleted": true for that action and stop generating further actions for this phase. Wait for the next screenshot before continuing.
- Only set "completed": true in the last action if the user's query is fully completed.
- ALWAYS return an array of actions, even if only one action is needed.

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
            
            // Handle multiple JSON arrays - take only the first valid one
            if (cleanedResponse.includes('][')) {
                const firstArrayEnd = cleanedResponse.indexOf(']') + 1;
                cleanedResponse = cleanedResponse.substring(0, firstArrayEnd);
            }
            
            // If response is truncated, try to fix it by finding the last complete action
            if (!cleanedResponse.endsWith(']') && cleanedResponse.includes('{')) {
                const lastCompleteAction = cleanedResponse.lastIndexOf('}, {');
                if (lastCompleteAction > 0) {
                    cleanedResponse = cleanedResponse.substring(0, lastCompleteAction + 1) + ']';
                } else {
                    // Find the last complete action ending with }
                    const lastBrace = cleanedResponse.lastIndexOf('}');
                    if (lastBrace > 0) {
                        cleanedResponse = cleanedResponse.substring(0, lastBrace + 1) + ']';
                    }
                }
            }
            
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

    async analyzeWithContext(screenshotPath, query, previousActions = []) {
        try {
            const imageBuffer = fs.readFileSync(screenshotPath);
            const base64Image = imageBuffer.toString('base64');

            const contextPrompt = previousActions.length > 0 
                ? `\n\nPrevious actions taken: ${JSON.stringify(previousActions, null, 2)}`
                : '';

            const systemPrompt = `You are a browser automation assistant. Use your knowledge of common website structures and well-known sites (such as Amazon, Google, etc.) to select the most appropriate elements for automation. Use the screenshot only as a fallback reference if you cannot infer the structure from your knowledge.

Available functions:
1. navigateToWebsite(website) - Navigate to a website
2. clickElement(selector, selectorType) - Click a button, link, or any clickable element
3. fillInput(selector, text, selectorType) - Fill an input field with text
4. scrollToElement(selector, selectorType) - Scroll to bring an element into view
5. waitForElement(selector, selectorType, timeout) - Wait for an element to appear

Selector types: 'id', 'xpath', 'css', 'text' (for partial text match)

Rules:
- Always prioritize your knowledge of the website's structure (e.g., for Amazon, use known input/search bar ids, button classes, etc.).
- For product listings on Amazon, prefer using known container classes (like 's-result-item'), data attributes (like 'data-asin'), or predictable CSS selectors for product links/buttons. Do NOT use visible product titles or dynamic text as selectors. Prefer clicking the first product by index or container, not by text.
- Do NOT use long product titles, dynamic text, or placeholder/label text as selectors. Prefer unique, stable selectors (id, name, css, xpath).
- Only use text selectors if the text is short, visible, and not a placeholder, label, or dynamic content.
- Always wait for elements to be visible and enabled before clicking or interacting.
- If an element is not interactable, suggest scrolling, waiting, or closing overlays/popups/modals before retrying.
- Check for overlays, modals, or other UI elements that may block interaction and close or dismiss them if present.
- Only select elements that are visible and interactable (not hidden, disabled, or off-screen).
- If you are not sure an element is interactable, suggest a 'waitForElement' or 'scrollToElement' action before interacting.
- If an action (like navigation or clicking a link/button) leads to a new page or significant DOM change, set "phaseCompleted": true for that action and stop generating further actions for this phase. Wait for the next screenshot before continuing.
- Only set "completed": true in the last action if the user's query is fully completed.
- ALWAYS return an array of actions, even if only one action is needed.

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
            
            // Handle multiple JSON arrays - take only the first valid one
            if (cleanedResponse.includes('][')) {
                const firstArrayEnd = cleanedResponse.indexOf(']') + 1;
                cleanedResponse = cleanedResponse.substring(0, firstArrayEnd);
            }
            
            // If response is truncated, try to fix it by finding the last complete action
            if (!cleanedResponse.endsWith(']') && cleanedResponse.includes('{')) {
                const lastCompleteAction = cleanedResponse.lastIndexOf('}, {');
                if (lastCompleteAction > 0) {
                    cleanedResponse = cleanedResponse.substring(0, lastCompleteAction + 1) + ']';
                } else {
                    // Find the last complete action ending with }
                    const lastBrace = cleanedResponse.lastIndexOf('}');
                    if (lastBrace > 0) {
                        cleanedResponse = cleanedResponse.substring(0, lastBrace + 1) + ']';
                    }
                }
            }
            
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
            console.error('Error in contextual LLM analysis:', error);
            throw error;
        }
    }
}

module.exports = OllamaLLMService;
