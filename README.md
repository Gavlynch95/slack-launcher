# Slack Launcher

An Electron launcher for keeping separate Slack accounts in isolated sessions, with a fast two-pane view for testing and administration.

## Run it

```bash
npm install
npm start
```

## Using it

- Add each workspace with its Slack subdomain and its team ID (`T…`). Enterprise Grid workspaces also use the organization ID (`E…`) for organization pages.
- Add every account with its label and email. The email is stored locally and the copy button works even when the account is signed out.
- Turn on **Split** and click either pane to make it the target for account selection. Both panes have their own Slack page shortcuts, MC links, and reset control.
- MC controls use the active Slack session's user and workspace IDs and open in the system browser, where your work authentication is available.

## Reset

Reset is intentionally confirmed before it runs. It attempts to leave channels, close DMs/group DMs, and delete drafts for that account; Slack-protected conversations such as `#general` remain.
