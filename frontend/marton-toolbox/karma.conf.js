// Karma configuration for `ng test` / `npm test`.
const fs = require('fs');
const os = require('os');
const path = require('path');

// Use an installed Chrome if there is one; otherwise fall back to Playwright's Chromium,
// so tests run on machines without Google Chrome. Set CHROME_BIN to override.
if (!process.env.CHROME_BIN) {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    path.join(os.homedir(), 'Library/Caches/ms-playwright'),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    if (candidate.endsWith('ms-playwright')) {
      const dir = fs.readdirSync(candidate).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
      const bin = dir && path.join(candidate, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
      if (bin && fs.existsSync(bin)) { process.env.CHROME_BIN = bin; break; }
    } else { process.env.CHROME_BIN = candidate; break; }
  }
}

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: { jasmine: { random: true }, clearContext: false },
    jasmineHtmlReporter: { suppressAll: true },
    coverageReporter: { dir: path.join(__dirname, './coverage'), subdir: '.', reporters: [{ type: 'html' }, { type: 'text-summary' }] },
    reporters: ['progress', 'kjhtml'],
    browsers: ['Chrome'],
    customLaunchers: {
      ChromeHeadlessCI: { base: 'ChromeHeadless', flags: ['--no-sandbox', '--disable-gpu'] },
    },
    restartOnFileChange: true,
  });
};
