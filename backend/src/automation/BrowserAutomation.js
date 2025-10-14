const { Builder, By, until } = require("selenium-webdriver");
const fs = require("fs-extra");
const path = require("path");
class BrowserAutomation {
  constructor() {
    this.driver = null;
  }
  async setup() {
    const start = Date.now();
    console.log("Starting browser setup");
    this.driver = await new Builder().forBrowser("chrome").build();
    await this.driver.manage().window().maximize();
    const end = Date.now();
    const duration = (end - start) / 1000;
    console.log(`setup function took ${duration.toFixed(4)} seconds`);
    console.log("Browser setup complete");
  }

  async navigateToWebsite(website) {
    const start = Date.now();
    console.log("Navigating to website:", website);
    await this.driver.get(website);
    const end = Date.now();
    const duration = (end - start) / 1000;
    console.log(`navigateToWebsite function took ${duration.toFixed(4)} seconds`);
  }

  async takeScreenshot() {
    try {
      console.log("Taking screenshot");
      await fs.ensureDir("screenshots");
      const screenshot = await this.driver.takeScreenshot();
      const filePath = path.join("screenshots", `${new Date().toISOString().replace(/:/g, "-")}.png`);
      await fs.writeFile(filePath, screenshot, "base64");
      console.log("File saved successfully as ", filePath);
      return filePath;
    } catch (error) {
      console.log("Unable to save screenshot", error);
    }
  }
 async clickElement(selector, selectorType) {
    console.log(`Clicking button with ${selectorType}: ${selector}`);
        
      // Clean up selector if it has CSS-style prefix but selectorType is id  
      if (selectorType === 'id' && selector.startsWith('#')) {
        selector = selector.substring(1);
      }     
    
    let element;
    switch (selectorType) {
      case "id":
        element = await this.driver.wait(until.elementLocated(By.id(selector)), 5000);
        break;
      case "xpath":
        element = await this.driver.wait(until.elementLocated(By.xpath(selector)), 5000);
        break;
      case "css":
        element = await this.driver.wait(until.elementLocated(By.css(selector)), 5000);
        break;
      case "text":
        console.log(`Searching for text: '${selector}'`);
        
        // Try multiple XPath strategies for text matching
        const xpathStrategies = [
          // Exact text match
          `//*[normalize-space(text())='${selector}']`,
          // Contains text match
          `//*[contains(normalize-space(text()), "${selector}")]`,
          // Button/clickable elements with text
          `//button[contains(normalize-space(text()), "${selector}")]`,
          `//a[contains(normalize-space(text()), "${selector}")]`,
          `//input[@value='${selector}']`,
          `//input[contains(@value, '${selector}')]`,
          // Elements with aria-label
          `//*[@aria-label='${selector}']`,
          `//*[contains(@aria-label, '${selector}')]`,
          // Case insensitive search
          `//*[contains(translate(normalize-space(text()), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${selector.toLowerCase()}')]`
        ];
        
        element = null;
        const foundElements = [];
        
        for (let i = 0; i < xpathStrategies.length; i++) {
          const xpath = xpathStrategies[i];
          try {
            console.log(`Trying XPath strategy ${i+1}: ${xpath}`);
            const elements = await this.driver.findElements(By.xpath(xpath));
            console.log(`Found ${elements.length} elements with strategy ${i+1}`);
            
            for (const elem of elements) {
              try {
                const isDisplayed = await elem.isDisplayed();
                const isEnabled = await elem.isEnabled();
                const tagName = await elem.getTagName();
                const elemText = (await elem.getText()).trim();
                const elemValue = (await elem.getAttribute('value')) || '';
                const elemAriaLabel = (await elem.getAttribute('aria-label')) || '';
                
                console.log(`  Element: tag=${tagName}, text='${elemText}', value='${elemValue}', aria-label='${elemAriaLabel}', displayed=${isDisplayed}, enabled=${isEnabled}`);
                
                if (isDisplayed && isEnabled) {
                  foundElements.push({
                    element: elem,
                    strategy: i + 1,
                    text: elemText,
                    tag: tagName
                  });
                }
              } catch (e) {
                console.log(`  Error checking element: ${e.message}`);
                continue;
              }
            }
            
            if (foundElements.length > 0) {
              break;
            }
          } catch (e) {
            console.log(`Strategy ${i+1} failed: ${e.message}`);
            continue;
          }
        }
        
        if (foundElements.length > 0) {
          // Prioritize buttons and links, then by strategy order
          foundElements.sort((a, b) => {
            const aScore = (a.tag === 'button' || a.tag === 'a') ? 0 : 1;
            const bScore = (b.tag === 'button' || b.tag === 'a') ? 0 : 1;
            if (aScore !== bScore) return aScore - bScore;
            return a.strategy - b.strategy;
          });
          element = foundElements[0].element;
          console.log(`Selected element:`, foundElements[0]);
        } else {
          console.log(`No clickable elements found with text: '${selector}'`);
          // Try one more time with a very broad search
          try {
            const allElements = await this.driver.findElements(By.xpath("//*"));
            console.log(`Searching through ${allElements.length} elements for text containing '${selector}'`);
            for (const elem of allElements) {
              try {
                const isDisplayed = await elem.isDisplayed();
                const text = await elem.getText();
                if (isDisplayed && text.toLowerCase().includes(selector.toLowerCase())) {
                  const tag = await elem.getTagName();
                  console.log(`Found potential match: ${tag} with text '${text.substring(0, 50)}...'`);
                }
              } catch (e) {
                continue;
              }
            }
          } catch (e) {
            console.log(`Broad search failed: ${e.message}`);
          }
        }
        break;
      default:
        throw new Error(`Unsupported selector type: ${selectorType}`);
    }
    
    if (!element) {
      console.log(`Element not found with ${selectorType}: ${selector}`);
      throw new Error("Element not found");
    }
    
    // Make click more robust: scroll into view, ensure it's on top at center point,
    // try a real sequence of mouse events, and fall back to JS click.
    try {
      console.log(`Attempting to click element: ${await element.getTagName()} with text: '${(await element.getText()).substring(0, 50)}...'`);
      await this.driver.executeScript("arguments[0].scrollIntoView({block: 'center', inline: 'center'})", element);
      console.log("Scrolled element into view");
      
      await this.driver.wait(until.elementIsVisible(element), 5000);
      console.log("Element is visible");
      
      await this.driver.wait(until.elementIsEnabled(element), 5000);
      console.log("Element is clickable");

      // Check which element is actually at the center point of our target
      const topInfo = await this.driver.executeScript(
        `const el = arguments[0];
         const rect = el.getBoundingClientRect();
         const cx = rect.left + rect.width/2;
         const cy = rect.top + rect.height/2;
         const top = document.elementFromPoint(cx, cy);
         return {
           rect: {x: rect.x, y: rect.y, w: rect.width, h: rect.height},
           topTag: top ? top.tagName : null,
           topId: top ? top.id : null,
           topClass: top ? top.className : null,
           topText: top ? top.textContent.substring(0,50) : null,
           topOuter: top ? top.outerHTML && top.outerHTML.substring(0,300) : null
         };`,
        element
      );
      console.log("Target element info: rect=", topInfo.rect);
      console.log(`Element at center: tag=${topInfo.topTag}, id=${topInfo.topId}, text='${topInfo.topText}'`);

      // If another element sits on top of the target, try clicking that instead (it may be the real control)
      const elementTag = await element.getTagName();
      const shouldClickTop = topInfo && topInfo.topTag && topInfo.topTag.toLowerCase() !== elementTag.toLowerCase();

      if (shouldClickTop) {
        console.log("Different element detected at center; attempting to click the top element instead.");
        // Click the element at point via document.elementFromPoint and dispatch mouse events
        const clickResult = await this.driver.executeScript(
          `(function(el){
             const rect = el.getBoundingClientRect();
             const cx = rect.left + rect.width/2;
             const cy = rect.top + rect.height/2;
             const top = document.elementFromPoint(cx, cy);
             function dispatchMouse(target, type){
               const ev = new MouseEvent(type, {bubbles:true, cancelable:true, view:window, button:0});
               target.dispatchEvent(ev);
             }
             if(top){ 
               top.focus(); 
               dispatchMouse(top,'mouseover'); 
               dispatchMouse(top,'mousedown'); 
               dispatchMouse(top,'mouseup'); 
               dispatchMouse(top,'click'); 
               return 'Clicked top element: ' + top.tagName + ' with text: ' + (top.textContent || '').substring(0,30);
             }
             return 'No top element found';
           })(arguments[0]);`,
          element
        );
        console.log(`Click result: ${clickResult}`);
      } else {
        // Dispatch realistic mouse events on the intended element
        console.log("Clicking intended element with mouse events");
        const clickResult = await this.driver.executeScript(
          `(function(el){
             el.focus();
             function dispatchMouse(target, type){
               const ev = new MouseEvent(type, {bubbles:true, cancelable:true, view:window, button:0});
               target.dispatchEvent(ev);
             }
             dispatchMouse(el,'mouseover');
             dispatchMouse(el,'mousedown');
             dispatchMouse(el,'mouseup');
             dispatchMouse(el,'click');
             return 'Clicked element: ' + el.tagName + ' with text: ' + (el.textContent || '').substring(0,30);
           })(arguments[0]);`,
          element
        );
        console.log(`Click result: ${clickResult}`);
      }
      
      console.log("Click action completed successfully");
    } catch (err) {
      console.log(`Robust click sequence failed (${err.name || err.message}). Attempting JS click fallback.`);
      try {
        await this.driver.executeScript('arguments[0].click();', element);
        console.log("JS click fallback succeeded");
      } catch (jsErr) {
        console.log(`JS click fallback also failed: ${jsErr.message}`);
        throw jsErr;
      }
    }
  }
  async fillInput(selector, text, selectorType) {
    console.log("Request for filling input");
    let element;
    switch (selectorType) {
      case "id":
        element = await this.driver.wait(until.elementLocated(By.id(selector)), 5000);
        break;
      case "css":
        element = await this.driver.wait(until.elementLocated(By.css(selector)), 5000);
        break;
      case "xpath":
        element = await this.driver.wait(until.elementLocated(By.xpath(selector)), 5000);
        break;
      case "text":
        const xpathSelectorFill = `//*[contains(normalize-space(text()), "${selector}") or contains(normalize-space(@placeholder), "${selector}") or contains(normalize-space(@name), "${selector}")]`;
        element = await this.driver.wait(
          until.elementLocated(By.xpath(xpathSelectorFill)),
          5000
        );
        break;
      default:
        throw new Error(`Unsupported selector type: ${selectorType}`);
    }
    await element.sendKeys(text);
  }
  async scrollToElement(selector, selectorType){
    try {
      console.log("Request for scrolling to element");
    let element;
    switch (selectorType) {
      case "id":
        element = await this.driver.wait(until.elementLocated(By.id(selector)), 5000);
        break;
      case "css":
        element = await this.driver.wait(until.elementLocated(By.css(selector)), 5000);
        break;
      case "xpath":
        element = await this.driver.wait(until.elementLocated(By.xpath(selector)), 5000);
        break;
      case "text":
        const elements = await this.driver.wait(
          until.elementsLocated(By.xpath(`//*[contains(normalize-space(text()), "${selector}")]`)),
          5000
        );
          element = elements[elements.length - 1]
        break;
      default:
        throw new Error(`Unsupported selector type: ${selectorType}`);
    }
    await this.driver.executeScript("arguments[0].scrollIntoView({block:'center',inline:'center'})", element);
    console.log("Scrolled to the element");
    } catch (error) {
      console.log("erorr",error)
    }    
  }

