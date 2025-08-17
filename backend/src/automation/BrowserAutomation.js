const { Builder, By, until } = require("selenium-webdriver");
const fs = require("fs-extra");
const path = require("path");
class BrowserAutomation {
  constructor() {
    this.driver = null;
  }
  async setup() {
    console.log("Starting browser setup");
    this.driver = await new Builder().forBrowser("chrome").build();
    await this.driver.manage().window().maximize();
    console.log("Browser setup complete");
  }

  async navigateToWebsite(website) {
    console.log("Navigating to website:", website);
    await this.driver.get(website);
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
    let element;
    
    try {
      // Clean up selector if it has CSS-style prefix but selectorType is id  
      if (selectorType === 'id' && selector.startsWith('#')) {
        selector = selector.substring(1);
      }
      
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
          // Find element by partial visible text (for buttons/links)
          // Use contains() with normalize-space() for better text matching
          const xpathSelector = `//*[contains(normalize-space(text()), "${selector}") or contains(normalize-space(@value), "${selector}") or contains(normalize-space(@alt), "${selector}") or contains(normalize-space(@title), "${selector}")]`;
          element = await this.driver.wait(
            until.elementLocated(By.xpath(xpathSelector)),
            5000
          );
          break;
        default:
          throw new Error(`Unsupported selector type: ${selectorType}`);
      }

      // Wait for element to be clickable
      await this.driver.wait(until.elementIsEnabled(element), 3000);
      
      // Scroll to element to ensure it's visible
      await this.driver.executeScript("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", element);
      
      // Wait a moment for any animations to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try regular click first
      await element.click();
      
    } catch (error) {
      // If regular click fails, try JavaScript click as fallback
      if (element && error.message.includes('not interactable')) {
        console.log(`Regular click failed, trying JavaScript click...`);
        await this.driver.executeScript("arguments[0].click();", element);
      } else {
        throw error;
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
    console.log("Request for scrolling to element");
    let element;
    
    // Clean up selector if it has CSS-style prefix but selectorType is id
    if (selectorType === 'id' && selector.startsWith('#')) {
      selector = selector.substring(1);
    }
    
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
        element = await this.driver.wait(
          until.elementLocated(By.xpath(`//*[contains(normalize-space(text()), "${selector}")]`)),
          5000
        );
        break;
      default:
        throw new Error(`Unsupported selector type: ${selectorType}`);
    }
    await this.driver.executeScript("arguments[0].scrollIntoView(true)", element);
    console.log("Scrolled to the element");
  }

    async waitForElement(selector, selectorType = 'id', timeout = 5000){
        console.log(`Waiting for element with ${selectorType}: ${selector}`);
        
        // Clean up selector if it has CSS-style prefix but selectorType is id
        if (selectorType === 'id' && selector.startsWith('#')) {
            selector = selector.substring(1);
        }
        
        switch(selectorType) {
            case 'id':
                return await this.driver.wait(until.elementLocated(By.id(selector)), timeout);
            case 'xpath':
                return await this.driver.wait(until.elementLocated(By.xpath(selector)), timeout);
            case 'css':
                return await this.driver.wait(until.elementLocated(By.css(selector)), timeout);
            case 'text':
                const xpathSelectorWait = `//*[contains(normalize-space(text()), "${selector}") or contains(normalize-space(@value), "${selector}") or contains(normalize-space(@alt), "${selector}") or contains(normalize-space(@title), "${selector}")]`;
                return await this.driver.wait(until.elementLocated(By.xpath(xpathSelectorWait)), timeout);
            default:
                throw new Error(`Unsupported selector type: ${selectorType}`);
        }
    }    async getPageSource(){
        return this.driver.getPageSource();
    }


  // Return a compact HTML snippet containing only visible, interactive elements
  // This is intended to be small and useful for the LLM (ids, classes, names, placeholders, text)
  async getCleanHTML(maxChars = 5000, maxElements = 150) {
    const snippet = await this.driver.executeScript(function (maxChars, maxElements) {
      function isVisible(el) {
        try {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style && style.visibility !== 'hidden' && style.display !== 'none' && el.offsetParent !== null;
        } catch (e) { return false; }
      }
      function truncate(s, n) { if (!s) return ''; return s.length > n ? s.slice(0, n) + '...' : s; }

      const keepAttrs = ['id','class','name','type','placeholder','value','href','src','alt','title','role','aria-label','data-testid'];
      const selectors = 'input,button,a,select,textarea,form,img,[role], [onclick],[data-testid]';
      const nodes = Array.from(document.querySelectorAll(selectors));
      const outputParts = [];

      // page metadata
      const title = document.title || '';
      const metaDesc = (document.querySelector('meta[name="description"]')||{}).content || '';
      outputParts.push(`<meta title="${truncate(title,200)}">`);
      if (metaDesc) outputParts.push(`<meta description="${truncate(metaDesc,300)}">`);

      let count = 0;
      for (const n of nodes) {
        if (count >= maxElements) break;
        if (!isVisible(n)) continue;

        const tag = n.tagName.toLowerCase();
        const attrPairs = [];
        for (const a of keepAttrs) {
          try {
            if (a === 'class') {
              const cls = n.className && typeof n.className === 'string' ? n.className.split(/\s+/).slice(0,3).join(' ') : '';
              if (cls) attrPairs.push(`class="${truncate(cls,80)}"`);
            } else if (a === 'value') {
              const v = n.value || '';
              if (v) attrPairs.push(`value="${truncate(String(v),120)}"`);
            } else if (n.hasAttribute && n.hasAttribute(a)) {
              attrPairs.push(`${a}="${truncate(n.getAttribute(a),120)}"`);
            } else if ((a === 'href' || a === 'src') && (n[a] || n.getAttribute && n.getAttribute(a))) {
              const v = n[a] || (n.getAttribute && n.getAttribute(a));
              if (v) attrPairs.push(`${a}="${truncate(v,160)}"`);
            }
          } catch (e) {}
        }

        let text = '';
        try {
          text = (n.innerText || n.textContent || '').trim().replace(/\s+/g, ' ');
          if (!text && (n.placeholder || n.getAttribute && n.getAttribute('placeholder'))) {
            text = n.placeholder || '';
          }
        } catch (e) { text = ''; }

        const snippetHtml = `<${tag} ${attrPairs.join(' ')}>${truncate(text, 200)}</${tag}>`;
        outputParts.push(snippetHtml);
        count++;

        const joined = outputParts.join('\n');
        if (joined.length > maxChars) break;
      }

      return outputParts.join('\n').slice(0, maxChars);
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
  async saveCleanHTMLToFile(filePath = null, maxChars = 5000, maxElements = 150) {
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
        }
    }

}
module.exports = BrowserAutomation;
