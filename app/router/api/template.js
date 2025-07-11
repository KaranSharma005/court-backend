import { Router } from "express";
import upload from "../../middleware/uploaddata.js";
import excelUpload from "../../middleware/excelUpload.js";
import TemplateModel from "../../models/template.js";
import { status, signStatus } from "../../constants/index.js";
import { extractFields } from "../../utilities/getWordPlaceholder.js";
import { checkLoginStatus } from "../../middleware/checkAuth.js";
import { isOfficer, isReader } from "../../middleware/checkuser.js";
import multer from "multer";
import { convertDocToPdf } from "../../utilities/preview.js";
import { docPreview } from "../../utilities/preview.js";
import mongoose from "mongoose";
import path from "path";
import ExcelJS from "exceljs";
const router = Router();
const __dirname = import.meta.dirname;
router.post(
  "/addTemplate",
  checkLoginStatus,
  (req, res, next) => {
    upload.single("file")(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        return res
          .status(400)
          .json({ msg: "Upload failed", error: err.message });
      } else if (err) {
        return res
          .status(400)
          .json({ msg: "Invalid file", error: err.message });
      }

      next();
    });
  },
  async (req, res, next) => {
    try {
      const { title, description } = req.body;
      const file = req.file;

      if (!title || !description || !file) {
        return res
          .status(400)
          .json({ msg: "Title, description, and file are required." });
      }

      const fileUrl = `${file.path}`;
      const fields = extractFields(file.path); //function

      const templateVariables = fields.map((field) => {
        const isExcluded =
          field.toLowerCase() === "signature" ||
          field.toLowerCase() === "rq code";
        return {
          name: field,
          required: !isExcluded,
          showOnExcel: !isExcluded,
        };
      });

      const newTemplate = new TemplateModel({
        templateName: title,
        description,
        url: fileUrl,
        status: status.active,
        signStatus: signStatus.unsigned,
        createdBy: req?.session?.userId,
        updatedBy: req?.session?.userId,
        templateVariables,
      });

      await newTemplate.save();

      return res
        .status(201)
        .json({ msg: "Template saved successfully", template: newTemplate });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/getAll", checkLoginStatus, async (req, res) => {
  try {
    const user = req?.session?.userId;
    const templatesData = await TemplateModel.find({
      status: status.active,
      $or: [{ createdBy: user }, { assignedTo: user }],
    });
    return res.json({ templatesData });
  } catch (error) {
    next(error);
  }
});

router.get(`/preview/:id`, checkLoginStatus, async (req, res, next) => {
  try {
    const template = await TemplateModel.findOne({
      id: req?.params?.id,
    }).select("url");
    const pdfBuffer = await convertDocToPdf(template?.url);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=preview.pdf");
    return res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

router.delete("/delete/:id", checkLoginStatus, async (req, res) => {
  try {
    const user = req?.session?.userId;
    const id = req?.params?.id;

    await TemplateModel.updateOne(
      { id: id },
      { status: status.deleted },
      { new: true }
    );
    const templatesData = await TemplateModel.find({
      status: status.active,
      $or: [{ createdBy: user }, { assignedTo: user }],
    });
    return res.json({ templatesData });
  } catch (error) {
    next(error);
  }
});

router.post("/clone/:id", checkLoginStatus, async (req, res, next) => {
  try {
    const id = req?.params?.id;
    const user = req?.session?.userId;

    const template = await TemplateModel.findOne({ id });

    const newTemplate = new TemplateModel({
      templateName: template.templateName,
      description: template.description,
      url: template?.url,
      status: status?.active,
      signStatus: signStatus?.unsigned,
      createdBy: user,
      updatedBy: user,
      templateVariables: template.templateVariables,
    });
    await newTemplate.save();
    const templatesData = await TemplateModel.find({
      status: status.active,
      $or: [{ createdBy: user }, { assignedTo: user }],
    });
    return res.json({ templatesData });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/addExcel/:id",
  checkLoginStatus,
  (req, res, next) => {
    excelUpload.single("excelFile")(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        return res
          .status(400)
          .json({ msg: "Upload failed", error: err.message });
      } else if (err) {
        return res
          .status(400)
          .json({ msg: "Invalid file", error: err.message });
      }

      next();
    });
  },
  async (req, res, next) => {
    try {
      const file = req?.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const templateId = req?.params?.id;
      if (!mongoose.Types.ObjectId.isValid(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }

      const template = await TemplateModel.findOne({
        id: new mongoose.Types.ObjectId(templateId),
      });
      if (!template)
        return res.status(404).json({ error: "Template not found" });

      const filePath = path.join(
        process.cwd(),
        "/app/public/excel",
        file.filename
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
      const completeRows = arrayOfRow.filter(
        (row) => row.length - 1 === expectedLength
      );

      const rowsToSend = completeRows.map((row) => {
        row.shift();
        return row;
      });

      const formattedRows = rowsToSend.map((row) => {
        const rowData = {};
        keys.forEach((key, i) => {
          rowData[key] = String(row[i] ?? "");
        });

        return {
          id: new mongoose.Types.ObjectId(),
          data: rowData,
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

router.get("/extractFields/:id", checkLoginStatus, async (req, res, next) => {
  try {
    const templateId = req?.params?.id;
    const templateVar = await TemplateModel.findOne({
      id: templateId,
    }).select("templateVariables");

    const temp = await TemplateModel.findOne({
      id: templateId,
    }).select("templateName assignedTo");
    const assignedToExists = temp?.assignedTo ? true : false;
    const name = temp?.templateName;

    return res.json({ templateVar, name, assignedToExists });
  } catch (error) {
    next(error);
  }
});

router.get("/getAll/:id", checkLoginStatus, async (req, res, next) => {
  try {
    const id = req?.params?.id;
    const allExcelFields = await TemplateModel.find({
      id: new mongoose.Types.ObjectId(id),
    }).select("data status");
    const finalOutput = allExcelFields[0]?.data;

    const assignedDocs = await TemplateModel.find({
      assignedTo: { $exists: true, $ne: null },
    });
    let isDispatched = false;
    if (assignedDocs.length != 0) {
      isDispatched = true;
    }
    res.json({ finalOutput });
  } catch (error) {
    next(error);
  }
});

router.delete(
  "/deleteDoc/:id/:docId",
  checkLoginStatus,
  async (req, res, next) => {
    try {
      const templateID = req?.params?.id;
      const docId = req?.params?.docId;

      const result = await TemplateModel.updateOne(
        { id: templateID },
        {
          $pull: {
            data: { id: docId },
          },
        }
      );

      const allExcelFields = await TemplateModel.find({
        id: new mongoose.Types.ObjectId(templateID),
      }).select("data status");
      const finalOutput = allExcelFields[0]?.data;
      return res.json({ finalOutput });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/preview/:templateID/:id",
  checkLoginStatus,
  async (req, res, next) => {
    try {
      const templateId = req?.params?.templateID;
      const id = req?.params?.id;

      const result = await TemplateModel.findOne(
        { id: templateId, "data.id": id },
        { "data.$": 1 }
      ).select("url");
      const dataToFill = result.data[0].data;
      const path = result.url;

      const bufferData = await docPreview(dataToFill, path);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=offer_letter.pdf");
      res.send(bufferData);
    } catch (error) {
      next(error);
    }
  }
);

router.get("/requests", async (req, res, next) => {
  try {
    const user = req?.session?.userId;
    const requests = await TemplateModel.find({
      status: status.active,
      $or: [{ createdBy: user }, { assignedTo: user }],
    });
    return res.json({ requests });
  } catch (error) {
    next(error);
  }
});
export default router;
