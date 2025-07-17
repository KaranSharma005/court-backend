import TemplateModel from "../models/template.js";
import { status, signStatus } from "../constants/index.js";
import mongoose from "mongoose";
export const deleteTemplate = async (req, res) => {
  try {
    const user = req?.session?.userId;
    const id = req?.params?.id;

    const template = await TemplateModel.find({ id }).select("signStatus");
    if (template[0]?.signStatus != signStatus?.unsigned) {
      return res.status(403).json({ msg: "Unauthorized access" });
    }

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
};

export const deleteDocument = async (req, res, next) => {
  try {
    const templateID = req?.params?.id;
    const docId = req?.params?.docId;
    const template = await TemplateModel.findOne({ id: templateID }).select(
      "signStatus"
    );
    if (template?.signStatus != signStatus.unsigned) {
      return res.status(403).json({ msg: "No access to delete" });
    }

    const result = await TemplateModel.updateOne(
      { id: templateID },
      { $pull: { data: { id: docId } } }
    );

    const allExcelFields = await TemplateModel.find({
      id: new mongoose.Types.ObjectId(templateID),
    }).select("data status");
    const finalOutput = allExcelFields[0]?.data;
    return res.json({ finalOutput });
  } catch (error) {
    next(error);
  }
};

export const getRejectedDoc = async (req, res, next) => {
  try {
    const templateId = req?.params?.tempId;
    const template = await TemplateModel.find({ id: templateId }).select(
      "data"
    );
    const rejectedDoc = template[0]?.data?.filter(
      (doc) => doc.signStatus == signStatus.rejected
    );

    return res.json({ rejectedDoc });
  } catch (error) {
    next(error);
  }
};

export const deleteSignature = async (req, res, next) => {
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
};

export const rejectDoc = async (req, res, next) => {
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
};

export const rejectAllDoc = async (req, res, next) => {
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
      },
      { new: true }
    );
    return res.json({ msg: "All documents rejecteed" });
  } catch (error) {
    next(error);
  }
};
