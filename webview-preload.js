// Webview preload — injects into page's main world before Slack scripts run
// Uses webFrame.executeJavaScript to bypass context isolation
const { webFrame } = require('electron');

webFrame.executeJavaScript(`
  Object.defineProperty(navigator, 'userAgentData', {
    get: () => ({
      brands: [
        { brand: 'Chromium', version: '136' },
        { brand: 'Google Chrome', version: '136' },
        { brand: 'Not-A.Brand', version: '99' }
      ],
      mobile: false,
      platform: 'macOS',
      getHighEntropyValues: (hints) => Promise.resolve({
        brands: [
          { brand: 'Chromium', version: '136' },
          { brand: 'Google Chrome', version: '136' },
          { brand: 'Not-A.Brand', version: '99' }
        ],
        mobile: false,
        platform: 'macOS',
        platformVersion: '15.0.0',
        architecture: 'arm',
        model: '',
        fullVersionList: [
          { brand: 'Chromium', version: '136.0.0.0' },
          { brand: 'Google Chrome', version: '136.0.0.0' },
          { brand: 'Not-A.Brand', version: '99.0.0.0' }
        ]
      })
    }),
    configurable: true
  });
`);
