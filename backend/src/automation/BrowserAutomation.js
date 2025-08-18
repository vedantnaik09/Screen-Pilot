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
        // Find element by partial visible text (for buttons/links)
        const elements = await this.driver.wait(
          until.elementsLocated(By.xpath(`//*[contains(normalize-space(text()), "${selector}")]`)),
          5000
        );
        element = elements[elements.length - 1]
        break;
      default:
        throw new Error(`Unsupported selector type: ${selectorType}`);
    }
    // Make click more robust: scroll into view, ensure it's on top at center point,
    // try a real sequence of mouse events, and fall back to JS click.
    try {
      await this.driver.executeScript("arguments[0].scrollIntoView({block: 'center', inline: 'center'})", element);
      await this.driver.wait(until.elementIsVisible(element), 5000);
      await this.driver.wait(until.elementIsEnabled(element), 5000);

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
           topOuter: top ? top.outerHTML && top.outerHTML.substring(0,300) : null
         };`,
        element
      );
      console.log("Target rect/overlay info:", topInfo);

      // If another element sits on top of the target, try clicking that instead (it may be the real control)
      const shouldClickTop = topInfo && topInfo.topId && topInfo.topId !== element.getAttribute('id');

      if (shouldClickTop) {
        console.log("Different element detected at center; attempting to click the top element instead.");
        // Click the element at point via document.elementFromPoint and dispatch mouse events
        await this.driver.executeScript(
          `(function(el){
             const rect = el.getBoundingClientRect();
             const cx = rect.left + rect.width/2;
             const cy = rect.top + rect.height/2;
             const top = document.elementFromPoint(cx, cy);
             function dispatchMouse(target, type){
               const ev = new MouseEvent(type, {bubbles:true, cancelable:true, view:window, button:0});
               target.dispatchEvent(ev);
             }
             if(top){ top.focus(); dispatchMouse(top,'mouseover'); dispatchMouse(top,'mousedown'); dispatchMouse(top,'mouseup'); dispatchMouse(top,'click'); }
           })(arguments[0]);`,
          element
        );
      } else {
        // Dispatch realistic mouse events on the intended element
        await this.driver.executeScript(
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
           })(arguments[0]);`,
          element
        );
      }
    } catch (err) {
      console.log(`Robust click sequence failed (${err && (err.name || err.message)}). Attempting JS click fallback.`);
      try {
        await this.driver.executeScript('arguments[0].click();', element);
      } catch (jsErr) {
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
  async getCleanHTML(maxChars = 5000, maxElements = 150) {
    const snippet = await this.driver.executeScript(function (maxChars, maxElements) {
      function isVisible(el) {
        try {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          // Some interactive elements (inputs inside flex containers, shadow DOM, or transformed nodes)
          // may not have an offsetParent but are still visible. Use bounding rects or client rects
          // as additional indicators of visibility.
          const hasDimensions = rect.width > 0 && rect.height > 0;
          const hasClientRects = el.getClientRects && el.getClientRects().length > 0;
          const visibleStyle = style && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
          const attached = el.offsetParent !== null;
          return visibleStyle && (hasDimensions || hasClientRects || attached);
        } catch (e) { return false; }
      }
      function truncate(s, n) { if (!s) return ''; return s.length > n ? s.slice(0, n) + '...' : s; }

  const keepAttrs = ['id','class','name','type','placeholder','value','href','src','alt','title','role','aria-label','data-testid','enterkeyhint','maxlength'];
  const selectors = 'input,button,a,select,textarea,form,img,[role],[onclick],[data-testid]';
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

        // Determine tag early because we use it to decide inclusion even when not visible
        const tag = (n.tagName || '').toLowerCase();

        // Include element if visible OR if it's an input (or contains an input) with identifying attrs
        let include = false;
        try {
          if (isVisible(n)) {
            include = true;
          } else {
            // Inputs with placeholder/name or type text/search should be included even if CSS makes them hard to measure
            if (tag === 'input') {
              const p = (n.getAttribute && (n.getAttribute('placeholder') || n.getAttribute('name') || n.getAttribute('aria-label'))) || '';
              const t = (n.getAttribute && (n.getAttribute('type') || '')).toLowerCase();
              if (p || t === 'text' || t === 'search') include = true;
            }
            // Include forms/spans/divs that contain such inputs
            if (!include && (tag === 'form' || tag === 'span' || tag === 'div')) {
              const inner = n.querySelector && n.querySelector('input[placeholder], input[name], input[type="text"], input[type="search"]');
              if (inner) include = true;
            }
          }
        } catch (e) {
          // on error, skip
          continue;
        }

        if (!include) continue;

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