    async waitForElement(selector, selectorType = 'id', timeout = 5000){
        console.log(`Waiting for element with ${selectorType}: ${selector}`);
        try {
           // Clean up selector if it has CSS-style prefix but selectorType is id
        if (selectorType === 'id' && selector.startsWith('#')) {
            selector = selector.substring(1);
        }
        let element;
        switch(selectorType) {
            case 'id':
                element= await this.driver.wait(until.elementLocated(By.id(selector)), timeout);
                break;
            case 'xpath':
                element= await this.driver.wait(until.elementLocated(By.xpath(selector)), timeout);
                break;
            case 'css':
                element= await this.driver.wait(until.elementLocated(By.css(selector)), timeout);
                break;
            case 'text':
                const xpathSelectorWait = `//*[contains(normalize-space(text()), "${selector}") or contains(normalize-space(@value), "${selector}") or contains(normalize-space(@alt), "${selector}") or contains(normalize-space(@title), "${selector}")]`;
                const elements= await this.driver.wait(until.elementsLocated(By.xpath(xpathSelectorWait)), timeout);
                element = elements[elements.length -1]
                break;
            default:
                throw new Error(`Unsupported selector type: ${selectorType}`);
        }
        if(element){
              await this.driver.executeScript("arguments[0].scrollIntoView({block:'center', inline:'center'})",element)
          }
        } catch (error) {
          console.log("Error in waitForElement", error)
          throw new Error(error);
        }
       
    }    
    
