# Browser Automator Extension

A browser extension that provides AI-powered automation capabilities directly in your browser, complementing the server-based automation system.

## Features

- **AI-Powered Automation**: Uses LLM to intelligently interact with web pages
- **Multiple LLM Providers**: Support for server-based LLM, OpenAI, and Anthropic
- **Visual Feedback**: Highlights interactive elements during automation
- **Screenshot Capture**: Take screenshots for analysis and debugging
- **Page Analysis**: Extract page information and interactive elements
- **Error Recovery**: Intelligent error handling and recovery mechanisms

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `browser-extension` folder
4. The Browser Automator icon should appear in your toolbar

## Usage

### Basic Automation

1. Click the Browser Automator extension icon
2. Enter a task description (e.g., "Search for laptops on Amazon")
3. Choose your LLM provider:
   - **Server LLM**: Uses your backend server (default)
   - **OpenAI**: Direct API calls (requires API key)
   - **Anthropic**: Direct API calls (requires API key)
4. Click "Start Task" to begin automation

### Manual Tools

- **Screenshot**: Capture the current page
- **Page Info**: Get detailed page information
- **Stop Task**: Halt ongoing automation

## Configuration

### Server Backend Integration

The extension connects to your backend server at `http://localhost:3000` by default. Make sure your server is running to use the "Server LLM" option.

### API Keys

For direct LLM provider access:
1. Select "OpenAI GPT-4" or "Anthropic Claude"
2. Enter your API key in the provided field
3. Settings are saved automatically

## Architecture

### Components

1. **Popup (`popup.html/js`)**: Main user interface
2. **Background Script (`background.js`)**: Handles extension lifecycle and communication
3. **Content Script (`content.js`)**: Runs on web pages, executes automation
4. **Injected Script (`injected.js`)**: Advanced automation utilities

### Communication Flow

```
Popup → Background Script → Content Script → Web Page
  ↓                                           ↓
Server API ← → LLM Analysis ← → Screenshot Capture
```

## API Integration

### Server Endpoints Used

- `POST /processQuery`: Process screenshots and get automation actions
- `GET /health`: Check server status

### Supported Actions

- `navigateToWebsite`: Navigate to a URL
- `clickElement`: Click on elements using various selectors
- `fillInput`: Fill form inputs with text
- `scrollToElement`: Scroll elements into view
- `waitForElement`: Wait for elements to appear

### Selector Types

- **id**: Element ID (without #)
- **css**: CSS selector
- **xpath**: XPath expression
- **text**: Visible text content
- **attribute**: Attribute-based selection

## Development

### File Structure

```
browser-extension/
├── manifest.json          # Extension manifest
├── popup.html            # Main UI
├── popup.js              # UI logic
├── background.js         # Background service worker
├── content.js            # Content script for web pages
├── injected.js           # Page context utilities
├── icons/                # Extension icons
└── README.md            # This file
```

### Adding New Features

1. **New Actions**: Add to content script and injected script
2. **UI Changes**: Modify popup.html and popup.js
3. **API Integration**: Update background.js communication

## Troubleshooting

### Common Issues

1. **Extension not loading**:
   - Check Developer mode is enabled
   - Reload the extension from chrome://extensions/

2. **Server connection issues**:
   - Ensure backend server is running on port 3000
   - Check CORS settings if needed

3. **Automation not working**:
   - Check browser console for errors
   - Verify selectors are correct
   - Ensure page is fully loaded

### Debug Mode

Access browser automation utilities in console:
```javascript
// Check if utilities are loaded
window.BrowserAutomator.version

// Find elements
window.BA.findElement('submit-btn', 'id')

// Get interactive elements
window.BA.getInteractiveElements()

// Highlight element for debugging
window.BA.highlightElement(element)
```

## Security

- Extension requests minimal permissions
- API keys are stored locally in browser storage
- No data is transmitted except to configured LLM providers
- Server communication uses localhost only

## Comparison with Server Automation

| Feature | Browser Extension | Server Automation |
|---------|------------------|-------------------|
| Browser Control | User's browser | Headless Chrome |
| Installation | Browser extension | Server setup |
| Performance | Native browser | Selenium overhead |
| Debugging | DevTools access | Limited visibility |
| Scalability | Single user | Multi-user/parallel |
| Network | User's network | Server network |

## License

This extension is part of the Browser Automator project.
