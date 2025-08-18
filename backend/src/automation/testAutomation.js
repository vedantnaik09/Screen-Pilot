import { Builder, By, until } from "selenium-webdriver";
import fs from "fs-extra";
import path from "path";
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

  // New helper: accept an existing WebElement and perform robust JS click (preferred over WebElement.click())
  async clickRawElement(element) {
    // scroll into view and ensure visible/enabled
    try {
      await this.driver.executeScript("arguments[0].scrollIntoView({block:'center', inline:'center'})", element);
      await this.driver.wait(until.elementIsVisible(element), 5000);
      await this.driver.wait(until.elementIsEnabled(element), 5000);
    } catch (e) {
      console.log("error ",e)
    }

    // Inspect elementFromPoint to find the actual top element at the center
    const topInfo = await this.driver.executeScript(
      `const el = arguments[0];
       const rect = el.getBoundingClientRect();
       const cx = rect.left + rect.width/2;
       const cy = rect.top + rect.height/2;
       const top = document.elementFromPoint(cx, cy);
       return { topId: top ? top.id : null, topName: top ? top.name : null, topOuter: top ? top.outerHTML && top.outerHTML.substring(0,300) : null };`,
      element
    );

    // If a different element sits on top, click that instead
    if (topInfo && (topInfo.topId || topInfo.topName)) {
      try {
        await this.driver.executeScript(
          `(function(el){
             const rect = el.getBoundingClientRect();
             const cx = rect.left + rect.width/2;
             const cy = rect.top + rect.height/2;
             const top = document.elementFromPoint(cx, cy);
             if(top){ top.focus(); top.click(); }
           })(arguments[0]);`,
          element
        );
        return;
      } catch (e) {
        // fall back to clicking the original element
      }
    }

    // Otherwise click the intended element with JS
    await this.driver.executeScript('arguments[0].focus(); arguments[0].click();', element);
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
        element = await this.driver.wait(
          until.elementLocated(By.xpath(`//*[contains(normalize-space(text()), "${selector}")]`)),
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
        switch(selectorType) {
            case 'id':
                return await this.driver.wait(until.elementLocated(By.id(selector)), timeout);
            case 'xpath':
                return await this.driver.wait(until.elementLocated(By.xpath(selector)), timeout);
            case 'css':
                return await this.driver.wait(until.elementLocated(By.css(selector)), timeout);
            default:
                throw new Error(`Unsupported selector type: ${selectorType}`);
        }
    }

    async getPageSource(){
        return this.driver.getPageSource();
    }

    async close(){
        if(this.driver) {
            await this.driver.quit();
        }
    }

}



const browserAutomation = new BrowserAutomation();
await browserAutomation.setup();
await browserAutomation.navigateToWebsite("https://www.amazon.in/HP-Laptop-15-6-inch-Graphics-fc0154AU/dp/B0D3HG5CMG?crid=1ZFFHH5CVLD5H&dib=eyJ2IjoiMSJ9.xCWN7EW0bTvIb7BbRXXenz5tM6VOt4i1Vs4Z-zAZfgI9_qW7gQfQZmHGxsaYlX6egFg61ck9jRIBFxBWQ7ZKBUch64JuREfKtDTCIWNk1bUXlmygKm0cRumwqELOqm5mMlNEm-vkbQaO6OJi8i9IrobTM7yDcZ1AETw8misiVH0D7SaPV1W2ApHXw0JdNCq2DT25-wFkACfm3bt-q8xt6M6oJOJ8FDNWorCdlQxMwWA.RCuvNhT5YxQM2xSWoumEKcNbungR8R8MuPq0STihbdE&dib_tag=se&keywords=laptop&qid=1755458132&sprefix=laptop%2Caps%2C221&sr=8-3&th=1")
await browserAutomation.clickElement("Add to Cart","text")

// const elements = await browserAutomation.driver.wait(
//           until.elementsLocated(By.xpath(`//*[contains(normalize-space(text()), "Add to Cart")]`)),
//           5000
//         );

// try {
//   // prefer our robust JS-based click rather than WebElement.click() which can cause intercepted errors
//   await browserAutomation.clickRawElement(elements[2]);
// } catch (err) {
  
//   console.log("Error ",err)
// }

export default BrowserAutomation;
