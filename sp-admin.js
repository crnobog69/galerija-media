require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const { execSync } = require('child_process');
const readline = require('readline');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const downloadDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir);
}

// Utility function for interactive input
function getInput(promptText) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(promptText, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

// Измене у функцији uploadFile:
async function uploadFile() {
  // Питајте корисника за апсолутну путању или оставите празно за тренутни директоријум
  const dirPath = await getInput("Унесите путању за претрагу (оставите празно за тренутни директоријум): ");
  const searchDir = dirPath.trim() ? dirPath.trim() : __dirname;
  // Користите searchDir у команди find
  const findCmd = `find "${searchDir}" -type f -not -path '${searchDir}/node_modules/*' | fzf`;
  const localFile = execSync(findCmd, { encoding: 'utf8' }).trim();
  const subfolder = execSync("echo -e 'audio\nvideos\nphotos' | fzf", { encoding: 'utf8' }).trim();
  const fileContent = fs.readFileSync(localFile);
  const baseName = localFile.split('/').pop();
  const safeName = encodeURIComponent(baseName);
  const destination = `${subfolder}/${safeName}`;
  
  supabase.storage.from('cgalerija')
    .upload(destination, fileContent)
    .then(result => console.log(result))
    .catch(error => console.error(error));
}

// Update function (re-uploads with upsert)
function updateFile() {
  const localFile = execSync("find . -type f -not -path './node_modules/*' | fzf", { encoding: 'utf8' }).trim();
  const subfolder = execSync("echo -e 'audio\nvideos\nphotos' | fzf", { encoding: 'utf8' }).trim();
  const fileContent = fs.readFileSync(localFile);
  const baseName = localFile.split('/').pop();
  const safeName = encodeURIComponent(baseName);
  const destination = `${subfolder}/${safeName}`;
  
  supabase.storage.from('cgalerija')
    .upload(destination, fileContent, { upsert: true })
    .then(result => console.log(result))
    .catch(error => console.error(error));
}

// Modified downloadFile function to list objects and choose file using fzf
async function downloadFile() {
  // Let the user choose a folder via fzf (audio, videos, photos)
  const folder = execSync("echo -e 'audio\nvideos\nphotos' | fzf", { encoding: 'utf8' }).trim();
  supabase.storage.from('cgalerija')
    .list(folder)
    .then(result => {
      if (result.data && result.data.length > 0) {
        const files = result.data.map(obj => obj.name).join("\n");
        const selectedFile = execSync(`echo "${files}" | fzf`, { encoding: 'utf8' }).trim();
        const objectKey = `${folder}/${selectedFile}`;
        supabase.storage.from('cgalerija')
          .download(objectKey)
          .then(async (result) => {
            if(result.error) {
              console.error(result.error);
              return;
            }
            const { data } = result;
            let buffer;
            if(typeof data.arrayBuffer === 'function') {
              buffer = Buffer.from(await data.arrayBuffer());
            } else {
              buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
            }
            // Write file to downloads folder
            const filePath = path.join(downloadDir, selectedFile);
            fs.writeFileSync(filePath, buffer);
            console.log(`Преузето ${selectedFile} у ${filePath}`);
          })
          .catch(error => console.error(error));
      } else {
        console.log("Нема датотека у директоријуму");
      }
    })
    .catch(error => console.error(error));
}

// Modified deleteFile function using fzf for interactive deletion selection.
async function deleteFile() {
  const folder = execSync("echo -e 'audio\nvideos\nphotos' | fzf", { encoding: 'utf8' }).trim();
  supabase.storage.from('cgalerija')
    .list(folder)
    .then(result => {
      if (result.data && result.data.length > 0) {
        const files = result.data.map(obj => obj.name).join("\n");
        const selectedFile = execSync(`echo "${files}" | fzf`, { encoding: 'utf8' }).trim();
        const objectKey = `${folder}/${selectedFile}`;
        supabase.storage.from('cgalerija')
          .remove([objectKey])
          .then(res => console.log(`Избрисано ${objectKey}`, res))
          .catch(err => console.error(err));
      } else {
        console.log("Нема фајлова у директоријуму");
      }
    })
    .catch(err => console.error(err));
}

// Choose operation using fzf
const operation = execSync("echo -e 'Отпреми\nПреузми\nАжурирај\nОбриши' | fzf", { encoding: 'utf8' }).trim();

// Async main function to handle both sync and async operations.
async function main() {
  switch(operation) {
    case 'Отпреми':
      await uploadFile();
      break;
    case 'Преузми':
      await downloadFile();
      break;
    case 'Ажурирај':
      updateFile();
      break;
    case 'Обриши':
      await deleteFile();
      break;
    default:
      console.log('Невалидна операција');
      break;
  }
}

main();
