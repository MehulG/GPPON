import { randomBytes } from 'crypto'
import { TaskState } from '../states/taskState.js'
export class TaskProposal {
    constructor(config) {
        this.id = randomBytes(16).toString('hex')
        this.proposerId = config.proposerId
        this.timestamp = Date.now()
        this.requirements = {
            cpu: config.cpu || 1,  // CPU cores
            memory: config.memory || 512,  // MB
            bandwidth: config.bandwidth || 1,  // Mbps
            storage: config.storage || 1  // GB
        }
        this.containerConfig = {
            image: config.image,
            command: config.command,
            env: config.env || {},
            ports: config.ports || [],
            volumes: config.volumes || []
        }
        this.instances = config.instances || 1
        this.timeout = config.timeout || 3600  // seconds
        this.maxRetries = config.maxRetries || 3
        this.state = TaskState.PROPOSED
        this.acceptedBy = null
        this.result = null
        this.lockId = null
        this.lockTimestamp = null
        this.lockedBy = null // field to track which node has the lock
    }
}
