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

    async getCleanHTML() {
        // Get clean HTML without scripts, styles, and unnecessary attributes
        const cleanHTML = await this.driver.executeScript(`
            function cleanElement(element) {
                if (!element) return '';
                
                // Skip script, style, noscript tags
                if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK'].includes(element.tagName)) {
                    return '';
                }
                
                let result = '<' + element.tagName.toLowerCase();
                
                // Only include useful attributes
                const keepAttributes = ['id', 'class', 'type', 'value', 'placeholder', 'alt', 'title', 'href', 'src'];
                for (let attr of keepAttributes) {
                    if (element.hasAttribute(attr)) {
                        let value = element.getAttribute(attr);
                        // Truncate long values
                        if (value && value.length > 50) {
                            value = value.substring(0, 50) + '...';
                        }
                        result += ' ' + attr + '="' + (value || '') + '"';
                    }
                }
                result += '>';
                
                // Get text content (truncated)
                let textContent = '';
                for (let child of element.childNodes) {
                    if (child.nodeType === 3) { // Text node
                        textContent += child.textContent.trim();
                    }
                }
                if (textContent && textContent.length > 100) {
                    textContent = textContent.substring(0, 100) + '...';
                }
                
                // Process children
                let childrenHTML = '';
                for (let child of element.children) {
                    childrenHTML += cleanElement(child);
                }
                
                if (textContent && !childrenHTML) {
                    result += textContent;
                } else if (childrenHTML) {
                    result += childrenHTML;
                }
                
                result += '</' + element.tagName.toLowerCase() + '>';
                return result;
            }
            
            return cleanElement(document.body);
        `);
        
        return cleanHTML;
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
