# Frontend visual checks

Captured from the local app at `http://127.0.0.1:8001` after the session and authorized workspace data loaded. The PNGs are full-page viewport captures at the named dimensions. The Search, Apps and People renders were opened and visually inspected.

- `screenshots/search-1440x900.png`
- `screenshots/search-1280x800.png`
- `screenshots/apps-1440x900.png`
- `screenshots/people-1280x800.png`

To recapture, start the server and run `python qa/capture_screens.py`. The helper uses the locally bundled Chromium executable and its Chrome DevTools Protocol endpoint; it does not require Playwright or Selenium.

The captures cover the landing/search screen, populated Apps catalogue and People directory. They do not cover every interactive state (conversation results, citation drawer, app details, organization chart, document and approval views); those remain unverified visually in this pass. Backend workflow tests cover the supported local operations.
