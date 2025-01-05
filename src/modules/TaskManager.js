import { EventEmitter } from 'events'
import { randomBytes } from 'crypto'
import { pipe } from 'it-pipe'
import * as uint8arrays from 'uint8arrays'
import { pushable } from 'it-pushable'
import all from 'it-all'
import { peerIdFromString } from '@libp2p/peer-id';

const TaskState = {
    PROPOSED: 'PROPOSED',
    ACCEPTED: 'ACCEPTED',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
    LOCKED: 'LOCKED' // New state for atomic locking
}

class TaskProposal {
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
    }
}

class TaskManager extends EventEmitter {
    constructor(node) {
        super()
        this.node = node
        this.proposals = new Map()  // id -> TaskProposal
        this.activeTasks = new Map()  // id -> TaskInfo
        this.capabilities = {
            cpu: 4,  // Default available CPU cores
            memory: 8192,  // Default available memory (MB)
            bandwidth: 100,  // Default bandwidth (Mbps)
            storage: 100  // Default storage (GB)
        }
        this.lockTimeout = 5000  // Lock timeout in ms
        this.maxConcurrentTasks = 5
        this.setupProtocols()
    }

    async setupProtocols() {
        this.node.node.handle('/gppon/task/propose/1.0.0', this.handleProtocol.bind(this, this.handleProposal.bind(this)))
        this.node.node.handle('/gppon/task/accept/1.0.0', this.handleProtocol.bind(this, this.handleAcceptance.bind(this)))
        this.node.node.handle('/gppon/task/status/1.0.0', this.handleProtocol.bind(this, this.handleStatusUpdate.bind(this)))
        this.node.node.handle('/gppon/task/result/1.0.0', this.handleProtocol.bind(this, this.handleResult.bind(this)))
        this.node.node.handle('/gppon/task/lock/1.0.0', this.handleProtocol.bind(this, this.handleLockRequest.bind(this)))
        this.node.node.handle('/gppon/task/unlock/1.0.0', this.handleProtocol.bind(this, this.handleUnlockRequest.bind(this)))
    }

    async handleProtocol(handler, { connection, stream }) {
        try {
            // Collect chunks from the stream
            let data = new Uint8Array()
            for await (const chunk of stream.source) {
                // Convert Uint8ArrayList to Uint8Array
                const chunkArray = new Uint8Array(chunk.subarray())
                // Combine with existing data
                const newData = new Uint8Array(data.length + chunkArray.length)
                newData.set(data)
                newData.set(chunkArray, data.length)
                data = newData
            }

            // Only process if we have data
            if (data.length > 0) {
                // Convert to string and parse
                const messageStr = new TextDecoder().decode(data)
                const message = JSON.parse(messageStr)

                // Handle the message
                const result = await handler(message)

                // Send response
                const response = {
                    status: 'ok',
                    result,
                    timestamp: Date.now()
                }

                const responseData = new TextEncoder().encode(JSON.stringify(response))
                await pipe([responseData], stream.sink)
            } else {
                // Handle empty stream case
                const errorResponse = {
                    status: 'error',
                    message: 'No data received',
                    timestamp: Date.now()
                }
                const responseData = new TextEncoder().encode(JSON.stringify(errorResponse))
                await pipe([responseData], stream.sink)
            }
        } catch (error) {
            console.error('Error in protocol handler:', error)
            try {
                const errorResponse = {
                    status: 'error',
                    message: error.message,
                    timestamp: Date.now()
                }
                const responseData = new TextEncoder().encode(JSON.stringify(errorResponse))
                await pipe([responseData], stream.sink)
            } catch (e) {
                console.error('Error sending error response:', e)
            }
        }
    }
    async broadcastProposal(proposal) {
        const message = {
            type: 'TASK_PROPOSAL',
            payload: proposal,
            timestamp: Date.now()
        }

        const peers = await this.node.node.peerStore.all()
        const messageData = new TextEncoder().encode(JSON.stringify(message))

        const results = await Promise.allSettled(
            peers.map(async peer => {
                try {
                    // Dial the peer
                    const stream = await this.node.node.dialProtocol(peer.id, '/gppon/task/propose/1.0.0')

                    // Send the proposal
                    await pipe([messageData], stream.sink)

                    // Collect response data
                    let responseData = new Uint8Array()
                    for await (const chunk of stream.source) {
                        const chunkArray = new Uint8Array(chunk.subarray())
                        const newData = new Uint8Array(responseData.length + chunkArray.length)
                        newData.set(responseData)
                        newData.set(chunkArray, responseData.length)
                        responseData = newData
                    }

                    if (responseData.length > 0) {
                        // Parse response
                        const responseText = new TextDecoder().decode(responseData)
                        const response = JSON.parse(responseText)

                        if (response.status === 'error') {
                            throw new Error(response.message)
                        }

                        console.log(`Successfully sent proposal to peer ${peer.id}`)
                        return response
                    } else {
                        throw new Error('No response data received')
                    }
                } catch (error) {
                    console.warn(`Failed to send proposal to peer ${peer.id}:`, error.message)
                    throw error
                }
            })
        )

        // Count successes and failures
        const successes = results.filter(r => r.status === 'fulfilled').length
        const failures = results.filter(r => r.status === 'rejected').length

        console.log(`Broadcast complete: ${successes} successful, ${failures} failed`)

        if (successes === 0) {
            throw new Error('Failed to send proposal to any peers')
        }

        return results
    }

