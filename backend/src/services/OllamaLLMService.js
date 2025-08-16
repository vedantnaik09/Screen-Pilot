
const { ChatOllama } = require("@langchain/ollama");
const { HumanMessage } = require("@langchain/core/messages");
const { z } = require("zod");
const fs = require("fs");


// Define the schema for a single action
const ActionSchema = z.object({
	action: z.enum([
		"navigateToWebsite",
		"clickElement",
		"fillInput",
		"scrollToElement",
		"waitForElement"
	]),
	params: z.object({
		website: z.string().optional(),
		selector: z.string().optional(),
		selectorType: z.enum(["id", "css", "xpath", "text"]).optional(),
		text: z.string().optional(),
		timeout: z.number().optional()
	}),
	reasoning: z.string(),
	phaseCompleted: z.boolean(),
	completed: z.boolean()
});

// The LLM should return an array of actions
const ActionsArraySchema = z.array(ActionSchema);

function extractFirstJsonArray(text) {
	// Use a greedy match to capture the entire array, even if it contains nested objects
	const match = text.match(/\[.*\]/s);
	if (match) {
		try {
			return JSON.parse(match[0]);
		} catch (e) {
			// If parsing fails, fall through
		}
	}
	throw new Error("No valid JSON array found in LLM output");
}

class OllamaLLMService {
	constructor() {
		this.model = new ChatOllama({
			baseUrl: "https://emerging-cockatoo-informally.ngrok-free.app/", // adjust if needed
			model: "qwen2.5vl",
		});
	}


