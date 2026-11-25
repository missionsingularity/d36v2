import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { mapGrievanceRecord, mapOfficeRecord, mapPensionRecord } from "./import-mapping.ts";

type RecordData = Record<string, unknown>;
const projectRoot = process.cwd();
nextEnv.loadEnvConfig(projectRoot);
const fixtureRoot = path.join(projectRoot, "Singularity_D36V2_Implementation", "fixtures");
const sourceRoot = path.join(projectRoot, "Singularity_D36V2_Implementation", "source-records");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase: any = null;

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(fixtureRoot, name), "utf8")) as T;
}
function hash(data: Uint8Array) { return createHash("sha256").update(data).digest("hex"); }
function stableUuid(value: string) {
  const bytes = Buffer.from(createHash("sha256").update(`singularity:${value}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
async function upsert(table: string, rows: RecordData[], onConflict = "id") {
  if (!supabase) throw new Error("Supabase import client has not been initialized.");
  if (!rows.length) return;
  for (let start = 0; start < rows.length; start += 100) {
    const { error } = await supabase.from(table).upsert(rows.slice(start, start + 100), { onConflict, ignoreDuplicates: true });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function main() {
  const [people, offices, pensions, grievances, audits, knowledge, manifest] = await Promise.all([
    readJson<RecordData[]>("people.json"), readJson<RecordData[]>("offices.json"), readJson<RecordData[]>("pensions.json"),
    readJson<RecordData[]>("grievances.json"), readJson<RecordData[]>("audit_events.json"), readJson<RecordData[]>("knowledge_changes.json"),
    readJson<RecordData[]>("source_manifest.json"),
  ]);
  const unresolved = pensions.filter((row) => row.unresolved === true).length;
  const headOfOffice = pensions.filter((row) => row.stage === "head_of_office").length;
  if (pensions.length !== 186 || unresolved !== 41 || headOfOffice !== 23 || people.length !== 15 || audits.length !== 47 || manifest.length !== 18) {
    throw new Error(`Fixture count check failed (pensions=${pensions.length}, unresolved=${unresolved}, headOfOffice=${headOfOffice}, people=${people.length}, audit=${audits.length}, sources=${manifest.length}).`);
  }
  for (const item of manifest) {
    const sourcePath = String(item.path).replace(/^source-records[\\/]/, "");
    const digest = hash(await readFile(path.join(sourceRoot, sourcePath)));
    if (digest !== item.sha256) throw new Error(`Source hash mismatch for ${item.id}; refusing to import altered source data.`);
  }
  if (process.argv.includes("--check")) {
    console.log(JSON.stringify({ validated: { people: people.length, offices: offices.length, pensions: pensions.length, unresolved, head_of_office: headOfOffice, grievances: grievances.length, audit_events: audits.length, knowledge_changes: knowledge.length, sources: manifest.length }, source_hashes: "all 18 verified", mode: "fixture check only; no network or database writes" }, null, 2));
    return;
  }
  if (!url || !serviceKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the importer environment.");
  supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const departmentId = "ASSAM_PENSION_PUBLIC_GRIEVANCES";
  const { error: departmentError } = await supabase.from("departments").upsert({ id: departmentId, name: "Pension & Public Grievances, Assam", classification: "training" }, { onConflict: "id", ignoreDuplicates: true });
  if (departmentError) throw new Error(`departments: ${departmentError.message}`);
  await upsert("offices", offices.map((office) => mapOfficeRecord(office, departmentId)));
  await upsert("employees", people.map((person) => ({ ...person, classification: "training", attributes: person })));
  await upsert("responsibilities", people.map((person) => ({ employee_id: person.id, description: String(person.designation ?? person.role), source: "Supplied officer profile", classification: "training" })), "employee_id,description");

  const pensionerIds = new Map(pensions.map((record) => [String(record.id), stableUuid(String(record.id))]));
  await upsert("pensioners", pensions.map((record) => ({ id: pensionerIds.get(String(record.id)), name: record.pensioner_name, district: record.district, office_id: record.office_id, classification: "training" })));
  await upsert("pension_cases", pensions.map((record) => mapPensionRecord(record, String(pensionerIds.get(String(record.id))))));
  await upsert("grievances", grievances.map(mapGrievanceRecord));
  await upsert("audit_events", audits.map((record) => ({ ...record, timestamp: record.timestamp, payload: record, classification: "training" })));
  await upsert("knowledge_changes", knowledge.map((record) => ({
    id: record.id, source_id: record.source_id, requester_id: record.requester_id, reviewer_id: record.reviewer_id,
    state: record.state, authority_verified: record.authority_verified, signature_verified: record.signature_verified,
    effective_date_verified: record.effective_date_verified, rule_compatibility_verified: record.rule_compatibility_verified,
    publication_approved: record.publication_approved, payload: record, classification: "training",
  })));

  for (const item of manifest) {
    const sourcePath = String(item.path).replace(/^source-records[\\/]/, "");
    const bytes = await readFile(path.join(sourceRoot, sourcePath));
    const digest = hash(bytes);
    if (digest !== item.sha256) throw new Error(`Source hash mismatch for ${item.id}; refusing to upload altered original.`);
    const storagePath = `${item.id}/v${item.version}.md`;
    const { error: uploadError } = await supabase.storage.from("singularity-documents").upload(storagePath, bytes, { contentType: "text/markdown; charset=utf-8", upsert: false });
    if (uploadError) {
      const existing = await supabase.storage.from("singularity-documents").download(storagePath);
      if (existing.error || hash(new Uint8Array(await existing.data.arrayBuffer())) !== digest) throw new Error(`Storage upload/verification failed for ${item.id}: ${uploadError.message}`);
    }
    const { error: docError } = await supabase.from("documents").upsert({
      id: item.id, title: item.title, current_version: item.version, case_id: item.proposal_id, classification: "training",
      storage_path: storagePath, source_hash: digest, source_location: item.logical_location, attributes: { anchor: item.anchor, logical_location: item.logical_location },
    }, { onConflict: "id", ignoreDuplicates: true });
    if (docError) throw new Error(`documents ${item.id}: ${docError.message}`);
    await upsert("document_versions", [{ document_id: item.id, version: item.version, storage_path: storagePath, sha256: digest, immutable: true }], "document_id,version");
    await upsert("document_passages", [{ document_id: item.id, version: item.version, section: `${item.logical_location} · ${item.anchor}`, passage: item.passage, classification: "training" }], "document_id,version,section");
  }

  const relationships: RecordData[] = [];
  for (const person of people) {
    relationships.push({ subject_type: "employee", subject_id: person.id, relationship: "belongs_to", object_type: "office", object_id: person.office_id, classification: "training" });
    if (person.manager_id) relationships.push({ subject_type: "employee", subject_id: person.id, relationship: "reports_to", object_type: "employee", object_id: person.manager_id, classification: "training" });
  }
  for (const record of pensions) {
    relationships.push({ subject_type: "pensioner", subject_id: String(pensionerIds.get(String(record.id))), relationship: "has_case", object_type: "case", object_id: record.id, classification: "training" });
    if (record.owner_id) relationships.push({ subject_type: "employee", subject_id: record.owner_id, relationship: "assigned_case", object_type: "case", object_id: record.id, classification: "training" });
  }
  for (const record of grievances) relationships.push({ subject_type: "case", subject_id: String(record.proposal_id), relationship: "relates_to", object_type: "grievance", object_id: String(record.id), classification: "training" });
  await upsert("ontology_relationships", relationships, "subject_type,subject_id,relationship,object_type,object_id");

  console.log(JSON.stringify({ imported: { people: people.length, offices: offices.length, pensions: pensions.length, grievances: grievances.length, audit_events: audits.length, knowledge_changes: knowledge.length, sources: manifest.length }, originals: "SHA-256 verified before private storage upload", mode: "insert-only; existing records preserved" }, null, 2));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Fixture import failed."); process.exitCode = 1; });
