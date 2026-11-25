export type SourceRecord = Record<string, unknown>;

export function mapOfficeRecord(source: SourceRecord, departmentId: string) {
  const { id, name, location, parent_id, ...unknownFields } = source;
  return {
    id: String(id),
    name: String(name ?? ""),
    location: String(location ?? ""),
    parent_id: parent_id == null ? null : String(parent_id),
    department_id: departmentId,
    attributes: { ...unknownFields, classification: "training", source_record: source },
  };
}

export function mapPensionRecord(source: SourceRecord, pensionerId: string) {
  return {
    id: String(source.id),
    pensioner_id: pensionerId,
    owner_id: source.owner_id == null ? null : String(source.owner_id),
    office_id: String(source.office_id ?? ""),
    district: String(source.district ?? ""),
    department: String(source.department ?? ""),
    unresolved: source.unresolved == null ? false : Boolean(source.unresolved),
    stage: String(source.stage ?? ""),
    issue: String(source.issue ?? ""),
    late_objection: source.late_objection == null ? null : Boolean(source.late_objection),
    visible_before_retirement: source.visible_before_retirement == null ? null : Boolean(source.visible_before_retirement),
    payload: source,
    classification: "training",
    version: 1,
  };
}

export function mapGrievanceRecord(source: SourceRecord) {
  const disposalDate = typeof source.disposed === "string" ? source.disposed : null;
  return {
    id: String(source.id),
    case_id: source.proposal_id == null ? null : String(source.proposal_id),
    owner_id: source.owner_id == null ? null : String(source.owner_id),
    received: source.received ?? null,
    status: String(source.status ?? ""),
    disposed: disposalDate !== null || source.disposed === true,
    disposal_date: disposalDate,
    atr_date: source.atr_date ?? null,
    outcome_verified: source.outcome_verified == null ? false : Boolean(source.outcome_verified),
    payload: { ...source, source_record: source, disposal_date: disposalDate },
    classification: "training",
  };
}
