import express from 'express';
import { setupNetwork, DEFAULT_CONFIG } from './setup.js';
import GPPONNode from './modules/GPPON_node.js'
import net from 'net'
import { createAndMonitorTask, TASK_CONFIGS } from './createTask.js'
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { splitVideoBySize, combineVideos } from './videoSplitter.js';

const app = express();
app.use(express.json());
const upload = multer({ dest: "uploads/" });

// Store active networks
const activeNetworks = new Map();
let activeTasks = [];
let completedTasks = [];

// Start a new GPPON network
app.post('/network/start', async (req, res) => {
  try {
    const networkId = Date.now().toString();
    const config = {
      ...DEFAULT_CONFIG,
      ...req.body
    };

    console.log(`Starting new network with ID ${networkId}`);

    const network = await setupNetwork(config);
    activeNetworks.set(networkId, network);

    // Return network information
    const networkInfo = {
      id: networkId,
      config,
      registrars: network.registrars.map(r => ({
        port: r.config.port,
        multiaddr: r.getMultiaddr(),
        peerCount: r.getDiscoveredPeers().length
      })),
      nodes: network.nodes.map(n => ({
        port: n.config.port,
        peerCount: n.getDiscoveredPeers().length
      }))
    };

    res.status(201).json(networkInfo);
  } catch (error) {
    console.error('Error starting network:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get network status
app.get('/network/:networkId', (req, res) => {
  const { networkId } = req.params;
  const network = activeNetworks.get(networkId);

  if (!network) {
    return res.status(404).json({ error: 'Network not found' });
  }

  const networkInfo = {
    id: networkId,
    registrars: network.registrars.map(r => ({
      port: r.config.port,
      multiaddr: r.getMultiaddr(),
      peerCount: r.getDiscoveredPeers().length
    })),
    nodes: network.nodes.map(n => ({
      port: n.config.port,
      peerCount: n.getDiscoveredPeers().length
    }))
  };

  res.json(networkInfo);
});

// Stop a network
app.delete('/network/:networkId', async (req, res) => {
  const { networkId } = req.params;
  const network = activeNetworks.get(networkId);

  if (!network) {
    return res.status(404).json({ error: 'Network not found' });
  }

  try {
    // Stop all nodes
    await Promise.all([
      ...network.registrars.map(r => r.stop()),
      ...network.nodes.map(n => n.stop())
    ]);

    // Clean up monitoring
    network.cleanup();
    activeNetworks.delete(networkId);

    res.json({ message: 'Network stopped successfully' });
  } catch (error) {
    console.error('Error stopping network:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get list of all active networks
app.get('/networks', (req, res) => {
  const networks = Array.from(activeNetworks.keys()).map(networkId => {
    const network = activeNetworks.get(networkId);
    return {
      id: networkId,
      registrarCount: network.registrars.length,
      nodeCount: network.nodes.length
    };
  });

  res.json(networks);
});

// Add a new node to existing network
app.post('/network/:networkId/node', async (req, res) => {
  const { networkId } = req.params;
  const network = activeNetworks.get(networkId);

  if (!network) {
    return res.status(404).json({ error: 'Network not found' });
  }

  try {
    const bootstrapList = network.registrars.map(r => r.getMultiaddr());
    const lastNode = network.nodes[network.nodes.length - 1];
    const nextPort = lastNode.config.port + 1;

    const node = new GPPONNode({
      port: await findAvailablePort(nextPort),
      enableMDNS: network.registrars[0].config.enableMDNS,
      bootstrapList
    });

    await node.start();
    network.nodes.push(node);

    res.status(201).json({
      port: node.config.port,
      peerCount: node.getDiscoveredPeers().length,
      peerId: node.peerId
    });
  } catch (error) {
    console.error('Error adding node:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new task proposal
app.post('/tasks/create', async (req, res) => {
  try {
    let networkId = req.body.networkId;
    let nodeId = req.body.nodeId;
    let task_type = req.body.task_type;
    let task_input = req.body.task_input;
    let task_result = req.body.task_result;
    let splits = req.body.splits;
    let resolution = req.body.resolution;

    if (!networkId || !nodeId || !task_type || !task_input || !task_result || !splits || !resolution) {
      return res.status(400).json({ error: 'networkId, nodeId, task_type, task_input, task_result, splits and resolution are required' });
    }

    const network = activeNetworks.get(networkId)

    let actualNode;
    for (let i = 0; i < network.nodes.length; i++) {
      if (network.nodes[i].peerId === nodeId) {
        actualNode = network.nodes[i];
        break;
      }
    }

    if (task_type === 'videoProcess') {
      let targetSize = fs.statSync(task_input).size;
      let targetSizeMB = targetSize / (1024 * 1024);
      let split_videos = await splitVideoBySize(task_input, parseFloat(targetSizeMB / splits), task_result)
      let tasks = []

      for (let split = 0; split < split_videos.parts.length; split++) {
        tasks[split] = JSON.parse(JSON.stringify(TASK_CONFIGS.videoProcess))
        tasks[split].env = {
          RESOLUTION: resolution,
          INPUT_FILE: [split_videos.parts[split]],
          OUTPUT_FILE: ["out_" + split_videos.parts[split].split("/").pop()]
        }
        let taskPromise = createAndMonitorTask(actualNode, tasks[split])
        let taskID = Date.now().toString();
        activeTasks.push({ taskID, taskPromise });
      }
      return res.status(201).json({ createdTasks: tasks });
    } else {
      return res.status(400).json({ error: 'supported task_type: [videoProcess]' });
    }
  } catch (error) {
    console.error('Task proposal creation failed:', error)
    res.status(500).json({
      message: 'Failed to create task proposal',
      error: error.message
    })
  }
})

// Get active tasks status
// app.get('/tasks/status', (req, res) => {
//   try {
//     const activeTasksInfo = activeTasks.map(({ taskID }) => ({
//       taskID,
//       isActive: true
//     }));
//     res.status(200).json(activeTasksInfo);
//   } catch (error) {
//     console.error('Failed to get tasks status:', error);
//     res.status(500).json({
//       message: 'Failed to get tasks status',
//       error: error.message
//     });
//   }
// });

// Check task completion status
app.get('/tasks/status', async (req, res) => {
  try {
    const taskStatuses = await Promise.all(activeTasks.map(async ({ taskID, taskPromise }) => {
      try {
        const result = await Promise.race([taskPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 0))]);
        return { taskID, status: 'completed' };
      } catch (error) {
        if (error.message === 'timeout') {
          return { taskID, status: 'in progress' };
        }
        return { taskID, status: 'failed', error: error.message };
      }
    }));

    res.status(200).json(taskStatuses);
  } catch (error) {
    console.error('Failed to check task completion:', error);
    res.status(500).json({
      message: 'Failed to check task completion status',
      error: error.message
    });
  }
});


async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    server.listen(port)
  })
}

async function findAvailablePort(startPort) {
  let port = startPort
  while (!(await isPortAvailable(port))) {
    port++
  }
  return port
}

// Multer setup for file uploads

app.post("/split-video", upload.single("video"), async (req, res) => {
  try {
    const { targetSizeMB } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "No video file uploaded." });
    }
    if (!targetSizeMB) {
      return res.status(400).json({ error: "Target size (MB) is required." });
    }

    const inputFile = req.file.path;
    const outputDir = path.join("output", path.parse(req.file.originalname).name);

    const result = await splitVideoBySize(inputFile, parseFloat(targetSizeMB), outputDir);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred while splitting the video." });
  }
});


// Combine the split video files into one file
app.post('/combine-videos', async (req, res) => {
  const { outputDirectory, outputFileName } = req.body;

  if (!outputDirectory || !fs.existsSync(outputDirectory)) {
    return res.status(400).json({ message: 'Invalid output directory.' });
  }

  try {
    // Step 1: Get all .mp4 files from the output directory
    const parts = await getMp4Files(outputDirectory);

    if (parts.length < 2) {
      return res.status(400).json({ message: 'You need to provide at least two video parts.' });
    }

    // Step 2: Combine the videos
    const fileListPath = path.join(outputDirectory, 'filelist.txt');
    const combinedFilePath = path.join(outputDirectory, outputFileName || 'final_combined.mp4');

    // Step 3: Create the file list and start the combination process
    const fileListContent = parts.map(part => `file '${part}'`).join('\n');
    fs.writeFileSync(fileListPath, fileListContent);

    const command = `ffmpeg -f concat -safe 0 -i ${fileListPath} -c copy ${combinedFilePath}`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error combining videos: ${error.message}`);
        return res.status(500).json({ message: 'Error combining the videos.' });
      }
      if (stderr) {
        console.error(`FFmpeg stderr: ${stderr}`);
      }

      console.log(`Videos combined successfully into: ${combinedFilePath}`);

      // Step 4: Send the combined video file as a response
      res.download(combinedFilePath, (err) => {
        if (err) {
          console.error('Error sending file:', err);
          return res.status(500).json({ message: 'Error sending the combined video.' });
        }

        // Clean up temporary files after sending the response
        cleanUpFiles(parts, fileListPath, combinedFilePath);
      });
    });
  } catch (error) {
    console.error('Error during video processing:', error);
    res.status(500).json({ message: 'Error processing the videos.', error: error.message });
  }
});

// Function to get all .mp4 files in the output directory
function getMp4Files(directory) {
  return new Promise((resolve, reject) => {
    fs.readdir(directory, (err, files) => {
      if (err) {
        return reject('Error reading directory: ' + err);
      }

      const mp4Files = files
        .filter(file => path.extname(file).toLowerCase() === '.mp4')
        .map(file => path.join(directory, file)); // Get full path

      resolve(mp4Files);
    });
  });
}

// Clean up temporary files
function cleanUpFiles(parts, fileListPath, combinedFilePath) {
  parts.forEach(part => fs.unlinkSync(part)); // Delete the split parts
  fs.unlinkSync(fileListPath); // Delete the filelist.txt
  fs.unlinkSync(combinedFilePath); // Optionally, delete the combined file after sending
}


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GPPON Server listening on port ${PORT}`);
  console.log('Available endpoints:');
  console.log('  POST   /network/start        - Start a new GPPON network');
  console.log('  GET    /network/:networkId   - Get network status');
  console.log('  DELETE /network/:networkId   - Stop a network');
  console.log('  GET    /networks             - List all active networks');
  console.log('  POST   /network/:networkId/node - Add a node to network');
  console.log('  POST   /tasks/create         - Create a new task proposal');
  console.log('  GET    /tasks/status         - Check task completion status');
  console.log('  POST   /split-video          - Split a video file into parts');
  console.log('  POST   /combine-videos       - Combine split video parts into one');
});

