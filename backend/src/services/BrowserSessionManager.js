const BrowserAutomation = require("../automation/BrowserAutomation");

class BrowserSessionManager {
    constructor() {
        this.browserAutomation = null;
    }

    async getBrowser() {
        if (!this.browserAutomation) {
            this.browserAutomation = new BrowserAutomation();
            await this.browserAutomation.setup();
        }
        return this.browserAutomation;
    }

    async closeBrowser() {
        if (this.browserAutomation) {
            await this.browserAutomation.close();
            this.browserAutomation = null;
        }
    }
}

module.exports = new BrowserSessionManager();