    async createProposal(config) {
        const proposal = new TaskProposal({
            proposerId: this.node.peerId.toString(),
            ...config
        })

        this.proposals.set(proposal.id, proposal)

        try {
            await this.broadcastProposal(proposal)

            console.log(`Node ${this.node.config.port}: Created proposal ${proposal.id}`)

            this.emit('proposalCreated', {
                proposalId: proposal.id,
                timestamp: Date.now(),
                config: proposal
            })

            return proposal.id
        } catch (error) {
            console.error('Error creating proposal:', error)
            this.proposals.delete(proposal.id)
            throw error
        }
    }

    async handleLockRequest(message) {
        const { proposalId, lockId } = message.payload
        const proposal = this.proposals.get(proposalId)

        if (!proposal) {
            throw new Error('Proposal not found')
        }

        // Check if task is already locked
        if (proposal.state === TaskState.LOCKED) {
            // Check if lock has expired
            if (Date.now() - proposal.lockTimestamp > this.lockTimeout) {
                // Lock has expired, allow new lock
                proposal.lockId = lockId
                proposal.lockTimestamp = Date.now()
                proposal.state = TaskState.LOCKED
                return { success: true, lockId }
            }
            return { success: false, reason: 'Task is locked' }
        }

        // Check if task is available
        if (proposal.state !== TaskState.PROPOSED) {
            return { success: false, reason: 'Task is not available' }
        }

        // Lock the task
        proposal.lockId = lockId
        proposal.lockTimestamp = Date.now()
        proposal.state = TaskState.LOCKED
 
        return { success: true, lockId }
    }

    async handleUnlockRequest(message) {
        const { proposalId, lockId } = message.payload
        const proposal = this.proposals.get(proposalId)

        if (!proposal) {
            throw new Error('Proposal not found')
        }

        if (proposal.lockId !== lockId) {
            return { success: false, reason: 'Invalid lock ID' }
        }

        // Reset lock
        proposal.lockId = null
        proposal.lockTimestamp = null
        proposal.state = TaskState.PROPOSED

        return { success: true }
    }

    async acquireLock(proposalId) {
        const lockId = randomBytes(16).toString('hex')

        try {
            const proposal = this.proposals.get(proposalId)
            if (!proposal) {
                throw new Error('Proposal not found')
            }

            // Convert string to proper PeerId
            let proposerPeerId;
            try {
                proposerPeerId = peerIdFromString(proposal.proposerId)
            } catch (error) {
                console.error('Error creating PeerId:', error)
                return null
            }

            const message = {
                type: 'LOCK_REQUEST',
                payload: { proposalId, lockId }
            }

            try {
                const stream = await this.node.node.dialProtocol(proposerPeerId, '/gppon/task/lock/1.0.0')

                await pipe(
                    [uint8arrays.fromString(JSON.stringify(message))],
                    stream.sink
                )

                let responseData = new Uint8Array()
                for await (const chunk of stream.source) {
                    const chunkArray = new Uint8Array(chunk.subarray())
                    const newData = new Uint8Array(responseData.length + chunkArray.length)
                    newData.set(responseData)
                    newData.set(chunkArray, responseData.length)
                    responseData = newData
                }

                const response = JSON.parse(new TextDecoder().decode(responseData))
                return response.success ? lockId : null

            } catch (error) {
                console.error('Error in lock request:', error)
                return null
            }

        } catch (error) {
            console.error('Error acquiring lock:', error)
            return null
        }
    }



