// Background script for handling extension lifecycle and communication
class BackgroundService {
  constructor() {
    this.activeTasks = new Map();
    this.initializeListeners();
  }

  initializeListeners() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener(() => {
      console.log('Browser Automator Extension installed');
    });

    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep the message channel open for async responses
    });

    // Handle tab updates for ongoing tasks
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (this.activeTasks.has(tabId) && changeInfo.status === 'complete') {
        this.handleTabUpdate(tabId, tab);
      }
    });

    // Clean up when tabs are closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.activeTasks.has(tabId)) {
        this.activeTasks.delete(tabId);
      }
    });
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'EXECUTE_ACTION':
          const result = await this.executeAction(message.tabId, message.action);
          sendResponse({ success: true, result });
          break;

        case 'GET_TAB_INFO':
          const tabInfo = await this.getTabInfo(message.tabId);
          sendResponse({ success: true, data: tabInfo });
          break;

        case 'REGISTER_TASK':
          this.activeTasks.set(message.tabId, {
            taskId: message.taskId,
            query: message.query,
            startTime: Date.now()
          });
          sendResponse({ success: true });
          break;

        case 'UNREGISTER_TASK':
          this.activeTasks.delete(message.tabId);
          sendResponse({ success: true });
          break;

        case 'CAPTURE_SCREENSHOT':
          const screenshot = await this.captureScreenshot(message.tabId);
          sendResponse({ success: true, data: screenshot });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async executeAction(tabId, action) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: this.getActionExecutorFunction(),
        args: [action]
      });

      return results[0].result;
    } catch (error) {
      throw new Error(`Failed to execute action: ${error.message}`);
    }
  }

  getActionExecutorFunction() {
    return (action) => {
      // This function runs in the context of the webpage
      const { action: actionType, params } = action;

      // Helper functions for element interaction
      const findElement = (selector, selectorType) => {
        switch (selectorType) {
          case 'id':
            const cleanSelector = selector.startsWith('#') ? selector.substring(1) : selector;
            return document.getElementById(cleanSelector);
          case 'css':
            return document.querySelector(selector);
          case 'xpath':
            return document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          case 'text':
            const xpath = `//*[contains(normalize-space(text()), "${selector}")]`;
            const elements = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            return elements.snapshotLength > 0 ? elements.snapshotItem(elements.snapshotLength - 1) : null;
          default:
            throw new Error(`Unsupported selector type: ${selectorType}`);
        }
      };

      const clickElement = (element) => {
        if (!element) return false;
        
        try {
          // Scroll element into view
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Wait a bit for scroll to complete
          setTimeout(() => {
            // Try different click methods
            if (element.click) {
              element.click();
            } else {
              // Fallback to mouse events
              const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              element.dispatchEvent(event);
            }
          }, 500);
          
          return true;
        } catch (error) {
          console.error('Click error:', error);
          return false;
        }
      };

      const fillInput = (element, text) => {
        if (!element) return false;
        
        try {
          // Focus the element
          element.focus();
          
          // Clear existing content
          element.value = '';
          
          // Fill with new text
          element.value = text;
          
          // Trigger input events
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          
          return true;
        } catch (error) {
          console.error('Fill input error:', error);
          return false;
        }
      };

      const scrollToElement = (element) => {
        if (!element) return false;
        
        try {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return true;
        } catch (error) {
          console.error('Scroll error:', error);
          return false;
        }
      };

      // Execute the action
      try {
        switch (actionType) {
          case 'navigateToWebsite':
            window.location.href = params.website;
            return { success: true };

          case 'clickElement':
            const clickTarget = findElement(params.selector, params.selectorType);
            const clickSuccess = clickElement(clickTarget);
            return { 
              success: clickSuccess,
              found: !!clickTarget,
              selector: params.selector,
              selectorType: params.selectorType
            };

          case 'fillInput':
            const inputTarget = findElement(params.selector, params.selectorType);
            const fillSuccess = fillInput(inputTarget, params.text);
            return { 
              success: fillSuccess,
              found: !!inputTarget,
              selector: params.selector,
              selectorType: params.selectorType,
              text: params.text
            };

          case 'scrollToElement':
            const scrollTarget = findElement(params.selector, params.selectorType);
            const scrollSuccess = scrollToElement(scrollTarget);
            return { 
              success: scrollSuccess,
              found: !!scrollTarget,
              selector: params.selector,
              selectorType: params.selectorType
            };

          default:
            throw new Error(`Unknown action type: ${actionType}`);
        }
      } catch (error) {
        return { 
          success: false, 
          error: error.message,
          action: actionType,
          params: params
        };
      }
    };
  }

  async getTabInfo(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Get page information
          const getCleanHTML = () => {
            try {
              const clonedDoc = document.cloneNode(true);
              
              // Remove script and style tags
              const scripts = clonedDoc.querySelectorAll('script, style, noscript');
              scripts.forEach(el => el.remove());
              
              // Get body content with limited depth
              const body = clonedDoc.body;
              if (!body) return '';
              
              return body.innerHTML.substring(0, 8000); // Limit size
            } catch (error) {
              return '';
            }
          };

          return {
            url: window.location.href,
            title: document.title,
            html: getCleanHTML(),
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
              scrollX: window.scrollX,
              scrollY: window.scrollY
            },
            readyState: document.readyState,
            timestamp: Date.now()
          };
        }
      });

      return results[0].result;
    } catch (error) {
      throw new Error(`Failed to get tab info: ${error.message}`);
    }
  }

  async captureScreenshot(tabId) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { 
        format: 'png',
        quality: 90
      });
      return dataUrl;
    } catch (error) {
      throw new Error(`Failed to capture screenshot: ${error.message}`);
    }
  }

  handleTabUpdate(tabId, tab) {
    const task = this.activeTasks.get(tabId);
    if (task) {
      // Notify content script or popup about tab update
      chrome.tabs.sendMessage(tabId, {
        type: 'TAB_UPDATED',
        taskId: task.taskId,
        url: tab.url,
        title: tab.title
      }).catch(() => {
        // Ignore errors if content script is not ready
      });
    }
  }
}

// Initialize the background service
new BackgroundService();
