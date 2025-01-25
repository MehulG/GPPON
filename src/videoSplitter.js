import fs,{ statSync, existsSync, mkdirSync} from "fs";
import { exec } from "child_process";
import path, { join } from "path";

async function getVideoDuration(inputFile) {
  return new Promise((resolve, reject) => {
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFile}"`,
      (error, stdout) => {
        if (error) {
          reject("Error getting video duration: " + error.message);
        } else {
          resolve(parseFloat(stdout.trim()));
        }
      }
    );
  });
}


export async function splitVideoBySize(inputFile, targetSizeMB, outputDir) {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const totalSizeMB = statSync(inputFile).size / (1024 * 1024);
  const numParts = Math.ceil(totalSizeMB / targetSizeMB);

  if (numParts < 2) {
    return { message: "The target size is larger than the file size. No splitting needed." };
  }

  console.log(`Splitting video into ${numParts} parts...`);
  console.log(`Target size: ${targetSizeMB} MB`);
  const totalDuration = await getVideoDuration(inputFile);
  const segmentDuration = totalDuration / numParts;

  const promises = [];
  for (let i = 0; i < numParts; i++) {
    const startTime = i * segmentDuration;
    const outputFile = join(outputDir, `part_${i + 1}.mp4`);

    const command = `ffmpeg -i "${inputFile}" -ss ${startTime} -t ${segmentDuration} -c copy "${outputFile}"`;
    promises.push(
      new Promise((resolve, reject) => {
        exec(command, (error) => {
          if (error) {
            reject("Error splitting video: " + error.message);
          } else {
            resolve(outputFile);
          }
        });
      })
    );
  }

  const outputFiles = await Promise.all(promises);
  return { message: "Video successfully split", parts: outputFiles };
}


// Combine all the split files into a single video
export async function combineVideos(outputDir, parts) {
    const fileListPath = path.join(outputDir, 'filelist.txt');
  
    // Create a text file with the list of parts to concatenate
    const fileListContent = parts.map(part => `file '${part}'`).join('\n');
    fs.writeFileSync(fileListPath, fileListContent);
  
    // Use FFmpeg to concatenate the videos
    const outputCombinedFile = path.join(outputDir, 'output_combined.mp4');
    const command = `ffmpeg -f concat -safe 0 -i ${fileListPath} -c copy ${outputCombinedFile}`;
  
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(`Error combining videos: ${error.message}`);
        } else {
          resolve(outputCombinedFile);
        }
      });
    });
}
  
export default {
  splitVideoBySize, 
  combineVideos,
};
