import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { mplex } from '@libp2p/mplex'
import { noise } from '@chainsafe/libp2p-noise'
import { kadDHT } from '@libp2p/kad-dht'
import { mdns } from '@libp2p/mdns'
import { bootstrap } from '@libp2p/bootstrap'
import { EventEmitter } from 'events'

class GPPONNode extends EventEmitter {
  constructor(config) {
    super()
    this.config = config
    this.node = null
    this.peerId = null
    this.discoveredPeers = new Set()
    this.isRegistrar = config.isRegistrar || false
  }

  async start() {
    const transports = [tcp()]
    const muxers = [mplex()]
    const connectionEncryption = [noise()]
    const peerDiscovery = []
    
    // Add mDNS for local discovery
    if (this.config.enableMDNS) {
      peerDiscovery.push(mdns())
    }
    
    // Add bootstrap nodes if provided
    if (this.config.bootstrapList?.length) {
      peerDiscovery.push(bootstrap({
        list: this.config.bootstrapList
      }))
    }

    const options = {
      addresses: {
        listen: [`/ip4/127.0.0.1/tcp/${this.config.port}`]
      },
      transports: transports,
      streamMuxers: muxers,
      connectionEncrypters: connectionEncryption,
      peerDiscovery,
      modules: {
        dht: kadDHT
      }
    }

    this.node = await createLibp2p(options)
    this.peerId = this.node.peerId.toString()

    this.node.addEventListener('peer:discovery', (evt) => {
      const peerId = evt.detail.id.toString()
      this.discoveredPeers.add(peerId)
      console.log(`Node ${this.config.port}${this.isRegistrar ? ' (Registrar)' : ''} discovered peer:`, peerId)
      this.emit('peerDiscovered', peerId)
    })

    this.node.addEventListener('peer:connect', (evt) => {
      const peerId = evt.detail.remotePeer.toString()
      console.log(`Node ${this.config.port}${this.isRegistrar ? ' (Registrar)' : ''} connected to peer:`, peerId)
      this.emit('peerConnected', peerId)
    })

    await this.node.start()
    console.log(`Node started on port ${this.config.port}${this.isRegistrar ? ' (Registrar)' : ''} with ID: ${this.peerId}`)
    return this.peerId
  }

  getMultiaddr() {
    return `/ip4/127.0.0.1/tcp/${this.config.port}/p2p/${this.peerId}`
  }

  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers)
  }

  async stop() {
    await this.node.stop()
  }
}

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
  
  // Get registrar multiaddrs for bootstrap list
  const bootstrapList = [
    registrar1.getMultiaddr(),
    registrar2.getMultiaddr()
  ]

  // Start regular nodes
  const nodes = []
  for(let i = 0; i < 8; i++) {
    const node = new GPPONNode({
      port: 6002 + i,
      enableMDNS: true,
      bootstrapList
    })
    nodes.push(node)
  }

  // Start all regular nodes
  await Promise.all(nodes.map(node => node.start()))

  // Print network status every 5 seconds
  setInterval(() => {
    console.log('\n=== Network Status ===')
    console.log('Registrar 1 peers:', registrar1.getDiscoveredPeers().length)
    console.log('Registrar 2 peers:', registrar2.getDiscoveredPeers().length)
    nodes.forEach((node, i) => {
      console.log(`Node ${6002 + i} peers:`, node.getDiscoveredPeers().length)
    })
  }, 5000)

  return { registrars: [registrar1, registrar2], nodes }
}

setupNetwork().catch(console.error)

export default GPPONNode