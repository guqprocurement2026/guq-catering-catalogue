# GU-Q Catering Catalogue — Autonomous GitHub Implementation

This package is designed so **Events manages menu attachments** while **Finance supports the backend only**.

## End-state workflow

1. Events opens one Google Form.
2. Events selects the hotel and catering category, attaches the official PDF, and submits.
3. A Finance-owned Google Apps Script trigger processes the submission.
4. The PDF is moved into the Finance-owned Drive menu library.
5. The control Sheet updates the current menu link and keeps an upload history.
6. Apps Script commits the refreshed `site/data/catalogue.json` file to GitHub.
7. GitHub Actions deploys the updated `site/` folder to GitHub Pages.
8. The catalogue shows the new menu without Events editing GitHub, the Sheet, or website code.

## What Events receives

Only the **Google Form responder URL**.

## What Finance owns

- Control Google Sheet
- Apps Script project and trigger
- Drive root folder for approved menus
- Events upload access list
- Price Register
- GitHub repository configuration
- Fine-grained GitHub token stored in Apps Script Properties

Start with [`docs/00_START_HERE.md`](docs/00_START_HERE.md).
