import GPPONNode from './modules/GPPON_node.js'

async function setupNetwork() {
  // Start registrar nodes
  const registrar1 = new GPPONNode({ 
    port: 6000, 
    enableMDNS: true,
    isRegistrar: true 
  })
  const registrar2 = new GPPONNode({ 
    port: 6001, 
    enableMDNS: true,
    isRegistrar: true 
  })

  await Promise.all([registrar1.start(), registrar2.start()])
  
  // Get bootstrap list
  const bootstrapList = [
    registrar1.getMultiaddr(),
    registrar2.getMultiaddr()
  ]

  // Start regular nodes
  const nodes = []
  for(let i = 0; i < 100; i++) {
    const node = new GPPONNode({
      port: 6002 + i,
      enableMDNS: true,
      bootstrapList
    })
    nodes.push(node)
  }

  // Start all regular nodes with a slight delay between each
  for (const node of nodes) {
    await node.start()
    await new Promise(resolve => setTimeout(resolve, 20))
  }

  // Print network status every 10 seconds
  setInterval(() => {
    console.log('\n=== Network Status ===')
    console.log(`Registrar 1 (port 6000): ${registrar1.getDiscoveredPeers().length} peers`)
    console.log(`Registrar 2 (port 6001): ${registrar2.getDiscoveredPeers().length} peers`)
    nodes.forEach((node, i) => {
      console.log(`Node ${6002 + i}: ${node.getDiscoveredPeers().length} peers`)
    })
  }, 10000)

  return { registrars: [registrar1, registrar2], nodes }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nShutting down GPPON network...')
  const { registrars, nodes } = await network
  await Promise.all([
    ...registrars.map(r => r.stop()),
    ...nodes.map(n => n.stop())
  ])
  process.exit(0)
})

const network = setupNetwork().catch(error => {
  console.error('Error setting up network:', error)
  process.exit(1)
})

export { setupNetwork }