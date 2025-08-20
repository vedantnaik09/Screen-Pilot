// Injected script that runs in the page context
// This provides additional automation utilities that have full access to the page

(function() {
  'use strict';

  // Only inject once
  if (window.browserAutomatorInjected) {
    return;
  }
  window.browserAutomatorInjected = true;

  // Create namespace for automation utilities
  window.BrowserAutomator = {
    version: '1.0.0',
    
    // Enhanced element finding with multiple strategies
    findElement: function(selector, selectorType, options = {}) {
      const { timeout = 0, visible = true, enabled = true } = options;
      
      const strategies = {
        id: (sel) => {
          const cleanId = sel.startsWith('#') ? sel.substring(1) : sel;
          return document.getElementById(cleanId);
        },
        
        css: (sel) => document.querySelector(sel),
        
        xpath: (sel) => {
          const result = document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          return result.singleNodeValue;
        },
        
        text: (sel) => {
          // Multiple text matching strategies
          const strategies = [
            // Exact text match
            `//*[normalize-space(text())="${sel}"]`,
            // Contains text
            `//*[contains(normalize-space(text()), "${sel}")]`,
            // Partial match for buttons/links
            `//button[contains(normalize-space(text()), "${sel}")]`,
            `//a[contains(normalize-space(text()), "${sel}")]`,
            `//input[@value="${sel}"]`,
            `//*[@title="${sel}"]`,
            `//*[@alt="${sel}"]`
          ];
          
          for (const xpath of strategies) {
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            if (result.singleNodeValue) {
              return result.singleNodeValue;
            }
          }
          return null;
        },
        
        attribute: (sel) => {
          // Format: "attribute:value" or "attribute=value"
          const [attr, value] = sel.split(/[=:]/);
          return document.querySelector(`[${attr}="${value}"]`);
        }
      };

      const findFn = strategies[selectorType];
      if (!findFn) {
        throw new Error(`Unsupported selector type: ${selectorType}`);
      }

      const checkElement = () => {
        const element = findFn(selector);
        if (!element) return null;
        
        if (visible) {
          const rect = element.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0 && 
                           getComputedStyle(element).visibility !== 'hidden' &&
                           getComputedStyle(element).display !== 'none';
          if (!isVisible) return null;
        }
        
        if (enabled && element.disabled) return null;
        
        return element;
      };

      if (timeout === 0) {
        return checkElement();
      }

      // Wait for element with timeout
      return new Promise((resolve) => {
        const startTime = Date.now();
        
        const poll = () => {
          const element = checkElement();
          if (element) {
            resolve(element);
            return;
          }
          
          if (Date.now() - startTime >= timeout) {
            resolve(null);
            return;
          }
          
          setTimeout(poll, 100);
        };
        
        poll();
      });
    },

    // Smart clicking with multiple fallback strategies
    smartClick: function(element) {
      if (!element) return false;

      try {
        // Strategy 1: Scroll into view and ensure visibility
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        
        // Strategy 2: Check for overlapping elements
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const topElement = document.elementFromPoint(centerX, centerY);
        
        if (topElement && topElement !== element) {
          console.warn('Element is obscured by:', topElement);
          // Try clicking the top element if it's interactive
          if (this.isInteractive(topElement)) {
            element = topElement;
          }
        }

        // Strategy 3: Multiple click approaches
        const clickStrategies = [
          // Standard click
          () => element.click(),
          
          // Mouse event simulation
          () => {
            const event = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true,
              clientX: centerX,
              clientY: centerY
            });
            element.dispatchEvent(event);
          },
          
          // Focus and enter for buttons
          () => {
            if (element.tagName.toLowerCase() === 'button' || element.type === 'submit') {
              element.focus();
              const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true
              });
              element.dispatchEvent(enterEvent);
            }
          },
          
          // Form submission for submit buttons
          () => {
            if (element.type === 'submit' && element.form) {
              element.form.submit();
            }
          }
        ];

        // Try each strategy
        for (const strategy of clickStrategies) {
          try {
            strategy();
            return true;
          } catch (e) {
            console.warn('Click strategy failed:', e);
          }
        }

        return false;
      } catch (error) {
        console.error('Smart click error:', error);
        return false;
      }
    },

    // Enhanced form filling
    smartFill: function(element, text) {
      if (!element) return false;

      try {
        // Focus the element
        element.focus();
        
        // Handle different input types
        const inputType = element.type?.toLowerCase();
        const tagName = element.tagName.toLowerCase();

        // Clear existing content
        if (tagName === 'input' || tagName === 'textarea') {
          element.value = '';
          
          // Simulate user typing for better compatibility
          for (let i = 0; i < text.length; i++) {
            setTimeout(() => {
              element.value += text[i];
              
              // Trigger events
              element.dispatchEvent(new Event('input', { bubbles: true }));
              
              // Trigger change event on last character
              if (i === text.length - 1) {
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('blur', { bubbles: true }));
              }
            }, i * 10); // Small delay between characters
          }
        } else if (tagName === 'select') {
          // Handle select elements
          const option = Array.from(element.options).find(opt => 
            opt.text.toLowerCase().includes(text.toLowerCase()) ||
            opt.value.toLowerCase().includes(text.toLowerCase())
          );
          
          if (option) {
            element.value = option.value;
            element.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        return true;
      } catch (error) {
        console.error('Smart fill error:', error);
        return false;
      }
    },

    // Check if element is interactive
    isInteractive: function(element) {
      if (!element) return false;
      
      const tagName = element.tagName.toLowerCase();
      const interactiveTags = ['button', 'a', 'input', 'select', 'textarea'];
      
      return interactiveTags.includes(tagName) ||
             element.onclick ||
             element.getAttribute('role') === 'button' ||
             element.hasAttribute('tabindex');
    },

    // Get all interactive elements on the page
    getInteractiveElements: function() {
      const selectors = [
        'button',
        'input[type="button"], input[type="submit"], input[type="reset"]',
        'input[type="text"], input[type="email"], input[type="password"], input[type="search"]',
        'textarea',
        'select',
        'a[href]',
        '[onclick]',
        '[role="button"]',
        '[tabindex]'
      ];

      const elements = [];
      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            elements.push({
              element: el,
              tag: el.tagName.toLowerCase(),
              id: el.id || null,
              className: el.className || null,
              text: el.textContent?.trim().substring(0, 100) || '',
              type: el.type || null,
              href: el.href || null,
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              }
            });
          }
        });
      });

      return elements;
    },

    // Wait for page to be ready
    waitForReady: function(timeout = 10000) {
      return new Promise((resolve) => {
        if (document.readyState === 'complete') {
          resolve(true);
          return;
        }

        const startTime = Date.now();
        const checkReady = () => {
          if (document.readyState === 'complete') {
            resolve(true);
            return;
          }
          
          if (Date.now() - startTime >= timeout) {
            resolve(false);
            return;
          }
          
          setTimeout(checkReady, 100);
        };

        checkReady();
      });
    },

    // Scroll to element with various strategies
    scrollToElement: function(element, options = {}) {
      if (!element) return false;

      const { behavior = 'smooth', block = 'center', inline = 'center' } = options;

      try {
        element.scrollIntoView({ behavior, block, inline });
        return true;
      } catch (error) {
        console.error('Scroll error:', error);
        return false;
      }
    },

    // Debug helper to highlight elements
    highlightElement: function(element, color = '#4CAF50') {
      if (!element) return;

      const originalOutline = element.style.outline;
      element.style.outline = `2px solid ${color}`;
      element.style.outlineOffset = '2px';

      setTimeout(() => {
        element.style.outline = originalOutline;
        element.style.outlineOffset = '';
      }, 3000);
    },

    // Get page state for analysis
    getPageState: function() {
      return {
        url: window.location.href,
        title: document.title,
        readyState: document.readyState,
        interactiveElements: this.getInteractiveElements().length,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY
        },
        timestamp: Date.now()
      };
    }
  };

  // Expose utilities globally for debugging
  if (typeof window !== 'undefined') {
    window.BA = window.BrowserAutomator;
  }

  console.log('Browser Automator utilities injected successfully');

})();
