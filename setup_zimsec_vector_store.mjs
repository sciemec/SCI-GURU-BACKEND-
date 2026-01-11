import fs from "fs";
import path from "path";
import OpenAI from "openai";
import "dotenv/config";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function upsertEnv(key, value) {
  const envPath = path.resolve(process.cwd(), ".env");
  let txt = "";
  if (fs.existsSync(envPath)) txt = fs.readFileSync(envPath, "utf8");

  const lines = txt.split(/\r?\n/);
  let found = false;

  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) next.push(`${key}=${value}`);

  fs.writeFileSync(envPath, next.join("\n").trim() + "\n", "utf8");
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in .env");
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    // Vector Stores often require the assistants v2 beta header in some environments
    defaultHeaders: { "OpenAI-Beta": "assistants=v2" }
  });

  const docsDir = path.resolve(process.cwd(), "docs");
  if (!fs.existsSync(docsDir)) {
    throw new Error(`Missing docs folder: ${docsDir}`);
  }

  const pdfFiles = fs
    .readdirSync(docsDir)
    .filter((f) => f.toLowerCase().endsWith(".pdf"));

  if (pdfFiles.length === 0) {
    throw new Error("No PDFs found in /docs. Put your PDFs in sci-guru-backend/docs/");
  }

  console.log("📄 PDFs found in docs/:");
  for (const f of pdfFiles) console.log(" -", f);

  // 1) Create or reuse vector store
  let vectorStoreId = process.env.VECTOR_STORE_ID?.trim();
  if (!vectorStoreId) {
    const vs = await openai.vectorStores.create({ name: "Sci-Guru PDFs" });
    vectorStoreId = vs.id;
    console.log("\n✅ Created Vector Store:", vectorStoreId);
    upsertEnv("VECTOR_STORE_ID", vectorStoreId);
    console.log("✅ Saved VECTOR_STORE_ID into .env");
  } else {
    console.log("\n✅ Using existing Vector Store:", vectorStoreId);
  }

  // Manifest to avoid re-uploading the same PDFs every time
  const manifestPath = path.resolve(process.cwd(), ".vectorstore_manifest.json");
  let manifest = { vectorStoreId, files: {} };
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifest.vectorStoreId = vectorStoreId;
      manifest.files ??= {};
    } catch {
      manifest = { vectorStoreId, files: {} };
    }
  }

  // 2) Determine which PDFs are new/changed
  const toUpload = [];
  for (const filename of pdfFiles) {
    const fullPath = path.join(docsDir, filename);
    const st = fs.statSync(fullPath);
    const sig = `${st.size}-${st.mtimeMs}`;

    if (manifest.files[filename] && manifest.files[filename].sig === sig) {
      continue; // unchanged
    }
    toUpload.push({ filename, fullPath, sig });
  }

  if (toUpload.length === 0) {
    console.log("\n✅ No new/changed PDFs to upload. Vector store is already up to date.");
    return;
  }

  console.log(`\n⬆️ Uploading ${toUpload.length} PDF(s) as OpenAI Files...`);

  // 3) Upload PDFs as Files (purpose: assistants)
  const fileIds = [];
  for (const item of toUpload) {
    console.log("   Uploading:", item.filename);
    const created = await openai.files.create({
      file: fs.createReadStream(item.fullPath),
      purpose: "assistants"
    });
    fileIds.push(created.id);

    // Update manifest immediately
    manifest.files[item.filename] = { sig: item.sig, file_id: created.id };
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log("✅ Saved upload manifest:", path.basename(manifestPath));

  // 4) Add those file_ids to the vector store via a file batch
  console.log("\n🧠 Indexing PDFs into the Vector Store (file batch)...");
  const batch = await openai.vectorStores.fileBatches.create(vectorStoreId, {
    file_ids: fileIds
  });

  console.log("✅ File batch created:", batch.id, "status:", batch.status);

  // 5) Poll until complete
  let status = batch.status;
  while (status === "in_progress" || status === "queued") {
    await sleep(4000);
    const latest = await openai.vectorStores.fileBatches.retrieve(batch.id, {
      vector_store_id: vectorStoreId
    });
    status = latest.status;
    console.log("   ...status:", status);
  }

  if (status !== "completed") {
    throw new Error(`Batch ended with status: ${status}`);
  }

  console.log("\n🎉 DONE! Your PDFs are now in the Vector Store:", vectorStoreId);
}

main().catch((e) => {
  console.error("\n❌ Setup failed:", e?.message || e);
  process.exit(1);
});