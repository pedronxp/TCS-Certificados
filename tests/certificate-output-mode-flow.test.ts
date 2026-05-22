import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { CertificateBatchStatus } from "@prisma/client";
import { handleAuthenticatedCertificateDownload } from "../src/app/api/certificates/[id]/download/[type]/route";
import { GET as publicDownload } from "../src/app/api/public/certificates/[codigo]/download/route";
import { processBatchJobChunk, startBatchJob } from "../src/lib/batch-jobs";
import { deleteCertificateIssues, issueCertificate } from "../src/lib/certificate-service";
import { NON_EDITABLE_NATIVE_DOWNLOAD_ERROR } from "../src/lib/certificate-output-format";
import * as prismaModule from "../src/lib/prisma";

const { prisma } = prismaModule as {
  prisma: Record<string, Record<string, unknown>>;
};
const prismaStubs: Array<() => void> = [];

afterEach(() => {
  restorePrismaStubs();
  mock.restoreAll();
});

test("authenticated download route blocks native files for non-editable certificates", async () => {
  stubPrisma(prisma.certificateIssue, "findMany", async () => []);
  stubPrisma(prisma.certificateIssue, "findUnique", async () => certificateIssueForDownload("NON_EDITABLE", "DOCX"));

  const response = await handleAuthenticatedCertificateDownload(
    new Request("http://localhost/api/certificates/issue-1/download/docx"),
    { params: Promise.resolve({ id: "issue-1", type: "docx" }) },
    async () => ({ id: "admin-1", name: "Admin", email: "admin@example.com", role: "ADMIN" }),
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.code, "CERTIFICATE_NATIVE_DOWNLOAD_BLOCKED");
  assert.equal(body.error, NON_EDITABLE_NATIVE_DOWNLOAD_ERROR);
});

