import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import * as timetabling from "../controllers/timetablingController.js";

// Rooms, lecturers, modules and the generated class timetable. Registry runs it;
// AppAdmin can act for an institution by passing institutionId, as with /registry.
const router = Router();
router.use(requireAuth, requireRole(["Registry", "AppAdmin"]));

const spreadsheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.originalname || "")) {
      cb(new Error("Upload an Excel (.xlsx or .xls) or CSV file"));
      return;
    }
    cb(null, true);
  },
});

const readSpreadsheet = (req: Request, res: Response, next: NextFunction) => {
  spreadsheet.single("file")(req, res, (error: unknown) => {
    if (error) {
      const tooBig = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
      res.status(400).json({ message: tooBig ? "The file is bigger than 10 MB. Split it into smaller files." : (error as Error).message || "Invalid upload" });
      return;
    }
    next();
  });
};

router.get("/import/template", timetabling.importTemplate);
router.post("/import", readSpreadsheet, timetabling.importData);

router.get("/rooms", timetabling.listRooms);
router.post("/rooms", timetabling.createRoom);
router.post("/rooms/generate", timetabling.generateRooms);
router.put("/rooms/:id", timetabling.updateRoom);
router.delete("/rooms/:id", timetabling.deleteRoom);

router.get("/lecturers", timetabling.listLecturers);
router.post("/lecturers", timetabling.createLecturer);
router.put("/lecturers/:id", timetabling.updateLecturer);
router.delete("/lecturers/:id", timetabling.deleteLecturer);

router.get("/modules", timetabling.listModules);
router.post("/modules", timetabling.createModule);
router.put("/modules/:id", timetabling.updateModule);
router.delete("/modules/:id", timetabling.deleteModule);
router.get("/modules/:id/students", timetabling.listModuleStudents);
router.post("/modules/:id/students", timetabling.addModuleStudents);
router.delete("/modules/:id/students/:studentId", timetabling.removeModuleStudent);

router.get("/runs", timetabling.listRuns);
router.post("/runs", timetabling.generateRun);
router.get("/runs/:id", timetabling.getRun);
router.post("/runs/:id/publish", timetabling.publishRun);
router.post("/runs/:id/sessions", timetabling.placeUnplaced);
router.put("/sessions/:id", timetabling.moveSession);

export default router;