	async analyzeScreenshotAndQuery(screenshotPath, query) {
		const imageBuffer = fs.readFileSync(screenshotPath);
		const base64Image = imageBuffer.toString("base64");

						const prompt = `
You are a browser-automation assistant for a Node.js backend that uses Selenium WebDriver (Chrome).  
Your task is to output **one valid JSON array (no Markdown)** containing at most **three** action objects that will satisfy the user's query by interacting with the page visible in the supplied screenshot.


========================  GENERAL RULES  ========================
1. Return **only** the JSON array. Use double quotes for every JSON string.
2. Every action object must contain:
  • "action"           - one of: navigateToWebsite | clickElement | fillInput | scrollToElement | waitForElement  
  • "params"           - see per-action requirements below  
  • "reasoning"        - 1-sentence justification (assistants only; humans will not see it)  
  • "phaseCompleted"   - true if the DOM will reload or change substantially after this action  
  • "completed"        - true only if ${query} is achieved completely, refer to the screenshot as well for the confirmation.
3. **Never output more than three actions.** If more steps are needed, end with phaseCompleted:true so the controller can call you again.
4. Do not repeat the same action with identical params consecutively—adjust strategy instead.
5. Favor **id** or **css** selectors, then **xpath**, and use **text** only if the text is short, visible, unique, and stable.
6. **Do NOT use an input field (such as a text box) as a click target for submitting a search or form. Only click actual buttons or elements intended for submission.**
7. **For submitting a search or form, prefer clicking a button (e.g., with type='submit', or a visible search icon/button) rather than the input field itself.**
8. **Never use the placeholder text of an input as a selector for a button click. Only use it for identifying input fields to type into.**
9. **If you cannot confidently identify a search or submit button, do NOT click the input field. Instead, return a waitForElement or scrollToElement action for a likely button, or set phaseCompleted: true and explain in reasoning.**
10. **For Amazon, the search button is usually a button next to the search input, often with type='submit', or a class like '.nav-search-submit'. Try to use such selectors if visible.**

========================  SELECTOR TYPES & EXACT SYNTAX  ========================
• id  
  - params.selector: the raw id value, WITHOUT “#” (e.g., "submitBtn")  
• css  
  - params.selector: any valid CSS selector (e.g., "#submitBtn", ".btn.primary", "div[data-role='item']")  
• xpath  
  - params.selector: full XPath beginning with // or / and using @ for attributes  
    Examples: "//button[@type='submit']" , "//div[@data-test='card'][1]"  
    NEVER mix CSS syntax inside an XPath.  
• text  
  - If you are unsure about the selector or selectorType, rely on the screenshot and the visible text on the element.
  - params.selector: a short, unique, and stable substring of the visible text of a link or button (e.g., "Add to Cart" or a distinctive part of it). Do NOT use the entire long text, as OCR or screenshot text may be imperfect. Instead, use a partial but unique substring that is visible and likely to match only the intended element.
  - Do **not** use placeholder, aria-label, tooltip, or long/dynamic strings.

========================  PER-ACTION PARAMS  ========================
1. navigateToWebsite  
   params = { "website": "https://example.com" }   // full absolute URL

2. clickElement  
   params = { "selector": "<selector>", "selectorType": "id|css|xpath|text" }

3. fillInput  
   params = { 
     "selector": "<selector>", 
     "selectorType": "id|css|xpath|text", 
     "text": "<text to type>" 
   }

4. scrollToElement  
   params = { "selector": "<selector>", "selectorType": "id|css|xpath|text" }

5. waitForElement  
   params = { 
     "selector": "<selector>", 
     "selectorType": "id|css|xpath|text", 
     "timeout": 5000 // optional, defaults to 5000 ms 
   }

========================  BEST PRACTICES  ========================
• Before interacting with an element that might be off-screen or load late, insert a waitForElement or scrollToElement first.  
• Avoid placeholder, aria-label, long class strings, and volatile attribute values.  
• Use known stable ids on popular sites (e.g., Amazon search bar id "twotabsearchtextbox").  
• If you are unsure about the selector or selectorType, rely on the screenshot and the visible text. For selectorType 'text', use a short, unique, and stable substring of the visible text (not the entire text) to identify the element. This helps avoid errors from OCR or long/dynamic text.
• Set phaseCompleted:true on the last action before a full page reload (e.g., clicking a search button).  
• Only set completed:true on the very final action that accomplishes the user's high-level goal.
• Return a maximum of 3 actions, no more than that.
• Do not generate actions beyond a phase, only generate actions up to that phase
========================  SCHEMA TEMPLATE (DO NOT COPY VALUES)  ========================
[
  {
    "action": "navigateToWebsite",
    "params": { "website": "<url>" },
    "reasoning": "Load the target site.",
    "phaseCompleted": true,
    "completed": false
  },
  {
    "action": "fillInput",
    "params": { 
      "selector": "<selector>", 
      "selectorType": "id|css|xpath|text", 
      "text": "<text>" 
    },
    "reasoning": "Enter the user's search term.",
    "phaseCompleted": false,
    "completed": false
  },
  {
    "action": "clickElement",
    "params": { 
      "selector": "<selector>", 
      "selectorType": "id|css|xpath|text" 
    },
    "reasoning": "Submit the search.",
    "phaseCompleted": false,
    "completed": true
  }
]

========================  INPUTS  ========================
Screenshot: <screenshotPath>
User Query: ${query}


======================== IMPORTANT INSTRUCTION ===============
- Do not generate more than 3 actions.
- Only generate the minimum number of actions only for that phase.
- Please analyse the attached screenshot as well so that there is no redundancy, generate the actions cleverly. Check if that action has already taken place, if yes then dont generate that action again, generate further actions.
- For xpath use full XPath beginning with // or / and using @ for attributes.
- If you are unsure about the selector or selectorType, rely on the screenshot and the visible text. For selectorType 'text', use a short, unique, and stable substring of the visible text (not the entire text) to identify the element.
- **Do NOT use an input field (such as a text box) as a click target for submitting a search or form. Only click actual buttons or elements intended for submission.**
- **For submitting a search or form, prefer clicking a button (e.g., with type='submit', or a visible search icon/button) rather than the input field itself.**
- **Never use the placeholder text of an input as a selector for a button click. Only use it for identifying input fields to type into.**
- **If you cannot confidently identify a search or submit button, do NOT click the input field. Instead, return a waitForElement or scrollToElement action for a likely button, or set phaseCompleted: true and explain in reasoning.**
- **For Amazon, the search button is usually a button next to the search input, often with type='submit', or a class like '.nav-search-submit'. Try to use such selectors if visible.**

========================  OUTPUT  ========================
Return only the JSON array of actions that satisfies the query and adheres strictly to all rules above. Do NOT output anything else.
`;


		const message = new HumanMessage({
			content: [
				{ type: "text", text: prompt },
				{ type: "image_url", image_url: { url: `data:image/png;base64,${base64Image}` } }
			]
		});

		const response = await this.model.invoke([message]);
		// Try to extract and parse the first JSON array from the LLM output
		let actions;
		let raw;
		try {
			if (typeof response === "string") {
				raw = response;
			} else if (response && typeof response.content === "string") {
				raw = response.content;
			} else {
				throw new Error("Unexpected LLM response format");
			}
			actions = extractFirstJsonArray(raw);
			actions = ActionsArraySchema.parse(actions);
		} catch (err) {
			console.error("Raw LLM output:", raw);
			throw new Error("Failed to parse or validate LLM output: " + err.message);
		}
		return actions;
	}


