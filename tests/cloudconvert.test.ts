import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { convertDocxToPdfWithCloudConvert } from "../src/lib/cloudconvert";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.CLOUDCONVERT_API_KEY;
const originalApiBaseUrl = process.env.CLOUDCONVERT_API_BASE_URL;
const originalSyncApiBaseUrl = process.env.CLOUDCONVERT_SYNC_API_BASE_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("CLOUDCONVERT_API_KEY", originalApiKey);
  restoreEnv("CLOUDCONVERT_API_BASE_URL", originalApiBaseUrl);
  restoreEnv("CLOUDCONVERT_SYNC_API_BASE_URL", originalSyncApiBaseUrl);
});

test("skips CloudConvert when API key is not configured", async () => {
  delete process.env.CLOUDCONVERT_API_KEY;

  const pdf = await convertDocxToPdfWithCloudConvert(Buffer.from("docx"));

  assert.equal(pdf, null);
});

test("converts DOCX through CloudConvert job upload flow", async () => {
  process.env.CLOUDCONVERT_API_KEY = "test-key";
  process.env.CLOUDCONVERT_API_BASE_URL = "https://api.example.test/v2";
  process.env.CLOUDCONVERT_SYNC_API_BASE_URL = "https://sync.example.test/v2";

  const calls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    calls.push(url);

    if (url === "https://api.example.test/v2/jobs") {
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-key");
      return jsonResponse({
        data: {
          id: "job-1",
          status: "waiting",
          tasks: [
            {
              id: "task-upload",
              name: "import-docx",
              operation: "import/upload",
              status: "waiting",
              result: {
                form: {
                  url: "https://upload.example.test",
                  parameters: { signature: "abc" },
                },
              },
            },
          ],
        },
      });
    }

    if (url === "https://upload.example.test") {
      assert.equal(init?.method, "POST");
      assert.ok(init?.body instanceof FormData);
      return new Response(null, { status: 201 });
    }

    if (url === "https://sync.example.test/v2/jobs/job-1") {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-key");
      return jsonResponse({
        data: {
          id: "job-1",
          status: "finished",
          tasks: [
            {
              id: "task-export",
              name: "export-pdf",
              operation: "export/url",
              status: "finished",
              result: {
                files: [{ filename: "certificate.pdf", url: "https://download.example.test/certificate.pdf" }],
              },
            },
          ],
        },
      });
    }

    if (url === "https://download.example.test/certificate.pdf") {
      return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const pdf = await convertDocxToPdfWithCloudConvert(Buffer.from("docx"));

  assert.deepEqual([...pdf ?? []], [0x25, 0x50, 0x44, 0x46]);
  assert.deepEqual(calls, [
    "https://api.example.test/v2/jobs",
    "https://upload.example.test",
    "https://sync.example.test/v2/jobs/job-1",
    "https://download.example.test/certificate.pdf",
  ]);
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
