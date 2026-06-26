import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDatabaseUrl,
  buildPackFilename,
  generateSecret,
  isDatabaseUrl,
  isDirectoryEmpty,
  patchEnvContent,
} from "./helpers.js";

describe("generateSecret", () => {
  it("returns a non-empty string", () => {
    expect(generateSecret().length).toBeGreaterThan(0);
  });

  it("returns a different value each call", () => {
    expect(generateSecret()).not.toBe(generateSecret());
  });

  it("produces at least 40 characters of output from 32 random bytes", () => {
    // base64url of 32 bytes = 43 chars (no padding)
    expect(generateSecret().length).toBeGreaterThanOrEqual(40);
  });
});

describe("isDatabaseUrl", () => {
  it("recognises a postgres URL", () => {
    expect(isDatabaseUrl("postgresql://user:pass@localhost:5432/db")).toBe(true);
  });

  it("recognises a postgres+ssl URL", () => {
    expect(isDatabaseUrl("postgres://host/db")).toBe(true);
  });

  it("returns false for a plain database name", () => {
    expect(isDatabaseUrl("my_database")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isDatabaseUrl("")).toBe(false);
  });
});

describe("buildDatabaseUrl", () => {
  it("builds a localhost postgres URL from a database name", () => {
    expect(buildDatabaseUrl("myapp")).toBe(
      "postgresql://postgres:postgres@localhost:5432/myapp",
    );
  });

  it("preserves the name verbatim", () => {
    const url = buildDatabaseUrl("my-cool-db");
    expect(url).toContain("my-cool-db");
  });
});

describe("patchEnvContent", () => {
  const sample = [
    "APP_NAME=template",
    "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/template",
    "BETTER_AUTH_SECRET=replace-with-32-byte-random-string",
    "ADMIN_SEED_EMAIL=admin@example.com",
    "ANTHROPIC_API_KEY=",
  ].join("\n");

  it("replaces a known key's value", () => {
    const result = patchEnvContent(sample, { APP_NAME: "myapp" });
    expect(result).toContain("APP_NAME=myapp");
    expect(result).not.toContain("APP_NAME=template");
  });

  it("replaces multiple keys at once", () => {
    const result = patchEnvContent(sample, {
      APP_NAME: "proj",
      ADMIN_SEED_EMAIL: "dev@proj.com",
    });
    expect(result).toContain("APP_NAME=proj");
    expect(result).toContain("ADMIN_SEED_EMAIL=dev@proj.com");
  });

  it("leaves unrelated lines untouched", () => {
    const result = patchEnvContent(sample, { APP_NAME: "x" });
    expect(result).toContain("DATABASE_URL=postgresql://postgres:postgres@localhost:5432/template");
  });

  it("handles setting a value on an empty-value line", () => {
    const result = patchEnvContent(sample, { ANTHROPIC_API_KEY: "sk-123" });
    expect(result).toContain("ANTHROPIC_API_KEY=sk-123");
  });

  it("does not replace a key that is not present", () => {
    const original = patchEnvContent(sample, { NONEXISTENT_KEY: "value" });
    expect(original).toBe(sample);
  });

  it("writes the additive auth options for an email-password project", () => {
    const authSample = [
      "AUTH_METHOD=email-password",
      "AUTH_ENABLE_MAGIC_LINK=false",
      "AUTH_ENABLE_ENTRA=false",
      "ENTRA_TENANT_ID=",
      "ENTRA_CLIENT_ID=",
      "ENTRA_CLIENT_SECRET=",
    ].join("\n");
    const result = patchEnvContent(authSample, {
      AUTH_ENABLE_MAGIC_LINK: "true",
      AUTH_ENABLE_ENTRA: "true",
      ENTRA_TENANT_ID: "tenant-123",
      ENTRA_CLIENT_ID: "client-123",
    });
    expect(result).toContain("AUTH_ENABLE_MAGIC_LINK=true");
    expect(result).toContain("AUTH_ENABLE_ENTRA=true");
    expect(result).toContain("ENTRA_TENANT_ID=tenant-123");
    expect(result).toContain("ENTRA_CLIENT_ID=client-123");
    expect(result).toContain("ENTRA_CLIENT_SECRET=");
  });
});

describe("buildPackFilename", () => {
  it("constructs a file: reference using the given package version", () => {
    const result = buildPackFilename("/tmp/packs", "rbrasier", "application", "1.0.0");
    expect(result).toBe("file:/tmp/packs/rbrasier-application-1.0.0.tgz");
  });

  it("does not use a different package's version", () => {
    const adapterVersion = "1.0.1";
    const applicationVersion = "1.0.0";
    const result = buildPackFilename("/tmp/packs", "rbrasier", "application", applicationVersion);
    expect(result).not.toContain(adapterVersion);
    expect(result).toContain(applicationVersion);
  });

  it("works for all framework package names", () => {
    for (const pkg of ["domain", "shared", "application", "adapters"]) {
      const result = buildPackFilename("/packs", "rbrasier", pkg, "2.3.4");
      expect(result).toBe(`file:/packs/rbrasier-${pkg}-2.3.4.tgz`);
    }
  });
});

describe("isDirectoryEmpty", () => {
  function makeTmpDir(): string {
    return mkdtempSync(join(tmpdir(), "create-test-"));
  }

  it("returns true for a truly empty directory", () => {
    const dir = makeTmpDir();
    try {
      expect(isDirectoryEmpty(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("returns true when only .DS_Store is present", () => {
    const dir = makeTmpDir();
    try {
      writeFileSync(join(dir, ".DS_Store"), "");
      expect(isDirectoryEmpty(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("returns true when only Thumbs.db is present", () => {
    const dir = makeTmpDir();
    try {
      writeFileSync(join(dir, "Thumbs.db"), "");
      expect(isDirectoryEmpty(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("returns false when a real file is present", () => {
    const dir = makeTmpDir();
    try {
      writeFileSync(join(dir, "package.json"), "{}");
      expect(isDirectoryEmpty(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("returns false when a real file and .DS_Store are both present", () => {
    const dir = makeTmpDir();
    try {
      writeFileSync(join(dir, ".DS_Store"), "");
      writeFileSync(join(dir, "package.json"), "{}");
      expect(isDirectoryEmpty(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
