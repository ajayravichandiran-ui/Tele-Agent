# Tele-Agent AI Sidebar

A sidebar in your existing Chrome/Brave browser that analyzes bill images, the current question, and webpage instructions with a **local vision model**, then fills one answer. It never clicks Accept or submits a form.

No manual cropping is required. The browser extension supplies the page context; Ollama on your computer runs the AI model. A small model can still misread text or follow instructions incorrectly, so check filled values before accepting.

## Local AI setup on Windows

1. Install [Ollama for Windows](https://ollama.com/download/windows).
2. Open PowerShell and download a small vision model:

   ```powershell
   ollama pull qwen3-vl:2b
   ```

3. Keep Ollama running. The sidebar connects to `http://127.0.0.1:11434` only.
4. Open **Local AI setup** in the sidebar and click **Check local AI**.

The 2B model is a starting point for a GTX 1650 with 4 GB VRAM. Depending on image size, model memory, and system RAM, Ollama can use CPU/RAM as well; this may be slow. Runtime model inference and performance on this hardware have not been tested in the cloud machine.

If Ollama returns HTTP 403, copy the **exact extension origin command** shown in the sidebar into PowerShell, then quit Ollama from the system tray and reopen it. The command sets `OLLAMA_ORIGINS` for this extension's ID only. It replaces any existing origins setting; if you already configured origins for another app, preserve them as a comma-separated list. Do not set `OLLAMA_HOST` to a public network address. Model installation requires Internet access, but bill analysis runs locally without an external AI account or API key.

## Build

Requires Node.js 24 and npm.

```sh
npm ci
npm run build
npm test
```

The build produces the unpacked sidebar in `dist/`. Legacy local OCR assets remain bundled for the earlier review workflow and its smoke tests; the AI sidebar uses Ollama.

## Install in Chrome or Brave

1. Download or copy the built `dist` folder to your computer.
2. Open the browser's Extensions page (`chrome://extensions` or `brave://extensions`).
3. Enable **Developer mode**, choose **Load unpacked**, and select `dist`.
4. Pin **Tele-Agent AI Sidebar** to your toolbar. Chrome 116+ or a Brave version supporting Chrome's side-panel API is required; use current Chrome if your Brave version does not expose it.

## Read and fill

1. Open the bill website and log in normally. Keep the bill and answer field visible.
2. Click the extension toolbar icon.
3. The AI sidebar opens next to the website and detects the editable answer field. If multiple answer fields exist, choose the intended one from the dropdown.
4. Click **Analyze and fill current field**. It reads the bill image and page instructions and fills the requested answer when the model reports supporting evidence.
5. To process subsequent questions automatically, enable **Continue when the question changes**. It checks for a new question every three seconds. Switching tabs, model errors, or uncertain answers pause automatic processing.
6. Check the answer and evidence, then click the website's **Accept** button yourself.
7. When a result needs review, correct the answer and click **Fill reviewed answer**. A changed question or user-edited field is protected from stale AI output.

For **Treating Dentist SOF**, the answer should be the bill's “Signature On File” phrase, adjusted to any field-specific formatting instruction. For **Treating Dentist NPI**, it should be the NPI digits only. Existing answers displayed on the website are explicitly excluded as source evidence in the AI prompt.

## Privacy and limitations

- The AI sidebar sends the visible-page screenshot, up to two readable document images, field context, and up to 24,000 characters of page text only to the local Ollama endpoint. It does not store bill images, prompts, or answers. Only your model name is saved. Keep Ollama's own debug logging disabled for sensitive documents.
- Full source images are included when the page permits canvas reading. Cross-origin images or canvas/PDF viewers may provide only the visible screenshot. Scroll/zoom the bill so the relevant region is readable before analysis. It does not scroll hidden pages automatically or inspect cross-origin frames.
- All readable top-level page text is inspected within the stated limit, including field instructions. A visual screenshot covers the current viewport, not every offscreen region of the website.
- Website access is granted through the toolbar click; the only persistent host permission is the local Ollama address.
- Inputs and textareas in the main page are supported. Cross-origin frames, canvas-only inputs, and custom rich-text controls are not supported.
- After navigating or reloading, click the toolbar icon again if Chrome asks for page access.
- Ambiguous answers are held for review. The small model's evidence and certainty are not a guarantee; verify identifiers, dates, and handwritten text.
- Live Teletype behavior requires validation in your logged-in browser.

## Development

Source lives in `extension/`. Run `npm run build` after editing and click Reload on the browser's Extensions page. `npm test` checks prompt construction, answer constraints, the manifest policy, screenshot coordinates, and text preservation.

`npm run test:browser` uses installed Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`). It exercises the legacy real local OCR engine and the AI sidebar's screenshot/instruction flow, filling, uncertainty handling, automatic continuation, and changed-question/user-edit protection. Chrome extension APIs and the sidebar's AI responses are mocked in these checks. They validate orchestration, not real model extraction accuracy. The cloud browser's policy blocks unpacked extensions; toolbar permissions, side-panel behavior, actual Ollama inference, and live Teletype integration require checks on your computer.
