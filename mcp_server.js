const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

// Parse .env manually
const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  if (line.trim() && !line.startsWith("#")) {
    const parts = line.split("=");
    if (parts.length >= 2) {
      env[parts[0].trim()] = parts
        .slice(1)
        .join("=")
        .trim()
        .replace(/^['"]|['"]$/g, "");
    }
  }
});

const CLIENT_ID = env.client_id;
const CLIENT_SECRET = env.client_secret;
const REDIRECT_URI = env.redirect_uris || env.redirect_uri || 'http://localhost:3000/oauth2callback';
const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
);

// Automatically update .env when Google refreshes the access token
oAuth2Client.on("tokens", (tokens) => {
  let newEnv = fs.readFileSync(envPath, "utf-8");
  if (tokens.access_token) {
    if (newEnv.match(/access_token\s*=.*/)) {
      newEnv = newEnv.replace(/access_token\s*=.*/, `access_token=${tokens.access_token}`);
    } else {
      newEnv += `\naccess_token=${tokens.access_token}`;
    }
  }
  if (tokens.refresh_token) {
    if (newEnv.match(/refresh_token\s*=.*/)) {
      newEnv = newEnv.replace(/refresh_token\s*=.*/, `refresh_token=${tokens.refresh_token}`);
    } else {
      newEnv += `\nrefresh_token=${tokens.refresh_token}`;
    }
  }
  fs.writeFileSync(envPath, newEnv);
});

if (env.refresh_token && env.access_token) {
  oAuth2Client.setCredentials({
    access_token: env.access_token,
    refresh_token: env.refresh_token,
    token_type: "Bearer",
  });
} else {
  console.error("Warning: Missing refresh_token or access_token in .env. Run generate_token.js to generate them.");
}

const sheets = google.sheets({ version: "v4", auth: oAuth2Client });
const drive = google.drive({ version: "v3", auth: oAuth2Client });

// Helper to convert sheet/tab name to numeric sheetId
async function getSheetIdByName(sheetsClient, spreadsheetId, sheetName) {
  const doc = await sheetsClient.spreadsheets.get({ spreadsheetId });
  const found = doc.data.sheets.find(
    (s) => s.properties.title.toLowerCase() === sheetName.toLowerCase()
  );
  if (!found) {
    throw new Error(`Sheet tab named '${sheetName}' not found in spreadsheet '${spreadsheetId}'.`);
  }
  return found.properties.sheetId;
}

// Helper to parse A1 notation like "A1:C10" into numeric indices
function parseA1Range(rangeStr) {
  if (!rangeStr) {
    return { startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 26 };
  }
  // Strip off the sheet name part if present (e.g. "Sheet1!A1:B2" -> "A1:B2")
  const parts = rangeStr.split("!");
  const notation = parts[parts.length - 1];

  const cells = notation.split(":");
  const startCell = cells[0];
  const endCell = cells[1] || cells[0];

  const parseCell = (cell) => {
    const colMatch = cell.match(/[A-Z]+/i);
    const rowMatch = cell.match(/\d+/);

    let col = null;
    if (colMatch) {
      const letters = colMatch[0].toUpperCase();
      col = 0;
      for (let i = 0; i < letters.length; i++) {
        col = col * 26 + (letters.charCodeAt(i) - 64);
      }
      col -= 1; // Convert to 0-based index
    }

    const row = rowMatch ? parseInt(rowMatch[0], 10) - 1 : null;
    return { col, row };
  };

  const start = parseCell(startCell);
  const end = parseCell(endCell);

  return {
    startRowIndex: start.row !== null ? start.row : 0,
    endRowIndex: end.row !== null ? end.row + 1 : 1000,
    startColumnIndex: start.col !== null ? start.col : 0,
    endColumnIndex: end.col !== null ? end.col + 1 : 26,
  };
}

