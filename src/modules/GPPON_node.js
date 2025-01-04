import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { mplex } from '@libp2p/mplex'
import { noise } from '@chainsafe/libp2p-noise'
import { kadDHT } from '@libp2p/kad-dht'
import { mdns } from '@libp2p/mdns'
import { bootstrap } from '@libp2p/bootstrap'
import { identify } from '@libp2p/identify'
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
    const options = {
      addresses: {
        listen: [`/ip4/127.0.0.1/tcp/${this.config.port}`]
      },
      transports: [tcp()],
      streamMuxers: [mplex()],
      connectionEncrypters: [noise()],
      services: {
        identify: identify(),
        dht: kadDHT({
          clientMode: false, // Allow all nodes to participate in DHT
          protocol: '/gppon/1.0.0',
          initialStabilizeDelay: 1000,
          queryDelay: 500,
          enabled: true,
          querySelfInterval: 1000,
          randomWalk: {
            enabled: true,
            interval: 3000,
            timeout: 1000
          }
        })
      },
      connectionManager: {
        minConnections: 5
      },
      peerDiscovery: [
        ...(this.config.bootstrapList?.length ? [bootstrap({
          list: this.config.bootstrapList,
          timeout: 5000
        })] : []),
        ...(this.config.enableMDNS ? [mdns()] : [])
      ]
    }

    this.node = await createLibp2p(options)
    this.peerId = this.node.peerId.toString()

    this.node.addEventListener('peer:discovery', (evt) => {
      try {
        if (evt?.detail?.id) {
          const peerId = evt.detail.id.toString()
          if (!this.discoveredPeers.has(peerId)) {
            this.discoveredPeers.add(peerId)
            this.emit('peerDiscovered', peerId)
          }
        }
      } catch (error) {
        console.error('Error in peer:discovery event:', error)
      }
    })

    this.node.addEventListener('peer:connect', (evt) => {
      try {
        if (evt?.detail?.remotePeer) {
          const peerId = evt.detail.remotePeer.toString()
          console.log(`Node ${this.config.port}${this.isRegistrar ? ' (Registrar)' : ''} connected to peer: ${peerId}`)
          this.emit('peerConnected', peerId)
        }
      } catch (error) {
        console.error('Error in peer:connect event:', error)
      }
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
    if (this.node) {
      await this.node.stop()
    }
  }
}

export default GPPONNode