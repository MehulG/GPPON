// setup.js
import GPPONNode from './modules/GPPON_node.js'
import net from 'net'

const DEFAULT_CONFIG = {
  registrarCount: 2,
  nodeCount: 5,
  baseRegistrarPort: 6000,
  enableMDNS: true,
  startupDelay: 500, // ms between node starts
  statusInterval: 10000 // ms between status updates
}

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

async function setupNetwork(userConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...userConfig }

  try {
    const registrars = []
    let nextPort = config.baseRegistrarPort

    // Start first registrar
    // const firstRegistrar = new GPPONNode({
    //   port: await findAvailablePort(nextPort),
    //   enableMDNS: config.enableMDNS,
    //   isRegistrar: true
    // })
    // await firstRegistrar.start()
    // registrars.push(firstRegistrar)
    // nextPort = firstRegistrar.config.port + 1

    // Start remaining registrars with bootstrap to first registrar
    for (let i = 1; i < config.registrarCount; i++) {
      const registrar = new GPPONNode({
        port: await findAvailablePort(nextPort),
        enableMDNS: config.enableMDNS,
        isRegistrar: true,
        // bootstrapList: [firstRegistrar.getMultiaddr()]
      })
      await registrar.start()
      registrars.push(registrar)
      nextPort = registrar.config.port + 1
    }

    // Get complete bootstrap list
    const bootstrapList = registrars.map(r => r.getMultiaddr())

    // Start regular nodes with full bootstrap list
    const nodes = []
    for (let i = 0; i < config.nodeCount; i++) {
      nextPort = await findAvailablePort(nextPort)
      const node = new GPPONNode({
        port: nextPort,
        enableMDNS: config.enableMDNS,
        bootstrapList  // All nodes get full registrar list
      })
      await node.start()
      nodes.push(node)
      await new Promise(resolve => setTimeout(resolve, config.startupDelay))
      nextPort++
    }
    // Status monitoring
    const statusInterval = setInterval(() => {
      console.log('\n=== Network Status ===')
      registrars.forEach((registrar, idx) => {
        console.log(`Registrar ${idx + 1} (port ${registrar.config.port}): ${registrar.getDiscoveredPeers().length} peers`)
      })
      nodes.forEach((node) => {
        console.log(`Node ${node.config.port}: ${node.getDiscoveredPeers().length} peers`)
      })
    }, config.statusInterval)

    return {
      registrars,
      nodes,
      cleanup: () => {
        clearInterval(statusInterval)
      }
    }
  } catch (error) {
    console.error('Error in setupNetwork:', error)
    throw error
  }
}

export { setupNetwork, DEFAULT_CONFIG }