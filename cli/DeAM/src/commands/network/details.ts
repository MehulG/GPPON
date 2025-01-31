import { Command, Args, Flags } from '@oclif/core'
import fetch from 'node-fetch'
import { cli } from 'cli-ux'

interface NetworkResponse {
  registrars: unknown[]
  nodes: unknown[]
}

export default class NetworkDetails extends Command {
  static description = 'Get details for a specific network'

  static examples = [
    '$ deam network details 123',        // Simple example
    '$ deam network details --id 123',   // Using named flag
  ]

  static args = {
    networkId: Args.string({
      description: 'ID of the network to fetch details for',
      required: false,
    }),
  }

  static flags = {
    id: Flags.string({
      char: 'i',
      description: 'Network ID to fetch details for',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(NetworkDetails)
    
    // Get networkId from either args or flags
    const networkId = args.networkId || flags.id
    
    if (!networkId) {
      this.error(
        'Network ID is required. You can provide it as an argument or with --id flag:\n' +
        '  deam network details 123\n' +
        '  deam network details --id 123'
      , { exit: 1 })
    }

    try {
      cli.action.start('Fetching network details')

      const response = await fetch(`http://localhost:3000/network/${networkId}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Network with ID ${networkId} not found`)
        }
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const network = await response.json() as NetworkResponse

      cli.action.stop()

      // Display network details
      this.log('\nNetwork Details:')
      this.log('---------------')
      this.log(`ID: ${networkId}`)
      this.log(`Registrar Count: ${network.registrars.length}`)
      this.log(`Node Count: ${network.nodes.length}`)

    } catch (error) {
      cli.action.stop('failed')
      
      // Handle different types of errors with user-friendly messages
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