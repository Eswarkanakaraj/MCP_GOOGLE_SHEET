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

---

## 📐 Handling Sheet Design Changes (Schema Flexibility)

The MCP server setup (`mcp_server.js`) is intentionally **schema-agnostic**. It does not strictly lock you into the 9-column design. Here is how it handles changes to your sheet's design (e.g., adding columns, moving dropdowns, or adding tabs):

### 1. Basic Data Updates (`update_google_sheet`)
If you add more columns (e.g., expanding from 9 to 12 columns), **you do not need to change `mcp_server.js` at all.** 
* **How it works:** The tool dynamically accepts a `range` (like `'Sheet1!A2:L2'`) and an array of `values`. 
* **What you do:** Just tell the AI in your prompt, *"I added 3 new columns at the end."* The AI will automatically adjust the range and the data it sends to the server.

### 2. Header Rows & Dropdowns (`add_dropdown_validation`)
If you change how many header rows are at the top of your sheet, you *might* need to adjust `mcp_server.js`.
* **Current Server Design:** The `add_dropdown_validation` tool has a default of `startRowIndex: 2`, which assumes your data starts on **Row 3** (indexes are 0-based).
* **What you do:** If your headers only take up 1 row, you can either instruct the AI to always pass `startRowIndex: 1`, OR manually change the default in `mcp_server.js`. *(Similarly, `remove_dropdown_validation` defaults to `startRowIndex: 56`).*

### 3. Total Column Limit (`format_google_sheet`)
If your sheet expands to a massive amount of columns (beyond column 'Z'):
* **Current Server Design:** The formatting tool defaults to `endColumnIndex: 26` (formatting columns A through Z). 
* **What you do:** If your sheet grows beyond column Z, change the default `endColumnIndex` to something higher (e.g., `50`) in `mcp_server.js`, or ensure the AI explicitly passes that number when calling the formatting tool.

### 4. Multiple Sheet Tabs (`sheetId`)
If you redesign your workflow to use multiple tabs (e.g., "Tasks", "Users"):
* **Current Server Design:** Formatting and dropdown tools default to `sheetId: 0` (the first tab created in the document). 
* **What you do:** Instruct the AI to explicitly pass the specific `sheetId` (e.g., `123456789`) for the new tabs when requesting dropdowns or formatting, otherwise operations will default to the first tab.

**Summary:** To adapt to a new sheet design, you rarely need to modify the server code. Simply inform the AI of your new column layout in your prompt, and it will dynamically map your request to the flexible tools provided by `mcp_server.js`.

---

## 💡 Prompt Engineering & Optimization Tips

To get the absolute best results from your AI assistant when using this Google Sheet sync tool, you can leverage detailed prompts. The AI will interpret your design intentions and call the appropriate MCP tools sequentially.

Here are highly optimized prompt templates you can copy and customize:

### 1. The "Design Realignment" Prompt (When your sheet layout changes)
If you add columns, change headers, or change colors, tell the AI exactly what the new layout looks like in a single structured prompt:
> *"I have redesigned my Google Sheet tab named 'Tasks'. Here is the new layout:
> * Column A: Task ID
> * Column B: Module Name
> * Column C: Task Description
> * Column D: Dev Status (Dropdown: 'Not Started', 'In Progress', 'Completed')
> * Column E: Verification (Dropdown: 'Pending', 'Verified')
> * Column F: Date Updated
> 
> Row 1 is a title row. Row 2 contains these headers. All actual data starts on Row 3. Please keep this structure in mind for all future updates to this tab."*

### 2. The "Aesthetic Polish" Prompt (Bulk Formatting)
To format your sheet to look extremely professional using Google-supported clean typography (like `Inter`, `Roboto`, or `Montserrat`):
> *"Format the 'Tasks' sheet to look clean and modern. Set the font family to 'Inter' for all columns from A to F, starting from row 1 to 500. Additionally, apply data validation dropdowns to Column D (Dev Status) with ['Not Started', 'In Progress', 'Completed'] and Column E (Verification) with ['Pending', 'Verified'] starting from Row 3."*

### 3. The "Smart Data Insertion" Prompt
When adding data, instruct the AI to calculate or format specific fields (like dates or status pills) automatically:
> *"Add a new task: 'Implement JWT login verification' under the 'Auth' module. Mark its status as 'In Progress' and verification as 'Pending'. Set today's date in Column F. Make sure to find the first empty row in the 'Tasks' sheet to insert this, and format the row's text font to 'Inter'."*

### 4. The "Bulk Import / Migration" Prompt
If you have a block of tasks or a markdown table you want to sync at once:
> *"I have a list of 5 tasks below. For each task, find the next empty row starting from row 3 on the sheet and sync them one by one. Use the exact status text 'Not Started' so the dropdown validation doesn't break:
> 1. Design signup UI
> 2. Create database migration for users
> 3. Set up email confirmation template
> 4. Write validation middleware
> 5. Create logout endpoint"*

---

### 🚀 Optimization Best Practices
* **Provide Column Mappings:** The AI is smart, but explicitly mapping columns (e.g. *"Column C is Description"*) prevents errors.
* **Keep Dropdowns Exact:** Ensure that the text you ask the AI to insert matches your Sheet's data validation list *exactly* (case-sensitive) so Google Sheets displays the colored status pill correctly.
* **Specify Tab Names:** If your Google Sheet contains multiple tabs, always mention the specific tab name (e.g. *"'Tasks' tab"*) in your prompts so the AI knows where to write.