	async analyzeWithContext(screenshotPath, query, previousActions = []) {
		const imageBuffer = fs.readFileSync(screenshotPath);
		const base64Image = imageBuffer.toString("base64");
		const contextPrompt = previousActions.length > 0 ? `\nPrevious actions: ${JSON.stringify(previousActions, null, 2)}` : '';

const prompt = `
You are a browser-automation assistant for a Node.js backend that uses Selenium WebDriver (Chrome).  
Your task is to output **one valid JSON array (no Markdown)** containing at most **three** action objects that will satisfy the user's query by interacting with the page visible in the supplied screenshot.

========================  GENERAL RULES  ========================
1. Return **only** the JSON array. Use double quotes for every JSON string.
2. Every action object must contain:
   • "action"           - one of: navigateToWebsite | clickElement | fillInput | scrollToElement | waitForElement  
   • "params"           - see per-action requirements below  
   • "reasoning"        - 1-sentence justification (assistants only; humans will not see it)  
   • "phaseCompleted"   - true if the DOM will reload or change substantially after this action  
   • "completed"        - true only if ${query} is achieved completely, refer to the screenshot as well for the confirmation.
3. **Never output more than three actions.** If more steps are needed, end with phaseCompleted:true so the controller can call you again.
4. Do not repeat the same action with identical params consecutively—adjust strategy instead.
5. Favor **id** or **css** selectors, then **xpath**, and use **text** only if the text is short, visible, unique, and stable.

========================  SELECTOR TYPES & EXACT SYNTAX  ========================
• id  
  - params.selector: the raw id value, WITHOUT “#” (e.g., "submitBtn")  
• css  
  - params.selector: any valid CSS selector (e.g., "#submitBtn", ".btn.primary", "div[data-role='item']")  
• xpath  
  - params.selector: full XPath beginning with // or / and using @ for attributes  
    Examples: "//button[@type='submit']" , "//div[@data-test='card'][1]"  
    NEVER mix CSS syntax inside an XPath.  
• text  
  - If you are unsure about the selector or selectorType, rely on the screenshot and the visible text on the element.
  - params.selector: a short, unique, and stable substring of the visible text of a link or button (e.g., "Add to Cart" or a distinctive part of it). Do NOT use the entire long text, as OCR or screenshot text may be imperfect. Instead, use a partial but unique substring that is visible and likely to match only the intended element.
  - Do **not** use placeholder, aria-label, tooltip, or long/dynamic strings.

========================  PER-ACTION PARAMS  ========================
1. navigateToWebsite  
   params = { "website": "https://example.com" }   // full absolute URL

2. clickElement  
   params = { "selector": "<selector>", "selectorType": "id|css|xpath|text" }

3. fillInput  
   params = { 
     "selector": "<selector>", 
     "selectorType": "id|css|xpath|text", 
     "text": "<text to type>" 
   }

4. scrollToElement  
   params = { "selector": "<selector>", "selectorType": "id|css|xpath|text" }

5. waitForElement  
   params = { 
     "selector": "<selector>", 
     "selectorType": "id|css|xpath|text", 
     "timeout": 5000 // optional, defaults to 5000 ms 
   }

========================  BEST PRACTICES  ========================
• Before interacting with an element that might be off-screen or load late, insert a waitForElement or scrollToElement first.  
• Avoid placeholder, aria-label, long class strings, and volatile attribute values.  
• Use known stable ids on popular sites (e.g., Amazon search bar id "twotabsearchtextbox").  
• If you are unsure about the selector or selectorType, rely on the screenshot and the visible text. For selectorType 'text', use a short, unique, and stable substring of the visible text (not the entire text) to identify the element. This helps avoid errors from OCR or long/dynamic text.
• Set phaseCompleted:true on the last action before a full page reload (e.g., clicking a search button).  
• Only set completed:true on the very final action that accomplishes the user's high-level goal.
• Return a maximum of 3 actions, no more than that.
• Do not generate actions beyond a phase, only generate actions up to that phase
========================  SCHEMA TEMPLATE (DO NOT COPY VALUES)  ========================
[
  {
    "action": "navigateToWebsite",
    "params": { "website": "<url>" },
    "reasoning": "Load the target site.",
    "phaseCompleted": true,
    "completed": false
  },
  {
    "action": "fillInput",
    "params": { 
      "selector": "<selector>", 
      "selectorType": "id|css|xpath|text", 
      "text": "<text>" 
    },
    "reasoning": "Enter the user's search term.",
    "phaseCompleted": false,
    "completed": false
  },
  {
    "action": "clickElement",
    "params": { 
      "selector": "<selector>", 
      "selectorType": "id|css|xpath|text" 
    },
    "reasoning": "Submit the search.",
    "phaseCompleted": false,
    "completed": true
  }
]

========================  INPUTS  ========================
Screenshot: <screenshotPath>
User Query: ${query}

======================== IMPORTANT INSTRUCTION ===============
- Do not generate more than 3 actions.
- Only generate the minimum number of actions only for that phase.
- Please analyse the attached screenshot as well so that there is no redundancy, generate the actions cleverly. Check if that action has already taken place, if yes then dont generate that action again, generate further actions.
- For xpath use full XPath beginning with // or / and using @ for attributes.
- **Do NOT use an input field (such as a text box) as a click target for submitting a search or form. Only click actual buttons or elements intended for submission.**
- **For submitting a search or form, prefer clicking a button rather than the input field itself.**
- **Never use the placeholder text of an input as a selector for a button click. Only use it for identifying input fields to type into.**
- If you are unsure about the selector or selectorType, rely on the screenshot and the visible text. For selectorType 'text', use a short, unique, and stable substring of the visible text (not the entire text) to identify the element.
Previous Actions (last 3): ${JSON.stringify(previousActions)}

========================  OUTPUT  ========================
Return only the JSON array of actions that satisfies the query and adheres strictly to all rules above. Do NOT output anything else.
`;


		const message = new HumanMessage({
			content: [
				{ type: "text", text: prompt },
				{ type: "image_url", image_url: { url: `data:image/png;base64,${base64Image}` } }
			]
		});

		const response = await this.model.invoke([message]);
		let actions;
		let raw;
		try {
			if (typeof response === "string") {
				raw = response;
			} else if (response && typeof response.content === "string") {
				raw = response.content;
			} else {
				throw new Error("Unexpected LLM response format");
			}
			actions = extractFirstJsonArray(raw);
			actions = ActionsArraySchema.parse(actions);
		} catch (err) {
			console.error("Raw LLM output:", raw);
			throw new Error("Failed to parse or validate LLM output: " + err.message);
		}
		return actions;
	}


