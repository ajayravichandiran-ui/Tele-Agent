# Tele-Agent Bill Assistant

A Chrome/Brave extension that reads a selected bill region **on your computer**, lets you correct the extracted answer, and fills the selected website field. It never clicks Accept or submits a form.

This first version uses local Tesseract OCR. You select the matching region yourself; it does not yet automatically interpret a whole bill or find the answer to every question. Printed text works best. Handwriting and poor scans require careful review.

## Build

Requires Node.js 24 and npm.

```sh
npm ci
npm run build
npm test
```

The build bundles the OCR worker, WebAssembly engine, and English model. No CDN, external AI account, or API key is needed at runtime.

## Install in Chrome or Brave

1. Download or copy the built `dist` folder to your computer.
2. Open the browser's Extensions page (`chrome://extensions` or `brave://extensions`).
3. Enable **Developer mode**, choose **Load unpacked**, and select `dist`.
4. Pin **Tele-Agent Bill Assistant** to your toolbar.

## Read and fill

1. Open the bill website and log in normally. Keep the bill and answer field visible.
2. Click the extension toolbar icon.
3. Click the answer input on the website.
4. Drag a tight rectangle around just the matching answer text on the bill. Press Escape to cancel.
5. In the review tab, check the cropped image and correct the extracted text.
6. Click **Fill selected field**. The website tab becomes active again.
7. Verify the value and click the website's **Accept** button yourself.

For “Treating Dentist SOF,” select the printed “Signature On File” text, rather than the entire dentist information box. Select NPI digits separately for an NPI question.

## Privacy and limitations

- The extension captures the visible tab locally to crop the selected region. It replaces the stored screenshot with field metadata when the review tab opens. Images and answers are not sent to an external service or written to logs.
- Temporary jobs use browser session storage. Filling, discarding, or closing the source tab removes them; browser restart also clears session storage.
- Clicking the icon grants access to the current tab only. There are no persistent site permissions.
- Inputs and textareas in the main page are supported. Cross-origin frames, canvas-only inputs, and custom rich-text controls are not supported.
- Reloading a page invalidates the selection. Select again if the website advances to another question.
- OCR confidence is an engine estimate. Verify every answer before accepting.
- Live Teletype behavior requires validation in your logged-in browser.

## Development

Source lives in `extension/`. Run `npm run build` after editing and click Reload on the browser's Extensions page. `npm test` checks screenshot coordinate conversion and text preservation.

`npm run test:browser` uses installed Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`) to exercise the real local OCR engine and DOM selection/fill, with Chrome extension storage and messaging mocked. It checks that Accept remains untouched. The cloud browser's administrator policy blocks unpacked extensions, so actual toolbar permission handling and live Teletype integration must be checked in your browser.
