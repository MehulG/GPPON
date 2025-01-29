import { Command, Flags } from '@oclif/core'
import fetch from 'node-fetch'
import { cli } from 'cli-ux'

interface TaskCreatePayload {
  networkId: string
  nodeId: string
  task_type: string
  task_input: string
  task_result: string
  splits: number
  resolution: string
}

export default class TaskCreate extends Command {
  static description = 'Create a new task proposal interactively'

  static examples = [
    '$ deam task create',
  ]

  async run(): Promise<void> {
    try {
      const networkId = await cli.prompt('Network ID', {
        required: true,
        type: 'normal',
      })

      const nodeId = await cli.prompt('Node ID', {
        required: true,
        type: 'normal',
      })

      // Fixed task type since server only accepts 'videoProcess'
      const task_type = 'videoProcess'
      this.log('Task type: videoProcess (only supported type)')

      const task_input = await cli.prompt('Input video file path', {
        required: true,
        type: 'normal',
      })

      const task_result = await cli.prompt('Result directory path', {
        required: true,
        type: 'normal',
      })

      const splits_str = await cli.prompt('Number of splits', {
        required: true,
        type: 'normal',
        default: '1',
      })
      const splits = parseInt(splits_str, 10)

      const resolution = await cli.prompt('Resolution (e.g., "2000:-2")', {
        required: true,
        type: 'normal',
        default: '2000:-2',
      })

      // Preview the input and ask for confirmation
      this.log('\nTask Proposal Preview:')
      this.log('--------------------')
      this.log(`Network ID: ${networkId}`)
      this.log(`Node ID: ${nodeId}`)
      this.log(`Task Type: ${task_type}`)
      this.log(`Input File: ${task_input}`)
      this.log(`Result Directory: ${task_result}`)
      this.log(`Splits: ${splits}`)
      this.log(`Resolution: ${resolution}`)

      const confirmed = await cli.confirm('\nDo you want to create this task? (y/n)')
      if (!confirmed) {
        this.log('Task creation cancelled')
        return
      }

      const payload: TaskCreatePayload = {
        networkId,
        nodeId,
        task_type,
        task_input,
        task_result,
        splits,
        resolution,
      }

      cli.action.start('Creating task proposal')

      const response = await fetch('http://localhost:3000/tasks/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      
      if (!response.ok) {
        const errorData:any = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }
      
      const result:any = await response.json()
      cli.action.stop('done')

      // Display success message and created tasks
      this.log('\nTasks created successfully:')
      if (result.createdTasks) {
        this.log(JSON.stringify(result.createdTasks, null, 2))
        result.createdTasks.forEach((task: any, index: number) => {
          this.log(`\nTask ${index + 1}:`)
          if (task.env) {
            if (task.env.INPUT_FILE) {
              const inputPath = Array.isArray(task.env.INPUT_FILE) 
                ? task.env.INPUT_FILE[0] 
                : task.env.INPUT_FILE
              this.log(`Input: ${inputPath}`)
              // Log the actual part number from the filename
              const partMatch = inputPath.match(/part_(\d+)\.mp4/)
              if (partMatch) {
                this.log(`Part Number: ${partMatch[1]}`)
              }
            }
            if (task.env.OUTPUT_FILE) {
              const outputFile = Array.isArray(task.env.OUTPUT_FILE) 
                ? task.env.OUTPUT_FILE[0] 
                : task.env.OUTPUT_FILE
              this.log(`Output: ${outputFile}`)
            }
            if (task.env.RESOLUTION) this.log(`Resolution: ${task.env.RESOLUTION}`)
          }
        })
      }

    } catch (error) {
      cli.action.stop('failed')
      
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ECONNREFUSED') {
          this.error('Could not connect to the task service. Is it running?')
        } else {
          this.error(error.message)
        }
      } else {
        this.error('An unexpected error occurred')
      }
    }
  }
}