    async getPageSource(){
        return this.driver.getPageSource();
    }


  // Return a compact HTML snippet containing only visible, interactive elements
  // This is intended to be small and useful for the LLM (ids, classes, names, placeholders, text)
  async getCleanHTML(maxChars = 50000, maxElements = 500) {
    const snippet = await this.driver.executeScript(function (maxChars, maxElements) {
      function cleanElement(element, depth = 0, maxDepth = 10) {
        if (depth > maxDepth || !element) return '';
        
        const tagName = element.tagName.toLowerCase();
        
        // Skip these unnecessary elements
        const skipTags = ['script', 'style', 'noscript', 'meta', 'link', 'head'];
        if (skipTags.includes(tagName)) return '';
        
        // Skip hidden elements
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return '';
        }
        
        // Keep all attributes
        const attributes = [];
        
        for (let i = 0; i < element.attributes.length; i++) {
          const attr = element.attributes[i];
          let value = attr.value;
          
          if (value) {
            // Only truncate extremely long attribute values to prevent bloat
            if (value.length > 500) {
              value = value.substring(0, 500) + '...';
            }
            attributes.push(`${attr.name}="${value}"`);
          }
        }
        
        const attrString = attributes.length > 0 ? ' ' + attributes.join(' ') : '';
        
        // Handle self-closing tags
        const selfClosingTags = ['img', 'input', 'br', 'hr', 'meta', 'link'];
        if (selfClosingTags.includes(tagName)) {
          return `<${tagName}${attrString}>`;
        }
        
        // Get text content for leaf elements or elements with minimal children
        let content = '';
        const childElements = Array.from(element.children);
        
        if (childElements.length === 0) {
          // Leaf element - get text content
          let text = element.textContent || '';
          text = text.trim().replace(/\s+/g, ' ');
          if (text.length > 200) {
            text = text.substring(0, 200) + '...';
          }
          content = text;
        } else {
          // Process child elements
          const childrenHtml = [];
          for (const child of childElements) {
            const childHtml = cleanElement(child, depth + 1, maxDepth);
            if (childHtml) {
              childrenHtml.push(childHtml);
            }
          }
          
          // If we have text nodes mixed with elements, include them
          const textNodes = [];
          for (const node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent.trim();
              if (text) {
                textNodes.push(text);
              }
            }
          }
          
          if (textNodes.length > 0 && childrenHtml.length === 0) {
            // Only text nodes, treat as text content
            content = textNodes.join(' ').replace(/\s+/g, ' ');
            if (content.length > 200) {
              content = content.substring(0, 200) + '...';
            }
          } else {
            // Mix of elements and text, include everything
            if (textNodes.length > 0) {
              const combinedText = textNodes.join(' ').trim();
              if (combinedText) {
                childrenHtml.unshift(combinedText);
              }
            }
            content = childrenHtml.join('\n');
          }
        }
        
        if (!content && childElements.length === 0) {
          return `<${tagName}${attrString}></${tagName}>`;
        }
        
        return `<${tagName}${attrString}>${content}</${tagName}>`;
      }
      
      // Start from body element to get the actual rendered content
      const body = document.body;
      if (!body) return '<html><body>No body element found</body></html>';
      
      // Add basic document info
      const title = document.title || '';
      const url = window.location.href || '';
      
      let result = `<!-- Page: ${title} -->\n<!-- URL: ${url} -->\n\n`;
      
      // Clean the body content
      const cleanedBody = cleanElement(body, 0, 15);
      result += cleanedBody;
      
      // Truncate if too long
      if (result.length > arguments[0]) {
        result = result.substring(0, arguments[0]) + '\n<!-- Content truncated -->';
      }
      
      return result;
    }, maxChars, maxElements);

      // Auto-save the cleaned HTML to disk for logging/inspection.
      try {
        const defaultDir = path.join('logs', 'html-snippets');
        const finalPath = path.join(defaultDir, `${new Date().toISOString().replace(/:/g, '-')}.html`);
        await fs.ensureDir(path.dirname(finalPath));
        await fs.writeFile(finalPath, snippet, 'utf8');
        console.log('Saved HTML snippet to', finalPath);
      } catch (err) {
        // Do not fail the caller if logging fails — just warn.
        console.log('Failed to auto-save HTML snippet', err && err.message ? err.message : err);
      }

      return snippet;
  }

  // Save the cleaned HTML to a file. If filePath is omitted a timestamped file will be created under logs/html-snippets.
  async saveCleanHTMLToFile(filePath = null, maxChars = 50000, maxElements = 500) {
    const html = await this.getCleanHTML(maxChars, maxElements);
    try {
      const defaultDir = path.join('logs', 'html-snippets');
      const finalPath = filePath
        ? filePath
        : path.join(defaultDir, `${new Date().toISOString().replace(/:/g, '-')}.html`);

      await fs.ensureDir(path.dirname(finalPath));
      await fs.writeFile(finalPath, html, 'utf8');
      console.log('Saved HTML snippet to', finalPath);
      return finalPath;
    } catch (err) {
      console.log('Failed to save HTML snippet', err);
      throw err;
    }
  }

    async dismissOverlays() {
        console.log("Checking for common overlays or popups to dismiss...");
        
        try {
            // Common overlay/popup selectors to try dismissing
            const overlaySelectors = [
                // Common close buttons
                'button[aria-label*="close"]', 'button[title*="close"]', 
                '[class*="close"]', '.modal-close', '.overlay-close',
                // Cookie banners
                'button[id*="cookie"]', 'button[class*="cookie"]'
            ];
            
            for (const selector of overlaySelectors) {
                try {
                    const elements = await this.driver.findElements(By.css(selector));
                    for (const element of elements) {
                        const isDisplayed = await element.isDisplayed();
                        if (isDisplayed) {
                            console.log(`Dismissing overlay with selector: ${selector}`);
                            await element.click();
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
        } catch (error) {
            console.log("No overlays found or error dismissing:", error.message);
        }
    }

    async close(){
        if(this.driver) {
            await this.driver.quit();
            this.driver = null;
        }
    }

}
module.exports = BrowserAutomation;
