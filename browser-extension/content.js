// Content script that runs on all web pages
class BrowserAutomationContent {
  constructor() {
    this.isInjected = false;
    this.taskActive = false;
    this.setupMessageListener();
    this.injectAutomationScript();
    
    console.log('Browser Automator content script loaded');
  }

  setupMessageListener() {
    // Listen for messages from background script and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open
    });
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'PING':
          sendResponse({ success: true, ready: true });
          break;

        case 'START_TASK':
          this.taskActive = true;
          this.highlightInteractableElements();
          sendResponse({ success: true });
          break;

        case 'STOP_TASK':
          this.taskActive = false;
          this.removeHighlights();
          sendResponse({ success: true });
          break;

        case 'EXECUTE_ACTION_DIRECT':
          const result = await this.executeAction(message.action);
          sendResponse({ success: true, result });
          break;

        case 'GET_PAGE_STATE':
          const pageState = this.getPageState();
          sendResponse({ success: true, data: pageState });
          break;

        case 'TAB_UPDATED':
          this.handleTabUpdate(message);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Content script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  injectAutomationScript() {
    if (this.isInjected) return;

    try {
      // Inject the automation utilities script
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injected.js');
      script.onload = () => {
        script.remove();
        this.isInjected = true;
        console.log('Automation utilities injected');
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      console.error('Failed to inject automation script:', error);
    }
  }

  executeAction(action) {
    return new Promise((resolve) => {
      try {
        const result = this.performAction(action);
        resolve(result);
      } catch (error) {
        resolve({ success: false, error: error.message });
      }
    });
  }

  performAction(action) {
    const { action: actionType, params } = action;

    switch (actionType) {
      case 'navigateToWebsite':
        window.location.href = params.website;
        return { success: true, action: 'navigate' };

      case 'clickElement':
        return this.clickElement(params.selector, params.selectorType);

      case 'fillInput':
        return this.fillInput(params.selector, params.selectorType, params.text);

      case 'scrollToElement':
        return this.scrollToElement(params.selector, params.selectorType);

      case 'waitForElement':
        return this.waitForElement(params.selector, params.selectorType, params.timeout || 5000);

      default:
        throw new Error(`Unsupported action: ${actionType}`);
    }
  }

  findElement(selector, selectorType) {
    try {
      switch (selectorType) {
        case 'id':
          const cleanId = selector.startsWith('#') ? selector.substring(1) : selector;
          return document.getElementById(cleanId);
          
        case 'css':
          return document.querySelector(selector);
          
        case 'xpath':
          const xpathResult = document.evaluate(
            selector, 
            document, 
            null, 
            XPathResult.FIRST_ORDERED_NODE_TYPE, 
            null
          );
          return xpathResult.singleNodeValue;
          
        case 'text':
          // Find elements containing the text
          const textXpath = `//*[contains(normalize-space(text()), "${selector}")]`;
          const textResult = document.evaluate(
            textXpath, 
            document, 
            null, 
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, 
            null
          );
          
          // Return the last match (usually the most specific)
          if (textResult.snapshotLength > 0) {
            return textResult.snapshotItem(textResult.snapshotLength - 1);
          }
          return null;
          
        default:
          throw new Error(`Unsupported selector type: ${selectorType}`);
      }
    } catch (error) {
      console.error('Error finding element:', error);
      return null;
    }
  }

  clickElement(selector, selectorType) {
    const element = this.findElement(selector, selectorType);
    
    if (!element) {
      return { 
        success: false, 
        error: `Element not found: ${selector} (${selectorType})`,
        found: false
      };
    }

    try {
      // Scroll element into view
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center', 
        inline: 'center' 
      });

      // Wait a moment for scroll to complete, then click
      setTimeout(() => {
        try {
          // Check if element is clickable
          const rect = element.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          
          if (!isVisible) {
            console.warn('Element is not visible:', selector);
          }

          // Try multiple click methods
          if (element.click && typeof element.click === 'function') {
            element.click();
          } else {
            // Fallback to dispatching click event
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
              detail: 1
            });
            element.dispatchEvent(clickEvent);
          }

          // Also try focus for form elements
          if (element.focus && typeof element.focus === 'function') {
            element.focus();
          }

        } catch (clickError) {
          console.error('Click execution error:', clickError);
        }
      }, 300);

      return { 
        success: true, 
        found: true,
        elementType: element.tagName.toLowerCase(),
        elementText: element.textContent?.substring(0, 50) || ''
      };

    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        found: true
      };
    }
  }

  fillInput(selector, selectorType, text) {
    const element = this.findElement(selector, selectorType);
    
    if (!element) {
      return { 
        success: false, 
        error: `Input element not found: ${selector} (${selectorType})`,
        found: false
      };
    }

    try {
      // Scroll into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Focus the element
      element.focus();

      // Clear existing content
      if (element.value !== undefined) {
        element.value = '';
      }
      
      // Set the new value
      element.value = text;

      // Trigger events to simulate user input
      const events = ['input', 'change', 'keyup', 'blur'];
      events.forEach(eventType => {
        const event = new Event(eventType, { bubbles: true });
        element.dispatchEvent(event);
      });

      return { 
        success: true, 
        found: true,
        text: text,
        elementType: element.tagName.toLowerCase()
      };

    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        found: true
      };
    }
  }

  scrollToElement(selector, selectorType) {
    const element = this.findElement(selector, selectorType);
    
    if (!element) {
      return { 
        success: false, 
        error: `Element not found: ${selector} (${selectorType})`,
        found: false
      };
    }

    try {
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center', 
        inline: 'center' 
      });

      return { 
        success: true, 
        found: true,
        elementType: element.tagName.toLowerCase()
      };

    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        found: true
      };
    }
  }

  waitForElement(selector, selectorType, timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const checkElement = () => {
        const element = this.findElement(selector, selectorType);
        
        if (element) {
          resolve({ 
            success: true, 
            found: true,
            waitTime: Date.now() - startTime
          });
          return;
        }

        if (Date.now() - startTime >= timeout) {
          resolve({ 
            success: false, 
            error: `Element not found within ${timeout}ms: ${selector} (${selectorType})`,
            found: false,
            waitTime: Date.now() - startTime
          });
          return;
        }

        setTimeout(checkElement, 100);
      };

      checkElement();
    });
  }

  getPageState() {
    try {
      const getCleanHTML = () => {
        try {
          // Create a clean version of the HTML for analysis
          const body = document.body.cloneNode(true);
          
          // Remove scripts, styles, and comments
          const unwanted = body.querySelectorAll('script, style, noscript, [style*="display: none"], [style*="visibility: hidden"]');
          unwanted.forEach(el => el.remove());
          
          return body.innerHTML.substring(0, 10000); // Limit size
        } catch (error) {
          return document.body.innerHTML.substring(0, 10000);
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
        timestamp: Date.now(),
        interactableElements: this.getInteractableElements()
      };
    } catch (error) {
      console.error('Error getting page state:', error);
      return null;
    }
  }

  getInteractableElements() {
    try {
      const elements = [];
      const selectors = [
        'button',
        'input[type="button"]',
        'input[type="submit"]',
        'input[type="text"]',
        'input[type="email"]',
        'input[type="password"]',
        'input[type="search"]',
        'textarea',
        'select',
        'a[href]',
        '[onclick]',
        '[role="button"]'
      ];

      selectors.forEach(selector => {
        const found = document.querySelectorAll(selector);
        found.forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            elements.push({
              tag: el.tagName.toLowerCase(),
              id: el.id || null,
              class: el.className || null,
              text: el.textContent?.trim().substring(0, 50) || '',
              type: el.type || null,
              visible: true,
              index: index
            });
          }
        });
      });

      return elements.slice(0, 50); // Limit to prevent large payloads
    } catch (error) {
      console.error('Error getting interactable elements:', error);
      return [];
    }
  }

  highlightInteractableElements() {
    if (!this.taskActive) return;

    try {
      // Remove existing highlights
      this.removeHighlights();

      const style = document.createElement('style');
      style.id = 'browser-automator-highlights';
      style.textContent = `
        .browser-automator-highlight {
          outline: 2px solid #4CAF50 !important;
          outline-offset: 2px !important;
          background-color: rgba(76, 175, 80, 0.1) !important;
          position: relative !important;
        }
        .browser-automator-highlight::before {
          content: '🤖';
          position: absolute !important;
          top: -20px !important;
          left: 0 !important;
          background: #4CAF50 !important;
          color: white !important;
          padding: 2px 6px !important;
          font-size: 12px !important;
          border-radius: 3px !important;
          z-index: 9999 !important;
        }
      `;
      document.head.appendChild(style);

      // Highlight interactive elements
      const interactableSelectors = [
        'button',
        'input[type="button"]',
        'input[type="submit"]',
        'input[type="text"]',
        'input[type="email"]',
        'input[type="password"]',
        'textarea',
        'select',
        'a[href]',
        '[onclick]',
        '[role="button"]'
      ];

      interactableSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el.offsetWidth > 0 && el.offsetHeight > 0) {
            el.classList.add('browser-automator-highlight');
          }
        });
      });

    } catch (error) {
      console.error('Error highlighting elements:', error);
    }
  }

  removeHighlights() {
    try {
      // Remove highlight classes
      const highlighted = document.querySelectorAll('.browser-automator-highlight');
      highlighted.forEach(el => {
        el.classList.remove('browser-automator-highlight');
      });

      // Remove highlight styles
      const styleEl = document.getElementById('browser-automator-highlights');
      if (styleEl) {
        styleEl.remove();
      }
    } catch (error) {
      console.error('Error removing highlights:', error);
    }
  }

  handleTabUpdate(message) {
    console.log('Tab updated for task:', message.taskId);
    // Could implement task state persistence here
  }
}

// Initialize content script when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new BrowserAutomationContent();
  });
} else {
  new BrowserAutomationContent();
}