	// Add error recovery method similar to LLMService, using structured output
	async handleActionError({ screenshotPath, query, previousActions = [], lastAction, error }) {
		const imageBuffer = fs.readFileSync(screenshotPath);
		const base64Image = imageBuffer.toString('base64');
		const contextPrompt = previousActions.length > 0
			? `\n\nPrevious actions taken: ${JSON.stringify(previousActions, null, 2)}`
			: '';

		const systemPrompt = `You are a browser automation assistant for a Node.js backend using Selenium WebDriver (with Chrome). The previous action failed with the following error: "${error}".

========================  GENERAL RULES  ========================
1. Return **only** the JSON array. Use double quotes for every JSON string.
2. Every action object must contain:
   • "action"           - one of: navigateToWebsite | clickElement | fillInput | scrollToElement | waitForElement  
   • "params"           - see per-action requirements below  
   • "reasoning"        - 1-sentence justification (assistants only; humans will not see it)  
   • "phaseCompleted"   - true if the DOM will reload or change substantially after this action  
   • "completed"        - true only if ${query} is achieved completely, refer to the screenshot as well for the confirmation.
3. **Never output more than three actions.** If more steps are needed, end with phaseCompleted:true so the controller can call you again.
4. Do not repeat the same action with identical params consecutively—adjust strategy instead.
5. Favor **id** or **css** selectors, then **xpath**, and use **text** only if the text is short, visible, unique, and stable.

========================  SELECTOR TYPES & EXACT SYNTAX  ========================
• id  
  - params.selector: the raw id value, WITHOUT “#” (e.g., "submitBtn")  
• css  
  - params.selector: any valid CSS selector (e.g., "#submitBtn", ".btn.primary", "div[data-role='item']")  
• xpath  
  - params.selector: full XPath beginning with // or / and using @ for attributes  
    Examples: "//button[@type='submit']" , "//div[@data-test='card'][1]"  
    NEVER mix CSS syntax inside an XPath.  
• text  
  - If you are unsure about the selector or selectorType, rely on the screenshot and the visible text on the element.
  - params.selector: a short, unique, and stable substring of the visible text of a link or button (e.g., "Add to Cart" or a distinctive part of it). Do NOT use the entire long text, as OCR or screenshot text may be imperfect. Instead, use a partial but unique substring that is visible and likely to match only the intended element.
  - Do **not** use placeholder, aria-label, tooltip, or long/dynamic strings.

========================  PER-ACTION PARAMS  ========================
1. navigateToWebsite  
   params = { "website": "https://example.com" }   // full absolute URL

2. clickElement  
   params = { "selector": "<selector>", "selectorType": "id|css|xpath|text" }

3. fillInput  
   params = { 
     "selector": "<selector>", 
     "selectorType": "id|css|xpath|text", 
     "text": "<text to type>" 
   }

4. scrollToElement  
   params = { "selector": "<selector>", "selectorType": "id|css|xpath|text" }

5. waitForElement  
   params = { 
     "selector": "<selector>", 
     "selectorType": "id|css|xpath|text", 
     "timeout": 5000 // optional, defaults to 5000 ms 
   }

========================  BEST PRACTICES  ========================
• Before interacting with an element that might be off-screen or load late, insert a waitForElement or scrollToElement first.  
• Avoid placeholder, aria-label, long class strings, and volatile attribute values.  
• Use known stable ids on popular sites (e.g., Amazon search bar id "twotabsearchtextbox").  
• If you are unsure about the selector or selectorType, rely on the screenshot and the visible text. For selectorType 'text', use a short, unique, and stable substring of the visible text (not the entire text) to identify the element. This helps avoid errors from OCR or long/dynamic text.
• Set phaseCompleted:true on the last action before a full page reload (e.g., clicking a search button).  
• Only set completed:true on the very final action that accomplishes the user's high-level goal.
• Return a maximum of 3 actions, no more than that.
• Do not generate actions beyond a phase, only generate actions up to that phase
========================  SCHEMA TEMPLATE (DO NOT COPY VALUES)  ========================
[
  {
    "action": "navigateToWebsite",
    "params": { "website": "<url>" },
    "reasoning": "Load the target site.",
    "phaseCompleted": true,
    "completed": false
  },
  {
    "action": "fillInput",
    "params": { 
      "selector": "<selector>", 
      "selectorType": "id|css|xpath|text", 
      "text": "<text>" 
    },
    "reasoning": "Enter the user's search term.",
    "phaseCompleted": false,
    "completed": false
  },
  {
    "action": "clickElement",
    "params": { 
      "selector": "<selector>", 
      "selectorType": "id|css|xpath|text" 
    },
    "reasoning": "Submit the search.",
    "phaseCompleted": false,
    "completed": true
  }
]

========================  INPUTS  ========================
Screenshot: <screenshotPath>
User Query: ${query}

======================== IMPORTANT INSTRUCTION ===============
- Since the previous action failed with the error ${error}, prefer relying on the screenshot and the visible text. For selectorType 'text', use a short, unique, and stable substring of the visible text (not the entire text) to identify the element.
Previous Actions (last 3): ${JSON.stringify(previousActions)}
- Do not generate more than 3 actions.
- Only generate the minimum number of actions only for that phase.
- Please analyse the attached screenshot as well so that there is no redundancy, generate the actions cleverly. Check if that action has already taken place, if yes then dont generate that action again, generate further actions.
- For xpath use full XPath beginning with // or / and using @ for attributes.
- **Do NOT use an input field (such as a text box) as a click target for submitting a search or form. Only click actual buttons or elements intended for submission.**
- **For submitting a search or form, prefer clicking a button rather than the input field itself.**
- **Never use the placeholder text of an input as a selector for a button click. Only use it for identifying input fields to type into.**

========================  OUTPUT  ========================
Return only the JSON array of actions that satisfies the query and adheres strictly to all rules above. Do NOT output anything else.
`;
		const message = new HumanMessage({
			content: [
				{ type: "text", text: systemPrompt },
				{ type: "image_url", image_url: { url: `data:image/png;base64,${base64Image}` } }
			]
		});
		const response = await this.model.invoke([message]);
		let actions;
		let raw;
		try {
			if (typeof response === "string") {
				raw = response;
			} else if (response && typeof response.content === "string") {
				raw = response.content;
			} else {
				throw new Error("Unexpected LLM response format");
			}
			actions = extractFirstJsonArray(raw);
			actions = ActionsArraySchema.parse(actions);
		} catch (err) {
			console.error("Raw LLM output:", raw);
			throw new Error("Failed to parse or validate LLM output: " + err.message);
		}
		return actions;
	}
}

module.exports = OllamaLLMService;
