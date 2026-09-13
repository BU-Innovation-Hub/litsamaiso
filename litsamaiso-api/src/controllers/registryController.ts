import type { Request, Response } from "express";
import { addExceptionToRegistry, addRegistryStudent, applyRegistryImport, deleteRegistryException, deleteRegistryStudent, editRegistryException, editRegistryStudent, findStudentByNationalId, getRegistryDashboard, listRegistryExceptions, listRegistryStudents, reconcileException, reconcileRegistryImport, resolveRegistryRow, stageRegistryUpload, type RegistryUploadProgress } from "../services/registryService.js";

const actor = (req: Request): any => (req as any).user;
const scopedActor = (req: Request): any => {
  const current = actor(req);
  if (!current?._id) {
    throw new Error("Authenticated user id is missing");
  }

  const role = String((current.role && current.role.name) || current.role || "").toLowerCase();
  const requested = req.query.institutionId || req.body?.institutionId;

  // Keep the fields used by Registry services explicit. Spreading a hydrated
  // Mongoose document can omit getter-backed properties such as `_id`.
  return {
    _id: current._id,
    email: current.email,
    role: current.role,
    institution: role === "appadmin" && requested ? requested : current.institution,
  };
};
const handle = async (res: Response, action: () => Promise<unknown>) => { try { res.json({ data: await action() }); } catch (error: any) { const status = Number(error?.statusCode) === 409 ? 409 : 400; res.status(status).json({ message: error?.message || "Registry request failed" }); } };

const wantsStream = (req: Request) => req.query.stream === "1" || String(req.headers.accept || "").includes("application/x-ndjson");
const streamUpload = (req: Request, res: Response, kind: "students" | "financial") => {
  const file = (req as any).file;
  if (!file?.buffer) { res.status(400).json({ message: "Missing file" }); return; }
  if (!wantsStream(req)) { void handle(res, () => stageRegistryUpload({ buffer: file.buffer, filename: file.originalname, kind, actor: scopedActor(req) })); return; }
  const write = (event: Record<string, unknown>) => res.write(`${JSON.stringify(event)}\n`);
  res.status(200).setHeader("Content-Type", "application/x-ndjson").setHeader("Cache-Control", "no-cache").setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  write({ type: "started", processed: 0, total: 0, inserted: 0, skipped: 0, errors: 0, percent: 0, message: "Reading spreadsheet" });
  void stageRegistryUpload({ buffer: file.buffer, filename: file.originalname, kind, actor: scopedActor(req), onProgress: (progress: RegistryUploadProgress) => write({ type: "progress", ...progress }) })
    .then((result: any) => {
      const total = Number(result.rows?.length || 0);
      write({ type: "completed", processed: 0, total, inserted: 0, skipped: 0, errors: 0, percent: 25, message: "Spreadsheet staged; processing records", result });
      res.end();
    })
    .catch((error: any) => { write({ type: "error", processed: 0, total: 0, inserted: 0, skipped: 0, errors: 1, percent: 0, message: error?.message || "Registry upload failed" }); res.end(); });
};
export const uploadRegistryStudents = (req: Request, res: Response) => streamUpload(req, res, "students");
export const uploadRegistryFinancial = (req: Request, res: Response) => streamUpload(req, res, "financial");
export const dashboard = (req: Request, res: Response) => void handle(res, () => getRegistryDashboard(scopedActor(req)));
export const getImport = (req: Request, res: Response) => void handle(res, () => reconcileRegistryImport(req.params.id as string, scopedActor(req)));
export const resolveRow = (req: Request, res: Response) => void handle(res, () => resolveRegistryRow(req.params.id as string, Number(req.body?.rowNumber), req.body || {}, scopedActor(req)));
export const applyImport = (req: Request, res: Response) => {
  if (!wantsStream(req)) { void handle(res, () => applyRegistryImport(req.params.id as string, scopedActor(req))); return; }
  const write = (event: Record<string, unknown>) => res.write(`${JSON.stringify(event)}\n`);
  res.status(200).setHeader("Content-Type", "application/x-ndjson").setHeader("Cache-Control", "no-cache").setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  void applyRegistryImport(req.params.id as string, scopedActor(req), (progress) => write({ type: "progress", ...progress }))
    .then((result: any) => { write({ type: "completed", ...result, percent: 100, message: "Import completed", result }); res.end(); })
    .catch((error: any) => { write({ type: "error", percent: 0, message: error?.message || "Registry apply failed" }); res.end(); });
};
export const listStudents = (req: Request, res: Response) => void handle(res, () => listRegistryStudents(scopedActor(req), { search: String(req.query.search || ""), status: String(req.query.status || ""), borrower: String(req.query.borrower || ""), page: Number(req.query.page), limit: Number(req.query.limit) }));
export const addStudent = (req: Request, res: Response) => void handle(res, () => addRegistryStudent(scopedActor(req), req.body || {}));
export const editStudent = (req: Request, res: Response) => void handle(res, () => editRegistryStudent(scopedActor(req), req.params.id as string, req.body || {}));
export const deleteStudent = (req: Request, res: Response) => void handle(res, () => deleteRegistryStudent(scopedActor(req), req.params.id as string));
export const exceptions = (req: Request, res: Response) => void handle(res, () => listRegistryExceptions(scopedActor(req)));
export const editException = (req: Request, res: Response) => void handle(res, () => editRegistryException(scopedActor(req), req.params.importId as string, Number(req.params.rowNumber), req.body || {}, { autoReconcile: (req.body as any)?.autoReconcile !== false }));
export const reconcileExceptionRow = (req: Request, res: Response) => void handle(res, () => reconcileException(scopedActor(req), req.params.importId as string, Number(req.params.rowNumber)));
export const searchStudentByNationalId = (req: Request, res: Response) => void handle(res, () => findStudentByNationalId(scopedActor(req), req.params.nationalId as string));
export const deleteException = (req: Request, res: Response) => void handle(res, () => deleteRegistryException(scopedActor(req), req.params.importId as string, Number(req.params.rowNumber)));
export const addException = (req: Request, res: Response) => void handle(res, () => addExceptionToRegistry(scopedActor(req), req.params.importId as string, Number(req.params.rowNumber), req.body || {}));
