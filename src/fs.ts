import path from "path";

import { promises as fs } from "fs";

async function ensureDirExists(dirPath: string) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      throw err;
    }
  }
}

async function writeFileWithDirs(filePath: string, data: any) {
  const dirPath = path.dirname(filePath);
  await ensureDirExists(dirPath);
  await fs.writeFile(filePath, data);
}

export const writeFile = (data: any, filePath = "data") => {
  writeFileWithDirs(filePath, JSON.stringify(data, null, 2))
    .then(() => {
      // console.log("File has been saved!");
    })
    .catch((err) => {
      console.error("Error writing file:", err);
    });
};

export const readJsonFile = async (filePath: string, default_info = {}) => {
  let json = default_info;

  try {
    const data = await fs.readFile(filePath, "utf8");
    json = JSON.parse(data);
  } catch (err) {
    console.error("Error reading or parsing file:", err);
  }
  return json;
};
