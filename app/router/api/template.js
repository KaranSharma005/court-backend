import { Router } from "express";
import upload from "../../middleware/uploaddata.js";
import excelUpload from "../../middleware/excelUpload.js";
import TemplateModel from "../../models/template.js";
import { status, signStatus } from "../../constants/index.js";
import { checkLoginStatus } from "../../middleware/checkAuth.js";
import multer from "multer";
import mongoose from "mongoose";
import path from "path";
import ExcelJS from "exceljs";
import fs from 'fs';
import { addTemplate } from "../../controller/fileUploadController.js";
import { getAll, 
  templatePreview, 
  getFields, 
  getDocuments, 
  documentPreview, 
  getRequests, 
  signedPreview
} from '../../controller/detailController.js'
import { deleteDocument, deleteTemplate, getRejectedDoc } from "../../controller/deleteController.js";
import { cloneTemplate } from "../../controller/otherController.js";
const router = Router();
const __dirname = import.meta.dirname;
router.post("/addTemplate",checkLoginStatus,
  (req, res, next) => {
    upload.single("file")(req, res, function (err) {
      if(err instanceof multer.MulterError) {
        return res.status(400).json({ msg: "Upload failed", error: err.message });
      }else if (err) {
        return res.status(400).json({ msg: "Invalid file", error: err.message });
      }
      next();
    });
  },
  addTemplate
);

router.get("/getAll", checkLoginStatus, getAll);

router.get(`/preview/:id`, checkLoginStatus, templatePreview);

router.delete("/delete/:id", checkLoginStatus, deleteTemplate);

router.post("/clone/:id", checkLoginStatus, cloneTemplate);

router.post(
  "/addExcel/:id",checkLoginStatus,
  (req, res, next) => {
    excelUpload.single("excelFile")(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ msg: "Upload failed", error: err.message });
      } else if (err) {
        return res.status(400).json({ msg: "Invalid file", error: err.message });
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      const file = req?.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const templateId = req?.params?.id;
      const template = await TemplateModel.findOne({
        id: new mongoose.Types.ObjectId(templateId),
      });
      if (!template){
        return res.status(404).json({ error: "Template not found" });
      }
      if(template?.signStatus != signStatus?.unsigned){
        return res.status(403).json({error : "CAn't upload more data"});
      }
      const filePath = path.join(process.cwd(),"/app/public/excel",file.filename
      );
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const worksheet = workbook.getWorksheet(1);
      const keys = template.templateVariables.map((v) => v.name);
      const expectedLength = keys.length;

      const arrayOfRow = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        arrayOfRow.push(row.values);
      });
      const filteredRows = arrayOfRow.map((row) => {
        row.shift();
        return row.slice(0, expectedLength);
      });

      const formattedRows = filteredRows.map((row) => {
        const rowData = {};
        keys.forEach((key, i) => {
          rowData[key] = String(row[i] ?? "");
        });

        return {
          id: new mongoose.Types.ObjectId(),
          data: rowData,
          signStatus: signStatus.unsigned,
        };
      });

      const result = await TemplateModel.updateOne(
        { id: new mongoose.Types.ObjectId(templateId) },
        { $push: { data: { $each: formattedRows } } }
      );
      const allExcelFields = await TemplateModel.find({
        id: new mongoose.Types.ObjectId(templateId),
      }).select("data");
      const finalOutput = allExcelFields[0]?.data;
      res.json({ finalOutput });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/extractFields/:id", checkLoginStatus, getFields);

router.get("/getAll/:id", checkLoginStatus, getDocuments);

router.delete("/deleteDoc/:id/:docId",checkLoginStatus, deleteDocument);

router.get("/preview/:templateID/:id", checkLoginStatus, documentPreview);

router.get("/requests",checkLoginStatus, getRequests);

router.get("/rejected/:tempId",checkLoginStatus, getRejectedDoc);

router.get("/sign-preview/:templateID/:id",checkLoginStatus, signedPreview);
export default router;