import { Router } from "express";
import multer from "multer";
import signatureUpload from "../../middleware/signatureUpload.js";
import Signature from "../../models/signatures.js";
import { status } from "../../constants/index.js";
import { signStatus } from "../../constants/index.js";
import { checkLoginStatus } from "../../middleware/checkAuth.js";
import TemplateModel from "../../models/template.js";
import { getIO } from "../../config/socket.js";
import mongoose from "mongoose";
import PizZip from "pizzip";  
import Docxtemplater from "docxtemplater";
import convertpdf from "libreoffice-convert";
import ImageModule from "docxtemplater-image-module-free";
import fs from "fs";
import path from "path";

const router = Router();

router.post("/addSignature",(req, res, next) => {
    signatureUpload.single("signature")(req, res, function (err) {
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
  }
);

router.get("/getAll", async (req, res, next) => {
  try {
    const user = req?.session?.userId;
    const allURL = await Signature.find({createdBy: user,status: status.active,}).select("url");
    return res.json({ allURL });
  } catch (error) {
    next(error);
  }
});

router.delete("/delete/:id", async (req, res, next) => {
  try {
    let id = req?.params?.id;
    let cleanId = id.replace(/^:/, "");
    id = new mongoose.Types.ObjectId(cleanId);
    const user = req?.session?.userId;

    await Signature.updateOne({ _id: id },{ status: status.deleted },{ new: true });
    const allURL = await Signature.find({ createdBy: user,status: status.active,}).select("url");

    return res.json({ allURL });
  } catch (error) {
    next(error);
  }
});

router.post("/sendForSign/:templateID/:id",checkLoginStatus,async (req, res, next) => {
    try {
      const templateID = req?.params?.templateID;
      const userIdToSend = req?.params?.id;

      const template = await TemplateModel.findOne({ id: templateID }).select("data signStatus");
      if (template?.signStatus != 0 && template?.data?.length == 0) {
        return res.send(403).json({ msg: "Unauthorized request" });
      }

      const result = await TemplateModel.findOneAndUpdate(
        { id: templateID },{ assignedTo: userIdToSend, signStatus: signStatus.readForSign },{ new: true }
      );
      await TemplateModel.updateOne(
        { id: templateID },{ $set: { "data.$[].signStatus": signStatus.readForSign } }
      );
      const io = getIO();
      io.to(userIdToSend).emit("signature-request", result);
      return res.json({ msg: "Sent successfully" });
    } catch (error) {
      next(error);
    }
  }
);

router.delete("/reject/:tempId/:docId",checkLoginStatus,async (req, res, next) => {
    try {
      const templateID = req?.params?.tempId;
      const docId = req?.params?.docId;
      const reason = req?.body?.reason;
      if (req?.session?.role != 2) {
        return res.status(403).json({ msg: "Unauthorized access" });
      }

      const updatedTemplate = await TemplateModel.findOneAndUpdate(
        { id: templateID, "data.id": docId },
        {
          $set: {
            "data.$.signStatus": signStatus.rejected,
            "data.$.rejectionReason": reason,
          },
        },{ new: true }
      );
      return res.json({ msg: "Template Rejected" });
    } catch (error) {
      next(error);
    }
  }
);

router.delete("/rejectAll/:tempId",checkLoginStatus,async (req, res, next) => {
    try {
      const templateID = req?.params?.tempId;
      const reason = req?.body?.reason;
      if (req?.session?.role != 2) {
        return res.status(403).json({ msg: "Unauthorized access" });
      }

      const updatedTemplate = await TemplateModel.findOneAndUpdate(
        { id: templateID },
        {
          $set: {
            "data.$[].signStatus": signStatus.rejected,
            "data.$[].rejectionReason": reason,
            signStatus: signStatus.rejected,
          },
        },{ new: true }
      );
      return res.json({ msg: "All documents rejecteed" });
    } catch (error) {
      next(error);
    }
  }
);

router.patch("/delegate/:tempId", checkLoginStatus, async (req, res, next) => {
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
});

router.post("/sign/:tempId/:id", checkLoginStatus, async (req, res, next) => {
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
    let count = 0;
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
      await templateDoc.save();
      count++;
      io.to(userId).emit("sign-count", count);
      io.to(createdBy).emit("sign-count", count);
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
});

router.get("/getSignatures", checkLoginStatus, async (req, res, next) => {
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
});

export default router;
