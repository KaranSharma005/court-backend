import TemplateModel from "../models/template.js";
import { status, signStatus } from "../constants/index.js";
import { convertDocToPdf } from "../utilities/preview.js";
import { docPreview } from "../utilities/preview.js";
import mongoose from "mongoose";
import Signature from "../models/signatures.js";

export const getAll = async (req, res, next) => {
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
};

export const templatePreview = async (req, res, next) => {
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
};

export const documentPreview = async (req, res, next) => {
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
};

export const getFields = async (req, res, next) => {
  try {
    const templateId = req?.params?.id;
    const templateVar = await TemplateModel.findOne({ id: templateId }).select(
      "templateVariables"
    );
    const temp = await TemplateModel.findOne({ id: templateId }).select(
      "templateName assignedTo"
    );
    const assignedToExists = temp?.assignedTo ? true : false;
    const name = temp?.templateName;

    return res.json({ templateVar, name, assignedToExists });
  } catch (error) {
    next(error);
  }
};

export const getDocuments = async (req, res, next) => {
  try {
    const id = req?.params?.id;

    const allExcelFields = await TemplateModel.find({
      id: new mongoose.Types.ObjectId(id),
    }).select("data status");

    const finalOutput = allExcelFields[0]?.data;
    const templateDoc = await TemplateModel.findOne({ id: id }).select(
      "assignedTo"
    );
    const isDispatched = !!templateDoc?.assignedTo;

    res.json({ finalOutput, isDispatched });
  } catch (error) {
    next(error);
  }
};

export const getRequests = async (req, res, next) => {
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
}

export const signedPreview = async (req, res, next) => {
  try {
    const templateId = req?.params?.templateID;
    const docId = req?.params?.id;
    const template = await TemplateModel.findOne({ id: templateId },{ data: 1 });
    const doc = template?.data?.find((ele) => ele.id == docId);
    const filePath = path.join(process.cwd(),"app", "public", "signed", doc?.url);
    
    const fileBuffer = await fs.readFileSync(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline'); 
    res.send(fileBuffer);
  } catch (error) {
    next(error);
  }
}

export const getSignatures = async (req, res, next) => {
  try {
    const user = req?.session?.userId;
    const allURL = await Signature.find({createdBy: user,status: status.active,}).select("url");
    return res.json({ allURL });
  } catch (error) {
    next(error);
  }
}

export const getAllSign = async (req, res, next) => {
  try {
    const userId = req?.session?.userId;
    const allSignature = await Signature.find({
      userId,
      status: status.active,
    }).select("url id -_id");
    return res.json({ allSignature });
  } catch (error) {
    next(error);
  }
}