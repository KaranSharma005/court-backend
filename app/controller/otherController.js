import TemplateModel from "../models/template.js";
import Signature from "../models/signatures.js";
import { getIO } from "../config/socket.js";
import { status, signStatus } from "../constants/index.js";
import PizZip from "pizzip";  
import Docxtemplater from "docxtemplater";
import convertpdf from "libreoffice-convert";
import ImageModule from "docxtemplater-image-module-free";
import fs from "fs";
import path from "path";
export const cloneTemplate = async (req, res, next) => {
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
      signCount : 0,
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
};

export const sendForSign = async (req, res, next) => {
  try {
    const templateID = req?.params?.templateID;
    const userIdToSend = req?.params?.id;

    const template = await TemplateModel.findOne({ id: templateID }).select(
      "data signStatus"
    );
    if (template?.signStatus != 0 && template?.data?.length == 0) {
      return res.send(403).json({ msg: "Unauthorized request" });
    }

    const result = await TemplateModel.findOneAndUpdate(
      { id: templateID },
      { assignedTo: userIdToSend, signStatus: signStatus.readForSign },
      { new: true }
    );
    await TemplateModel.updateOne(
      { id: templateID },
      { $set: { "data.$[].signStatus": signStatus.readForSign } }
    );
    const io = getIO();
    io.to(userIdToSend).emit("signature-request", result);
    return res.json({ msg: "Sent successfully" });
  } catch (error) {
    next(error);
  }
};


export const delegateRequest = async (req, res, next) => {
  try {
    const templateID = req?.params?.tempId;
    const updatedTemplate = await TemplateModel.findOneAndUpdate(
      { id: templateID, signStatus: { $ne: signStatus.rejected } }, 
      { signStatus: signStatus.delegated },{ new: true }
    );
    if (!updatedTemplate) {
      return res.status(400).json({ msg: "Cannot delegate. Already rejected or template not found." });
    }
    return res.json({ msg: "Delegated Successfully" });
  } catch (error) {
    next(error);
  }
}

export const signDocuments = async (req, res, next) => {
  try {
    const tempId = req?.params?.tempId;
    const selectedSign = req?.body?.url;
    const userId = req?.session?.userId;
    const signId = req?.params?.id;

    if (!tempId || !selectedSign) {
      return res.status(403).json({ msg: "Unauthorized access" });
    }

    const templateDoc = await TemplateModel.findOne({ id: tempId });
    const createdBy = templateDoc?.createdBy.toString();
    if (!templateDoc) {
      return res.status(404).json({ error: "Template not found" });
    }

    const templatePath = templateDoc?.url;
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: "Template file not found" });
    }
    const signaturePath = path.resolve(
      selectedSign.replace("http://localhost:3000/signature","app/public/signatures/")
    );
    if (!fs.existsSync(signaturePath)) {
      return res.status(404).json({ error: "Signature image not found", path: signaturePath });
    }

    const fileContent = fs.readFileSync(templatePath, "binary");
    const signedRecords = [];
    const io = getIO();
    io.to(userId).emit("processing-sign", tempId);
    io.to(createdBy).emit("processing-sign", tempId);
    for (const record of templateDoc.data) {
      try {
        if (record?.signStatus == signStatus.rejected) continue;
        const recordData = record.data instanceof Map ? Object.fromEntries(record.data.entries()) : record.data;
        recordData["image:signature"] = signaturePath;

        const zip = new PizZip(fileContent);
        const imageModule = new ImageModule({
          centered: false,
          getImage: (tag) => fs.readFileSync(tag),
          getSize: () => [150, 50],
        });

        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          modules: [imageModule],
        });

        doc.render(recordData);
        const buffer = doc.getZip().generate({ type: "nodebuffer" });

        const timestamp = Date.now();
        const docxPath = path.resolve(process.cwd(),"app/public/signed",`${timestamp}_signed.docx`);

        fs.writeFileSync(docxPath, buffer);
        const docxBuf = fs.readFileSync(docxPath);
        const pdfBuf = await new Promise((resolve, reject) => {
          convertpdf.convert(docxBuf, ".pdf", undefined, (err, done) => {
            if (err) reject(err);
            else resolve(done);
          });
        });
        const finalPdfPath = docxPath.replace(".docx", ".pdf");
        fs.writeFileSync(finalPdfPath, pdfBuf);

        record.url = `${timestamp}_signed.pdf`;
        record.signStatus = 5;
        record.signedDate = new Date();

        signedRecords.push({
          recordId: record.id,
          finalPdfPath,
        });
      } catch (recordError) {
        console.log(`Failed to sign record ${record.id}:`, recordError.message);
      }
      templateDoc.signStatus = signStatus.inProcess;
      templateDoc.signCount = templateDoc.signCount + 1;
      await templateDoc.save();
      io.to(userId).emit("sign-count", tempId);
      io.to(createdBy).emit("sign-count", tempId);
    }
    templateDoc.signedBy = userId;
    templateDoc.signatureId = signId;
    templateDoc.signStatus = signStatus.Signed;
    await templateDoc.save();
    io.to(userId).emit("sign-complete", tempId);
    io.to(createdBy).emit("sign-complete", tempId);
    return res.json({ msg: "Signed successfully" });
  } catch (error) {
    next(error);
  }
}