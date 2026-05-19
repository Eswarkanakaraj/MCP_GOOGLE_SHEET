const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Parse .env manually
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
        const parts = line.split('=');
        if (parts.length >= 2) {
            env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        }
    }
});

const CLIENT_ID = env.client_id;
const CLIENT_SECRET = env.client_secret;
const REDIRECT_URI = env.redirect_uris || 'http://localhost';
const SPREADSHEET_ID = env.sheet_id || '1gCZhHSR-WcofTcaf9nbNYLURRmuEGXnj4BzDulHjWAs';

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

if (env.refresh_token && env.access_token) {
    oAuth2Client.setCredentials({
        access_token: env.access_token,
        refresh_token: env.refresh_token,
        token_type: 'Bearer'
    });
} else {
    console.error("Missing refresh_token or access_token in .env");
    process.exit(1);
}

const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });

const server = new Server({
  name: "google-sheets-mcp",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {}
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "update_google_sheet",
        description: "Updates a row in a Google Sheet.",
        inputSchema: {
          type: "object",
          properties: {
            range: {
              type: "string",
              description: "The A1 notation of the values to update. e.g., 'Sheet1!A2:C2'"
            },
            values: {
              type: "array",
              items: { type: "string" },
              description: "Array of string values to insert into the cells in the range. Example: ['100', 'Completed', 'Done']"
            }
          },
          required: ["range", "values"]
        }
      },
      {
        name: "format_google_sheet",
        description: "Updates formatting (e.g., font family) of cells in a Google Sheet.",
        inputSchema: {
          type: "object",
          properties: {
            fontFamily: {
              type: "string",
              description: "The font family name to apply. e.g., 'Times New Roman'"
            },
            sheetId: {
              type: "integer",
              description: "The ID of the sheet tab. Default is 0."
            },
            startRowIndex: {
              type: "integer",
              description: "Starting row index (0-based). Default is 0."
            },
            endRowIndex: {
              type: "integer",
              description: "Ending row index (exclusive). Default is 1000."
            },
            startColumnIndex: {
              type: "integer",
              description: "Starting column index. Default is 0."
            },
            endColumnIndex: {
              type: "integer",
              description: "Ending column index. Default is 26."
            }
          },
          required: ["fontFamily"]
        }
      },
      {
        name: "add_dropdown_validation",
        description: "Applies data validation dropdown rules to a specific column range in Google Sheets.",
        inputSchema: {
          type: "object",
          properties: {
            sheetId: {
              type: "integer",
              description: "The ID of the sheet tab. Default is 0."
            },
            startRowIndex: {
              type: "integer",
              description: "Starting row index (0-based). Default is 2 (Row 3)."
            },
            endRowIndex: {
              type: "integer",
              description: "Ending row index. Default is 1000."
            },
            columnIndex: {
              type: "integer",
              description: "The 0-based column index to apply validation to (e.g., 7 for Column H, 8 for Column I)."
            },
            options: {
              type: "array",
              items: { type: "string" },
              description: "Array of allowed string options. Example: ['Completed', 'Pending', 'In Progress']"
            }
          },
          required: ["columnIndex", "options"]
        }
      },
      {
        name: "remove_dropdown_validation",
        description: "Removes data validation rules from a specific column range in Google Sheets.",
        inputSchema: {
          type: "object",
          properties: {
            sheetId: {
              type: "integer",
              description: "Sheet ID. Default is 0."
            },
            startRowIndex: {
              type: "integer",
              description: "Starting row index (0-based). Default is 56 (Row 57)."
            },
            endRowIndex: {
              type: "integer",
              description: "Ending row index. Default is 1000."
            },
            columnIndex: {
              type: "integer",
              description: "Column index to remove validation from (e.g., 7 for H, 8 for I)."
            }
          },
          required: ["columnIndex"]
        }
      },
      {
        name: "create_sheet_tab",
        description: "Creates a new sheet tab inside the Google Spreadsheet.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "The title of the new sheet tab. e.g., 'Remarks Sheet 2'"
            }
          },
          required: ["title"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "update_google_sheet" || request.params.name === "format_google_sheet" || request.params.name === "add_dropdown_validation" || request.params.name === "remove_dropdown_validation" || request.params.name === "create_sheet_tab") {
    try {
      // Parse .env dynamically on every request
      const envPath = path.join(__dirname, '.env');
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const env = {};
      envContent.split('\n').forEach(line => {
          if (line.trim() && !line.startsWith('#')) {
              const parts = line.split('=');
              if (parts.length >= 2) {
                  env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
              }
          }
      });

      const CLIENT_ID = env.client_id;
      const CLIENT_SECRET = env.client_secret;
      const REDIRECT_URI = env.redirect_uris || 'http://localhost';
      const SPREADSHEET_ID = env.sheet_id || '1gCZhHSR-WcofTcaf9nbNYLURRmuEGXnj4BzDulHjWAs';

      const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
      if (env.refresh_token && env.access_token) {
          oAuth2Client.setCredentials({
              access_token: env.access_token,
              refresh_token: env.refresh_token,
              token_type: 'Bearer'
          });
      } else {
          throw new Error("Missing tokens in .env");
      }
      
      const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });

      if (request.params.name === "update_google_sheet") {
        const range = request.params.arguments.range;
        const valuesArray = request.params.arguments.values;
        
        const resource = {
          values: [valuesArray]
        };
        
        const result = await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: range,
          valueInputOption: 'USER_ENTERED',
          resource,
        });

        return {
          content: [{
            type: "text",
            text: `Success! ${result.data.updatedCells} cells updated in Google Sheets.`
          }]
        };
      }

      if (request.params.name === "format_google_sheet") {
        const fontFamily = request.params.arguments.fontFamily;
        const sheetId = request.params.arguments.sheetId || 0;
        const startRowIndex = request.params.arguments.startRowIndex || 0;
        const endRowIndex = request.params.arguments.endRowIndex || 1000;
        const startColumnIndex = request.params.arguments.startColumnIndex || 0;
        const endColumnIndex = request.params.arguments.endColumnIndex || 26;

        const requests = [
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: startRowIndex,
                endRowIndex: endRowIndex,
                startColumnIndex: startColumnIndex,
                endColumnIndex: endColumnIndex
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    fontFamily: fontFamily
                  }
                }
              },
              fields: "userEnteredFormat.textFormat.fontFamily"
            }
          }
        ];

        const result = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: { requests }
        });

        return {
          content: [{
            type: "text",
            text: `Success! Formatting applied to sheet.`
          }]
        };
      }

      if (request.params.name === "add_dropdown_validation") {
        const sheetId = request.params.arguments.sheetId || 0;
        const startRowIndex = request.params.arguments.startRowIndex || 2;
        const endRowIndex = request.params.arguments.endRowIndex || 1000;
        const colIndex = request.params.arguments.columnIndex;
        const options = request.params.arguments.options;

        const values = options.map(opt => ({ userEnteredValue: opt }));

        const requests = [
          {
            setDataValidation: {
              range: {
                sheetId: sheetId,
                startRowIndex: startRowIndex,
                endRowIndex: endRowIndex,
                startColumnIndex: colIndex,
                endColumnIndex: colIndex + 1
              },
              rule: {
                condition: {
                  type: "ONE_OF_LIST",
                  values: values
                },
                showCustomUi: true,
                strict: false
              }
            }
          }
        ];

        const result = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: { requests }
        });

        return {
          content: [{
            type: "text",
            text: `Success! Dropdown validation rules applied to column index ${colIndex}.`
          }]
        };
      }

      if (request.params.name === "remove_dropdown_validation") {
        const sheetId = request.params.arguments.sheetId || 0;
        const startRowIndex = request.params.arguments.startRowIndex || 56;
        const endRowIndex = request.params.arguments.endRowIndex || 1000;
        const colIndex = request.params.arguments.columnIndex;

        const requests = [
          {
            setDataValidation: {
              range: {
                sheetId: sheetId,
                startRowIndex: startRowIndex,
                endRowIndex: endRowIndex,
                startColumnIndex: colIndex,
                endColumnIndex: colIndex + 1
              }
            }
          }
        ];

        const result = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: { requests }
        });

        return {
          content: [{
            type: "text",
            text: `Success! Validation rules removed from column index ${colIndex}.`
          }]
        };
      }

      if (request.params.name === "create_sheet_tab") {
        const title = request.params.arguments.title;

        const requests = [
          {
            addSheet: {
              properties: {
                title: title
              }
            }
          }
        ];

        const result = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: { requests }
        });

        return {
          content: [{
            type: "text",
            text: `Success! Sheet tab '${title}' created successfully.`
          }]
        };
      }
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: `Error updating Google Sheets: ${error.message}`
        }]
      };
    }
  }
  
  throw new Error("Tool not found");
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Google Sheets MCP Server running on stdio");
}

run().catch(console.error);
