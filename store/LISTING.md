# Chrome Web Store listing

Copy each field into the developer dashboard. Images are in this folder.

## Store listing tab

**Name:** Markup

**Summary** (from `manifest.json`, 122 of 132 characters):
Edit copy and comment on any live page, then copy every change as one prompt for your AI agent or plain English for Slack.

**Category:** Developer Tools

**Language:** English

**Description:**

```
Review website copy right on the live page, then hand every change to your AI agent in one prompt.

Markup adds a small panel to any page. Turn it on from the toolbar or with Alt+Shift+E.

• Edit Copy: click any text and type your new wording. The old text is kept so your agent knows exactly what to replace.
• Comment: click any element and leave a note, such as "remove this" or "make this shorter".
• Browse: use the page as normal while the panel stays open.
• Copy for Agent: one detailed prompt with the current text, the new text, and a CSS selector for every change, across every page you reviewed.
• Copy for Human: plain English bullets to paste in Slack for a teammate.

The panel stays on as you move between pages, so you can review a whole site in one pass. Drag it to any corner, or minimize it to a small pill.

Private by design: Markup has no server, no account, and no analytics. Your changes are saved only in your browser until you copy them.

Open source: https://github.com/jonnilundy/markup
```

**Images:**

| Field | File |
| --- | --- |
| Store icon (128×128) | `../icons/icon-128.png` |
| Screenshots (1280×800) | `screenshot-1-edit.png`, `screenshot-2-comment.png`, `screenshot-3-copy.png` |
| Small promo tile (440×280) | `promo-small-440x280.png` |
| Marquee promo tile (1400×560, optional) | `promo-marquee-1400x560.png` |

**Homepage URL:** https://github.com/jonnilundy/markup

**Support URL:** https://github.com/jonnilundy/markup/issues

## Privacy practices tab

**Single purpose:**
Markup lets the user edit text and leave comments on the web page they are viewing, then copy those changes as one block of text to paste into an AI agent or a chat message.

**Permission justification: `storage`:**
Saves the user's edits, comments, and panel settings locally so they persist across pages and browser restarts until the user copies or clears them.

**Permission justification: host permissions (`<all_urls>` content script):**
The user reviews copy across many pages of a site, often following links from page to page. The content script must be present on every page so the panel can stay open and the user can edit text on whatever page they are viewing. The script does nothing until the user turns Markup on, and it makes no network requests.

**Remote code:** No, I am not using remote code. All JavaScript is included in the package.

**Data usage:**
- Check **Website content**: the extension reads the text of elements the user chooses to edit or comment on. This data stays on the user's device.
- Leave every other data type unchecked.
- Certify all three statements: data is not sold to third parties, not used for purposes unrelated to the single purpose, and not used for creditworthiness or lending.

**Privacy policy URL:** https://github.com/jonnilundy/markup/blob/main/PRIVACY.md

## Distribution tab

**Visibility:** Public

**Regions:** All regions

**Price:** Free

## Package

Run `./scripts/package.sh` from the repo root. It writes `dist/markup-<version>.zip` with only the files the extension needs. Upload that zip in the Package tab.
