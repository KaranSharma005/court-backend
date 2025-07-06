import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from 'fs';

export function extractFields(path) {
  const content = fs.readFileSync(path, "binary");

  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  const text = doc.getFullText();

  const matches = [...text.matchAll(/\{(.*?)\}/g)];
  const fields = [...new Set(matches.map(m => m[1]))];

  console.log(fields);
  return fields;
}
