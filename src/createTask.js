// createTask.js

export async function createAndMonitorTask(node, taskConfig) {
    return new Promise((resolve, reject) => {
        let timeoutId;
        const cleanup = () => {
            clearTimeout(timeoutId);
            if (node.taskManager) {
                node.taskManager.removeAllListeners('taskCompleted');
                node.taskManager.removeAllListeners('taskFailed');
            }
        };

        if (!node.taskManager) {
            cleanup();
            reject(new Error('TaskManager not initialized'));
            return;
        }

        // Set up event listeners
        node.taskManager.on('taskCompleted', (event) => {
            console.log('\n✅ Task completed successfully:', event.result);
            cleanup();
            resolve(event);
        });

        node.taskManager.on('taskFailed', (event) => {
            console.error('\n❌ Task failed:', event.error);
            cleanup();
            reject(new Error(event.error));
        });

        // Create the task
        console.log('\n📦 Creating new task with configuration:', taskConfig);
        
        node.createTask(taskConfig)
            .then(proposalId => {
                console.log('🆕 Proposal created with ID:', proposalId);
                
                // Set up status monitoring
                const checkStatus = setInterval(() => {
                    const proposal = node.taskManager.proposals.get(proposalId);
                    if (proposal) {
                        console.log(`📊 Task Status: ${proposal.state}`);
                        if (proposal.acceptedBy) {
                            console.log(`👤 Accepted by: ${proposal.acceptedBy}`);
                        }
                    }
                }, 2000);

                // Clean up status check on completion or failure
                node.taskManager.once('taskCompleted', () => clearInterval(checkStatus));
                node.taskManager.once('taskFailed', () => clearInterval(checkStatus));

                // Set timeout for task
                timeoutId = setTimeout(() => {
                    clearInterval(checkStatus);
                    cleanup();
                    reject(new Error('Task timed out'));
                }, taskConfig.timeout ? taskConfig.timeout * 1000 : 60000); // Default 60s timeout
            })
            .catch(error => {
                cleanup();
                reject(error);
            });
    });
}

// Example task configurations
export const TASK_CONFIGS = {
    // Simple nginx server task
    nginxServer: {
        image: 'nginx:latest',
        command: ['nginx', '-g', 'daemon off;'],
        cpu: 1,
        memory: 512,
        ports: [{ container: 80, host: 8080 }],
        env: {
            NGINX_PORT: '80'
        }
    },

    // Video processing task
    videoProcess: {
        image: 'jrottenberg/ffmpeg:latest',
        command: [
            'ffmpeg',
            '-i', 'input.mp4',
            '-c:v', 'libx264',
            '-preset', 'medium',
            'output.mp4'
        ],
        cpu: 2,
        memory: 1024,
        storage: 5
    },

    // Machine learning training task
    mlTraining: {
        image: 'tensorflow/tensorflow:latest-gpu',
        command: ['python', 'train.py'],
        cpu: 4,
        memory: 8192,
        env: {
            MODEL_TYPE: 'resnet50',
            BATCH_SIZE: '32',
            EPOCHS: '10'
        }
    },

    // Data processing task
    dataProcess: {
        image: 'python:3.9',
        command: ['python', 'app.py'],
        cpu: 2,
        memory: 4096,
        env: {
            INPUT_FILE: 'data.csv',
            OUTPUT_FILE: 'results.csv'
        }
    }
};

// Helper function to create a custom task configuration
export function createCustomTaskConfig({
    image,
    command,
    cpu = 1,
    memory = 512,
    storage = 1,
    bandwidth = 1,
    env = {},
    ports = [],
    timeout = 3600
}) {
    return {
        image,
        command,
        cpu,
        memory,
        storage,
        bandwidth,
        env,
        ports,
        timeout
    };
}