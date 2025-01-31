import { Command, Args, Flags } from '@oclif/core'
import fetch from 'node-fetch'
import { cli } from 'cli-ux'

export default class NetworkAddNode extends Command {
  static description = 'Add a node to a specific network'

  static examples = [
    '$ deam network node add 123',
    '$ deam network node add --network-id 123',
  ]

  static args = {
    networkId: Args.string({
      description: 'ID of the network to add node to',
      required: false,
    }),
  }

  static flags = {
    'network-id': Flags.string({
      char: 'n',
      description: 'Network ID to add node to',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(NetworkAddNode)
    
    // Get networkId from either args or flags
    const networkId = args.networkId || flags['network-id']
    
    if (!networkId) {
      this.error(
        'Network ID is required. You can provide it as an argument or with --network-id flag:\n' +
        '  deam network node add 123\n' +
        '  deam network node add --network-id 123'
      , { exit: 1 })
    }

    try {
      cli.action.start('Adding node to network')

      const response = await fetch(`http://localhost:3000/network/${networkId}/node`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Network with ID ${networkId} not found`)
        }
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result:any = await response.json()

      cli.action.stop('added')

      // Display result
      this.log('\nNode successfully added to network:')
      this.log('---------------')
      this.log(`Network ID: ${networkId}`)
      if (result.peerId) {
        this.log(`Node ID: ${result.peerId}`)
      }
      if (result.port) {
        this.log(`Node port: ${result.port}`)
      }

    } catch (error) {
      cli.action.stop('failed')
      
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ECONNREFUSED') {
          this.error('Could not connect to the network service. Is it running?')
        } else {
          this.error(error.message)
        }
      } else {
        this.error('An unexpected error occurred')
      }
    }
  }
}