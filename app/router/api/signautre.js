import { Router } from "express";
import multer from "multer";
import signatureUpload from "../../middleware/signatureUpload.js";
import { signStatus } from "../../constants/index.js";
import { checkLoginStatus } from "../../middleware/checkAuth.js";
import TemplateModel from "../../models/template.js";
import { getIO } from "../../config/socket.js";
import PizZip from "pizzip";  
import Docxtemplater from "docxtemplater";
import convertpdf from "libreoffice-convert";
import ImageModule from "docxtemplater-image-module-free";
import fs from "fs";
import path from "path";
import { addSignature } from "../../controller/fileUploadController.js";
import { getSignatures, getAllSign} from '../../controller/detailController.js'
import { deleteSignature, rejectDoc, rejectAllDoc } from "../../controller/deleteController.js";
import { sendForSign, delegateRequest,signDocuments } from "../../controller/otherController.js";

const router = Router();

router.post("/addSignature",checkLoginStatus,(req, res, next) => {
    signatureUpload.single("signature")(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ msg: "Upload failed", error: err.message });
      } else if (err) {
        return res.status(400).json({ msg: "Invalid file", error: err.message });
      }
      next();
    });
  },
  addSignature
);

router.get("/getAll",checkLoginStatus, getSignatures);

router.delete("/delete/:id",checkLoginStatus, deleteSignature);

router.post("/sendForSign/:templateID/:id",checkLoginStatus, sendForSign);

router.delete("/reject/:tempId/:docId",checkLoginStatus, rejectDoc);

router.delete("/rejectAll/:tempId",checkLoginStatus, rejectAllDoc);

router.patch("/delegate/:tempId", checkLoginStatus, delegateRequest);

router.post("/sign/:tempId/:id", checkLoginStatus, signDocuments);

router.get("/getSignatures", checkLoginStatus, getAllSign);

export default router;
