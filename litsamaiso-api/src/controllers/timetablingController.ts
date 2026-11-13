import type { Request, Response } from "express";
import { scopedActor } from "./registryController.js";
import * as timetablingImport from "../services/timetablingImportService.js";
import * as timetabling from "../services/timetablingService.js";

const handle = (res: Response, action: () => Promise<unknown>) =>
  void (async () => {
    try {
      res.json({ data: await action() });
    } catch (error: any) {
      const known = Number(error?.statusCode) || (["ValidationError", "CastError"].includes(error?.name) ? 400 : 0);
      if (!known) console.error("Timetabling request failed:", error);
      res.status(known || 500).json({
        message: known ? error.message : "Timetabling request failed",
        ...(typeof error?.code === "string" ? { code: error.code } : {}),
      });
    }
  })();

const param = (req: Request, name: string) => req.params[name] as string;

export const listRooms = (req: Request, res: Response) => handle(res, () => timetabling.listRooms(scopedActor(req)));
export const createRoom = (req: Request, res: Response) => handle(res, () => timetabling.createRoom(scopedActor(req), req.body || {}));
export const generateRooms = (req: Request, res: Response) => handle(res, () => timetabling.generateRooms(scopedActor(req), req.body || {}));
export const updateRoom = (req: Request, res: Response) => handle(res, () => timetabling.updateRoom(scopedActor(req), param(req, "id"), req.body || {}));
export const deleteRoom = (req: Request, res: Response) => handle(res, () => timetabling.deleteRoom(scopedActor(req), param(req, "id")));

export const listLecturers = (req: Request, res: Response) => handle(res, () => timetabling.listLecturers(scopedActor(req)));
export const createLecturer = (req: Request, res: Response) => handle(res, () => timetabling.createLecturer(scopedActor(req), req.body || {}));
export const updateLecturer = (req: Request, res: Response) => handle(res, () => timetabling.updateLecturer(scopedActor(req), param(req, "id"), req.body || {}));
export const deleteLecturer = (req: Request, res: Response) => handle(res, () => timetabling.deleteLecturer(scopedActor(req), param(req, "id")));

export const listModules = (req: Request, res: Response) => handle(res, () => timetabling.listModules(scopedActor(req), req.query));
export const createModule = (req: Request, res: Response) => handle(res, () => timetabling.createModule(scopedActor(req), req.body || {}));
export const updateModule = (req: Request, res: Response) => handle(res, () => timetabling.updateModule(scopedActor(req), param(req, "id"), req.body || {}));
export const deleteModule = (req: Request, res: Response) => handle(res, () => timetabling.deleteModule(scopedActor(req), param(req, "id")));
export const listModuleStudents = (req: Request, res: Response) => handle(res, () => timetabling.listModuleStudents(scopedActor(req), param(req, "id")));
export const addModuleStudents = (req: Request, res: Response) => handle(res, () => timetabling.addModuleStudents(scopedActor(req), param(req, "id"), req.body || {}));
export const removeModuleStudent = (req: Request, res: Response) => handle(res, () => timetabling.removeModuleStudent(scopedActor(req), param(req, "id"), param(req, "studentId")));

export const listRuns = (req: Request, res: Response) => handle(res, () => timetabling.listRuns(scopedActor(req), req.query));
export const generateRun = (req: Request, res: Response) => handle(res, () => timetabling.generateRun(scopedActor(req), req.body || {}));
export const getRun = (req: Request, res: Response) => handle(res, () => timetabling.getRun(scopedActor(req), param(req, "id")));
export const publishRun = (req: Request, res: Response) => handle(res, () => timetabling.publishRun(scopedActor(req), param(req, "id")));
export const placeUnplaced = (req: Request, res: Response) => handle(res, () => timetabling.placeUnplaced(scopedActor(req), param(req, "id"), req.body || {}));
export const moveSession = (req: Request, res: Response) => handle(res, () => timetabling.moveSession(scopedActor(req), param(req, "id"), req.body || {}));

// Shows what a spreadsheet would change, or saves it when `apply` is set
export const importData = (req: Request, res: Response) =>
  handle(res, () => timetablingImport.importTimetablingData(scopedActor(req), (req as Request & { file?: Express.Multer.File }).file, req.body || {}));

export const importTemplate = (_req: Request, res: Response) => {
  res
    .setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .setHeader("Content-Disposition", 'attachment; filename="room-allocation-template.xlsx"')
    .send(timetablingImport.buildImportTemplate());
};
