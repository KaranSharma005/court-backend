import { Router } from "express";
import upload from "../../middleware/uploaddata.js";
import excelUpload from "../../middleware/excelUpload.js";
import TemplateModel from "../../models/template.js";
import { status, signStatus } from "../../constants/index.js";
import { extractFields } from "../../utilities/getWordPlaceholder.js";
import multer from "multer";
import { convertDocToPdf } from "../../utilities/preview.js";
const router = Router();

router.post(
  "/addTemplate",
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
      const fields = extractFields(file.path);      //function

      const templateVariables = fields.map((field) =>{
        const isExcluded = field.toLowerCase() === "signature" || field.toLowerCase() === "rq code";
        return{
          name : field,
          required : !isExcluded,
          showOnExcel : !isExcluded
        }
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
    } 
    catch (error) {
      next(error);
    }
  }
);

router.get("/getAll", async (req, res) => {
  try {
    const user = req?.session?.userId;
    const templatesData = await TemplateModel.find({
      createdBy: user,
      status: status.active,
    });
    return res.json({ templatesData });
  } catch (error) {
    next(error);
  }
});

router.get(`/preview/:id`, async (req, res, next) => {
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

router.delete("/delete/:id", async (req, res) => {
  try {
    const user = req?.session?.userId;
    const id = req?.params?.id;
    
    await TemplateModel.updateOne(
      {id : id},
      { status: status.deleted },
      { new: true }
    );
    const templatesData = await TemplateModel.find({
      createdBy: user,
      status: status.active,
    });
    return res.json({ templatesData });
  } catch (error) {
    next(error);
  }
});

router.post("/clone/:id", async (req, res, next) => {
  try {
    const id = req?.params?.id;
    const user = req?.session?.userId;

    const template = await TemplateModel.findOne({id});
    
    const newTemplate = new TemplateModel({
      templateName: template.templateName,
      description : template.description,
      url: template.url,
      status: status.active,
      signStatus: signStatus.unsigned,
      createdBy: user,
      updatedBy: user,
      templateVariables : template.templateVariables,
    });
    await newTemplate.save();
    const templatesData = await TemplateModel.find({
      createdBy: user,
      status: status.active,
    });
    return res.json({templatesData});
  } catch (error) {
    next(error);
  }
});

router.post("/addExcel",excelUpload.single("excelFile"), async (req, res, next) => {
  try{

  }
  catch (error) {
    next(error);
  }
})

export default router;
