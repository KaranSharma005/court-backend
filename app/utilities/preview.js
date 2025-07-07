import libre from "libreoffice-convert";
import fs from "fs";

export const convertDocToPdf = async (inputPath) => {
  try {
    const docxBuf = fs.readFileSync(inputPath);

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
