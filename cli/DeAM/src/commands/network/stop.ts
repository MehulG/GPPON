import { Command, Args, Flags } from '@oclif/core'
import fetch from 'node-fetch'
import { cli } from 'cli-ux'

export default class NetworkStop extends Command {
  static description = 'Stop a specific network'

  static examples = [
    '$ deam network stop 123',
    '$ deam network stop --id 123',
    '$ deam network stop 123 --force', // Skip confirmation
  ]

  static args = {
    networkId: Args.string({
      description: 'ID of the network to stop',
      required: false,
    }),
  }

  static flags = {
    id: Flags.string({
      char: 'i',
      description: 'Network ID to stop',
      required: false,
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'Skip confirmation prompt',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(NetworkStop)
    
    // Get networkId from either args or flags
    const networkId = args.networkId || flags.id
    
    if (!networkId) {
      this.error(
        'Network ID is required. You can provide it as an argument or with --id flag:\n' +
        '  deam network stop 123\n' +
        '  deam network stop --id 123'
      , { exit: 1 })
    }

    // Confirm unless --force flag is used
    if (!flags.force) {
      const confirmed = await cli.confirm(`Are you sure you want to stop network ${networkId}? (y/n)`)
      if (!confirmed) {
        this.log('Operation cancelled')
        return
      }
    }

    try {
      cli.action.start(`Stopping network ${networkId}`)

      const response = await fetch(`http://localhost:3000/network/${networkId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Network with ID ${networkId} not found`)
        }
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      cli.action.stop('stopped')

      this.log(`\nNetwork ${networkId} has been successfully stopped`)

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