test("authenticated download route allows PDF for non-editable certificates", async () => {
  stubPrisma(prisma.certificateIssue, "findMany", async () => []);
  stubPrisma(prisma.certificateIssue, "findUnique", async () => certificateIssueForDownload("NON_EDITABLE", "PDF"));

  const response = await handleAuthenticatedCertificateDownload(
    new Request("http://localhost/api/certificates/issue-1/download/pdf"),
    { params: Promise.resolve({ id: "issue-1", type: "pdf" }) },
    async () => ({ id: "admin-1", name: "Admin", email: "admin@example.com", role: "ADMIN" }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
});

test("public download route applies the same native-file block for non-editable certificates", async () => {
  mockSuccessfulRateLimit();
  stubPrisma(prisma.certificateIssue, "findMany", async () => []);
  stubPrisma(prisma.certificateIssue, "findUnique", async () => certificateIssueForDownload("NON_EDITABLE", "DOCX"));

  const response = await publicDownload(
    new Request("http://localhost/api/public/certificates/TCS-BR-2026-0001/download?type=docx&documento=12345678900"),
    { params: Promise.resolve({ codigo: "TCS-BR-2026-0001" }) },
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.code, "CERTIFICATE_NATIVE_DOWNLOAD_BLOCKED");
  assert.equal(body.error, NON_EDITABLE_NATIVE_DOWNLOAD_ERROR);
});

test("public download route keeps PDF available for non-editable certificates", async () => {
  mockSuccessfulRateLimit();
  stubPrisma(prisma.certificateIssue, "findMany", async () => []);
  stubPrisma(prisma.certificateIssue, "findUnique", async () => certificateIssueForDownload("NON_EDITABLE", "PDF"));

  const response = await publicDownload(
    new Request("http://localhost/api/public/certificates/TCS-BR-2026-0001/download?type=pdf&documento=12345678900"),
    { params: Promise.resolve({ codigo: "TCS-BR-2026-0001" }) },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
});

test("issueCertificate persists editable by default and selected non-editable output mode", async () => {
  mockIssueCertificateDependencies();
  const createCalls: Array<Record<string, unknown>> = [];
  stubPrisma(prisma.certificateIssue, "create", async (input: unknown) => {
    createCalls.push(input as Record<string, unknown>);
    return { id: `issue-${createCalls.length}` };
  });

  await issueCertificate({
    templateId: "template-1",
    values: { nome: "Maria Silva" },
    issuedById: "admin-1",
    isTest: true,
  });
  await issueCertificate({
    templateId: "template-1",
    values: { nome: "Maria Silva" },
    issuedById: "admin-1",
    isTest: true,
    outputMode: "NON_EDITABLE",
  });

  assert.equal(readIssueCreateData(createCalls[0]).outputMode, "EDITABLE");
  assert.equal(readIssueCreateData(createCalls[1]).outputMode, "NON_EDITABLE");
});

test("startBatchJob persists selected output mode", async () => {
  let createInput: Record<string, unknown> | null = null;
  stubPrisma(prisma.certificateBatch, "create", async (input: unknown) => {
    createInput = input as Record<string, unknown>;
    return { id: "batch-1", total: 1, processed: 0, created: 0, errors: [], status: "RUNNING" };
  });

  await startBatchJob({
    templateId: "template-1",
    rows: [{ nome: "Maria Silva" }],
    issuedById: "admin-1",
    outputMode: "NON_EDITABLE",
  });

  assert.equal(readBatchCreateData(createInput).outputMode, "NON_EDITABLE");
});

test("batch processing applies the batch output mode to generated certificates", async () => {
  mockIssueCertificateDependencies();
  const issueCreates: Array<Record<string, unknown>> = [];
  stubPrisma(prisma.certificateIssue, "create", async (input: unknown) => {
    issueCreates.push(input as Record<string, unknown>);
    return { id: "issue-1" };
  });

  let batchFindFirstCalls = 0;
  stubPrisma(prisma.certificateBatch, "findFirst", async () => {
    batchFindFirstCalls += 1;
    if (batchFindFirstCalls === 1) {
      return {
        id: "batch-1",
        status: CertificateBatchStatus.RUNNING,
        total: 1,
        processed: 0,
        errors: [],
        values: { version: 1, lineOffset: 1, rows: [{ nome: "Maria Silva" }] },
        lockedAt: null,
        templateId: "template-1",
        createdById: "admin-1",
        isTest: true,
        outputMode: "NON_EDITABLE",
      };
    }

    return {
      id: "batch-1",
      status: CertificateBatchStatus.COMPLETED,
      total: 1,
      processed: 1,
      created: 1,
      errors: [],
      outputMode: "NON_EDITABLE",
      template: { name: "Modelo" },
    };
  });
  stubPrisma(prisma.certificateBatch, "updateMany", async () => ({ count: 1 }));
  stubPrisma(prisma.certificateBatch, "findUnique", async () => ({
    status: CertificateBatchStatus.RUNNING,
    total: 1,
    processed: 1,
    created: 1,
    errors: [],
    lockedAt: null,
  }));

  await processBatchJobChunk("batch-1", "admin-1");

  assert.equal(readIssueCreateData(issueCreates[0]).outputMode, "NON_EDITABLE");
});

test("deleteCertificateIssues removes selected issues and orphan recipients permanently", async () => {
  const deletedIssueIds: string[] = [];
  const deletedRecipientIds: string[] = [];
  stubPrisma(prisma.certificateIssue, "findMany", async () => [
    {
      id: "issue-1",
      recipientId: "recipient-1",
      files: [{ storagePath: null }],
    },
    {
      id: "issue-2",
      recipientId: "recipient-2",
      files: [{ storagePath: null }],
    },
  ]);
  stubPrisma(prisma, "$transaction", async (callback: unknown) => {
    assert.equal(typeof callback, "function");
    return (callback as (tx: unknown) => Promise<unknown>)({
      certificateIssue: {
        deleteMany: async (input: { where: { id: { in: string[] } } }) => {
          deletedIssueIds.push(...input.where.id.in);
          return { count: input.where.id.in.length };
        },
      },
      certificateRecipient: {
        deleteMany: async (input: { where: { id: { in: string[] } } }) => {
          deletedRecipientIds.push(...input.where.id.in);
          return { count: input.where.id.in.length };
        },
      },
    });
  });

  const deleted = await deleteCertificateIssues(["issue-1", "issue-2"]);

  assert.equal(deleted, 2);
  assert.deepEqual(deletedIssueIds, ["issue-1", "issue-2"]);
  assert.deepEqual(deletedRecipientIds, ["recipient-1", "recipient-2"]);
});

function certificateIssueForDownload(outputMode: "EDITABLE" | "NON_EDITABLE", type: "PDF" | "DOCX") {
  const content = type === "PDF" ? Buffer.from("%PDF-1.7\n") : Buffer.from("docx-content");

  return {
    id: "issue-1",
    verificationCode: "TCS-BR-2026-0001",
    values: { documento: "123.456.789-00" },
    status: "ISSUED",
    outputMode,
    deleteAt: null,
    issuedById: "admin-1",
    recipient: { name: "Maria Silva", document: "123.456.789-00" },
    template: {
      name: "Modelo",
      width: 1123,
      height: 794,
      background: null,
      layout: { elements: [] },
    },
    files: [
      {
        filename: type === "PDF" ? "certificado.pdf" : "certificado.docx",
        mimeType: type === "PDF"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content,
        storagePath: null,
      },
    ],
  };
}

function mockSuccessfulRateLimit() {
  stubPrisma(prisma.rateLimitAttempt, "deleteMany", async () => ({ count: 0 }));
  stubPrisma(prisma.rateLimitAttempt, "findUnique", async () => null);
  stubPrisma(prisma.rateLimitAttempt, "upsert", async () => ({
    count: 1,
    resetAt: new Date(Date.now() + 60_000),
  }));
}

function mockIssueCertificateDependencies() {
  stubPrisma(prisma.certificateTemplate, "findUnique", async () => ({
    id: "template-1",
    name: "Modelo",
    width: 1123,
    height: 794,
    background: null,
    layout: { elements: [] },
    variables: [{ key: "nome", label: "Nome", required: true }],
  }));
  stubPrisma(prisma.user, "findUnique", async () => ({
    id: "admin-1",
    name: "Admin",
    email: "admin@example.com",
    role: "ADMIN",
  }));
}

function readIssueCreateData(input: Record<string, unknown>) {
  return input.data as Record<string, unknown>;
}

function readBatchCreateData(input: Record<string, unknown> | null) {
  assert.ok(input);
  return input.data as Record<string, unknown>;
}

function stubPrisma(delegate: Record<string, unknown>, method: string, implementation: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(delegate, method);
  Object.defineProperty(delegate, method, {
    value: implementation,
    writable: true,
    configurable: true,
  });
  prismaStubs.push(() => {
    if (descriptor) {
      Object.defineProperty(delegate, method, descriptor);
      return;
    }

    delete delegate[method];
  });
}

function restorePrismaStubs() {
  for (const restore of prismaStubs.splice(0).reverse()) {
    restore();
  }
}
