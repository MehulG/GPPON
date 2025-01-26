import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

async function setupDirectory(proposal) {
    try {
        const folderName = `proposal_${proposal.id}`;
        const folderPath = path.join(process.cwd(), folderName);

        // Ensure directory exists
        await fs.mkdir(folderPath, { recursive: true });

        return folderPath;
    } catch (error) {
        console.error(`❌ Error creating directory: ${error.message}`);
        throw error;
    }
}

export default async function runDocker(proposal) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("🚀 Running Docker...");

            // 1️⃣ Setup directory for proposal
            const folderPath = await setupDirectory(proposal);
            //copy file in directory
            // await fs.copyFile(path.resolve(proposal.containerConfig.env.INPUT_FILE[0].split('/').pop()), path.resolve(folderPath, proposal.containerConfig.env.INPUT_FILE[0].split('/').pop()));
            const srcPath = path.resolve(proposal.containerConfig.env.INPUT_FILE[0]); 
            const destPath = path.resolve(folderPath, path.basename(proposal.containerConfig.env.INPUT_FILE[0]));

            await fs.copyFile(srcPath, destPath);

            
            // 2️⃣ Path to Python script
            const scriptPath = path.resolve(process.cwd(), "video-gen/docker_gen.py");
            const jsonInput = JSON.stringify(proposal.containerConfig);

            // 3️⃣ Run Python script (it will generate Dockerfile inside folderPath)
            const pythonProcess = spawn("python3", [scriptPath, jsonInput], { cwd: folderPath });

            let stdoutData = '';
            pythonProcess.stdout.on("data", (data) => {
                stdoutData += data.toString();
                console.log(`🐍 Python STDOUT: ${data.toString()}`);
            });

            let stderrData = '';
            pythonProcess.stderr.on("data", (data) => {
                stderrData += data.toString();
                console.error(`⚠️ Python STDERR: ${data.toString()}`);
            });

            pythonProcess.on("close", (code) => {
                console.log(`✅ Python script exited with code ${code}`);
                if (code === 0) {
                    resolve(stdoutData);
                } else {
                    reject(new Error(`Process exited with code ${code}\nError: ${stderrData}`));
                }
            });

            pythonProcess.on("error", (error) => {
                reject(new Error(`❌ Failed to start Python process: ${error.message}`));
            });

        } catch (error) {
            reject(new Error(`❌ Failed to execute Python script: ${error.message}`));
        }
    });
}