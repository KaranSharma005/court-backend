import TemplateModel from "../models/template.js";
import Signature from "../models/signatures.js";
import { getIO } from "../config/socket.js";
import { status, signStatus } from "../constants/index.js";
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