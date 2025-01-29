import { Command, Flags } from '@oclif/core'
import fetch from 'node-fetch'
import { cli } from 'cli-ux'

interface NetworkSummary {
  id: string
  registrarCount: number
  nodeCount: number
}

export default class NetworkList extends Command {
  static description = 'List all active networks'

  static examples = [
    '$ deam network list',
    '$ deam network list --csv',  // Optional CSV output
  ]

  static flags = {
    csv: Flags.boolean({
      char: 'c',
      description: 'Output in CSV format',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(NetworkList)

    try {
      cli.action.start('Fetching networks')

      const response = await fetch('http://localhost:3000/networks')
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const networks:any = await response.json() as NetworkSummary[]

      cli.action.stop()

      // Display networks in table format
      cli.table(networks, {
        id: {
          header: 'Network ID',
          minWidth: 10,
        },
        registrarCount: {
          header: 'Registrars',
          minWidth: 8,
        },
        nodeCount: {
          header: 'Nodes',
          minWidth: 8,
        },
      }, {
        printLine: this.log.bind(this),
        ...flags, // This enables CSV output when --csv flag is used
      })

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