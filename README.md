# Google Sheets MCP Server Documentation 📊🤖

This document provides a complete, step-by-step guide to how our Model Context Protocol (MCP) connection works, how to configure Google Cloud credentials, and how to manage the synchronization between your AI assistant and Google Sheets.

---

## 🏛️ Architecture Overview

```
+-------------------+       MCP Protocol        +--------------------+       Google OAuth2       +-------------------+
|                   |   (mcp_config.json)   |                    |    (Dynamic .env load)    |                   |
|   AI Assistant    | <===================> |   mcp_server.js    | <=======================> |   Google Sheets   |
|   (IDE Editor)    |                       |   (Node.js Server) |                           |        API        |
+-------------------+                           +--------------------+                           +-------------------+
```

The system operates via a local Node.js MCP server (`mcp_server.js`). When you prompt the AI in your editor (e.g., *"Add task 16.1 to the sheet"*), the AI invokes the registered MCP tool. The MCP server dynamically reads your OAuth credentials from `.env` and pushes the data to Google Sheets via the official Google Sheets API.

---

## 🛠️ Step 1: Google Cloud Setup & API Enabling

To allow the MCP server to interact with your Google Sheet, you must configure a project in Google Cloud Console.

### 1. Enable the Google Sheets API
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `ERP Sheet Sync`).
3. Navigate to **APIs & Services > Library**.
4. Search for **Google Sheets API** and click **Enable**.

### 2. Configure OAuth Consent Screen
1. Go to **APIs & Services > OAuth Consent Screen**.
2. Select **External** (or Internal if using Google Workspace) and click **Create**.
3. Fill in the App Name (e.g., `MCP Sheet Sync`) and User Support Email.
4. Under **Scopes**, click **Add or Remove Scopes** and add:
   * `https://www.googleapis.com/auth/spreadsheets` (Full control over spreadsheets).
5. Add your personal Google email address under **Test Users** so you can authorize the app during testing.

### 3. Create OAuth Client Credentials
1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Application Type: Select **Web application** (or Desktop app).
4. Name: `MCP Sheet Sync Client`.
5. Under **Authorized redirect URIs**, add:
   * `http://localhost`
   * `https://developers.google.com/oauthplayground` (Optional, if using OAuth Playground for initial tokens).
6. Click **Create**. You will receive your **Client ID** and **Client Secret**.

---

## 🔑 Step 2: Generating Refresh & Access Tokens

To keep the AI connected permanently without requiring login every time, we use an **Offline Refresh Token**.

### Method A: Using Google OAuth Playground (Fastest)
1. Go to [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. Click the Gear icon ⚙️ (Top Right) > check **Use your own OAuth credentials**.
3. Paste your OAuth **Client ID** and **Client Secret**.
4. In Step 1 (Select & authorize APIs), input the scope:
   `https://www.googleapis.com/auth/spreadsheets`
5. Click **Authorize APIs** and log in with your Google account.
6. In Step 2, click **Exchange authorization code for tokens**.
7. Copy the resulting `refresh_token` and `access_token`.

---

## 📁 Step 3: Project Configuration (`.env`)

Inside your local folder (`d:\Shrewd\Ceezet\google-sheet-sync\`), maintain a `.env` file containing your credentials. 

```env
client_id=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
client_secret=YOUR_GOOGLE_CLIENT_SECRET
redirect_uris=http://localhost
sheet_id=1gCZhHSR-WcofTcaf9nbNYLURRmuEGXnj4BzDulHjWAs
refresh_token=1//0g_YOUR_LONG_REFRESH_TOKEN_HERE
access_token=ya29.a0AfB_YOUR_CURRENT_ACCESS_TOKEN_HERE
```

> 📌 **Note on Dynamic Refresh**: The script `mcp_server.js` dynamically parses this `.env` file on every single tool call. If the access token expires, Google's OAuth library automatically uses the `refresh_token` to get a new one behind the scenes.

---

## 🔌 Step 4: MCP Server Registration in IDE

To connect the AI assistant to this local server, you must register it in your AI assistant's global configuration file.

### Configuration File Location
* **Windows**: `C:\Users\front\.gemini\antigravity\mcp_config.json`

### JSON Configuration Block
Add the following configuration inside the `"mcpServers"` object:

```json
{
  "mcpServers": {
    "GoogleSheetsSync": {
      "command": "node",
      "args": [
        "d:/Shrewd/Ceezet/google-sheet-sync/mcp_server.js"
      ],
      "env": {}
    }
  }
}
```

---

## 🎮 How to Use & Manage the Connection

### 1. Pushing Updates via AI Prompting
You do not need markdown files. Simply give natural language commands in your chat box:
> *"Add task 17.1: Completed User Profile page redesign under Authentication module. Mark Dev Status as Completed and Verification as Pending."*

The AI will automatically format this into your 9-column sheet schema and trigger the `update_google_sheet` tool.

### 2. Backfilling Dropdowns (Data Validation)
If your Google Sheet has Data Validation dropdowns (e.g., Column J and K), simply instruct the AI to pass the exact matching text (e.g., `"Completed"`, `"Pending"`). Google Sheets automatically renders them as beautifully colored status pills.

### 3. How to Disconnect / Stop the Service
If you ever want to pause the sync or revoke AI access to your Google Sheet:
1. Open `C:\Users\front\.gemini\antigravity\mcp_config.json`.
2. Delete or comment out the `"GoogleSheetsSync"` block and save the file.
3. The background server stops immediately, ensuring your spreadsheet is 100% private and disconnected. To reconnect, simply paste the block back in.