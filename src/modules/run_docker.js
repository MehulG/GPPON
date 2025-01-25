import path from 'path';
import { spawn } from 'child_process';

export default function runDocker(proposal) {
    return new Promise((resolve, reject) => {
        try {
            console.log("Running Docker...");
            console.log("===============================================================");
            console.log(proposal.containerConfig);
            const input = {dataProcess: proposal.containerConfig};

            console.log(`Current directory: ${process.cwd()}`);

            // Path to the Python script
            const scriptPath = path.resolve(process.cwd(), "./python-image/test.py");

            // JSON input to pass to the Python script
            const jsonInput = JSON.stringify(input);

            // Spawn the Python script as a subprocess
            const pythonProcess = spawn("python3", [scriptPath, jsonInput]);

            // Collect stdout data
            let stdoutData = '';
            pythonProcess.stdout.on("data", (data) => {
                stdoutData += data.toString();
                console.log(`Python STDOUT: ${data.toString()}`);
            });

            // Collect stderr data
            let stderrData = '';
            pythonProcess.stderr.on("data", (data) => {
                stderrData += data.toString();
                console.error(`Python STDERR: ${data.toString()}`);
            });

            // Handle process exit
            pythonProcess.on("close", (code) => {
                console.log(`Python script exited with code ${code}`);
                if (code === 0) {
                    resolve(stdoutData);
                } else {
                    reject(new Error(`Process exited with code ${code}\nError: ${stderrData}`));
                }
            });

            // Handle process errors
            pythonProcess.on("error", (error) => {
                reject(new Error(`Failed to start Python process: ${error.message}`));
            });

        } catch (error) {
            reject(new Error(`Failed to execute Python script: ${error.message}`));
        }
    });
}