    async releaseLock(proposalId, lockId) {
        try {
            const proposal = this.proposals.get(proposalId)
            if (!proposal) {
                throw new Error('Proposal not found')
            }

            // Convert string to proper PeerId
            let proposerPeerId;
            try {
                proposerPeerId = peerIdFromString(proposal.proposerId)
            } catch (error) {
                console.error('Error creating PeerId:', error)
                return
            }

            const message = {
                type: 'UNLOCK_REQUEST',
                payload: { proposalId, lockId }
            }

            const stream = await this.node.node.dialProtocol(proposerPeerId, '/gppon/task/unlock/1.0.0')
            await pipe(
                [uint8arrays.fromString(JSON.stringify(message))],
                stream.sink
            )

        } catch (error) {
            console.error('Error releasing lock:', error)
        }
    }


    async acceptProposal(proposalId) {
        const proposal = this.proposals.get(proposalId)
        if (!proposal || proposal.state !== TaskState.PROPOSED) {
            throw new Error('Invalid proposal or proposal already accepted')
        }

        // Try to acquire lock
        const lockId = await this.acquireLock(proposalId)
        if (!lockId) {
            throw new Error('Failed to acquire lock for proposal')
        }

        try {
            proposal.state = TaskState.ACCEPTED
            proposal.acceptedBy = this.node.peerId.toString()

            const message = {
                type: 'TASK_ACCEPTANCE',
                payload: {
                    proposalId,
                    acceptedBy: this.node.peerId.toString(),
                    timestamp: Date.now()
                }
            }

            const stream = await this.node.node.dialProtocol(proposal.proposerId, '/gppon/task/accept/1.0.0')
            await pipe(
                [uint8arrays.fromString(JSON.stringify(message))],
                stream.sink
            )

            // Start task execution
            await this.startTask(proposal)

        } catch (error) {
            console.error('Error accepting proposal:', error)
            proposal.state = TaskState.PROPOSED
            proposal.acceptedBy = null
            // Release lock in case of failure
            await this.releaseLock(proposalId, lockId)
            throw error
        }
    }

    async attemptAcceptProposal(proposalId) {
        const proposal = this.proposals.get(proposalId)

        // Double check state before attempting to accept
        if (!proposal || proposal.state !== TaskState.PROPOSED) {
            return false;
        }

        try {
            // Try to acquire lock first
            const lockId = await this.acquireLock(proposalId)
            if (!lockId) {
                return false;
            }

            // Double check state again after acquiring lock
            if (proposal.state !== TaskState.PROPOSED) {
                await this.releaseLock(proposalId, lockId)
                return false;
            }

            // Update state immediately to prevent race conditions
            proposal.state = TaskState.ACCEPTED
            proposal.acceptedBy = this.node.peerId.toString()

            try {
                // Convert proposer ID to proper PeerId for acceptance message
                const proposerPeerId = peerIdFromString(proposal.proposerId)

                const message = {
                    type: 'TASK_ACCEPTANCE',
                    payload: {
                        proposalId,
                        acceptedBy: this.node.peerId.toString(),
                        timestamp: Date.now()
                    }
                }

                // Notify proposer
                const stream = await this.node.node.dialProtocol(proposerPeerId, '/gppon/task/accept/1.0.0')
                await pipe(
                    [uint8arrays.fromString(JSON.stringify(message))],
                    stream.sink
                )

                // Start task execution
                await this.startTask(proposal)
                return true;

            } catch (error) {
                console.error('Error in task acceptance:', error)
                // Reset state on failure
                proposal.state = TaskState.PROPOSED
                proposal.acceptedBy = null
                await this.releaseLock(proposalId, lockId)
                return false;
            }

        } catch (error) {
            console.error('Error in attemptAcceptProposal:', error)
            // Reset state on failure
            if (proposal) {
                proposal.state = TaskState.PROPOSED
                proposal.acceptedBy = null
            }
            return false;
        }
    }


    async acceptProposal(proposalId) {
        const success = await this.attemptAcceptProposal(proposalId);
        if (!success) {
            throw new Error('Failed to accept proposal - may have already been accepted');
        }
    }

    async handleProposal(message) {
        try {
            if (!message || !message.payload) {
                throw new Error('Invalid proposal message')
            }

            const proposal = message.payload

            // Validate the proposal format
            if (!proposal.id || !proposal.proposerId || !proposal.containerConfig) {
                throw new Error('Invalid proposal format')
            }

            // Store proposerId as string
            if (typeof proposal.proposerId !== 'string') {
                proposal.proposerId = proposal.proposerId.toString()
            }

            // Store the proposal
            this.proposals.set(proposal.id, proposal)

            // Emit event for proposal received
            this.emit('proposalReceived', proposal)

            // Only attempt to accept if we meet requirements
            if (this.canHandleTask(proposal)) {
                setTimeout(async () => {
                    try {
                        // Add a small random delay to help prevent race conditions
                        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
                        await this.attemptAcceptProposal(proposal.id);
                    } catch (error) {
                        // Silently handle acceptance failures as other nodes may have accepted
                        console.log(`Failed to accept proposal ${proposal.id}: ${error.message}`);
                    }
                }, 0);
            }

            return {
                proposalId: proposal.id,
                received: true,
                timestamp: Date.now()
            }
        } catch (error) {
            console.error('Error handling proposal:', error)
            throw error
        }
    }
    canHandleTask(proposal) {
        return (
            this.capabilities.cpu >= proposal.requirements.cpu &&
            this.capabilities.memory >= proposal.requirements.memory &&
            this.capabilities.bandwidth >= proposal.requirements.bandwidth &&
            this.capabilities.storage >= proposal.requirements.storage &&
            this.activeTasks.size < (this.maxConcurrentTasks || 5)
        )
    }

