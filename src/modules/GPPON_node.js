// GPPON_node.js
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { mplex } from '@libp2p/mplex'
import { noise } from '@chainsafe/libp2p-noise'
import { kadDHT } from '@libp2p/kad-dht'
import { mdns } from '@libp2p/mdns'
import { bootstrap } from '@libp2p/bootstrap'
import { identify } from '@libp2p/identify'
import { EventEmitter } from 'events'
import PeerConnectionManager from './PeerConnectionManager.js'
import TaskManager from './TaskManager.js'
import { uPnPNAT } from '@libp2p/upnp-nat'
import { autoNAT } from '@libp2p/autonat'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { yamux } from '@chainsafe/libp2p-yamux'
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery'
// import { webSockets } from '@libp2p/websockets'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'


class GPPONNode extends EventEmitter {
  constructor(config) {
    super()
    this.config = config
    this.node = null
    this.peerId = null
    this.discoveredPeers = new Set()
    this.isRegistrar = false
    this.connectionManager = null
    this.taskManager = null
  }

  async start() {
    const options = {
      addresses: {
        listen: [`/ip4/0.0.0.0/tcp/${this.config.port}`],
        announce: [`/ip4/0.0.0.0/tcp/${this.config.port}`]
      },
      transports: [
        tcp(),
        circuitRelayTransport()
      ],
      streamMuxers: [mplex()],
      connectionEncrypters: [noise()],
      services: {
        identify: identify(),
        pubsub: gossipsub(),
      },
      connectionManager: {
        minConnections: 5
      },
      peerDiscovery: [
        pubsubPeerDiscovery({
          interval: 5000
        }),
        ...(this.config.enableMDNS ? [mdns()] : [])
      ]
    }

    // if (this.config.bootstrapList?.length > 0) {
      options.peerDiscovery.push(bootstrap({
        list: [`/ip4/35.223.109.24/tcp/5000/p2p/12D3KooWJa5rf3qANokGUJPMNVcJFyiiiifk8owzkdTUwuDXo2gz`]
      }))
    // }

    this.node = await createLibp2p(options)
    this.peerId = this.node.peerId.toString()

    // Initialize managers after node is created
    this.connectionManager = new PeerConnectionManager(this.node)
    this.taskManager = new TaskManager(this)

    // Set up event listeners
    this.setupEventListeners()

    // Start the libp2p node
    await this.node.start()
    console.log(`Node started on port ${this.config.port}${this.isRegistrar ? ' (Registrar)' : ''} with ID: ${this.peerId}`)
    return this.peerId
  }

  setupEventListeners() {
    // Handle peer discovery
    this.node.addEventListener('peer:discovery', (evt) => {
      try {
        console.log(evt);

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
        console.log(evt);

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


    // Forward connection manager events
    this.connectionManager.on('peerConnected', (data) => {
      // console.log(`Node ${this.config.port}: Connected to peer ${data.peerId}`)
      this.emit('peerConnected', data)
    })

    this.connectionManager.on('peerDisconnected', (data) => {
      console.log(`Node ${this.config.port}: Disconnected from peer ${data.peerId}`)
      this.emit('peerDisconnected', data)
    })

    this.connectionManager.on('heartbeat', (data) => {
      this.emit('heartbeat', data)
    })

    this.connectionManager.on('reconnectFailed', (data) => {
      console.warn(`Node ${this.config.port}: Failed to reconnect to peer ${data.peerId}`)
      this.emit('reconnectFailed', data)
    })

    // Handle task-related events from TaskManager
    if (this.taskManager) {
      this.taskManager.on('proposalCreated', (data) => {
        console.log(`Node ${this.config.port}: Created proposal ${data.proposalId}`)
        this.emit('proposalCreated', data)
      })

      this.taskManager.on('proposalReceived', (data) => {
        console.log(`Node ${this.config.port}: Received proposal ${data.id}`)
        this.emit('proposalReceived', data)
      })

      this.taskManager.on('taskStarted', (data) => {
        console.log(`Node ${this.config.port}: Started task ${data.proposalId}`)
        this.emit('taskStarted', data)
      })

      this.taskManager.on('taskCompleted', (data) => {
        console.log(`Node ${this.config.port}: Completed task ${data.proposalId}`)
        this.emit('taskCompleted', data)
      })

      this.taskManager.on('taskFailed', (data) => {
        console.warn(`Node ${this.config.port}: Task failed ${data.proposalId}`, data.error)
        this.emit('taskFailed', data)
      })
    }
  }

  getMultiaddr() {
    return `/ip4/0.0.0.0/tcp/${this.config.port}/p2p/${this.peerId}`
  }

  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers)
  }

  async getNetworkStats() {
    if (this.connectionManager) {
      return await this.connectionManager.getNetworkStats()
    }
    return null
  }

  async createTask(config) {
    if (!this.taskManager) {
      throw new Error('TaskManager not initialized');
    }

    console.log(`Node ${this.config.port}: Attempting to create task`);
    try {
      const proposalId = await this.taskManager.createProposal(config);
      console.log(`Node ${this.config.port}: Successfully created task with ID ${proposalId}`);
      return proposalId;
    } catch (error) {
      console.error(`Node ${this.config.port}: Failed to create task:`, error);
      throw error;
    }
  }
  async acceptTask(proposalId) {
    if (this.taskManager) {
      return await this.taskManager.acceptProposal(proposalId)
    }
    throw new Error('TaskManager not initialized')
  }

  async getTaskStatus(proposalId) {
    if (this.taskManager) {
      const proposal = this.taskManager.proposals.get(proposalId)
      return proposal ? {
        state: proposal.state,
        acceptedBy: proposal.acceptedBy,
        result: proposal.result
      } : null
    }
    return null
  }

  async disconnectPeer(peerId) {
    if (this.connectionManager) {
      await this.connectionManager.disconnectPeer(peerId)
    }
  }

  async updateCapabilities(capabilities) {
    if (this.taskManager) {
      this.taskManager.updateCapabilities(capabilities)
    }
  }

  async stop() {
    if (this.node) {
      await this.node.stop()

      // Clean up managers
      if (this.connectionManager) {
        this.connectionManager.removeAllListeners()
      }

      if (this.taskManager) {
        this.taskManager.removeAllListeners()
      }

      // Clear discovered peers
      this.discoveredPeers.clear()

      console.log(`Node ${this.config.port} stopped`)
    }
  }
}

export default GPPONNode