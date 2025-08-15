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
        element = await this.driver.wait(
          until.elementLocated(By.xpath(`//*[contains(normalize-space(text()), "${selector}")]`)),
          5000
        );
        break;
      default:
        throw new Error(`Unsupported selector type: ${selectorType}`);
    }
    await element.click();
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
module.exports = BrowserAutomation;