const server = new Server(
  {
    name: "google-sheets-mcp",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_spreadsheets",
        description: "Lists spreadsheets in the configured Drive folder or accessible by the user.",
        inputSchema: {
          type: "object",
          properties: {
            folder_id: {
              type: "string",
              description: "Optional Google Drive folder ID to search in. If omitted, searches 'My Drive'.",
            },
          },
        },
      },
      {
        name: "create_spreadsheet",
        description: "Creates a new Google Spreadsheet, optionally inside a specific Drive folder.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "The desired title for the spreadsheet. Example: 'Quarterly Report Q4'.",
            },
            folder_id: {
              type: "string",
              description: "Optional Google Drive folder ID where the spreadsheet should be created.",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "list_sheets",
        description: "Lists all sheet/tab names within a spreadsheet.",
        inputSchema: {
          type: "object",
          properties: {
            spreadsheet_id: {
              type: "string",
              description: "The spreadsheet ID. If omitted, uses the configured default.",
            },
          },
        },
      },
      {
        name: "create_sheet",
        description: "Adds a new sheet/tab to a spreadsheet.",
        inputSchema: {
          type: "object",
          properties: {
            spreadsheet_id: {
              type: "string",
              description: "The spreadsheet ID. If omitted, uses the configured default.",
            },
            title: {
              type: "string",
              description: "Name for the new sheet/tab.",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "get_sheet_data",
        description: "Reads data from a range in a sheet/tab.",
        inputSchema: {
          type: "object",
          properties: {
            spreadsheet_id: {
              type: "string",
              description: "The spreadsheet ID (from its URL). If omitted, uses the configured default.",
            },
            sheet: {
              type: "string",
              description: "Name of the sheet/tab (e.g., 'Sheet1').",
            },
            range: {
              type: "string",
              description: "Optional A1 notation (e.g., 'A1:C10'). If omitted, reads the whole tab.",
            },
            include_grid_data: {
              type: "boolean",
              description: "If True, returns full grid data including formatting/metadata. Default is False.",
            },
          },
          required: ["sheet"],
        },
      },
      {
        name: "update_cells",
        description: "Writes data to a specific range. Overwrites existing data.",
        inputSchema: {
          type: "object",
          properties: {
            spreadsheet_id: {
              type: "string",
              description: "The spreadsheet ID. If omitted, uses the configured default.",
            },
            sheet: {
              type: "string",
              description: "Name of the sheet/tab (e.g., 'Sheet1').",
            },
            range: {
              type: "string",
              description: "A1 notation range to write to (e.g., 'A1:C3').",
            },
            data: {
              type: "array",
              items: { type: "array", items: { type: "string" } },
              description: "2D array of values to write. Example: [['1', '2', '3'], ['a', 'b', 'c']]",
            },
          },
          required: ["sheet", "range", "data"],
        },
      },
      {
        name: "batch_update_cells",
        description: "Updates multiple ranges in one API call.",
        inputSchema: {
          type: "object",
          properties: {
            spreadsheet_id: {
              type: "string",
              description: "The spreadsheet ID. If omitted, uses the configured default.",
            },
            sheet: {
              type: "string",
              description: "Name of the sheet/tab.",
            },
            ranges: {
              type: "object",
              description: "Dictionary mapping range strings (A1 notation) to 2D arrays of values. Example: { 'A1:B2': [[1, 2], [3, 4]] }",
            },
          },
          required: ["sheet", "ranges"],
        },
      },
      {
        name: "add_dropdown_validation",
        description: "Applies data validation dropdown rules to a specific column range in Google Sheets.",
        inputSchema: {
          type: "object",
          properties: {
            sheetId: {
              type: "integer",
              description: "The ID of the sheet tab. Default is 0.",
            },
            startRowIndex: {
              type: "integer",
              description: "Starting row index (0-based). Default is 2 (Row 3).",
            },
            endRowIndex: {
              type: "integer",
              description: "Ending row index. Default is 1000.",
            },
            columnIndex: {
              type: "integer",
              description: "The 0-based column index to apply validation to (e.g., 3 for Column D).",
            },
            options: {
              type: "array",
              items: { type: "string" },
              description: "Array of allowed string options. Example: ['Completed', 'Pending', 'In Progress']",
            },
          },
          required: ["columnIndex", "options"],
        },
      },
      {
        name: "format_google_sheet",
        description: "Updates formatting (e.g., font family) of cells in a Google Sheet.",
        inputSchema: {
          type: "object",
          properties: {
            fontFamily: {
              type: "string",
              description: "The font family name to apply. e.g., 'Times New Roman'",
            },
            sheetId: {
              type: "integer",
              description: "The ID of the sheet tab. Default is 0.",
            },
            startRowIndex: {
              type: "integer",
              description: "Starting row index (0-based). Default is 0.",
            },
            endRowIndex: {
              type: "integer",
              description: "Ending row index (exclusive). Default is 1000.",
            },
            startColumnIndex: {
              type: "integer",
              description: "Starting column index. Default is 0.",
            },
            endColumnIndex: {
              type: "integer",
              description: "Ending column index. Default is 26.",
            },
          },
          required: ["fontFamily"],
        },
      },
      {
        name: "share_spreadsheet",
        description: "Shares a spreadsheet with specified users/emails and roles.",
        inputSchema: {
          type: "object",
          properties: {
            spreadsheet_id: {
              type: "string",
              description: "The spreadsheet ID. If omitted, uses the configured default.",
            },
            recipients: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  email_address: { type: "string", description: "Email address to share with." },
                  role: { type: "string", description: "Role: reader, commenter, writer." },
                },
                required: ["email_address", "role"],
              },
            },
            send_notification: {
              type: "boolean",
              description: "Send email notification. Default is True.",
            },
          },
          required: ["recipients"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    // Parse .env dynamically on every request to grab fresh/refreshed tokens
    const envPath = path.join(__dirname, ".env");
    const envContent = fs.readFileSync(envPath, "utf-8");
    const env = {};
    envContent.split("\n").forEach((line) => {
      if (line.trim() && !line.startsWith("#")) {
        const parts = line.split("=");
        if (parts.length >= 2) {
          env[parts[0].trim()] = parts
            .slice(1)
            .join("=")
            .trim()
            .replace(/^['"]|['"]$/g, "");
        }
      }
    });

    const CLIENT_ID = env.client_id;
    const CLIENT_SECRET = env.client_secret;
    const REDIRECT_URI = env.redirect_uris || env.redirect_uri || 'http://localhost:3000/oauth2callback';
    const DEFAULT_SPREADSHEET_ID = env.sheet_id;

    const oAuth2Client = new google.auth.OAuth2(
      CLIENT_ID,
      CLIENT_SECRET,
      REDIRECT_URI,
    );

    // Automatically update .env dynamically when token refreshes during tool execution
    oAuth2Client.on("tokens", (tokens) => {
      let newEnv = fs.readFileSync(envPath, "utf-8");
      if (tokens.access_token) {
        if (newEnv.match(/access_token\s*=.*/)) {
          newEnv = newEnv.replace(/access_token\s*=.*/, `access_token=${tokens.access_token}`);
        } else {
          newEnv += `\naccess_token=${tokens.access_token}`;
        }
      }
      if (tokens.refresh_token) {
        if (newEnv.match(/refresh_token\s*=.*/)) {
          newEnv = newEnv.replace(/refresh_token\s*=.*/, `refresh_token=${tokens.refresh_token}`);
        } else {
          newEnv += `\nrefresh_token=${tokens.refresh_token}`;
        }
      }
      fs.writeFileSync(envPath, newEnv);
    });

    if (!env.refresh_token || !env.access_token) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: `❌ **Google Sheets API Authorization Required**

It looks like you haven't generated your secure Google access tokens yet, or they are missing from your \`.env\` file. 

To authorize this server and connect your Google Sheets:
1. Open a terminal in the MCP project directory:
   \`\`\`bash
   cd "${__dirname.replace(/\\/g, '/')}"
   \`\`\`
2. Run the token generator script:
   \`\`\`bash
   node generate_token.js
   \`\`\`
3. Click the authorization link printed in your terminal, log in with your Google account, and click **Allow**.

Once you authorize the application, the tokens will be automatically saved to your \`.env\` file and your AI assistant will start working instantly! 🚀`
        }]
      };
    }

    oAuth2Client.setCredentials({
      access_token: env.access_token,
      refresh_token: env.refresh_token,
      token_type: "Bearer",
    });

    const sheets = google.sheets({ version: "v4", auth: oAuth2Client });
    const drive = google.drive({ version: "v3", auth: oAuth2Client });

    const toolName = request.params.name;
    const args = request.params.arguments || {};

    // 1. list_spreadsheets
    if (toolName === "list_spreadsheets") {
      const folderId = args.folder_id;
      let q = "mimeType = 'application/vnd.google-apps.spreadsheet'";
      if (folderId) {
        q += ` and '${folderId}' in parents`;
      }
      const res = await drive.files.list({
        q,
        fields: "files(id, name)",
      });
      const list = (res.data.files || []).map((f) => ({ id: f.id, title: f.name }));
      return {
        content: [{ type: "text", text: JSON.stringify(list, null, 2) }],
      };
    }

    // 2. create_spreadsheet
    if (toolName === "create_spreadsheet") {
      const title = args.title;
      const folderId = args.folder_id;

      const res = await sheets.spreadsheets.create({
        resource: {
          properties: { title },
        },
      });

      const spreadsheetId = res.data.spreadsheetId;

      // If a folder ID is specified, move the newly created file there
      if (folderId) {
        await drive.files.update({
          fileId: spreadsheetId,
          addParents: folderId,
          fields: "id, parents",
        });
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            spreadsheetId,
            title,
            folder: folderId || "Root",
            url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
          }, null, 2),
        }],
      };
    }

    // 3. list_sheets
    if (toolName === "list_sheets") {
      const spreadsheetId = args.spreadsheet_id || DEFAULT_SPREADSHEET_ID;
      const res = await sheets.spreadsheets.get({ spreadsheetId });
      const titles = (res.data.sheets || []).map((s) => s.properties.title);
      return {
        content: [{ type: "text", text: JSON.stringify(titles, null, 2) }],
      };
    }

    // 4. create_sheet
    if (toolName === "create_sheet") {
      const spreadsheetId = args.spreadsheet_id || DEFAULT_SPREADSHEET_ID;
      const title = args.title;

      const requests = [{ addSheet: { properties: { title } } }];
      const res = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: { requests },
      });

      const props = res.data.replies[0].addSheet.properties;
      return {
        content: [{ type: "text", text: JSON.stringify(props, null, 2) }],
      };
    }

    // 5. get_sheet_data
    if (toolName === "get_sheet_data") {
      const spreadsheetId = args.spreadsheet_id || DEFAULT_SPREADSHEET_ID;
      const sheet = args.sheet;
      const range = args.range;
      const includeGridData = args.include_grid_data || false;

      const rangeString = range ? `${sheet}!${range}` : sheet;

      if (includeGridData) {
        const res = await sheets.spreadsheets.get({
          spreadsheetId,
          ranges: [rangeString],
          includeGridData: true,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
        };
      } else {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: rangeString,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
        };
      }
    }

    // 6. update_cells
    if (toolName === "update_cells") {
      const spreadsheetId = args.spreadsheet_id || DEFAULT_SPREADSHEET_ID;
      const sheet = args.sheet;
      const range = args.range;
      const data = args.data;

      const rangeString = `${sheet}!${range}`;

      const res = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: rangeString,
        valueInputOption: "USER_ENTERED",
        resource: { values: data },
      });

      return {
        content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
      };
    }

    // 7. batch_update_cells
    if (toolName === "batch_update_cells") {
      const spreadsheetId = args.spreadsheet_id || DEFAULT_SPREADSHEET_ID;
      const sheet = args.sheet;
      const ranges = args.ranges; // Object mapping range -> 2D array

      const data = Object.keys(ranges).map((r) => ({
        range: `${sheet}!${r}`,
        values: ranges[r],
      }));

      const res = await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: {
          valueInputOption: "USER_ENTERED",
          data,
        },
      });

      return {
        content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
      };
    }

    // 8. add_dropdown_validation
    if (toolName === "add_dropdown_validation") {
      const sheetId = args.sheetId || 0;
      const startRowIndex = args.startRowIndex || 2;
      const endRowIndex = args.endRowIndex || 1000;
      const colIndex = args.columnIndex;
      const options = args.options;

      const values = options.map((opt) => ({ userEnteredValue: opt }));
      const requests = [{
        setDataValidation: {
          range: { sheetId, startRowIndex, endRowIndex, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 },
          rule: {
            condition: { type: "ONE_OF_LIST", values },
            showCustomUi: true,
            strict: false,
          },
        },
      }];

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: DEFAULT_SPREADSHEET_ID,
        resource: { requests },
      });
      return {
        content: [{ type: "text", text: `Success! Dropdown validation rules applied to column index ${colIndex}.` }],
      };
    }

    // 9. format_google_sheet
    if (toolName === "format_google_sheet") {
      const fontFamily = args.fontFamily;
      const sheetId = args.sheetId || 0;
      const startRowIndex = args.startRowIndex || 0;
      const endRowIndex = args.endRowIndex || 1000;
      const startColumnIndex = args.startColumnIndex || 0;
      const endColumnIndex = args.endColumnIndex || 26;

      const requests = [{
        repeatCell: {
          range: { sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex },
          cell: { userEnteredFormat: { textFormat: { fontFamily } } },
          fields: "userEnteredFormat.textFormat.fontFamily",
        },
      }];

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: DEFAULT_SPREADSHEET_ID,
        resource: { requests },
      });
      return {
        content: [{ type: "text", text: `Success! Formatting applied to sheet.` }],
      };
    }

    // 10. share_spreadsheet
    if (toolName === "share_spreadsheet") {
      const spreadsheetId = args.spreadsheet_id || DEFAULT_SPREADSHEET_ID;
      const recipients = args.recipients;
      const sendNotification = args.send_notification !== false;

      const successes = [];
      const failures = [];

      for (const r of recipients) {
        try {
          await drive.permissions.create({
            fileId: spreadsheetId,
            sendNotificationEmail: sendNotification,
            resource: {
              role: r.role,
              type: "user",
              emailAddress: r.email_address,
            },
          });
          successes.push({ email: r.email_address, role: r.role });
        } catch (e) {
          failures.push({ email: r.email_address, error: e.message });
        }
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: successes,
            failed: failures,
          }, null, 2),
        }],
      };
    }

    throw new Error(`Tool '${toolName}' not found`);
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${error.message}` }],
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Google Sheets MCP Server running on stdio");
}

run().catch(console.error);
