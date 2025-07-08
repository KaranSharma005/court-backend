import { Router } from "express";
import multer from "multer";
import signatureUpload from "../../middleware/signatureUpload.js";
import Signature from "../../models/signatures.js";
import { status } from "../../constants/index.js";
import mongoose from 'mongoose';
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
      const allURL = await Signature.find({createdBy : user, status : status.active}).select("url");
      return res.json({ allURL });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/getAll", async (req, res, next) => {
  try {
    const user = req?.session?.userId;
    const allURL = await Signature.find({createdBy : user, status : status.active}).select("url");
    return res.json({allURL})
  } catch (error) {
    next(error);
  }
});

router.delete("/delete/:id", async (req, res, next) => {
  try{
    console.log(req?.params?.id);
    let id = req?.params?.id;
    let cleanId = id.replace(/^:/, '');
    id = new mongoose.Types.ObjectId(cleanId);
    const user = req?.session?.userId;
    console.log(id);
    
    await Signature.updateOne({_id : id}, {status : status.deleted}, {new : true});
    const allURL = await Signature.find({createdBy : user, status : status.active}).select("url");
    
    return res.json({allURL})
  }
  catch(error){
    next(error);
  }
})

export default router;
