import express from 'express';
import { setupNetwork, DEFAULT_CONFIG } from './setup.js';
import GPPONNode from './modules/GPPON_node.js'
import net from 'net'

const app = express();
app.use(express.json());

// Store active networks
const activeNetworks = new Map();

// Start a new GPPON network
app.post('/network/start', async (req, res) => {
    try {
        const networkId = Date.now().toString();
        const config = {
            ...DEFAULT_CONFIG,
            ...req.body
        };

        console.log(`Starting new network with ID ${networkId}`);
        console.log('Configuration:', config);

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
            peerCount: node.getDiscoveredPeers().length
        });
    } catch (error) {
        console.error('Error adding node:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`GPPON Server listening on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('  POST   /network/start        - Start a new GPPON network');
    console.log('  GET    /network/:networkId   - Get network status');
    console.log('  DELETE /network/:networkId   - Stop a network');
    console.log('  GET    /networks             - List all active networks');
    console.log('  POST   /network/:networkId/node - Add a node to network');
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
