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
const router = Router();

router.post(
  "/addSignature",
  (req, res, next) => {
    signatureUpload.single("signature")(req, res, function (err) {
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
    const allURL = await Signature.find({
      createdBy: user,
      status: status.active,
    }).select("url");
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

    await Signature.updateOne(
      { _id: id },
      { status: status.deleted },
      { new: true }
    );
    const allURL = await Signature.find({
      createdBy: user,
      status: status.active,
    }).select("url");

    return res.json({ allURL });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/sendForSign/:templateID/:id",
  checkLoginStatus,
  async (req, res, next) => {
    try {
      const templateID = req?.params?.templateID;
      const userIdToSend = req?.params?.id;
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
  }
);

router.delete("/reject/:tempId/:docId", async (req, res, next) => {
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
      },
      { new: true }
    );

    return res.json({ msg: "Template Rejected" });
  } catch (error) {
    next(error);
  }
});

router.delete("/rejectAll/:tempId", async (req, res, next) => {
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
          signStatus : signStatus.rejected
        },
      },
      { new: true }
    );
    
    return res.json({msg : "All documents rejecteed"});
  } catch (error) {
    next(error);
  }
});

router.patch("/delegate/:tempId", async (req, res, next) =>{
  try{
    const templateID = req?.params?.tempId;
    const updatedTemplate = await TemplateModel.findOneAndUpdate(
      {id : templateID},
      {signStatus : signStatus.delegated},
      {new : true}
    )
    console.log(updatedTemplate);
    return res.json({msg : "Delegated Successfully"});
  } 
  catch(error){
    next(error);
  }
})

export default router;