    async handleAcceptance(message) {
        try {
            const { proposalId, acceptedBy } = message.payload

            const proposal = this.proposals.get(proposalId)
            if (proposal && proposal.state === TaskState.PROPOSED) {
                proposal.state = TaskState.ACCEPTED
                proposal.acceptedBy = acceptedBy

                this.emit('proposalAccepted', {
                    proposalId,
                    acceptedBy,
                    timestamp: Date.now()
                })
            }
        } catch (error) {
            console.error('Error handling acceptance:', error)
            throw error
        }
    }

    async startTask(proposal) {
        try {
            proposal.state = TaskState.RUNNING

            const taskInfo = {
                id: proposal.id,
                startTime: Date.now(),
                retryCount: 0,
                status: 'initializing',
                progress: 0
            }

            this.activeTasks.set(proposal.id, taskInfo)

            this.emit('taskStarted', {
                proposalId: proposal.id,
                timestamp: Date.now(),
                executorId: this.node.peerId.toString()
            })

            // Simulate task execution for now
            setTimeout(() => {
                this.completeTask(proposal.id, { status: 'success', data: 'Task completed successfully' })
            }, 5000)

        } catch (error) {
            console.error('Error starting task:', error)
            proposal.state = TaskState.FAILED
            this.emit('taskFailed', {
                proposalId: proposal.id,
                timestamp: Date.now(),
                error: error.message
            })
            throw error
        }
    }

    async handleStatusUpdate(message) {
        try {
            const { taskId, status, progress } = message.payload

            const task = this.activeTasks.get(taskId)
            if (task) {
                task.status = status
                task.progress = progress

                this.emit('taskStatusUpdated', {
                    taskId,
                    status,
                    progress,
                    timestamp: Date.now()
                })
            }
        } catch (error) {
            console.error('Error handling status update:', error)
            throw error
        }
    }

    async completeTask(taskId, result) {
        const proposal = this.proposals.get(taskId)
        if (proposal) {
            proposal.state = TaskState.COMPLETED
            proposal.result = result

            const message = {
                type: 'TASK_RESULT',
                payload: {
                    proposalId: taskId,
                    result,
                    timestamp: Date.now()
                }
            }

            try {
                const stream = await this.node.node.dialProtocol(proposal.proposerId, '/gppon/task/result/1.0.0')
                await pipe(
                    [uint8arrays.fromString(JSON.stringify(message))],
                    stream.sink
                )

                this.activeTasks.delete(taskId)

                this.emit('taskCompleted', {
                    proposalId: taskId,
                    result,
                    timestamp: Date.now()
                })
            } catch (error) {
                console.error('Error sending task result:', error)
                throw error
            }
        }
    }

    async handleResult(message) {
        try {
            const { proposalId, result } = message.payload

            const proposal = this.proposals.get(proposalId)
            if (proposal) {
                proposal.state = TaskState.COMPLETED
                proposal.result = result

                this.emit('taskCompleted', {
                    proposalId,
                    result,
                    timestamp: Date.now()
                })
            }
        } catch (error) {
            console.error('Error handling result:', error)
            throw error
        }
    }

    // Utility methods
    getProposalsByState(state) {
        return Array.from(this.proposals.values())
            .filter(proposal => proposal.state === state)
    }

    getActiveTasks() {
        return Array.from(this.activeTasks.values())
    }

    updateCapabilities(capabilities) {
        this.capabilities = {
            ...this.capabilities,
            ...capabilities
        }
    }

    async cancelProposal(proposalId) {
        const proposal = this.proposals.get(proposalId)
        if (proposal && proposal.state !== TaskState.COMPLETED) {
            proposal.state = TaskState.CANCELLED
            this.emit('proposalCancelled', {
                proposalId,
                timestamp: Date.now()
            })
            return true
        }
        return false
    }
}

export default TaskManager