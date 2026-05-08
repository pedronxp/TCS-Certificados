import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { convertDocxToPdfWithMicrosoftGraph } from "../src/lib/microsoft-graph";

const originalFetch = globalThis.fetch;
const originalTenantId = process.env.MICROSOFT_GRAPH_TENANT_ID;
const originalClientId = process.env.MICROSOFT_GRAPH_CLIENT_ID;
const originalClientSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET;
const originalDriveId = process.env.MICROSOFT_GRAPH_DRIVE_ID;
const originalUserId = process.env.MICROSOFT_GRAPH_USER_ID;
const originalFolderPath = process.env.MICROSOFT_GRAPH_FOLDER_PATH;
const originalApiBaseUrl = process.env.MICROSOFT_GRAPH_API_BASE_URL;
const originalTokenBaseUrl = process.env.MICROSOFT_GRAPH_TOKEN_BASE_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("MICROSOFT_GRAPH_TENANT_ID", originalTenantId);
  restoreEnv("MICROSOFT_GRAPH_CLIENT_ID", originalClientId);
  restoreEnv("MICROSOFT_GRAPH_CLIENT_SECRET", originalClientSecret);
  restoreEnv("MICROSOFT_GRAPH_DRIVE_ID", originalDriveId);
  restoreEnv("MICROSOFT_GRAPH_USER_ID", originalUserId);
  restoreEnv("MICROSOFT_GRAPH_FOLDER_PATH", originalFolderPath);
  restoreEnv("MICROSOFT_GRAPH_API_BASE_URL", originalApiBaseUrl);
  restoreEnv("MICROSOFT_GRAPH_TOKEN_BASE_URL", originalTokenBaseUrl);
});

test("skips Microsoft Graph when credentials are not configured", async () => {
  delete process.env.MICROSOFT_GRAPH_TENANT_ID;
  delete process.env.MICROSOFT_GRAPH_CLIENT_ID;
  delete process.env.MICROSOFT_GRAPH_CLIENT_SECRET;
  delete process.env.MICROSOFT_GRAPH_DRIVE_ID;
  delete process.env.MICROSOFT_GRAPH_USER_ID;

  const pdf = await convertDocxToPdfWithMicrosoftGraph(Buffer.from("docx"));

  assert.equal(pdf, null);
});

test("converts DOCX through Microsoft Graph upload and format flow", async () => {
  process.env.MICROSOFT_GRAPH_TENANT_ID = "tenant-1";
  process.env.MICROSOFT_GRAPH_CLIENT_ID = "client-1";
  process.env.MICROSOFT_GRAPH_CLIENT_SECRET = "secret-1";
  process.env.MICROSOFT_GRAPH_DRIVE_ID = "drive-1";
  process.env.MICROSOFT_GRAPH_FOLDER_PATH = "tmp/certificados";
  process.env.MICROSOFT_GRAPH_API_BASE_URL = "https://graph.example.test/v1.0";
  process.env.MICROSOFT_GRAPH_TOKEN_BASE_URL = "https://login.example.test";

  const calls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    calls.push(url);

    if (url === "https://login.example.test/tenant-1/oauth2/v2.0/token") {
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("Content-Type"), "application/x-www-form-urlencoded");
      assert.ok(String(init?.body).includes("scope=https%3A%2F%2Fgraph.microsoft.com%2F.default"));
      return jsonResponse({ access_token: "graph-token" });
    }

    if (url.startsWith("https://graph.example.test/v1.0/drives/drive-1/root:/tmp/certificados/tcs-certificados-")) {
      assert.equal(init?.method, "PUT");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer graph-token");
      assert.equal(new Headers(init?.headers).get("Content-Type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      assert.ok(url.endsWith(".docx:/content"));
      return jsonResponse({
        id: "item-1",
        name: "certificate.docx",
        parentReference: { driveId: "drive-1" },
      }, { status: 201 });
    }

    if (url === "https://graph.example.test/v1.0/drives/drive-1/items/item-1/content?format=pdf") {
      assert.equal(init?.method, "GET");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer graph-token");
      assert.equal(init?.redirect, "manual");
      return new Response(null, {
        status: 302,
        headers: { Location: "https://download.example.test/certificate.pdf" },
      });
    }

    if (url === "https://download.example.test/certificate.pdf") {
      return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    }

    if (url === "https://graph.example.test/v1.0/drives/drive-1/items/item-1") {
      assert.equal(init?.method, "DELETE");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer graph-token");
      return new Response(null, { status: 204 });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const pdf = await convertDocxToPdfWithMicrosoftGraph(Buffer.from("docx"));

  assert.deepEqual([...pdf ?? []], [0x25, 0x50, 0x44, 0x46]);
  assert.equal(calls.length, 5);
  assert.equal(calls[0], "https://login.example.test/tenant-1/oauth2/v2.0/token");
  assert.equal(calls[2], "https://graph.example.test/v1.0/drives/drive-1/items/item-1/content?format=pdf");
  assert.equal(calls[3], "https://download.example.test/certificate.pdf");
  assert.equal(calls[4], "https://graph.example.test/v1.0/drives/drive-1/items/item-1");
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
