import { Router } from "express";
import upload from "../middleware/uploaddata.js";
import TemplateModel from "../models/template.js";
import { status, signStatus } from "../constants/index.js";
import { extractFields } from "../utilities/getWordPlaceholder.js";
import multer from "multer";

const router = Router();

router.post("/addTemplate",(req, res, next) => {
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

      const fileUrl = `/uploads/${file.path}`;
      const fields = extractFields(file.path);

      const templateVariables = fields.map((field) => ({
        name: field,
        required: false,
        showOnExcel: false,
      }));

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

router.get("/getAll", async (req,res) => {
  try{
    const user = req?.session?.userId;
    const templatesData = await TemplateModel.find({createdBy : user});
    console.log(templatesData);
    return res.json({templatesData});
  }
  catch(error){
    next(error);
  }
})

export default router;