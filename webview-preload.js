// Webview preload: make Slack see the embedded Electron webview as current Chrome
// before Slack's own browser-detection scripts execute.
const { webFrame } = require('electron');

const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.47 Safari/537.36';

webFrame.executeJavaScript(`
  Object.defineProperty(navigator, 'userAgent', {
    get: () => '${CHROME_UA}',
    configurable: true
  });
  Object.defineProperty(navigator, 'vendor', {
    get: () => 'Google Inc.',
    configurable: true
  });
  Object.defineProperty(navigator, 'platform', {
    get: () => 'MacIntel',
    configurable: true
  });
  Object.defineProperty(navigator, 'userAgentData', {
    get: () => ({
      brands: [
        { brand: 'Chromium', version: '150' },
        { brand: 'Google Chrome', version: '150' },
        { brand: 'Not-A.Brand', version: '99' }
      ],
      mobile: false,
      platform: 'macOS',
      getHighEntropyValues: () => Promise.resolve({
        brands: [
          { brand: 'Chromium', version: '150' },
          { brand: 'Google Chrome', version: '150' },
          { brand: 'Not-A.Brand', version: '99' }
        ],
        mobile: false,
        platform: 'macOS',
        platformVersion: '15.0.0',
        architecture: 'arm',
        model: '',
        fullVersionList: [
          { brand: 'Chromium', version: '150.0.7871.47' },
          { brand: 'Google Chrome', version: '150.0.7871.47' },
          { brand: 'Not-A.Brand', version: '99.0.0.0' }
        ]
      })
    }),
    configurable: true
  });
  void 0;
`);
