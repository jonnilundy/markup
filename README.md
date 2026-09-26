# Markup

Chrome extension. Edit copy and leave comments on any live page, then copy one prompt for your agent.

## Install

1. Open `chrome://extensions`, turn on Developer mode.
2. Click **Load unpacked**, pick this folder.
3. Reload any open tabs.

## Use

- Toolbar icon or `Alt+Shift+E` turns it on and off (badge shows ON). It stays on across pages.
- **Edit Copy**: click text, type. Enter saves, Shift+Enter adds a line, Esc reverts.
- **Comment**: click an element, type a note, Enter saves. `↑` selects the parent.
- **Browse**: page works as normal, panel stays.
- **Move it**: drag the panel by its top bar, or flick it. It lands in the corner the throw heads toward and remembers that corner. Minimize turns it into a pill in the same corner. Click the pill to open it.
- **Copy Prompt (N)**: one prompt for every change on every page, grouped by page, with the current text, new text, and a CSS selector.
- Changes persist in `chrome.storage.local` until you click **Clear**.

## Test

`test/harness.html` loads `content.js` with a fake `chrome.storage`, so you can open it as a file and try the flows without installing.

## Look

Native macOS material: translucent blur, light and dark follow the system, segmented control, system font. Honors reduced motion, reduced transparency, and increased contrast.
