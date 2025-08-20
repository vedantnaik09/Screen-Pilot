class BrowserAutomationExtension {
  constructor() {
    this.isRunning = false;
    this.currentPhase = 0;
    this.previousActions = [];
    this.serverUrl = 'http://localhost:3000'; // Your backend server
    
    this.initializeEventListeners();
    this.loadSettings();
  }

  initializeEventListeners() {
    document.getElementById('startTask').addEventListener('click', () => this.startTask());
    document.getElementById('stopTask').addEventListener('click', () => this.stopTask());
    document.getElementById('takeScreenshot').addEventListener('click', () => this.takeScreenshot());
    document.getElementById('getPageInfo').addEventListener('click', () => this.getPageInfo());
    document.getElementById('llmProvider').addEventListener('change', () => this.toggleApiKeyField());
    
    // Load saved settings
    this.loadSettings();
  }

  toggleApiKeyField() {
    const provider = document.getElementById('llmProvider').value;
    const apiKeyGroup = document.getElementById('apiKeyGroup');
    
    if (provider === 'server') {
      apiKeyGroup.style.display = 'none';
    } else {
      apiKeyGroup.style.display = 'block';
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['llmProvider', 'apiKey', 'serverUrl']);
      if (result.llmProvider) {
        document.getElementById('llmProvider').value = result.llmProvider;
      }
      if (result.apiKey) {
        document.getElementById('apiKey').value = result.apiKey;
      }
      if (result.serverUrl) {
        this.serverUrl = result.serverUrl;
      }
      this.toggleApiKeyField();
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async saveSettings() {
    const settings = {
      llmProvider: document.getElementById('llmProvider').value,
      apiKey: document.getElementById('apiKey').value,
      serverUrl: this.serverUrl
    };
    
    try {
      await chrome.storage.local.set(settings);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  updateStatus(message, isLoading = false) {
    const statusContent = document.getElementById('statusContent');
    if (isLoading) {
      statusContent.innerHTML = `<span class="loading"></span>${message}`;
    } else {
      statusContent.textContent = message;
    }
  }

  addLogEntry(message, type = 'info') {
    const actionLog = document.getElementById('actionLog');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    actionLog.appendChild(logEntry);
    actionLog.scrollTop = actionLog.scrollHeight;
  }

  async startTask() {
    const query = document.getElementById('taskQuery').value.trim();
    if (!query) {
      this.addLogEntry('Please enter a task description', 'error');
      return;
    }

    this.isRunning = true;
    this.currentPhase = 0;
    this.previousActions = [];
    
    document.getElementById('startTask').classList.add('hidden');
    document.getElementById('stopTask').classList.remove('hidden');
    
    await this.saveSettings();
    this.updateStatus('Starting automation task...', true);
    this.addLogEntry(`Starting task: ${query}`, 'info');

    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Start the automation loop
      await this.automationLoop(tab.id, query);
      
    } catch (error) {
      this.addLogEntry(`Error starting task: ${error.message}`, 'error');
      this.stopTask();
    }
  }

  async automationLoop(tabId, query) {
    while (this.isRunning) {
      try {
        this.updateStatus(`Phase ${this.currentPhase + 1}: Analyzing page...`, true);
        this.addLogEntry(`Phase ${this.currentPhase + 1}: Taking screenshot and analyzing page`);

        // Take screenshot and get page info
        const screenshot = await this.captureVisibleTab();
        const pageInfo = await this.getPageInfoFromTab(tabId);

        // Get actions from LLM
        const actions = await this.getActionsFromLLM(screenshot, query, pageInfo);

        if (!actions || actions.length === 0) {
          this.addLogEntry('No actions received from LLM', 'error');
          break;
        }

        this.addLogEntry(`Received ${actions.length} actions to execute`);
        
        // Log detailed action information
        console.log('🎯 Actions received from LLM:', actions);
        actions.forEach((action, index) => {
          console.log(`Action ${index + 1}:`, action);
          this.addLogEntry(`Action ${index + 1}: ${action.action} (${action.selectorType || 'N/A'}: ${action.params?.selector || 'N/A'})`, 'info');
        });

        // Execute actions
        const executionResult = await this.executeActions(tabId, actions);

        if (executionResult.error) {
          this.addLogEntry(`Error executing actions: ${executionResult.error}`, 'error');
          // Try error recovery
          await this.handleExecutionError(tabId, query, executionResult);
        }

        if (executionResult.completed) {
          this.addLogEntry('Task completed successfully!', 'success');
          this.updateStatus('Task completed successfully!');
          break;
        }

        this.currentPhase++;
        
        // Prevent infinite loops
        if (this.currentPhase > 20) {
          this.addLogEntry('Maximum phases reached, stopping task', 'error');
          break;
        }

        // Small delay between phases
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        this.addLogEntry(`Error in automation loop: ${error.message}`, 'error');
        break;
      }
    }

    this.stopTask();
  }

  async captureVisibleTab() {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      return dataUrl;
    } catch (error) {
      throw new Error(`Failed to capture screenshot: ${error.message}`);
    }
  }

  async getPageInfoFromTab(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Get clean HTML and page info
          const cleanHTML = () => {
            const clonedDoc = document.cloneNode(true);
            
            // Remove script and style tags
            const scripts = clonedDoc.querySelectorAll('script, style, noscript');
            scripts.forEach(el => el.remove());
            
            // Remove comments
            const walker = document.createTreeWalker(
              clonedDoc,
              NodeFilter.SHOW_COMMENT,
              null,
              false
            );
            const comments = [];
            let node;
            while (node = walker.nextNode()) {
              comments.push(node);
            }
            comments.forEach(comment => comment.remove());
            
            // Get body content with limited depth
            const body = clonedDoc.body;
            if (!body) return '';
            
            return body.innerHTML.substring(0, 10000); // Limit size
          };

          return {
            url: window.location.href,
            title: document.title,
            html: cleanHTML(),
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight
            }
          };
        }
      });

      return results[0].result;
    } catch (error) {
      throw new Error(`Failed to get page info: ${error.message}`);
    }
  }

  async getActionsFromLLM(screenshot, query, pageInfo) {
    const provider = document.getElementById('llmProvider').value;
    
    if (provider === 'server') {
      return await this.getActionsFromServer(screenshot, query, pageInfo);
    } else {
      return await this.getActionsFromAPI(screenshot, query, pageInfo, provider);
    }
  }

  async getActionsFromServer(screenshot, query, pageInfo) {
    try {
      const requestBody = {
        screenshotDataUrl: screenshot,
        query: query,
        htmlSnippet: pageInfo.html,
        previousActions: this.previousActions.slice(-3),
        phase: this.currentPhase
      };

      const apiResponse = await fetch(`${this.serverUrl}/extension/processQuery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!apiResponse.ok) {
        throw new Error(`Server error: ${apiResponse.status} ${apiResponse.statusText}`);
      }

      return await apiResponse.json();
    } catch (error) {
      throw new Error(`Failed to get actions from server: ${error.message}`);
    }
  }

  async getActionsFromAPI(screenshot, query, pageInfo, provider) {
    // This would implement direct API calls to OpenAI, Anthropic, etc.
    // For now, throw an error to indicate it's not implemented
    throw new Error('Direct API calls not implemented yet. Please use server LLM provider.');
  }

  async executeActions(tabId, actions) {
    const results = {
      completed: false,
      error: null,
      lastAction: null
    };

    console.log(`🚀 [EXTENSION] Starting execution of ${actions.length} actions`);

    try {
      for (const [index, action] of actions.entries()) {
        console.log(`🎯 [EXTENSION] Executing action ${index + 1}/${actions.length}:`, action);
        this.addLogEntry(`Executing: ${action.action} - ${action.reasoning}`);
        this.previousActions.push(action);

        const success = await this.executeAction(tabId, action);
        
        console.log(`✅ [EXTENSION] Action ${index + 1} success:`, success);
        
        if (!success) {
          const errorMsg = `Failed to execute action: ${action.action}`;
          console.error(`❌ [EXTENSION] ${errorMsg}`);
          results.error = errorMsg;
          results.lastAction = action;
          break;
        }

        if (action.completed) {
          console.log(`🏁 [EXTENSION] Task marked as completed by action ${index + 1}`);
          results.completed = true;
          break;
        }

        if (action.phaseCompleted) {
          console.log(`📝 [EXTENSION] Phase marked as completed by action ${index + 1}`);
          break;
        }

        // Small delay between actions
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`❌ [EXTENSION] Error in executeActions:`, error);
      results.error = error.message;
    }

    console.log(`📊 [EXTENSION] Execution results:`, results);
    return results;
  }

  async executeAction(tabId, action) {
    console.log(`🔧 [EXTENSION] Executing action on tab ${tabId}:`, action);
    
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (actionData) => {
          console.log(`🎬 [CONTENT] Executing action:`, actionData);
          const { action: actionType, params } = actionData;

          // Helper function to find elements
          const findElement = (selector, selectorType) => {
            console.log(`🔍 [CONTENT] Finding element: ${selector} (${selectorType})`);
            
            let element = null;
            switch (selectorType) {
              case 'id':
                const cleanId = selector.startsWith('#') ? selector.substring(1) : selector;
                element = document.getElementById(cleanId);
                break;
              case 'css':
                element = document.querySelector(selector);
                break;
              case 'xpath':
                const xpathResult = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                element = xpathResult.singleNodeValue;
                break;
              case 'text':
                const xpath = `//*[contains(normalize-space(text()), "${selector}")]`;
                const elements = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                element = elements.snapshotLength > 0 ? elements.snapshotItem(elements.snapshotLength - 1) : null;
                break;
              default:
                throw new Error(`Unsupported selector type: ${selectorType}`);
            }
            
            console.log(`🎯 [CONTENT] Element found:`, !!element, element ? element.tagName : 'null');
            if (element) {
              console.log(`📍 [CONTENT] Element details:`, {
                tagName: element.tagName,
                id: element.id,
                className: element.className,
                textContent: element.textContent?.substring(0, 100),
                visible: element.offsetWidth > 0 && element.offsetHeight > 0
              });
            }
            
            return element;
          };

          console.log(`⚡ [CONTENT] Processing action type: ${actionType}`);

          switch (actionType) {
            case 'navigateToWebsite':
              console.log(`🌐 [CONTENT] Navigating to: ${params.website}`);
              window.location.href = params.website;
              return { success: true, action: 'navigate' };

            case 'clickElement':
              const clickElement = findElement(params.selector, params.selectorType);
              if (!clickElement) {
                console.error(`❌ [CONTENT] Click element not found: ${params.selector}`);
                return { success: false, error: 'Element not found', found: false };
              }
              
              try {
                console.log(`👆 [CONTENT] Attempting to click element`);
                clickElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // Try immediate click first
                clickElement.click();
                
                console.log(`✅ [CONTENT] Click attempted successfully`);
                return { success: true, found: true };
              } catch (e) {
                console.error(`❌ [CONTENT] Click error:`, e);
                return { success: false, error: e.message, found: true };
              }

            case 'fillInput':
              const inputElement = findElement(params.selector, params.selectorType);
              if (!inputElement) {
                console.error(`❌ [CONTENT] Input element not found: ${params.selector}`);
                return { success: false, error: 'Input element not found', found: false };
              }
              
              try {
                console.log(`⌨️ [CONTENT] Filling input with: ${params.text}`);
                inputElement.focus();
                inputElement.value = params.text;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(`✅ [CONTENT] Input filled successfully`);
                return { success: true, found: true };
              } catch (e) {
                console.error(`❌ [CONTENT] Fill error:`, e);
                return { success: false, error: e.message, found: true };
              }

            case 'scrollToElement':
              const scrollElement = findElement(params.selector, params.selectorType);
              if (!scrollElement) {
                console.error(`❌ [CONTENT] Scroll element not found: ${params.selector}`);
                return { success: false, error: 'Element not found', found: false };
              }
              
              try {
                console.log(`📜 [CONTENT] Scrolling element into view`);
                scrollElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                console.log(`✅ [CONTENT] Scroll completed successfully`);
                return { success: true, found: true };
              } catch (e) {
                console.error(`❌ [CONTENT] Scroll error:`, e);
                return { success: false, error: e.message, found: true };
              }

            default:
              console.error(`❌ [CONTENT] Unknown action type: ${actionType}`);
              return { success: false, error: `Unknown action type: ${actionType}` };
          }
        },
        args: [action]
      });

      console.log(`📋 [EXTENSION] Script execution result:`, results[0].result);
      
      const result = results[0].result;
      if (result && typeof result === 'object') {
        // Log detailed result information
        if (!result.success) {
          console.error(`❌ [EXTENSION] Action failed:`, {
            action: action.action,
            selector: action.params?.selector,
            selectorType: action.params?.selectorType,
            error: result.error,
            found: result.found
          });
        }
        return result.success;
      }
      
      console.warn(`⚠️ [EXTENSION] Unexpected result format:`, result);
      return !!result;
      
    } catch (error) {
      console.error(`❌ [EXTENSION] Error executing action:`, error);
      console.error(`🔍 [EXTENSION] Action details:`, action);
      return false;
    }
  }

  async handleExecutionError(tabId, query, executionResult) {
    console.log(`🚨 [EXTENSION] Handling execution error:`, executionResult);
    this.addLogEntry('Attempting error recovery...', 'info');
    
    try {
      // Take a fresh screenshot for error recovery
      const screenshot = await this.captureVisibleTab();
      const pageInfo = await this.getPageInfoFromTab(tabId);
      
      console.log(`🔧 [EXTENSION] Calling error recovery API...`);
      
      // Call the error recovery endpoint
      const requestBody = {
        screenshotDataUrl: screenshot,
        query: query,
        previousActions: this.previousActions.slice(-3),
        lastAction: executionResult.lastAction,
        error: executionResult.error,
        htmlSnippet: pageInfo.html
      };

      const apiResponse = await fetch(`${this.serverUrl}/extension/handleError`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!apiResponse.ok) {
        throw new Error(`Error recovery API failed: ${apiResponse.status} ${apiResponse.statusText}`);
      }

      const recoveryActions = await apiResponse.json();
      
      if (Array.isArray(recoveryActions) && recoveryActions.length > 0) {
        console.log(`🔄 [EXTENSION] Received ${recoveryActions.length} recovery actions`);
        this.addLogEntry(`Received ${recoveryActions.length} recovery actions`, 'info');
        
        // Execute recovery actions
        const recoveryResult = await this.executeActions(tabId, recoveryActions);
        
        if (recoveryResult.error) {
          console.error(`❌ [EXTENSION] Recovery actions failed:`, recoveryResult.error);
          this.addLogEntry(`Recovery actions failed: ${recoveryResult.error}`, 'error');
        } else {
          console.log(`✅ [EXTENSION] Recovery actions completed successfully`);
          this.addLogEntry('Recovery actions completed successfully', 'success');
        }
        
        return recoveryResult;
      } else {
        console.warn(`⚠️ [EXTENSION] No recovery actions received`);
        this.addLogEntry('No recovery actions received from server', 'error');
        return { error: 'No recovery actions available' };
      }
      
    } catch (error) {
      console.error(`❌ [EXTENSION] Error recovery failed:`, error);
      this.addLogEntry(`Error recovery failed: ${error.message}`, 'error');
      return { error: error.message };
    }
  }

  stopTask() {
    this.isRunning = false;
    document.getElementById('startTask').classList.remove('hidden');
    document.getElementById('stopTask').classList.add('hidden');
    this.updateStatus('Task stopped');
    this.addLogEntry('Task stopped by user', 'info');
  }

  async takeScreenshot() {
    try {
      this.updateStatus('Taking screenshot...', true);
      const screenshot = await this.captureVisibleTab();
      
      // Download the screenshot
      const link = document.createElement('a');
      link.href = screenshot;
      link.download = `screenshot-${new Date().toISOString().replace(/:/g, '-')}.png`;
      link.click();
      
      this.updateStatus('Screenshot saved');
      this.addLogEntry('Screenshot taken and saved', 'success');
    } catch (error) {
      this.addLogEntry(`Error taking screenshot: ${error.message}`, 'error');
      this.updateStatus('Error taking screenshot');
    }
  }

  async getPageInfo() {
    try {
      this.updateStatus('Getting page information...', true);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const pageInfo = await this.getPageInfoFromTab(tab.id);
      
      this.addLogEntry(`Page: ${pageInfo.title}`, 'info');
      this.addLogEntry(`URL: ${pageInfo.url}`, 'info');
      this.addLogEntry(`Viewport: ${pageInfo.viewport.width}x${pageInfo.viewport.height}`, 'info');
      this.addLogEntry(`HTML length: ${pageInfo.html.length} chars`, 'info');
      
      this.updateStatus('Page information retrieved');
    } catch (error) {
      this.addLogEntry(`Error getting page info: ${error.message}`, 'error');
      this.updateStatus('Error getting page info');
    }
  }
}

// Initialize the extension when popup loads
document.addEventListener('DOMContentLoaded', () => {
  new BrowserAutomationExtension();
});
