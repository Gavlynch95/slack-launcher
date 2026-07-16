// Run in every Slack webview before its page scripts. Slack blocks Electron
// clients, so provide the matching Chrome identity for the embedded Chromium.
const { webFrame } = require('electron');

const chromeVersion = process.versions.chrome;
const chromeMajor = chromeVersion.split('.')[0];
const chromeUserAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;

webFrame.executeJavaScript(`
  (() => {
    const chromeVersion = ${JSON.stringify(chromeVersion)};
    const chromeMajor = ${JSON.stringify(chromeMajor)};
    const chromeUserAgent = ${JSON.stringify(chromeUserAgent)};
    const userAgentData = {
      brands: [
        { brand: 'Google Chrome', version: chromeMajor },
        { brand: 'Chromium', version: chromeMajor },
        { brand: 'Not.A/Brand', version: '24' }
      ],
      mobile: false,
      platform: 'macOS',
      getHighEntropyValues: async () => ({
        brands: [
          { brand: 'Google Chrome', version: chromeMajor },
          { brand: 'Chromium', version: chromeMajor },
          { brand: 'Not.A/Brand', version: '24' }
        ],
        fullVersionList: [
          { brand: 'Google Chrome', version: chromeVersion },
          { brand: 'Chromium', version: chromeVersion },
          { brand: 'Not.A/Brand', version: '24.0.0.0' }
        ],
        mobile: false,
        platform: 'macOS',
        platformVersion: '15.0.0',
        architecture: 'arm',
        bitness: '64',
        model: '',
        wow64: false
      }),
      toJSON() { return { brands: this.brands, mobile: this.mobile, platform: this.platform }; }
    };
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => chromeUserAgent });
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, get: () => userAgentData });
    window.chrome ||= {};
    window.chrome.runtime ||= { connect() {}, sendMessage() {}, onMessage: { addListener() {} } };
  })();
`).catch(() => {});
