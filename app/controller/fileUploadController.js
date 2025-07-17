import TemplateModel from "../models/template.js";
import { status, signStatus } from "../constants/index.js";
import { extractFields } from "../utilities/getWordPlaceholder.js";
import Signature from "../models/signatures.js";

export const addTemplate = async (req, res, next) => {
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
      return { name: field, required: !isExcluded, showOnExcel: !isExcluded };
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
      signCount : 0,
    });
    await newTemplate.save();
    return res
      .status(201)
      .json({ msg: "Template saved successfully", template: newTemplate });
  } catch (error) {
    next(error);
  }
};

export const addSignature = async (req, res, next) => {
  try {
    const file = req?.file;
    const fileUrl = `${file.filename}`;

    const user = req?.session?.userId;
    const newSignature = new Signature({
      userId: user,
      url: fileUrl,
      status: status.active,
      createdBy: user,
      updatedBy: user,
    });
    await newSignature.save();
    const allURL = await Signature.find({
      createdBy: user,
      status: status.active,
    }).select("url");
    return res.json({ allURL });
  } catch (error) {
    next(error);
  }
};
