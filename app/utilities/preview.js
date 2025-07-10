import libre from "libreoffice-convert";
import fs from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export const convertDocToPdf = async (inputPath) => {
  try {
    const docxBuf = fs.readFileSync(inputPath);
    console.log(inputPath);
    const pdfBuf = await new Promise((resolve, reject) => {
      libre.convert(docxBuf, ".pdf", undefined, (err, done) => {
        if (err) {
          console.error("LibreOffice conversion error:", err);
          return reject(err);
        }
        resolve(done);
      });
    });

    return pdfBuf;
  } catch (error) {
    console.error("Conversion failed:", error.message);
    throw error;
  }
};

export const docPreview = async (pdfFields, path) => {
  try {
    const dataObj = Object.fromEntries(pdfFields.entries());
    const content = fs.readFileSync(path, "binary");

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    try {
      doc.render(dataObj);
    } catch (err) {
      console.error("Template rendering error:", err);
      return res.status(500).send("Error filling template");
    }

    const filledBuffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    const pdfBuf = await new Promise((resolve, reject) => {
      libre.convert(filledBuffer, ".pdf", undefined, (err, done) => {
        if (err) {
          console.error("LibreOffice conversion error:", err);
          return reject(err);
        }
        resolve(done);
      });
    });

    return pdfBuf;
  } catch (error) {
    throw error;
  }
};
